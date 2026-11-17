import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { setup, stubMain, withTrackers } from "./helpers";
import { playUnhaunt } from "../../src/content/costume/haunt-moment";

test("clip-path reveal covers frame and tint", () => {
  const { win, doc, recs } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  const clip = (el: Element, pseudo?: string) =>
    recs.find((r) => r.el === el && r.opts.pseudoElement === pseudo && r.keyframes.some((k) => "clipPath" in k));
  // the edge frame and the gutters are inside #starfield, which is clipped behind the ghost
  expect(root.getElementById("starfield")!.contains(root.getElementById("edge-frame"))).toBe(true);
  const field = clip(root.getElementById("starfield")!);
  expect(field?.opts).toMatchObject({ delay: 200, duration: 900 });
  // the page-sheet layers get the same wipe, shifted into their own box (tint at x=296, frame at x=290)
  const tint = clip(doc.documentElement, "::before");
  const frame = clip(doc.documentElement, "::after");
  expect(tint?.opts).toMatchObject({ delay: 200, duration: 900, easing: field!.opts.easing });
  expect(frame?.opts).toMatchObject({ delay: 200, duration: 900 });
  expect(tint!.keyframes.map((k) => k.clipPath)).toEqual(["inset(-8px calc(100% - -80px + 296px) -8px -8px)", "inset(-8px calc(100% - (100vw - 16px) + 296px) -8px -8px)"]);
  expect(String(frame!.keyframes[0]!.clipPath)).toContain("+ 290px");
});

test("graveyard slides with the HUD, no extra phase", async () => {
  const { win, doc, recs } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  const hud = root.getElementById("hud")!;
  const strip = root.getElementById("graveyard")!;
  const slide = (el: Element) => recs.filter((r) => r.el === el && r.keyframes.some((k) => String(k.transform).startsWith("translateY")));
  const timing = (r: { opts: KeyframeAnimationOptions }) => ({ delay: r.opts.delay, duration: r.opts.duration, easing: r.opts.easing });
  // in: one slide up, same delay, duration and easing as the HUD's, ending in place
  expect(slide(strip)).toHaveLength(1);
  expect(timing(slide(strip)[0]!)).toEqual(timing(slide(hud)[0]!));
  expect(slide(strip)[0]!.keyframes.at(-1)!.transform).toBe("translateY(0px)");
  // its sprites do not rise on their own during the haunt moment
  const sprites = [...strip.querySelectorAll(".stones > button")];
  expect(recs.filter((r) => sprites.some((s) => s === r.el || s.contains(r.el)))).toEqual([]);
  // out: one slide down with the HUD
  recs.length = 0;
  await playUnhaunt(root.getElementById("crypt-root")!, false);
  expect(slide(strip)).toHaveLength(1);
  expect(timing(slide(strip)[0]!)).toEqual(timing(slide(hud)[0]!));
  expect(slide(strip)[0]!.keyframes[0]!.transform).toBe("translateY(0px)");
});

test("a hidden strip (lane mode) gets no slide", () => {
  const { win, doc, recs } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  expect(recs.filter((r) => r.el === root.getElementById("graveyard"))).toEqual([]);
});
