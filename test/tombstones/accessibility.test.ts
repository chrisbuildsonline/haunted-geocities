// Tombstones spec task 14.5: nothing about a tombstone flashes, blinks or strobes faster than 3 Hz.
import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { openTombstoneCard } from "../../src/content/costume/card";
import { playHaunt } from "../../src/content/costume/haunt-moment";
import { costumeCss } from "../../src/content/costume/styles";
import { mountTombstones } from "../../src/content/costume/tombstones";
import type { DeadLink } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});
type Rec = { el: Element; kf: Keyframe[]; o: KeyframeAnimationOptions };
const MIN_PERIOD_MS = 333; // 3 Hz

/** A page with its markers layer and Element.animate recorded. `restore` puts the shared prototype back. */
function page() {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  win.document.write(`<!doctype html><html><body><a href="/missing.html">Stall list</a></body></html>`);
  const doc = win.document as unknown as Document;
  const recs: Rec[] = [];
  const proto = win.Element.prototype as unknown as { animate: unknown };
  const original = proto.animate; // happy-dom shares the prototype across windows
  proto.animate = function (this: Element, kf: Keyframe[], o: KeyframeAnimationOptions) {
    recs.push({ el: this, kf, o });
    return { finished: Promise.resolve(), finish() {} };
  };
  return { doc, recs, restore: () => (proto.animate = original) };
}
const dead: DeadLink = { url: "https://haunt.example/missing.html", path: "/missing.html", status: 404 };
const css = costumeCss({ stars: "", twinkle: "" });

describe("no tombstone animation period under 333ms", () => {
  test("no CSS rule for a marker or the stone card animates or transitions", () => {
    const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(([, sel]) => /tomb/.test(sel!));
    expect(rules.length).toBeGreaterThan(8);
    for (const [, sel, body] of rules) expect({ [sel!.trim()]: /animation|transition/.test(body!) }).toEqual({ [sel!.trim()]: false });
    expect(css).not.toMatch(/@keyframes hg-tomb/);
  });

  test("a new marker fades in once, over 200ms, opacity only, with no repeat or alternation", () => {
    const p = page();
    try {
      const markers = p.doc.body.appendChild(p.doc.createElement("div"));
      const tombs = mountTombstones(markers, { slots: () => [], fade: () => true, onOpen: () => undefined });
      tombs.update([dead]);
      const marker = markers.querySelector(".tomb-marker");
      expect(marker).not.toBeNull();
      const fades = p.recs.filter((r) => r.el === marker);
      expect(fades).toHaveLength(1);
      expect(fades[0]!.kf).toEqual([{ opacity: 0 }, { opacity: 1 }]);
      expect([fades[0]!.o.duration, fades[0]!.o.iterations, fades[0]!.o.direction]).toEqual([200, undefined, undefined]);
      tombs.stop();
    } finally {
      p.restore();
    }
  });

  test("the stone card opens without any animation of its own (it is the plain stone)", () => {
    const p = page();
    try {
      const cards = p.doc.body.appendChild(p.doc.createElement("div"));
      const opener = p.doc.body.appendChild(p.doc.createElement("button"));
      openTombstoneCard(cards, dead, opener, { bounds: { top: 48, bottom: 740 }, reduced: false });
      // The shared card slot fades in 120ms once, scale .96 to 1: not a loop.
      for (const r of p.recs) expect([r.o.iterations, r.o.direction]).toEqual([undefined, undefined]);
    } finally {
      p.restore();
    }
  });

  test("the haunt moment shows the markers layer with one 200ms opacity fade after 2300ms, no repeat", () => {
    const p = page();
    try {
      const croot = p.doc.body.appendChild(p.doc.createElement("div"));
      croot.innerHTML = `<div id="starfield"></div><div id="top-bands"></div><div id="markers"></div><div id="hud"></div><div id="lanes"></div>`;
      playHaunt(croot, false);
      const layer = p.recs.filter((r) => r.el === croot.querySelector("#markers"));
      expect(layer).toHaveLength(1);
      expect(layer[0]!.kf).toEqual([{ opacity: 0 }, { opacity: 1 }]);
      expect([layer[0]!.o.delay, layer[0]!.o.duration, layer[0]!.o.iterations, layer[0]!.o.direction]).toEqual([2300, 200, undefined, undefined]);
    } finally {
      p.restore();
    }
  });

  test("every animation in the costume stylesheet that repeats has a full period of at least 333ms", () => {
    const loops = [...css.matchAll(/animation:\s*([^;]*infinite[^;]*);/g)].map((m) => m[1]!);
    expect(loops.length).toBeGreaterThan(0);
    for (const a of loops) {
      const ms = Number(a.match(/(\d+)ms/)![1]);
      expect({ [a]: ms * (a.includes("alternate") ? 2 : 1) >= MIN_PERIOD_MS }).toEqual({ [a]: true });
    }
  });
});
