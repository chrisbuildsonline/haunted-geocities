// Layout at 375px and in the popup: CURSED! badges stay on their sentence's last line, docked
// graveyard name tags are legible and never collide or clip, the popup's lists scroll above the
// status bar, and no costume or popup text is under 12px; card close buttons are 24px targets.
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { CROWD_HOSTS, expect, fixture, haunt, openPopup, shadowOf, tabIdOf, test, trackerUrl, type InShadow } from "./fixtures";

const ELEMENTS = ["#stock", "#viewers", "#sale", "#clock", "#optin", "#decline"];

async function hauntAt(context: BrowserContext, sw: Worker, width: number, path: string, height = width < 400 ? 740 : 800) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(fixture(path));
  await haunt(sw, page);
  await page.waitForTimeout(3100); // the haunt moment settles
  return { page, inShadow: await shadowOf(page) };
}

/** Every element in the shadow root that shows text of its own, with its computed font size. */
const textSizes = (inShadow: InShadow) =>
  inShadow(function () {
    const out: { text: string; px: number }[] = [];
    for (const el of this.querySelectorAll<HTMLElement>("*")) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue!.trim()).map((n) => n.nodeValue!.trim()).join(" ");
      if (!own || el.closest("[hidden]") || !el.getClientRects().length) continue;
      out.push({ text: own.slice(0, 40), px: parseFloat(getComputedStyle(el).fontSize) });
    }
    return out;
  });

test("375: every CURSED! badge keeps its word and sits on its sentence's last line wherever the word fits", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "dark-patterns.html", 1800);
  await expect.poll(() => inShadow(function () { return this.querySelectorAll("#markers .curse-badge").length; }), { timeout: 10_000 }).toBe(6);
  await page.waitForTimeout(400);
  const geo = await inShadow(function (sels: string[]) {
    return [...this.querySelectorAll<HTMLElement>("#markers .curse-badge")].map((b, i) => {
      const r = b.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(sels[i]!)!);
      const lines = [...range.getClientRects()].filter((x) => x.width > 0);
      const last = lines.reduce((a, x) => (x.bottom > a.bottom || (x.bottom === a.bottom && x.right > a.right) ? x : a));
      const first = lines.reduce((a, x) => (x.top < a.top || (x.top === a.top && x.left < a.left) ? x : a));
      const cy = r.top + r.height / 2;
      const word = b.querySelector("span")!;
      const w = word.getBoundingClientRect();
      // the narrowest labelled badge: the word without its skull
      const compact = b.classList.contains("compact");
      b.classList.add("compact");
      const wordOnly = b.offsetWidth;
      b.classList.toggle("compact", compact);
      return {
        el: sels[i],
        shown: getComputedStyle(b).display !== "none",
        // beside the last line when the word fits there; above the first line (spot b) only when it cannot
        beside: cy >= last.top - 0.5 && cy <= last.bottom + 0.5 && Math.abs(r.left - (last.right + 4)) <= 0.5,
        above: Math.abs(r.left - first.left) <= 0.5 && Math.abs(r.bottom - (first.top - 4)) <= 1,
        wordFits: last.right + 4 + wordOnly <= document.documentElement.clientWidth,
        inside: r.right <= window.innerWidth,
        // the compact badge drops the skull, never the word: CURSED! is always a visible label inside the badge
        label: word.textContent === "CURSED!" && w.width > 20 && w.left >= r.left && w.right <= r.right + 0.5,
        skull: compact ? getComputedStyle(b.querySelector("svg")!).display === "none" : true,
        font: parseFloat(getComputedStyle(b).fontSize),
      };
    });
  }, ELEMENTS);
  for (const g of geo) {
    expect(g).toMatchObject({ shown: true, inside: true, label: true, skull: true });
    expect({ el: g.el, at: g.wordFits ? g.beside : g.above }).toEqual({ el: g.el, at: true });
  }
  // only the opt-in line ends too close to the edge for the word (its old skull-only badge was unlabelled)
  expect(geo.filter((g) => !g.wordFits).map((g) => g.el)).toEqual(["#optin"]);
  for (const g of geo) expect(g.font).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

/** The docked name tags: size, whether the text is cut, and their boxes against the row's. */
const tags = (inShadow: InShadow) =>
  inShadow(function () {
    const row = this.querySelector<HTMLElement>("#graveyard .stones")!;
    const rr = row.getBoundingClientRect();
    return [...row.querySelectorAll<HTMLElement>(":scope > button")].map((b) => {
      const t = b.querySelector<HTMLElement>(".tag")!;
      const r = t.getBoundingClientRect();
      const cs = getComputedStyle(t);
      return {
        company: b.dataset.company!,
        text: t.textContent,
        shown: cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity === "1" && r.width > 0,
        px: parseFloat(cs.fontSize),
        cut: t.scrollWidth > t.clientWidth,
        inButton: r.left >= b.getBoundingClientRect().left - 0.5 && r.right <= b.getBoundingClientRect().right + 0.5,
        inRow: r.top >= rr.top - 0.5 && r.bottom <= rr.top + row.clientHeight + 0.5,
        box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      };
    });
  });

const overlaps = (boxes: { left: number; right: number; top: number; bottom: number }[]) =>
  boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)).length;

test("graveyard name tags are legible, whole and apart at 375 and on a full-width page", async ({ context, sw }) => {
  for (const [width, path, names] of [
    [375, "trackers.html", ["Criteo", "Hotjar", "Taboola"]],
    [1280, "wide.html", ["Criteo", "AdTheorent", "Hotjar", "Taboola"]],
  ] as const) {
    const { page, inShadow } = await hauntAt(context, sw, width, path);
    const t = await tags(inShadow);
    expect(t.map((x) => x.text)).toEqual(names);
    for (const x of t) expect({ ...x, box: 0 }).toEqual({ company: x.company, text: x.company, shown: true, px: x.px, cut: false, inButton: true, inRow: true, box: 0 });
    for (const x of t) expect(x.px).toBeGreaterThanOrEqual(12);
    expect(overlaps(t.map((x) => x.box))).toBe(0);
    await page.close();
  }
});

test("a crowded graveyard keeps its tags apart and inside the row", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "trackers.html");
  for (const host of Object.values(CROWD_HOSTS)) {
    await page.evaluate((url) => fetch(url, { mode: "no-cors" }).then(() => "loaded"), trackerUrl(host, `crowd-${host}`));
  }
  await expect.poll(async () => (await tags(inShadow)).length).toBe(9);
  await page.waitForTimeout(400);
  const t = await tags(inShadow);
  for (const x of t) expect({ company: x.company, shown: x.shown, inButton: x.inButton, inRow: x.inRow }).toEqual({ company: x.company, shown: true, inButton: true, inRow: true });
  expect(overlaps(t.map((x) => x.box))).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the web ring's name is whole between prev and next at 375, 700 and 1280", async ({ context, sw }) => {
  // trackers.html: the counts and the six-digit odometer, the HUD at its fullest.
  for (const width of [375, 700, 1280]) {
    const { page, inShadow } = await hauntAt(context, sw, width, "trackers.html");
    await expect.poll(() => inShadow(function () { return !(this.querySelector("#hud .odo") as HTMLElement).hidden; })).toBe(true);
    const ring = await inShadow(function () {
      const name = this.querySelector<HTMLElement>("#hud .ring-name")!;
      const ring = this.querySelector<HTMLElement>("#hud .ring")!;
      const hud = this.querySelector<HTMLElement>("#hud")!.getBoundingClientRect();
      return {
        text: ring.innerText.replace(/\s+/g, " ").trim(),
        cut: name.scrollWidth > name.clientWidth,
        inHud: ring.getBoundingClientRect().right <= hud.right + 0.5,
      };
    });
    expect({ width, ...ring }).toEqual({ width, text: expect.stringMatching(/^« prev \| (Haunted )?WebRing \| next »$/), cut: false, inHud: true });
    await page.close();
  }
});

async function hauntedPopup(context: BrowserContext, sw: Worker, extensionId: string, size: { width: number; height: number }): Promise<Page> {
  const page = await context.newPage();
  await page.goto(fixture(`trackers.html?w=${size.width}`)); // a URL of its own: tabIdOf finds the tab by URL
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.setViewportSize(size);
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await expect(popup.getByText("No curses. This page plays fair.")).toBeAttached();
  await expect(popup.locator(".vampire-row")).toHaveCount(2);
  return popup;
}

test("popup: the lists scroll above the status bar, so the last line is never under it", async ({ context, sw, extensionId }) => {
  for (const size of [{ width: 360, height: 600 }, { width: 375, height: 667 }]) {
    const popup = await hauntedPopup(context, sw, extensionId, size);
    const geo = await popup.evaluate(() => {
      const client = document.querySelector<HTMLElement>(".client")!;
      const bar = () => document.querySelector(".statusbar")!.getBoundingClientRect();
      const line = () => [...document.querySelectorAll("p")].find((p) => p.textContent === "No curses. This page plays fair.")!.getBoundingClientRect();
      // Whole and above the status bar as the popup opens, with no scrolling...
      const c = client.getBoundingClientRect();
      const atRest = line().bottom <= bar().top + 0.5 && line().bottom <= c.bottom - parseFloat(getComputedStyle(client).paddingBottom) + 0.5;
      // ...and the list still scrolls inside the client, which ends above the status bar.
      client.scrollTop = client.scrollHeight;
      const settings = document.querySelector("fieldset.settings")!.getBoundingClientRect();
      return {
        atRest,
        scrolls: client.scrollHeight > client.clientHeight,
        clientAboveBar: c.bottom <= bar().top + 0.5,
        endAboveBar: settings.bottom <= bar().top + 0.5,
        barInWindow: bar().bottom <= Math.min(window.innerHeight, 600) + 0.5,
      };
    });
    expect({ size, ...geo }).toEqual({ size, atRest: true, scrolls: true, clientAboveBar: true, endAboveBar: true, barInWindow: true });
    await popup.close();
  }
});

test("popup: no text under 12px", async ({ context, sw, extensionId }) => {
  const popup = await hauntedPopup(context, sw, extensionId, { width: 360, height: 600 });
  const small = await popup.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue!.trim()) && el.getClientRects().length)
      .map((el) => ({ text: el.textContent!.trim().slice(0, 40), px: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((x) => x.px < 12),
  );
  expect(small).toEqual([]);
});

test("375: costume text is 12px or more and card close buttons are 24px targets", async ({ context, sw }) => {
  const { page, inShadow } = await hauntAt(context, sw, 375, "trackers.html");
  // An exorcised sprite (the stamp) and an open card (category, footnote, close button).
  await inShadow(function () { this.querySelector<HTMLElement>('#graveyard button[data-company="Criteo"]')!.click(); });
  await inShadow(function () { this.querySelector<HTMLElement>("#cards .act")!.click(); });
  await expect.poll(() => inShadow(function () { return !!this.querySelector('#graveyard button[data-company="Criteo"] .stamp'); })).toBe(true);
  await page.waitForTimeout(300);
  expect((await textSizes(inShadow)).filter((x) => x.px < 12)).toEqual([]);
  const close = await inShadow(function () {
    const r = this.querySelector("#cards .close")!.getBoundingClientRect();
    return [r.width, r.height];
  });
  expect(close[0]).toBeGreaterThanOrEqual(24);
  expect(close[1]).toBeGreaterThanOrEqual(24);

  // The tombstone card: its inscription and its close button.
  const links = await hauntAt(context, sw, 375, "links.html");
  const marker = ".tomb-marker";
  await expect.poll(() => links.inShadow(function (sel: string) { return [...this.querySelectorAll<HTMLElement>(sel)].some((m) => getComputedStyle(m).display !== "none"); }, marker), { timeout: 8000 }).toBe(true);
  await links.inShadow(function (sel: string) { [...this.querySelectorAll<HTMLElement>(sel)].find((m) => getComputedStyle(m).display !== "none")!.click(); }, marker);
  await expect.poll(() => links.inShadow(function () { return !!this.querySelector("#cards .tombstone-card"); })).toBe(true);
  await links.page.waitForTimeout(300);
  expect((await textSizes(links.inShadow)).filter((x) => x.px < 12)).toEqual([]);
  const stoneClose = await links.inShadow(function () {
    const r = this.querySelector("#cards .tombstone-card .close")!.getBoundingClientRect();
    return Math.min(r.width, r.height);
  });
  expect(stoneClose).toBeGreaterThanOrEqual(24);
});
