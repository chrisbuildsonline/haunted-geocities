// The scene-wide part of the haunt moment: six big tracker ghosts drift up through the whole page and
// one band of scanlines rolls down it (design/DESIGN.md "Haunt moment", the parade and the roll).
// Under reduced motion neither exists, and the settled costume is the same either way.
import type { Page } from "@playwright/test";
import { expect, fixture, haunt, shadowOf, test } from "./fixtures";

const OUT = "test-results/hero";

// `query` keeps two open tabs on different URLs: tabIdOf finds a tab by its URL.
async function openNews(page: Page, width: number, query = "") {
  await page.setViewportSize({ width, height: width >= 1280 ? 800 : 667 });
  await page.goto(fixture(`news.html${query}`));
  await page.waitForLoadState("load");
}

for (const width of [1280, 700, 375] as const) {
  test(`@${width}: six big ghosts cross the whole page bottom to top, a scanline roll passes once, no overflow`, async ({ context, sw }) => {
    test.setTimeout(90_000);
    const page = await context.newPage();
    await openNews(page, width);
    // The page's animation clock at a fifth of real time, so every spirit is sampled on its way.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
    await haunt(sw, page);
    const inShadow = await shadowOf(page);

    type Box = { left: number; top: number; bottom: number; width: number };
    type Sample = { fx: boolean; spirits: Box[]; roll: Box | null; overflow: boolean; vh: number; vw: number };
    const samples: Sample[] = [];
    let shot = false;
    for (const end = Date.now() + 45_000; Date.now() < end; await page.waitForTimeout(40)) {
      const s: Sample = await inShadow(function () {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
        };
        const roll = this.querySelector("#fx .roll");
        return {
          fx: !!this.getElementById("fx"),
          spirits: [...this.querySelectorAll("#fx .parade > .spirit")].map(box),
          roll: roll ? box(roll) : null,
          overflow: document.documentElement.scrollWidth > innerWidth,
          vh: innerHeight,
          vw: innerWidth,
        };
      });
      samples.push(s);
      const onScreen = s.spirits.filter((b) => b.bottom > 0 && b.top < s.vh).length;
      if (!shot && onScreen >= 4) {
        shot = true;
        await page.screenshot({ path: `${OUT}/parade-${width}.png` });
      }
      if (!s.fx) break;
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

    const live = samples.filter((s) => s.fx);
    const { vh, vw } = samples[0]!;
    // six spirits, the near ones 144px and the far ones 96px, all inside the page's width
    expect(live[0]!.spirits.map((b) => Math.round(b.width)).sort()).toEqual([144, 144, 144, 96, 96, 96].sort());
    // each one is seen low on the page and later high on it: a crossing of the whole height
    for (let i = 0; i < 6; i++) {
      const tops = live.map((s) => s.spirits[i]!.top);
      const low = tops.findIndex((t) => t > vh * 0.6 && t < vh);
      const high = tops.some((t, n) => n > low && t < vh * 0.2 && t > -live[0]!.spirits[i]!.width);
      expect({ i, low: low >= 0, high }).toEqual({ i, low: true, high: true });
    }
    // they spread across the width: centres in the left and right thirds
    const centres = live[0]!.spirits.map((b) => b.left + b.width / 2);
    expect(Math.min(...centres)).toBeLessThan(vw / 3);
    expect(Math.max(...centres)).toBeGreaterThan((2 * vw) / 3);
    // the roll band passes the top third, then the bottom third, once
    const rollTops = live.map((s) => s.roll!.top);
    const upper = rollTops.findIndex((t) => t >= 0 && t < vh / 3);
    const lower = rollTops.findIndex((t) => t > (2 * vh) / 3 && t < vh);
    expect(upper).toBeGreaterThanOrEqual(0);
    expect(lower).toBeGreaterThan(upper);
    // nothing pushes the page sideways while it plays, and the FX root is gone at the end
    expect(samples.some((s) => s.overflow)).toBe(false);
    expect(samples.at(-1)!.fx).toBe(false);
    expect(shot).toBe(true);
  });
}

test("reduced motion: no parade and no roll at any point; the settled costume matches the animated one", async ({ context, sw }) => {
  test.setTimeout(60_000);
  const layers = async (page: Page) => {
    const inShadow = await shadowOf(page);
    return inShadow(function () {
      return {
        parade: this.querySelectorAll(".parade, .spirit, .roll").length,
        ids: [...this.querySelectorAll("#crypt-root > [id]")].map((e) => e.id),
        ghosts: [...this.querySelectorAll<HTMLElement>("#lanes > .ghost")].map((g) => [g.dataset.company, getComputedStyle(g).opacity]),
      };
    });
  };
  // reduced: sample through the whole window in which the parade would play
  const still = await context.newPage();
  await still.emulateMedia({ reducedMotion: "reduce" });
  await openNews(still, 1280);
  await haunt(sw, still);
  const inShadow = await shadowOf(still);
  const seen: number[] = [];
  for (const end = Date.now() + 3200; Date.now() < end; await still.waitForTimeout(50)) {
    seen.push(await inShadow(function () { return this.querySelectorAll("#fx, .parade, .spirit, .roll").length; }));
  }
  expect(seen.length).toBeGreaterThan(10);
  expect(seen.filter((n) => n > 0)).toEqual([]);
  await still.screenshot({ path: `${OUT}/parade-reduced.png` });

  // with motion: once the moment is over, the same layers and the same ghosts, and no parade left
  const moving = await context.newPage();
  await openNews(moving, 1280, "?motion");
  await haunt(sw, moving);
  await moving.waitForTimeout(3600);
  expect(await layers(moving)).toEqual(await layers(still));
  expect((await layers(still)).parade).toBe(0);
});
