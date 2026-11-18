// Screenshot comparisons for the costume and the popup, at 1280 and 375 wide, with reduced motion,
// a fixed clock and disabled animations. Baselines live in __screenshots__/ and come from the
// Playwright Docker image: `bun run test:visual:update`, then review the PNGs before committing.
import { expect, shadowOf, test } from "../e2e/fixtures";
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
        await popup.getByRole("button", { name: "Haunt this page" }).click();
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
