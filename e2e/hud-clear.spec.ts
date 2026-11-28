// Legible tags, a whole marquee and a clear HUD (design/DESIGN.md "Ghosts", "Findings strip", "Top bands",
// "Card style"), at 1280 and on a 360px phone: the jury read the ghost name tags and the findings line as
// tiny and dim, saw the marquee cut at the viewport edge, and saw cards and the findings line on the HUD.
import type { Page } from "@playwright/test";
import { expect, fixture, haunt, openPopup, scrollToEnd, shadowOf, tabIdOf, test, type InShadow } from "./fixtures";

const SIZES = [[1280, 800], [360, 640]] as const;
const CRYPT = "rgb(0, 0, 51)";

/** WCAG contrast of two computed `rgb()` colours. */
const ratio = (a: string, b: string) => {
  const lum = (c: string) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

type Box = { left: number; top: number; right: number; bottom: number };
const crosses = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

async function hauntTrackers(page: Page, sw: Parameters<typeof haunt>[0], width: number, height: number): Promise<InShadow> {
  await page.setViewportSize({ width, height });
  await page.goto(fixture("trackers.html"));
  await haunt(sw, page);
  await page.waitForTimeout(3700); // the haunt moment settles
  return shadowOf(page);
}

const box = (inShadow: InShadow, sel: string) =>
  inShadow(function (s: string) {
    const el = this.querySelector<HTMLElement>(s);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  }, sel);

for (const [width, height] of SIZES) {
  test(`${width}: name tags and the findings line are 14px and hold 4.5:1, and the tags stand off the crypt`, async ({ context, sw }) => {
    const page = await context.newPage();
    const inShadow = await hauntTrackers(page, sw, width, height);
    const labels = await inShadow(function () {
      const read = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        return { text: el.textContent, size: parseFloat(cs.fontSize), color: cs.color, ground: cs.backgroundColor };
      };
      return { tags: [...this.querySelectorAll<HTMLElement>("#lanes .tag, #graveyard .tag")].map(read), findings: read(this.getElementById("findings")!) };
    });
    expect(labels.tags.length).toBeGreaterThanOrEqual(3);
    for (const t of labels.tags) {
      expect({ tag: t.text, size: t.size >= 14 }).toEqual({ tag: t.text, size: true });
      expect({ tag: t.text, ink: ratio(t.color, t.ground) >= 4.5 }).toEqual({ tag: t.text, ink: true });
      expect({ tag: t.text, offCrypt: ratio(t.ground, CRYPT) >= 4.5 }).toEqual({ tag: t.text, offCrypt: true });
    }
    expect(labels.findings.text).toBe("Trackers 3 / Vampires 2");
    expect(labels.findings.size).toBeGreaterThanOrEqual(14);
    expect(ratio(labels.findings.color, labels.findings.ground)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/hud-clear/tags-${width}.png` });
  });

  test(`${width}: the marquee line never meets the viewport edge, and never the HUD`, async ({ context, sw }) => {
    const page = await context.newPage();
    const inShadow = await hauntTrackers(page, sw, width, height);
    const band = (await box(inShadow, "#marquee"))!;
    /** Pixels of the marquee's #66ff99 ink in a clip of the band. */
    const ink = async (x: number, w: number) => {
      const png = (await page.screenshot({ clip: { x, y: Math.floor(band.top), width: w, height: Math.floor(band.bottom - band.top) } })).toString("base64");
      return page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        [c.width, c.height] = [img.width, img.height];
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 1]! > 120 && d[i + 1]! - d[i]! > 60) n++;
        return n;
      }, png);
    };
    // Hold the line entering at the right edge, crossing the middle, and leaving at the left edge.
    for (const left of [width - 30, width * 0.4, -40]) {
      await inShadow(function (x: number) {
        const a = this.getAnimations().find((n) => (n as CSSAnimation).animationName === "hg-marquee")!;
        const t = a.effect!.getComputedTiming();
        const travel = this.querySelector<HTMLElement>(".marquee-track")!.getBoundingClientRect().width;
        const vw = this.getElementById("marquee")!.clientWidth;
        a.pause();
        a.currentTime = (a.effect!.getTiming().delay as number) + ((vw - x) / travel) * (t.duration as number);
      }, left);
      expect(await ink(0, width), `the line is on screen at ${left}px`).toBeGreaterThan(0);
      expect(await ink(0, 8), `ink in the left 8px at ${left}px`).toBe(0);
      expect(await ink(width - 8, 8), `ink in the right 8px at ${left}px`).toBe(0);
    }
    await page.screenshot({ path: `test-results/hud-clear/marquee-${width}.png`, clip: { x: 0, y: 0, width, height: 48 } });

    // The bands stay at the top and the HUD in the footer: they never share a pixel, at the page's end or after the ghost icon's jump.
    await scrollToEnd(page);
    expect(crosses((await box(inShadow, "#marquee"))!, (await box(inShadow, "#hud"))!)).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await inShadow(function () { this.getElementById("show-tab")!.click(); });
    await page.waitForTimeout(1500); // the smooth scroll to the graveyard
    expect(crosses((await box(inShadow, "#marquee"))!, (await box(inShadow, "#hud"))!)).toBe(false);
  });

  test(`${width}: the findings line never covers the HUD as it scrolls in`, async ({ context, sw }) => {
    const page = await context.newPage();
    const inShadow = await hauntTrackers(page, sw, width, height);
    for (const peek of [10, 30, 50, 90]) {
      // scroll the HUD's top to `peek` px above the bottom of the viewport
      await inShadow(function (k: number) { scrollBy(0, this.getElementById("hud")!.getBoundingClientRect().top - (innerHeight - k)); }, peek);
      await page.waitForTimeout(100);
      const hud = (await box(inShadow, "#hud"))!;
      expect(Math.round(hud.top)).toBe(height - peek);
      const strip = await box(inShadow, "#findings");
      expect({ peek, overHud: !!strip && crosses(strip, hud) }).toEqual({ peek, overHud: false });
    }
  });

  test(`${width}: a card opened from the graveyard at the page's end stands clear of the HUD`, async ({ context, sw }) => {
    const page = await context.newPage();
    const inShadow = await hauntTrackers(page, sw, width, height);
    await scrollToEnd(page);
    const companies = await inShadow(function () { return [...this.querySelectorAll<HTMLElement>("#graveyard .stones > button")].map((b) => b.dataset.company!); });
    expect(companies.length).toBe(3);
    for (const company of companies) {
      await inShadow(function (c: string) { this.querySelector<HTMLElement>(`#graveyard button[data-company="${c}"]`)!.click(); }, company);
      const card = (await box(inShadow, "#cards .card"))!;
      const hud = (await box(inShadow, "#hud"))!;
      expect({ company, overHud: crosses(card, hud) }).toEqual({ company, overHud: false });
      expect({ company, inView: card.top >= 0 && card.bottom <= height && card.left >= 0 && card.right <= width }).toEqual({ company, inView: true });
      if (company === companies[0]) await page.screenshot({ path: `test-results/hud-clear/graveyard-card-${width}.png` });
      await inShadow(function () { this.querySelector<HTMLElement>("#cards .close")!.click(); });
    }
  });

  test(`${width}: a tombstone opened with the footer on screen stands clear of the HUD, and of the whole footer where it fits above it`, async ({ context, sw, extensionId }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(fixture("links.html"));
    const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
    await popup.getByRole("button", { name: "Haunt page" }).click();
    await page.bringToFront();
    const inShadow = await shadowOf(page);
    await expect.poll(() => inShadow(function () { return getComputedStyle(this.querySelector("#markers")!).opacity === "1" && this.querySelectorAll(".tomb-marker").length === 3; }), { timeout: 8000 }).toBe(true);
    await scrollToEnd(page);
    // the last stone on screen above the footer, with the footer's top in view
    const at = await inShadow(function () {
      const footer = this.getElementById("crypt-footer")!.getBoundingClientRect();
      const shown = [...this.querySelectorAll<HTMLElement>(".tomb-marker")].map((m) => m.getBoundingClientRect()).filter((r) => r.top >= 48 && r.bottom <= Math.min(footer.top, innerHeight));
      const r = shown.at(-1);
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, footerTop: footer.top } : null;
    });
    expect(at).not.toBeNull();
    expect(at!.footerTop).toBeLessThan(height);
    await page.mouse.click(at!.x, at!.y);
    await expect.poll(() => inShadow(function () { return getComputedStyle(this.querySelector("#cards .tombstone-card")!).opacity; })).toBe("1");
    const card = (await box(inShadow, "#cards .tombstone-card"))!;
    // Clear of the whole footer where the 248px stone fits above it (8px each side), as at 1280; on a
    // phone, where the footer takes most of the screen, still clear of the HUD.
    if (at!.footerTop - 48 >= 264) expect(crosses(card, (await box(inShadow, "#crypt-footer"))!)).toBe(false);
    if (width === 1280) expect(at!.footerTop - 48).toBeGreaterThanOrEqual(264);
    expect(crosses(card, (await box(inShadow, "#hud"))!)).toBe(false);
    expect(card.top).toBeGreaterThanOrEqual(48);
    expect(card.bottom).toBeLessThanOrEqual(height);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `test-results/hud-clear/tombstone-${width}.png` });
  });
}
