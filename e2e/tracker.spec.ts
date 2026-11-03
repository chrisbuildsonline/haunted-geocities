// Tracker detector end to end on fixtures/trackers.html (Criteo ×3, Hotjar ×2, Taboola ×1 through
// --host-resolver-rules): ghosts in the lanes, HUD counts, the popup list, Exorcise from the ghost
// card, Let it back, narrow pages, reduced motion and a byte-identical page after un-haunt.
import type { Page, Request } from "@playwright/test";
import { expect, fixture, haunt, openPopup, shadowOf, tabIdOf, TRACKER_HOSTS, trackerUrl, test, type InShadow } from "./fixtures";

const SHOTS = "test-results/tracker";
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

let probes = 0;
const probe = (page: Page, host: string) =>
  page.evaluate((url) => fetch(url, { mode: "no-cors" }).then(() => "loaded", () => "refused"), trackerUrl(host, `probe${++probes}`));

/** Ghost companies, their boxes, and every page text rect they could cover. */
const lanesLook = (inShadow: InShadow) =>
  inShadow(function () {
    const ghosts = [...this.querySelectorAll<HTMLElement>("#lanes .ghost")];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const text: DOMRect[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue?.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      text.push(...[...r.getClientRects()].filter((x) => x.width > 0));
    }
    const overlaps = ghosts.filter((g) => {
      const b = g.getBoundingClientRect();
      return text.some((t) => t.left < b.right && t.right > b.left && t.top < b.bottom && t.bottom > b.top);
    });
    const hud = this.getElementById("hud")!;
    return {
      companies: ghosts.map((g) => g.dataset.company),
      names: ghosts.map((g) => g.getAttribute("aria-label")),
      focusable: ghosts.every((g) => g.tabIndex === 0 && g.localName === "button"),
      overlaps: overlaps.map((g) => g.dataset.company),
      ghostCount: hud.querySelector(".count.ghosts .n")!.textContent,
      emptyHidden: (hud.querySelector(".empty") as HTMLElement).hidden,
      odometer: hud.querySelector(".hits")!.getAttribute("aria-label"),
      hudTop: hud.getBoundingClientRect().top,
      lowest: Math.max(0, ...ghosts.map((g) => g.getBoundingClientRect().bottom)),
    };
  });

const center = (inShadow: InShadow, selector: string) =>
  inShadow(function (sel: string) {
    const r = this.querySelector(sel)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);

const popupRows = (popup: Page) =>
  popup.locator(".ghost-row").evaluateAll((rows) =>
    rows.map((r) => [r.querySelector(".row-title")!.textContent, r.querySelector(".row-sub, .tag-pill")!.textContent, r.querySelector("button")!.textContent, r.classList.contains("exorcised")]),
  );

test("ghosts, HUD, popup list, Exorcise from the card, Let it back, and a byte-identical page after un-haunt", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  const failed: { host: string; error: string | undefined }[] = [];
  page.on("requestfailed", (r: Request) => failed.push({ host: new URL(r.url()).hostname, error: r.failure()?.errorText }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("trackers.html"));
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  const tabId = await tabIdOf(sw, page);

  // Haunt from the popup, as a user would.
  const popup = await openPopup(context, extensionId, tabId);
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await expect.poll(() => popupRows(popup)).toEqual([
    ["Criteo", expect.stringMatching(/^1 domain · /), "Exorcise", false],
    ["Hotjar", expect.stringMatching(/^1 domain · /), "Exorcise", false],
    ["Taboola", expect.stringMatching(/^1 domain · /), "Exorcise", false],
  ]);
  await expect(popup.locator('[data-count="ghosts"] .num')).toHaveText("3");
  await shot(popup, "popup-haunted");

  await page.bringToFront();
  await page.waitForTimeout(2600); // the haunt moment settles
  const inShadow = await shadowOf(page);
  const look = await lanesLook(inShadow);
  expect(look.companies).toEqual(["Criteo", "Hotjar", "Taboola"]);
  expect(look.names[0]).toBe("Criteo, tracker ghost, seen 3 times");
  expect(look.focusable).toBe(true);
  expect(look.overlaps).toEqual([]);
  expect(look.lowest).toBeLessThanOrEqual(look.hudTop);
  expect([look.ghostCount, look.emptyHidden, look.odometer]).toEqual(["1", true, "Souls counted: 000006"]); // Hotjar and Taboola score 2 for fingerprinting: known vampires, not ghosts
  await shot(page, "desktop-1280");

  // Open Criteo's card and exorcise it from the costume.
  const g = await center(inShadow, '#lanes .ghost[data-company="Criteo"]');
  await page.mouse.click(g.x, g.y);
  const card = () =>
    inShadow(function () {
      const c = this.querySelector<HTMLElement>("#cards .card");
      return c && { title: c.querySelector("h2")!.textContent, text: c.innerText, act: c.querySelector(".act")!.textContent, focused: c.contains(this.activeElement) };
    });
  expect(await card()).toMatchObject({ title: "Criteo", act: "Exorcise", focused: true });
  expect((await card())!.text).toContain("Seen 3 times on this page");
  expect((await card())!.text).toContain("Blocked until you close the browser.");
  await expect.poll(() => inShadow(function () {
    return getComputedStyle(this.querySelector("#cards .card")!).opacity;
  })).toBe("1");
  await shot(page, "ghost-card");

  await page.keyboard.press("Enter"); // focus is on [Exorcise]
  await expect.poll(async () => (await card())?.act).toBe("Let it back");
  const exorcisedGhost = () => inShadow(function () {
    const el = this.querySelector('#lanes .ghost[data-company="Criteo"]')!;
    return [el.classList.contains("exorcised"), el.querySelector(".stamp")?.textContent ?? null, getComputedStyle(el.querySelector(".sprite")!).opacity];
  });
  await expect.poll(exorcisedGhost).toEqual([true, "EXORCISED", "0.4"]); // after the 200ms fade
  expect(await probe(page, TRACKER_HOSTS.Criteo)).toBe("refused");
  expect(failed.at(-1)).toEqual({ host: TRACKER_HOSTS.Criteo, error: "net::ERR_BLOCKED_BY_CLIENT" });
  expect(await probe(page, TRACKER_HOSTS.Hotjar)).toBe("loaded");

  await page.keyboard.press("Escape");
  expect(await card()).toBeNull();
  expect(await inShadow(function () {
    return (this.activeElement as HTMLElement | null)?.dataset.company;
  })).toBe("Criteo");
  await shot(page, "desktop-exorcised");

  await popup.bringToFront();
  await expect.poll(() => popupRows(popup).then((r) => r[0])).toEqual(["Criteo", "Exorcised", "Let it back", true]);
  await expect(popup.locator(".ghost-row.exorcised .tag-pill")).toHaveText("Exorcised");
  await shot(popup, "popup-exorcised");

  // Let it back from the popup: the costume follows and the requests load again.
  await popup.getByRole("button", { name: "Let it back: Criteo" }).click();
  await expect.poll(() => popupRows(popup).then((r) => r[0]![2])).toBe("Exorcise");
  await expect.poll(() => exorcisedGhost().then((x) => x[0])).toBe(false);
  expect(await probe(page, TRACKER_HOSTS.Criteo)).toBe("loaded");

  // Un-haunt from the popup: the page is byte-identical and no rule is left.
  await popup.getByRole("button", { name: "Un-haunt" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle");
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
  expect(await sw.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).toEqual([]);
});

test("a 375px page has no lane: ghosts live in the HUD count only, nothing over text", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(fixture("trackers.html"));
  await haunt(sw, page);
  await page.waitForTimeout(2600);
  const look = await lanesLook(await shadowOf(page));
  expect(look.companies).toEqual([]);
  expect([look.ghostCount, look.odometer]).toEqual(["1", "Souls counted: 000006"]); // Criteo only: Hotjar and Taboola are known vampires now
  await shot(page, "narrow-375");
});

test("reduced motion: ghosts sit still at their slot centres, fully visible", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture("trackers.html"));
  await haunt(sw, page);
  await page.waitForTimeout(400);
  const inShadow = await shadowOf(page);
  const still = await inShadow(function () {
    const ghosts = [...this.querySelectorAll<HTMLElement>("#lanes .ghost")];
    return {
      n: ghosts.length,
      running: this.getAnimations().filter((a) => ghosts.some((g) => g.contains((a.effect as KeyframeEffect).target as Node))).length,
      transforms: ghosts.map((g) => getComputedStyle(g.querySelector(".bob")!).transform + getComputedStyle(g.querySelector(".sway")!).transform),
    };
  });
  expect(still.n).toBe(3);
  expect(still.running).toBe(0);
  expect(new Set(still.transforms)).toEqual(new Set(["nonenone"]));
  await shot(page, "reduced-motion");
});
