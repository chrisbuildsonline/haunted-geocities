// The exorcise moment on fixtures/trackers.html: Exorcise from Criteo's card spins its sprite out
// (one 400ms turn down to 40%, the EXORCISED stamp slamming on) and the HUD ghost count ticks from
// 1 to 0; Let it back raises it again. In a lane at 1280, docked in the graveyard strip at 375.
// Under reduced motion nothing turns: the 40% look and the stamp are there at once.
import type { Page } from "@playwright/test";
import { expect, fixture, openPopup, shadowOf, tabIdOf, test, type InShadow } from "./fixtures";

const SHOTS = "test-results/exorcise-moment";

async function hauntTrackers(context: Parameters<typeof openPopup>[0], sw: Parameters<typeof tabIdOf>[0], extensionId: string, width: number, reduced = false) {
  const page = await context.newPage();
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width >= 1280 ? 800 : 740 });
  await page.goto(fixture("trackers.html"));
  const popup = await openPopup(context, extensionId, await tabIdOf(sw, page));
  await popup.getByRole("button", { name: "Haunt this page" }).click();
  await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
  await page.bringToFront();
  await page.waitForTimeout(reduced ? 400 : 3100); // the haunt moment settles
  return { page, popup, inShadow: await shadowOf(page) };
}

const CRITEO = '#lanes .ghost[data-company="Criteo"], #graveyard .ghost[data-company="Criteo"]';

/** Criteo's sprite state, the spins running on it, and the HUD's ghost count. */
const look = (inShadow: InShadow) =>
  inShadow(function (sel: string) {
    const g = this.querySelector<HTMLElement>(sel)!;
    const sprite = g.querySelector(".sprite")!;
    const spins = this.getAnimations().filter((a) => {
      const e = a.effect as KeyframeEffect;
      return e.target === sprite && e.getKeyframes().some((k) => String(k.transform).includes("rotate"));
    });
    return {
      where: g.parentElement!.id || g.parentElement!.className,
      exorcised: g.classList.contains("exorcised"),
      stamp: g.querySelector(".stamp")?.textContent ?? null,
      spins: spins.map((a) => [a.effect!.getTiming().duration, a.playState]),
      opacity: getComputedStyle(sprite).opacity,
      ghosts: this.querySelector("#hud .count.ghosts .n")!.textContent,
      counts: !(this.querySelector("#hud .counts") as HTMLElement).hidden,
    };
  }, CRITEO);

async function exorciseFromCard(page: Page, inShadow: InShadow) {
  const r = await inShadow(function (sel: string) {
    const b = this.querySelector(sel)!.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, CRITEO);
  await page.mouse.click(r.x, r.y);
  await expect.poll(() => inShadow(function () { return this.querySelector("#cards .act")?.textContent ?? null; })).toBe("Exorcise");
  // Click, then wait for the sprite's class to change; the moment starts in that same task.
  await inShadow(function (sel: string) {
    const g = this.querySelector<HTMLElement>(sel)!;
    const changed = new Promise<void>((done) => new MutationObserver((_, mo) => (mo.disconnect(), done())).observe(g, { attributeFilter: ["class"] }));
    this.querySelector<HTMLElement>("#cards .act")!.click();
    return changed;
  }, CRITEO);
}

for (const width of [1280, 375] as const) {
  test(`Exorcise spins the sprite out and the HUD ghost count ticks down @${width}`, async ({ context, sw, extensionId }) => {
    const { page, popup, inShadow } = await hauntTrackers(context, sw, extensionId, width);
    expect(await look(inShadow)).toMatchObject({ where: width === 1280 ? "lanes" : "stones", exorcised: false, ghosts: "1", spins: [] });

    await exorciseFromCard(page, inShadow);
    // Caught mid-turn: one 400ms spin is running on the sprite and the count already reads 0.
    const mid = await look(inShadow);
    expect(mid).toMatchObject({ exorcised: true, stamp: "EXORCISED", ghosts: "0", counts: true });
    expect(mid.spins).toEqual([[400, "running"]]);
    // Freeze it halfway round for the shot, then let it finish.
    await inShadow(function () {
      // the spin (400), the stamp (200 after 200) and the count's tick (300)
      for (const a of this.getAnimations()) if ([400, 300, 200].includes(Number(a.effect?.getTiming().duration))) { a.pause(); a.currentTime = 260; }
    });
    await page.screenshot({ path: `${SHOTS}/mid-${width}.png` });
    await inShadow(function () {
      for (const a of this.getAnimations()) if (a.playState === "paused") a.play();
    });
    await expect.poll(() => look(inShadow)).toMatchObject({ spins: [], opacity: "0.4", ghosts: "0" });
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${SHOTS}/after-${width}.png` });

    // Let it back from the popup: whole again, no spin, and the count ticks back up.
    await popup.bringToFront();
    await popup.getByRole("button", { name: "Let it back: Criteo" }).click();
    await page.bringToFront();
    await expect.poll(() => look(inShadow)).toMatchObject({ exorcised: false, stamp: null, ghosts: "1", spins: [] });
  });
}

test("reduced motion: no spin, the 40% look and the stamp at once, and the count changes in place", async ({ context, sw, extensionId }) => {
  const { page, inShadow } = await hauntTrackers(context, sw, extensionId, 1280, true);
  await exorciseFromCard(page, inShadow);
  await expect.poll(async () => (await look(inShadow)).exorcised).toBe(true);
  const now = await look(inShadow);
  expect(now).toMatchObject({ stamp: "EXORCISED", spins: [], opacity: "0.4", ghosts: "0" });
  const running = await inShadow(function () {
    return this.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity).length;
  });
  expect(running).toBe(0);
});
