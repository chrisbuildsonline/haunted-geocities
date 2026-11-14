import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { detectDarkPatterns, mergeCurses, type DarkPattern } from "../../src/content/dark-patterns";
import { watchTimers } from "../../src/content/timers";

const HTML = readFileSync(join(import.meta.dir, "..", "..", "fixtures", "dark-patterns.html"), "utf8");

const load = () => {
  const win = new Window({ url: "http://127.0.0.1/dark-patterns.html", settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  win.document.write(HTML);
  return win.document as unknown as Document;
};

/** What the costume ends up with: the static detector plus the clock, ticked four times through the watcher. */
const curses = () => {
  const doc = load();
  const timers: DarkPattern[] = [];
  let cb: (r: { target: Node }[]) => void = () => {};
  class Stub {
    constructor(c: typeof cb) {
      cb = c;
    }
    observe() {}
    disconnect() {}
  }
  let t = 0;
  watchTimers(doc, "hg-crypt", (p) => timers.push(p), { now: () => (t += 1000), MutationObserver: Stub as unknown as typeof MutationObserver });
  const text = doc.getElementById("clock")!.firstChild!;
  for (const v of ["09:59", "09:58", "09:57", "09:56"]) {
    text.nodeValue = `Cart reserved for ${v}`;
    cb([{ target: text }]);
  }
  const statics = detectDarkPatterns(doc, "hg-crypt");
  return { doc, statics, all: mergeCurses(statics, timers) };
};

describe("fixtures/dark-patterns.html", () => {
  test("detectDarkPatterns on the fixture returns exactly the six curses, in order", () => {
    const { all, statics } = curses();
    // the clock only counts once it ticks, so the static detector sees the other five
    expect(statics.map((p) => p.element.id)).toEqual(["stock", "viewers", "sale", "optin", "decline"]);
    expect(all.map((p) => p.element.id)).toEqual(["stock", "viewers", "sale", "clock", "optin", "decline"]);
  });
  test("each curse has the expected kind, element id and snippet", () => {
    const got = curses().all.map((p) => [p.kind, p.element.id, p.snippet]);
    expect(got).toEqual([
      ["scarcity", "stock", "Only 2 left in stock!"],
      ["scarcity", "viewers", "12 people are viewing this blend right now"],
      ["countdown", "sale", "Offer ends in 3 hours, so hurry."],
      ["timer", "clock", "Cart reserved for 09:56"],
      ["prechecked", "optin", "Yes, send me the newsletter and partner offers"],
      ["confirmshaming", "decline", "No thanks, I hate saving money"],
    ]);
  });
  test("the innocent controls are not curses", () => {
    const { doc, all } = curses();
    const els = new Set(all.map((p) => p.element));
    for (const el of doc.querySelectorAll("p:not([id]), h1, h2, #plain-decline, label:not(#optin), button")) expect(els.has(el)).toBe(false);
    expect(els.size).toBe(6);
  });
  test("the hidden decoys are not curses", () => {
    expect(curses().all.some((p) => p.snippet.includes("Only 1 left"))).toBe(false);
  });
  test("every cursed element has the gap class", () => {
    const doc = load();
    for (const id of ["stock", "viewers", "sale", "clock", "optin", "decline"]) expect(doc.getElementById(id)!.closest(".gap")).not.toBeNull();
  });
  test("the page loads no external resource", () => {
    expect(HTML).not.toMatch(/\b(?:src|srcset)\s*=/i);
    expect(HTML).not.toMatch(/https?:\/\//i);
    expect(HTML).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    expect(HTML).not.toMatch(/@import|url\(/i);
  });
});
