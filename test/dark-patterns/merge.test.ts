import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { mergeCurses, type DarkPattern } from "../../src/content/dark-patterns";
import type { DarkPatternKind } from "../../src/data/types";

const doc = () => {
  const win = new Window({ url: "https://shop.test/" });
  win.document.body.innerHTML = `<div id="box"><p id="a">x</p><p id="b">y</p></div><p id="c">z</p>`;
  return win.document as unknown as Document;
};
const pat = (d: Document, id: string, kind: DarkPatternKind, snippet = id): DarkPattern => ({ kind, element: d.getElementById(id)!, snippet });

describe("mergeCurses", () => {
  test("timer replaces a countdown on the same element", () => {
    const d = doc();
    const r = mergeCurses([pat(d, "a", "countdown")], [pat(d, "a", "timer")]);
    expect(r.map((p) => p.kind)).toEqual(["timer"]);
  });
  test("timer replaces a countdown on an ancestor", () => {
    const d = doc();
    const r = mergeCurses([pat(d, "box", "countdown")], [pat(d, "a", "timer")]);
    expect(r.map((p) => [p.kind, p.element.id])).toEqual([["timer", "a"]]);
  });
  test("timer replaces a countdown on a descendant", () => {
    const d = doc();
    const r = mergeCurses([pat(d, "a", "countdown")], [pat(d, "box", "timer")]);
    expect(r.map((p) => [p.kind, p.element.id])).toEqual([["timer", "box"]]);
  });
  test("a timer does not replace a scarcity on the same element", () => {
    const d = doc();
    const r = mergeCurses([pat(d, "a", "scarcity")], [pat(d, "a", "timer")]);
    expect(r.map((p) => p.kind)).toEqual(["scarcity"]);
  });
  test("an unrelated countdown stays", () => {
    const d = doc();
    const r = mergeCurses([pat(d, "c", "countdown")], [pat(d, "a", "timer")]);
    expect(r.map((p) => p.kind)).toEqual(["timer", "countdown"]);
  });
  test("result is in document order", () => {
    const d = doc();
    const r = mergeCurses([pat(d, "c", "scarcity"), pat(d, "b", "scarcity")], [pat(d, "a", "timer")]);
    expect(r.map((p) => p.element.id)).toEqual(["a", "b", "c"]);
  });
  test("result is capped at 30", () => {
    const d = doc();
    const statics = Array.from({ length: 40 }, (_, i) => {
      const el = d.createElement("p");
      el.id = `n${i}`;
      d.body.append(el);
      return pat(d, el.id, "scarcity");
    });
    expect(mergeCurses(statics, [])).toHaveLength(30);
  });
});
