// Sound effects end to end. AudioContexts are counted with the DevTools WebAudio domain, which sees
// every context in a tab, the content script's isolated world included (a page script cannot).
// Haunts go through the router's real HAUNT path, so the MAIN-world vampire hooks are in the page.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, fixture, openPopup, shadowOf, tabIdOf, test, type InShadow } from "./fixtures";
import type { CompanyHit } from "../src/data/types";

type Ctx = { context: BrowserContext; sw: Worker; extensionId: string };

/**
 * Record real-time AudioContexts made and closed in `page`'s tab. Offline ones (a fingerprinting
 * script's audio render, never ours) are kept apart in `offline`.
 */
async function watchAudio(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const created: string[] = [];
  const offline: string[] = [];
  const closed: string[] = [];
  const close = (id: string) => void (created.includes(id) && !closed.includes(id) && closed.push(id));
  cdp.on("WebAudio.contextCreated", (e) => (e.context.contextType === "realtime" ? created : offline).push(e.context.contextId));
  cdp.on("WebAudio.contextChanged", (e) => e.context.contextState === "closed" && close(e.context.contextId));
  cdp.on("WebAudio.contextWillBeDestroyed", (e) => close(e.contextId));
  await cdp.send("WebAudio.enable");
  return { created, offline, closed };
}

/** The Sound effects setting, written where the popup switch writes it. */
const setSound = (sw: Worker, on: boolean) => sw.evaluate((v) => chrome.storage.local.set({ audioEnabled: v }), on);

/** Open `path` at 1280, haunt it through the router, and let the haunt moment settle. */
async function haunted({ context, sw, extensionId }: Ctx, path: string, init?: () => void) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  if (init) await page.addInitScript(init);
  const audio = await watchAudio(page);
  await page.goto(fixture(path));
  const tabId = await tabIdOf(sw, page);
  const popup = await openPopup(context, extensionId, tabId);
  expect(await popup.evaluate((id) => chrome.runtime.sendMessage({ type: "HAUNT", tabId: id }), tabId)).toMatchObject({ haunted: true });
  await page.bringToFront();
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  await page.waitForTimeout(3700); // the haunt moment settles
  const inShadow = await shadowOf(page);
  return { page, popup, tabId, audio, inShadow };
}

/** Click the costume element `selector` like a person (a real gesture), and wait for its card. */
async function openCard(page: Page, inShadow: InShadow, selector: string) {
  await expect.poll(() => inShadow(function (s: string) { return !!this.querySelector(s); }, selector), { timeout: 10_000 }).toBe(true);
  const at = await inShadow(function (s: string) {
    const r = this.querySelector(s)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => inShadow(function () { return !!this.querySelector("#cards .card"); })).toBe(true);
}
const closeCard = async (page: Page, inShadow: InShadow) => {
  await page.keyboard.press("Escape");
  await expect.poll(() => inShadow(function () { return !!this.querySelector("#cards .card"); })).toBe(false);
};

const GHOST = '#lanes .ghost[data-company="Criteo"]';
const KNOWN_VAMPIRE = (c: "Hotjar" | "Taboola") => `#lanes .vampire[data-company="${c}"]`;
const STONE = "#markers .tomb-marker";
const BADGE = "#markers .curse-badge";

/** Every card kind the fixtures have: ghost and vampire (trackers), tombstone (links), curse (dark patterns). */
async function openEveryKind(ctx: Ctx, init?: () => void) {
  const pages: Awaited<ReturnType<typeof haunted>>[] = [];
  const t = await haunted(ctx, "trackers.html", init);
  await openCard(t.page, t.inShadow, GHOST);
  await closeCard(t.page, t.inShadow);
  await openCard(t.page, t.inShadow, KNOWN_VAMPIRE("Hotjar"));
  await closeCard(t.page, t.inShadow);
  pages.push(t);
  const l = await haunted(ctx, "links.html", init);
  await openCard(l.page, l.inShadow, STONE);
  pages.push(l);
  const d = await haunted(ctx, "dark-patterns.html", init);
  await openCard(d.page, d.inShadow, BADGE);
  pages.push(d);
  return pages;
}

const vampiresOf = (sw: Worker, tabId: number) =>
  sw.evaluate(
    async (id) =>
      (((await chrome.storage.session.get(`ghosts:${id}`))[`ghosts:${id}`] as { companies: CompanyHit[] } | undefined)?.companies ?? [])
        .filter((c) => c.vampire)
        .map((c) => ({ company: c.company, domains: c.domains, caught: [...c.vampire!.caught].sort(), knownOnly: c.vampire!.knownOnly }))
        .sort((a, b) => (a.company < b.company ? -1 : 1)),
    tabId,
  );

test("with sound off, opening cards creates no AudioContext", async ({ context, sw, extensionId }) => {
  const pages = await openEveryKind({ context, sw, extensionId });
  await pages[2]!.page.waitForTimeout(500);
  for (const p of pages) expect(p.audio.created).toEqual([]);
});

test("with sound on, opening a card creates one AudioContext and reuses it", async ({ context, sw, extensionId }) => {
  await setSound(sw, true);
  const { page, inShadow, audio } = await haunted({ context, sw, extensionId }, "trackers.html");
  expect(audio.created).toEqual([]); // the haunt moment is silent
  await openCard(page, inShadow, GHOST);
  await expect.poll(() => audio.created.length).toBe(1);
  await closeCard(page, inShadow);
  await openCard(page, inShadow, KNOWN_VAMPIRE("Taboola"));
  await page.waitForTimeout(300);
  expect(audio.created).toHaveLength(1);
  expect(audio.closed).toEqual([]);
});

test("sound on never adds a vampire for the extension", async ({ context, sw, extensionId }) => {
  await setSound(sw, true);
  // In the page's own (MAIN) world: count every AudioContext the page could see being made.
  const count = () => {
    const w = window as unknown as Record<string, any>;
    w.__audioCalls = 0;
    for (const name of ["AudioContext", "OfflineAudioContext", "webkitAudioContext"]) {
      const C = w[name];
      if (typeof C !== "function") continue;
      w[name] = new Proxy(C, {
        construct(target, args, nt) {
          w.__audioCalls++;
          return Reflect.construct(target, args, nt);
        },
      });
    }
  };
  const pages = await openEveryKind({ context, sw, extensionId }, count);
  for (const p of pages) {
    // the sound did play, from the content script's isolated world
    await expect.poll(() => p.audio.created.length).toBe(1);
    expect(await p.page.evaluate(() => (window as unknown as { __audioCalls: number }).__audioCalls)).toBe(0);
  }
  // trackers.html: Hotjar and Taboola stay known vampires (Tracker Radar), nothing was caught, nothing else joined
  const t = pages[0]!;
  expect(await vampiresOf(sw, t.tabId)).toEqual([
    { company: "Hotjar", domains: ["hotjar.com"], caught: [], knownOnly: true },
    { company: "Taboola", domains: ["taboola.com"], caught: [], knownOnly: true },
  ]);
  for (const p of pages.slice(1)) expect(await vampiresOf(sw, p.tabId)).toEqual([]);
  // the popup and the toolbar badge agree
  await t.popup.reload();
  await expect(t.popup.locator('[data-count="vampires"] .num')).toHaveText("2");
  const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), t.tabId);
  expect(badge).toBe("3"); // one ghost and two known vampires
});

test("vampires.html shows the same vampires with sound off and on", async ({ context, sw, extensionId }) => {
  const run = async (on: boolean) => {
    await setSound(sw, on);
    const { page, tabId, inShadow, audio } = await haunted({ context, sw, extensionId }, "vampires.html");
    await page.locator("#email").focus();
    await page.waitForFunction(() => (window as unknown as { fpDone: number }).fpDone === 2);
    await expect.poll(async () => (await vampiresOf(sw, tabId)).filter((v) => v.caught.length === 3).length).toBe(2);
    await openCard(page, inShadow, '#lanes .vampire[data-company="AdTheorent"]');
    await closeCard(page, inShadow);
    await openCard(page, inShadow, "#lanes .vampire:not([data-company=\"AdTheorent\"])");
    await page.waitForTimeout(300);
    expect(audio.created).toHaveLength(on ? 1 : 0);
    const list = await vampiresOf(sw, tabId);
    const offline = audio.offline.length;
    await page.close();
    return { list, offline };
  };
  const off = await run(false);
  const on = await run(true);
  expect(off.list.map((v) => v.company)).toEqual(["AdTheorent", "nightowl-metrics.test"]);
  expect(on.list).toEqual(off.list);
  // the offline renders are the two page scripts' own, the same with sound on
  expect(off.offline).toBe(2);
  expect(on.offline).toBe(off.offline);
});

test("turning sound off closes the context and it is recreated lazily", async ({ context, sw, extensionId }) => {
  await setSound(sw, true);
  const { page, inShadow, audio } = await haunted({ context, sw, extensionId }, "trackers.html");
  await openCard(page, inShadow, GHOST);
  await expect.poll(() => audio.created.length).toBe(1);
  await closeCard(page, inShadow);

  await setSound(sw, false);
  await expect.poll(() => audio.closed).toEqual([audio.created[0]]);
  await openCard(page, inShadow, KNOWN_VAMPIRE("Hotjar"));
  await closeCard(page, inShadow);
  await page.waitForTimeout(300);
  expect(audio.created).toHaveLength(1); // off: nothing new

  await setSound(sw, true);
  await page.waitForTimeout(300);
  expect(audio.created).toHaveLength(1); // on alone builds nothing
  await openCard(page, inShadow, KNOWN_VAMPIRE("Taboola"));
  await expect.poll(() => audio.created.length).toBe(2);
});

test("the Haunt click plays from the popup only when sound is on", async ({ context, sw, extensionId }) => {
  for (const on of [false, true]) {
    await setSound(sw, on);
    const page = await context.newPage();
    const pageAudio = await watchAudio(page);
    await page.goto(fixture("clean.html"));
    const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
    const audio = await watchAudio(popup);
    await popup.getByRole("button", { name: "Haunt this page" }).click();
    await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
    if (on) await expect.poll(() => audio.created.length).toBe(1);
    else {
      await popup.waitForTimeout(500);
      expect(audio.created).toEqual([]);
    }
    expect(pageAudio.created).toEqual([]); // the haunt moment on the page is silent
    // Un-haunt plays nothing more
    await popup.getByRole("button", { name: "Un-haunt" }).click();
    await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle");
    await popup.waitForTimeout(300);
    expect(audio.created).toHaveLength(on ? 1 : 0);
    await popup.close();
    await page.close();
  }
});
