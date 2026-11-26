// Screenshot comparisons for the costume and the popup, at 1280 and 375 wide, with reduced motion,
// a fixed clock and disabled animations. Baselines live in __screenshots__/ and come from the
// Playwright Docker image: `bun run test:visual:update`, then review the PNGs before committing.
import { expect, haunt, shadowOf, test } from "../e2e/fixtures";
import { hauntThroughPopup, hudCount, openPreparedPopup, prepare, tickUntil, visualUrl, waitForHaunted, waitForPopupSettled } from "./helpers";

const WIDTHS = [1280, 375] as const;

// article: the restyle, tint and guestbook frame on a white page (full-overlay at 375); dark: no tint, light-blue links;
// wide: a full-width page with trackers, so the graveyard strip is docked above the HUD at both widths.
const FIXTURES = ["index", "trackers", "links", "dark-patterns", "column", "article", "dark", "wide"] as const;

test("the image has Comic Neue, so the costume's Comic Sans stack draws a comic face, not a fallback", async ({ context, sw, extensionId }) => {
  // A face is there when text set in it measures differently from the generic fallback alone.
  const page = await context.newPage();
  await prepare(page, 1280);
  await page.goto(visualUrl("index.html"));
  const widths = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const w = (font: string) => {
      ctx.font = font;
      return ctx.measureText("~*~ Welcome to my haunted homepage!!! ~*~").width;
    };
    return { comic: w('14px "Comic Neue", monospace'), mono: w("14px monospace"), comicSerif: w('14px "Comic Neue", serif'), serif: w("14px serif") };
  });
  expect(widths.comic).not.toBe(widths.mono);
  expect(widths.comicSerif).not.toBe(widths.serif);
  // and the costume resolves to it: the HUD's text renders in Comic Neue
  await hauntThroughPopup(context, sw, extensionId, page);
  await page.bringToFront();
  await waitForHaunted(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  type N = { nodeId: number; localName?: string; attributes?: string[]; children?: N[]; shadowRoots?: N[] };
  const find = (n: N): N | undefined =>
    n.attributes?.includes("empty") && n.attributes.includes("class") ? n : [...(n.children ?? []), ...(n.shadowRoots ?? [])].map(find).find(Boolean);
  const empty = find(root as N);
  expect(empty, "the HUD's empty line").toBeDefined();
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: empty!.nodeId });
  expect(fonts.map((f) => f.familyName)).toContain("Comic Neue");
});

for (const name of ["index", "trackers"] as const) {
  test(`in the comic face the HUD copy is whole at 1280 (${name})`, async ({ context, sw, extensionId }) => {
    // index.html: the empty state; trackers.html: the counts. No line ends in an ellipsis.
    const page = await context.newPage();
    await prepare(page, 1280);
    await page.goto(visualUrl(`${name}.html`));
    await hauntThroughPopup(context, sw, extensionId, page);
    await page.bringToFront();
    await waitForHaunted(page);
    const inShadow = await shadowOf(page);
    const cut = await inShadow(function () {
      return [...this.querySelectorAll<HTMLElement>("#hud *")]
        .filter((e) => e.offsetParent && getComputedStyle(e).textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth)
        .map((e) => e.textContent);
    });
    expect(cut).toEqual([]);
  });
}

test("HUD @700", async ({ context, sw, extensionId }) => {
  // Between the phone and the desktop: trackers.html's HUD on one row, counts, odometer and the whole web ring.
  const page = await context.newPage();
  await prepare(page, 700);
  await page.goto(visualUrl("trackers.html"));
  await hauntThroughPopup(context, sw, extensionId, page);
  await page.bringToFront();
  await waitForHaunted(page);
  const inShadow = await shadowOf(page);
  const hud = await inShadow(function () {
    const r = this.querySelector("#hud")!.getBoundingClientRect();
    return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  await page.mouse.move(0, 0);
  // the frame plus 4px around it, and its 4px hard shadow
  await expect(page).toHaveScreenshot("hud-700.png", { clip: { x: hud.x - 4, y: hud.y - 4, width: hud.width + 12, height: hud.height + 12 } });
});

/**
 * news.html mid-moment, motion on: every animation in the costume and on the page sheet is paused at
 * `at` ms. Wide (2000ms): the ghosts high on the page, each with its name on its hem, and the caption
 * riding into the marquee band; phone (2200ms): the last ghosts of the train in the marquee band under
 * the whole address, the caption riding in behind them.
 */
function hauntParade(width: number) {
  const at = width <= 400 ? 2200 : 2000;
  test(`haunt parade @${width}`, async ({ context, sw }) => {
    const page = await context.newPage();
    await prepare(page, width);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(visualUrl("news.html"));
    await page.waitForLoadState("load");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 }); // the moment holds at its start until seeked
    await haunt(sw, page);
    const inShadow = await shadowOf(page);
    await expect.poll(() => hudCount(page, "ghosts"), { timeout: 20_000 }).toBe(4);
    let last = -1;
    await expect
      .poll(async () => {
        const n = await inShadow(function () { return this.querySelectorAll("*").length; });
        const still = n === last;
        last = n;
        return still;
      }, { timeout: 20_000, intervals: [1000] })
      .toBe(true);
    const drawn = await inShadow(function (t: number) {
      const all = new Set([...this.getAnimations(), ...document.getAnimations()]);
      for (const a of all) {
        a.pause();
        a.currentTime = t;
      }
      return { spirits: this.querySelectorAll("#fx .parade > .spirit").length, caption: this.querySelector("#fx .found")?.textContent };
    }, at);
    expect(drawn).toEqual({ spirits: 6, caption: "Trackers found: 6" });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`haunt-parade-${width}.png`, { animations: "allow" });
  });
}

for (const width of WIDTHS) {
  for (const name of FIXTURES) {
    test(`costume ${name} @${width}`, async ({ context, sw, extensionId }) => {
      const page = await context.newPage();
      await prepare(page, width);
      await page.goto(visualUrl(`${name}.html`));
      await hauntThroughPopup(context, sw, extensionId, page);
      await page.bringToFront();
      await waitForHaunted(page);
      if (name === "dark-patterns") {
        // The cart clock ticks only when the paused page clock is advanced; the sixth curse is the ticking timer.
        await tickUntil(page, async () => (await hudCount(page, "curses")) === 6);
        await waitForHaunted(page);
      }
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`costume-${name}-${width}.png`);
    });
  }

  for (const screen of ["idle", "haunted"] as const) {
    test(`popup ${screen} @${width}`, async ({ context, sw, extensionId }) => {
      // trackers.html: the haunted popup lists a ghost and two known vampires.
      const page = await context.newPage();
      await prepare(page, 1280);
      await page.goto(visualUrl("trackers.html"));
      const popup = await openPreparedPopup(context, sw, extensionId, page, width);
      if (screen === "haunted") {
        await popup.getByRole("button", { name: "Haunt page" }).click();
        await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
        await page.bringToFront();
        await waitForHaunted(page);
        await popup.bringToFront();
        await waitForPopupSettled(popup);
      }
      await popup.mouse.move(0, 0);
      await expect(popup).toHaveScreenshot(`popup-${screen}-${width}.png`, { fullPage: true });
    });
  }

  test(`permissions @${width}`, async ({ context, extensionId }) => {
    // The Win95 dialog on the teal desktop, before Chrome is asked.
    const page = await context.newPage();
    await prepare(page, width);
    await page.goto(`chrome-extension://${extensionId}/permissions.html`);
    await expect(page.getByRole("button", { name: "Allow link checks" })).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`permissions-${width}.png`);
  });

  test(`exorcised @${width}`, async ({ context, sw, extensionId }) => {
    // trackers.html: Criteo exorcised from its card (a lane at 1280, the strip at 375), the card closed.
    // Reduced motion: no spin, the 40% sprite and the stamp at once, and the HUD ghost count reads 0.
    const page = await context.newPage();
    await prepare(page, width);
    await page.goto(visualUrl("trackers.html"));
    await hauntThroughPopup(context, sw, extensionId, page);
    await page.bringToFront();
    await waitForHaunted(page);
    const inShadow = await shadowOf(page);
    await inShadow(function () { this.querySelector<HTMLElement>('[data-company="Criteo"]')!.click(); });
    await inShadow(function () { this.querySelector<HTMLElement>("#cards .act")!.click(); });
    await expect.poll(() => hudCount(page, "ghosts")).toBe(0);
    await inShadow(function () {
      this.querySelector<HTMLElement>("#cards .close")!.click();
      (this.activeElement as HTMLElement | null)?.blur();
    });
    await waitForHaunted(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`exorcised-${width}.png`);
  });

  if (width === 375) hauntParade(700);
  hauntParade(width);

  if (width === 375) {
    test(`graveyard exorcised with a card @${width}`, async ({ context, sw, extensionId }) => {
      // trackers.html: Criteo exorcised from its docked card, then Hotjar's card open above the strip.
      const page = await context.newPage();
      await prepare(page, width);
      await page.goto(visualUrl("trackers.html"));
      await hauntThroughPopup(context, sw, extensionId, page);
      await page.bringToFront();
      await waitForHaunted(page);
      const inShadow = await shadowOf(page);
      const press = (company: string) => inShadow(function (c: string) { this.querySelector<HTMLElement>(`#graveyard button[data-company="${c}"]`)!.click(); }, company);
      await press("Criteo");
      await inShadow(function () { this.querySelector<HTMLElement>("#cards .act")!.click(); });
      await expect.poll(() => inShadow(function () { return !!this.querySelector('#graveyard button[data-company="Criteo"] .stamp'); })).toBe(true);
      await press("Hotjar");
      await waitForHaunted(page);
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`graveyard-card-${width}.png`);
    });
  }
}
