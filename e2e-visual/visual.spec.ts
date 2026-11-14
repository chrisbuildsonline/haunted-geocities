// Screenshot comparisons for the costume and the popup, at 1280 and 375 wide, with reduced motion,
// a fixed clock and disabled animations. Baselines live in __screenshots__/ and come from the
// Playwright Docker image: `bun run test:visual:update`, then review the PNGs before committing.
import { expect, test } from "../e2e/fixtures";
import { hauntThroughPopup, hudCount, openPreparedPopup, prepare, tickUntil, visualUrl, waitForHaunted, waitForPopupSettled } from "./helpers";

const WIDTHS = [1280, 375] as const;

const FIXTURES = ["index", "trackers", "links", "dark-patterns", "column"] as const;

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
}
