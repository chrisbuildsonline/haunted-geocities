// The hero haunt moment on a news-style page: the page dies like a CRT, the Webmaster's Ghost wipes
// 1998 in, then the tracker ghosts rise one by one with their name tags (design/DESIGN.md "Haunt moment").
import type { Page, Worker } from "@playwright/test";
import { expect, fixture, haunt, shadowOf, test } from "./fixtures";

const OUT = "test-results/hero";
const GHOSTS = ["Criteo", "Chartbeat", "Quantcast", "comScore"]; // fixtures/news.html, most requests first, then by name (code points)

async function unhaunt(sw: Worker, tabId: number) {
  await sw.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { type: "unhaunt" });
  }, tabId);
}

async function openNews(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("news.html"));
  await page.waitForLoadState("load");
}

test("phases go crt, wipe, rise; the lids meet; ghosts rise 250ms apart and every name tag shows", async ({ context, sw }) => {
  test.setTimeout(90_000);
  const page = await context.newPage();
  await openNews(page);
  // Run the page's animation clock at a fifth of real time, so every phase is sampled many times.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
  await haunt(sw, page);
  const inShadow = await shadowOf(page);

  type Sample = { phase: string | null; lidsShut: boolean; line: boolean; shown: string[]; tags: string[] };
  const samples: Sample[] = [];
  const shots = new Set<string>();
  for (const end = Date.now() + 45_000; Date.now() < end; await page.waitForTimeout(40)) {
    const s: Sample = await inShadow(function () {
      const fx = this.getElementById("fx");
      const top = this.querySelector(".lid.top")?.getBoundingClientRect();
      const ghosts = [...this.querySelectorAll<HTMLElement>("#lanes > .ghost")];
      const visible = (el: Element) => Number(getComputedStyle(el).opacity) > 0.5;
      return {
        phase: fx?.dataset.phase ?? null,
        lidsShut: !!top && top.bottom >= innerHeight / 2 - 2,
        line: !!this.querySelector(".phosphor") && getComputedStyle(this.querySelector(".phosphor")!).opacity === "1",
        shown: ghosts.filter(visible).map((g) => g.dataset.company!),
        tags: ghosts.filter((g) => visible(g) && visible(g.querySelector(".tag")!)).map((g) => g.dataset.company!),
      };
    });
    samples.push(s);
    const shot = s.lidsShut ? "1-crt" : s.phase === "wipe" ? "2-wipe" : s.phase === "rise" && s.tags.length >= 2 ? "3-rise" : null;
    if (shot && !shots.has(shot)) {
      shots.add(shot);
      await page.screenshot({ path: `${OUT}/desktop-${shot}.png` });
    }
    if (s.phase === null) break;
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

  // The phases, in order, never back, then the FX root is gone.
  const phases = samples.map((s) => s.phase).filter((p, i, all) => p !== all[i - 1]);
  expect(phases).toEqual(["crt", "wipe", "rise", null]);
  // The screen goes dark once: the lids shut during the CRT phase, with the phosphor line seen, and never again.
  expect(samples.some((s) => s.phase === "crt" && s.lidsShut)).toBe(true);
  expect(samples.some((s) => s.line)).toBe(true);
  expect(samples.filter((s) => s.phase !== "crt").some((s) => s.lidsShut)).toBe(false);
  // Ghosts appear one by one in lane order, and each tag only after its ghost.
  const firstSeen = (name: string, key: "shown" | "tags") => samples.findIndex((s) => s[key].includes(name));
  const order = GHOSTS.map((g) => firstSeen(g, "shown"));
  expect(order.every((n) => n > 0)).toBe(true);
  for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
  for (const g of GHOSTS) expect(firstSeen(g, "tags")).toBeGreaterThanOrEqual(firstSeen(g, "shown"));
  expect(samples.find((s) => s.phase === "rise" && s.shown.length === 1 && s.tags.length <= 1)).toBeDefined();

  // Settled: every ghost has its company name tag on screen.
  const settled = await inShadow(function () {
    return [...this.querySelectorAll<HTMLElement>("#lanes > .ghost")].map((g) => {
      const tag = g.querySelector<HTMLElement>(".tag")!;
      const r = tag.getBoundingClientRect();
      return { name: tag.textContent, opacity: getComputedStyle(tag).opacity, onScreen: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight };
    });
  });
  expect(settled).toEqual(GHOSTS.map((name) => ({ name, opacity: "1", onScreen: true })));
  await page.screenshot({ path: `${OUT}/desktop-4-settled.png` });
  expect([...shots].sort()).toEqual(["1-crt", "2-wipe", "3-rise"]);
});

test("the rise is timed by the moment: ghost i starts at 1700 + 250i ms, its tag 200ms later", async ({ context, sw }) => {
  const page = await context.newPage();
  await openNews(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  const timing = await inShadow(function () {
    return [...this.querySelectorAll<HTMLElement>("#lanes > .ghost")].map((g) => [
      g.getAnimations()[0]?.effect?.getTiming().delay,
      g.querySelector(".tag")!.getAnimations()[0]?.effect?.getTiming().delay,
    ]);
  });
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  expect(timing).toEqual([
    [1700, 1900],
    [1950, 2150],
    [2200, 2400],
    [2450, 2650],
  ]);
});

test("reduced motion: no FX, no phase, tags visible at once", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openNews(page);
  await haunt(sw, page);
  const inShadow = await shadowOf(page);
  const now = await inShadow(function () {
    return { fx: !!this.getElementById("fx"), phase: !!this.querySelector("[data-phase]"), tagAnims: [...this.querySelectorAll(".tag")].flatMap((t) => t.getAnimations()).length };
  });
  expect(now).toEqual({ fx: false, phase: false, tagAnims: 0 });
  await page.waitForTimeout(400); // the 300ms cross-fade
  const tags = await inShadow(function () {
    return [...this.querySelectorAll<HTMLElement>("#lanes > .ghost .tag")].map((t) => [t.textContent, getComputedStyle(t).opacity]);
  });
  expect(tags).toEqual(GHOSTS.map((g) => [g, "1"]));
  await page.screenshot({ path: `${OUT}/desktop-reduced.png` });
});

test("unhaunt mid-moment and after it: outerHTML and adoptedStyleSheets equal pre-haunt", async ({ context, sw }) => {
  const page = await context.newPage();
  await openNews(page);
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  // Cut short in the CRT phase, while the lids are shut.
  const tabId = await haunt(sw, page);
  await page.waitForTimeout(350);
  await unhaunt(sw, tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
  // The whole moment, then un-haunt.
  await haunt(sw, page);
  await page.waitForTimeout(3100);
  await unhaunt(sw, tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
});
