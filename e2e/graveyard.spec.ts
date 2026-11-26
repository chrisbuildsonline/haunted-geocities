// The footer graveyard: on a 375px page and on a full-width page the ghosts and vampires stand in the
// crypt footer at the end of the page, 12px above the HUD, open their cards, take the exorcise stamp,
// hide with the HUD, and leave the page byte-identical on un-haunt. Also the odometer's label.
import type { BrowserContext, Worker } from "@playwright/test";
import { CROWD_HOSTS, expect, fixture, haunt, openPopup, shadowOf, tabIdOf, test, trackerUrl, type InShadow } from "./fixtures";

const SHOTS = "test-results/graveyard";
const SUB = "tracker requests blocked or seen";

async function hauntAt(context: BrowserContext, sw: Worker, width: number, path: string, reduced = false) {
  const page = await context.newPage();
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 400 ? 740 : 800 });
  await page.goto(fixture(path));
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  const tabId = await haunt(sw, page);
  await page.waitForTimeout(reduced ? 400 : 3100); // the haunt moment settles
  return { page, tabId, before, inShadow: await shadowOf(page) };
}

/** The strip, its sprites, the lanes and the HUD, as the user sees them. */
const strip = (inShadow: InShadow) =>
  inShadow(function () {
    const g = this.getElementById("graveyard")!;
    const hud = this.getElementById("hud")!.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    const sprites = [...g.querySelectorAll<HTMLElement>(".stones > button")];
    const stones = g.querySelector<HTMLElement>(".stones")!;
    return {
      shown: !g.hidden && r.height > 0,
      companies: sprites.map((s) => s.dataset.company),
      // each button is as wide as the wider of the 48px sprite and its tag (font-dependent: Comic Neue tags can pass 48)
      widthsFit: sprites.every((s) => Math.abs(s.getBoundingClientRect().width - Math.max(48, s.querySelector(".tag")!.getBoundingClientRect().width)) <= 1),
      lanes: this.querySelectorAll("#lanes .ghost, #lanes .vampire").length,
      gap: Math.round(hud.top - r.bottom),
      sameInsets: Math.round(r.left) === Math.round(hud.left) && Math.round(r.right) === Math.round(hud.right),
      label: g.querySelector(".gy-bar")!.textContent,
      region: [g.getAttribute("role"), g.getAttribute("aria-label")],
      scroll: [stones.scrollWidth, stones.clientWidth],
      top: r.top,
      vh: innerHeight,
    };
  });

const spriteCenter = (inShadow: InShadow, company: string) =>
  inShadow(function (c: string) {
    const b = this.querySelector<HTMLElement>(`#graveyard .stones > button[data-company="${c}"]`)!;
    b.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, company);

const openCardTitle = (inShadow: InShadow) =>
  inShadow(function () {
    const c = this.querySelector<HTMLElement>("#cards .card");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { title: c.querySelector("h2")!.textContent, company: c.dataset.company, focused: c.contains(this.activeElement), bottom: r.bottom, left: r.left, right: r.right };
  });

const focusedCompany = (inShadow: InShadow) => inShadow(function () { return (this.activeElement as HTMLElement | null)?.dataset.company ?? null; });

test("375px: graveyard shows one sprite per company in lane order", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "trackers.html");
  const s = await strip(inShadow);
  expect(s.shown).toBe(true);
  expect(s.companies).toEqual(["Criteo", "Hotjar", "Taboola"]); // the ghost by count, then the known vampires by name
  expect(s.widthsFit).toBe(true);
  expect(s.lanes).toBe(0);
  expect(s.gap).toBe(12);
  expect(s.sameInsets).toBe(true);
  expect(s.label).toBe("Graveyard of trackers");
  expect(s.region).toEqual(["region", "Graveyard of trackers"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/narrow-375.png` });
});

test("full-width page: graveyard shown, no lanes", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 1280, "wide.html");
  const s = await strip(inShadow);
  expect(s.shown).toBe(true);
  expect(s.companies).toEqual(["Criteo", "AdTheorent", "Hotjar", "Taboola"]);
  expect(s.lanes).toBe(0);
  expect([s.gap, s.sameInsets]).toEqual([12, true]);
  await page.screenshot({ path: `${SHOTS}/wide-1280.png` });
});

test("the row wraps onto more rows when sprites do not fit; nothing scrolls sideways", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "trackers.html");
  for (const host of Object.values(CROWD_HOSTS)) {
    await page.evaluate((url) => fetch(url, { mode: "no-cors" }).then(() => "loaded"), trackerUrl(host, `crowd-${host}`));
  }
  await expect.poll(async () => (await strip(inShadow)).companies.length).toBe(9);
  const s = await strip(inShadow);
  expect(s.scroll[0]).toBeLessThanOrEqual(s.scroll[1]! + 1); // the row wraps, it does not overflow sideways...
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // ...nor does the page
  // Tab walks the sprites in order; the last one is inside the row.
  const order = s.companies;
  await inShadow(function () { this.querySelector<HTMLElement>("#graveyard .stones > button")!.focus(); });
  for (let i = 1; i < order.length; i++) await page.keyboard.press("Tab");
  expect(await focusedCompany(inShadow)).toBe(order.at(-1));
  const inView = await inShadow(function () {
    const b = (this.activeElement as HTMLElement).getBoundingClientRect();
    const row = this.querySelector("#graveyard .stones")!.getBoundingClientRect();
    return { ok: b.left >= row.left - 1 && b.right <= row.right + 1, b: [b.left, b.right], row: [row.left, row.right] };
  });
  expect(inView).toEqual({ ok: true, b: inView.b, row: inView.row }); // the boxes show in a failure
  await page.screenshot({ path: `${SHOTS}/crowded-375.png` });
});

test("sprite opens its card by click, Enter and Space, focus returns", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "trackers.html");
  const s = await strip(inShadow);
  // click the leftmost sprite (scrolled into view at the end of the page): the card stays 8px inside the viewport
  const at = await spriteCenter(inShadow, "Criteo");
  await page.mouse.click(at.x, at.y);
  let card = await openCardTitle(inShadow);
  expect(card).toMatchObject({ title: "Criteo", focused: true });
  expect(card!.bottom).toBeLessThanOrEqual(s.vh - 8 + 1);
  expect(card!.left).toBeGreaterThanOrEqual(8);
  expect(card!.right).toBeLessThanOrEqual(375 - 8);
  await page.keyboard.press("Escape");
  expect(await openCardTitle(inShadow)).toBeNull();
  expect(await focusedCompany(inShadow)).toBe("Criteo");
  // Enter on the rightmost sprite, Space on the middle one
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(await focusedCompany(inShadow)).toBe("Taboola");
  await page.keyboard.press("Enter");
  card = await openCardTitle(inShadow);
  expect(card).toMatchObject({ title: "Vampire identified", company: "Taboola", focused: true });
  expect(card!.bottom).toBeLessThanOrEqual(s.vh - 8 + 1);
  expect(card!.left).toBeGreaterThanOrEqual(8);
  await page.keyboard.press("Escape");
  expect(await focusedCompany(inShadow)).toBe("Taboola");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Space");
  expect(await openCardTitle(inShadow)).toMatchObject({ company: "Hotjar", focused: true });
  await page.keyboard.press("Escape");
  expect(await focusedCompany(inShadow)).toBe("Hotjar");
});

test("exorcise from a docked card stamps the sprite and the popup agrees", async ({ context, sw, extensionId }) => {
  // Haunted from the popup, as a user would, so the popup lists the companies.
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(fixture("trackers.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await page.bringToFront();
  await page.waitForTimeout(3700);
  const inShadow = await shadowOf(page);
  const at = await spriteCenter(inShadow, "Criteo");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press("Enter"); // focus is on [Exorcise]
  const stamped = () => inShadow(function () {
    const el = this.querySelector('#graveyard button[data-company="Criteo"]')!;
    return [el.classList.contains("exorcised"), el.querySelector(".stamp")?.textContent ?? null];
  });
  await expect.poll(stamped).toEqual([true, "EXORCISED"]);
  expect(await openCardTitle(inShadow)).toMatchObject({ company: "Criteo" });
  expect(await inShadow(function () { return this.querySelector("#cards .act")!.textContent; })).toBe("Let it back");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${SHOTS}/exorcised-375.png` });
  await popup.bringToFront();
  await expect(popup.locator(".ghost-row.exorcised .row-title")).toHaveText("Criteo");
  // Let it back from the popup: the stamp goes
  await popup.getByRole("button", { name: "Let it back: Criteo" }).click();
  await expect.poll(stamped).toEqual([false, null]);
});

test("page links and form controls still hit the page, last line scrolls above the strip", async ({ context, sw }) => {
  for (const width of [375, 1280]) {
    const { page, inShadow } = await hauntAt(context, sw, width, "wide.html");
    const top = (await strip(inShadow)).top;
    for (const sel of ["#moorings", "#contact", "#q", "#go"]) {
      const hit = await page.evaluate((s) => {
        const el = document.querySelector(s)!;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return at === el || el.contains(at) ? "page" : (at?.localName ?? "none");
      }, sel);
      expect({ width, sel, hit }).toEqual({ width, sel, hit: "page" });
    }
    const last = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return document.getElementById("last")!.getBoundingClientRect().bottom;
    });
    expect({ width, clear: last <= top }).toEqual({ width, clear: true });
    await page.close();
  }
});

test("Hide hides the strip, Show restores it", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "trackers.html");
  const look = () => inShadow(function () {
    const g = getComputedStyle(this.getElementById("graveyard")!);
    return [g.opacity, g.pointerEvents];
  });
  expect(await look()).toEqual(["1", "auto"]);
  await inShadow(function () { this.querySelector<HTMLElement>("#hud button.hide")!.click(); });
  await expect.poll(look).toEqual(["0", "none"]);
  await inShadow(function () { this.querySelector<HTMLElement>("#show-tab")!.click(); });
  await expect.poll(look).toEqual(["1", "auto"]);
  await page.close();
});

test("odometer says tracker requests blocked or seen", async ({ context, sw }) => {
  for (const width of [1280, 375]) {
    const { page, inShadow } = await hauntAt(context, sw, width, "trackers.html");
    const hits = await inShadow(function () {
      const h = this.querySelector<HTMLElement>("#hud .hits")!;
      const sub = h.querySelector<HTMLElement>(".sub")!.getBoundingClientRect();
      const hud = this.getElementById("hud")!.getBoundingClientRect();
      const shown = (sel: string) => h.querySelector<HTMLElement>(sel)!.getBoundingClientRect().width > 0;
      return { role: h.getAttribute("role"), title: h.title, aria: h.getAttribute("aria-label"), label: h.querySelector(".label")!.textContent, subShown: sub.width > 1, odo: shown(".odo"), none: shown(".none"), hudHeight: hud.height };
    });
    expect(hits).toMatchObject({ role: "group", title: SUB, aria: `Souls counted: 000006, ${SUB}`, label: "Souls counted", subShown: width > 400, odo: true, none: false });
    expect(hits.hudHeight).toBeLessThanOrEqual(88); // never more than two rows
    await page.screenshot({ path: `${SHOTS}/odometer-${width}.png` });
    await page.close();
  }
});

test("a page with no souls captions the odometer instead of showing 000000", async ({ context, sw }) => {
  for (const width of [1280, 375]) {
    const { page, inShadow } = await hauntAt(context, sw, width, "clean.html");
    const hits = await inShadow(function () {
      const h = this.querySelector<HTMLElement>("#hud .hits")!;
      const none = h.querySelector<HTMLElement>(".none")!;
      const r = none.getBoundingClientRect();
      const cs = getComputedStyle(none);
      return {
        role: h.getAttribute("role"),
        aria: h.getAttribute("aria-label"),
        odo: h.querySelector<HTMLElement>(".odo")!.getBoundingClientRect().width,
        caption: none.textContent,
        shown: r.width > 0 && cs.visibility === "visible",
        px: parseFloat(cs.fontSize),
        clipped: none.scrollWidth > none.clientWidth,
        hudHeight: this.getElementById("hud")!.getBoundingClientRect().height,
        empty: this.querySelector<HTMLElement>("#hud .empty")!.textContent,
      };
    });
    expect(hits).toMatchObject({ role: "group", aria: `Souls counted: none yet, ${SUB}`, odo: 0, caption: "No souls yet.", shown: true, clipped: false, empty: "No ghosts here. Suspiciously clean." });
    expect(hits.px).toBeGreaterThanOrEqual(12);
    expect(hits.hudHeight).toBeLessThanOrEqual(88);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/odometer-empty-${width}.png` });
    await page.close();
  }
});

test("unhaunt: outerHTML and adoptedStyleSheets equal pre-haunt", async ({ context, sw }) => {
  const { page, before, tabId } = await hauntAt(context, sw, 375, "wide.html");
  const sheets = await page.evaluate(() => document.adoptedStyleSheets.length);
  expect(sheets).toBe(1);
  await sw.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { type: "unhaunt" });
  }, tabId);
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe("0px");
});

test("reduced motion: no animation on docked sprites", async ({ context, sw }) => {
  const { inShadow } = await hauntAt(context, sw, 375, "trackers.html", true);
  const still = await inShadow(function () {
    const sprites = [...this.querySelectorAll<HTMLElement>("#graveyard .stones > button")];
    return {
      n: sprites.length,
      running: this.getAnimations().filter((a) => sprites.some((s) => s.contains((a.effect as KeyframeEffect).target as Node))).length,
      names: [...new Set(sprites.flatMap((s) => [...s.querySelectorAll("*")].map((e) => getComputedStyle(e).animationName)))],
      smooth: getComputedStyle(this.querySelector("#graveyard .stones")!).scrollBehavior,
    };
  });
  expect(still).toEqual({ n: 3, running: 0, names: ["none"], smooth: "auto" });
});
