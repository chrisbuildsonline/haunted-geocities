import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { setup, stubMain } from "./helpers";

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
