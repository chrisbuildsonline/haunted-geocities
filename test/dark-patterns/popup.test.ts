import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderScreen } from "../../src/popup/screens";
import { curseTile } from "../../src/popup/sprites";
import type { Curse, DeadLink, TabState } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const CURSES = [
  { kind: "scarcity", snippet: "Only 2 left in stock!" },
  { kind: "timer", snippet: "Offer ends in 00:03" },
  { kind: "confirmshaming", snippet: "No thanks, I hate saving money" },
] as unknown as Curse[];
const DEAD: DeadLink[] = [{ url: "https://example.org/missing.html", path: "/missing.html", status: 404 }];

function render(curses: Curse[] | undefined, tombstones: DeadLink[] = []) {
  const win = new Window({ url: "chrome-extension://x/popup.html" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const state = { haunted: true, restricted: false, url: "https://example.org/", ghosts: [], exorcised: [], tombstones, curses } as unknown as TabState;
  doc.body.append(...renderScreen(doc, { state, settings: doc.createElement("div"), onPrimary: () => undefined, onExorcise: () => undefined }));
  return doc;
}
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const css = () => readFileSync(join(import.meta.dir, "../../src/popup/styles.css"), "utf8").replace(/\s+/g, " ");

describe("popup curses (req 54-58)", () => {
  test("curseTile is an svg tile", () => {
    const svg = curseTile(render([]));
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  test("Curses tile shows the count", () => {
    expect(text(render(CURSES).querySelector('[data-count="curses"] .num'))).toBe("3");
    expect(text(render([]).querySelector('[data-count="curses"] .num'))).toBe("0");
  });

  test("a row shows the kind name and the quoted snippet", () => {
    const rows = [...render(CURSES).querySelectorAll(".curse-row")];
    expect(rows.map((r) => [text(r.querySelector(".row-title")), text(r.querySelector(".row-sub"))])).toEqual([
      ["Fake scarcity", "“Only 2 left in stock!”"],
      ["Ticking timer", "“Offer ends in 00:03”"],
      ["Confirmshaming", "“No thanks, I hate saving money”"],
    ]);
    expect(rows[0]!.querySelector(".icon-tile svg")).not.toBeNull();
  });

  test("the list follows the tombstone list", () => {
    const doc = render(CURSES, DEAD);
    expect(text(doc.querySelector(".curses-head"))).toBe("Curses (3)");
    expect(doc.querySelector(".tombstones-head")!.compareDocumentPosition(doc.querySelector(".curses-head")!) & 4).toBeTruthy();
    expect(doc.querySelector(".list")!.getAttribute("aria-label")).toBe("Ghosts, vampires, tombstones and curses");
    const none = render(CURSES);
    expect(none.querySelector(".no-tombstones")!.compareDocumentPosition(none.querySelector(".curses-head")!) & 4).toBeTruthy();
  });

  test("rows are in the order reported", () => {
    const rev = [...CURSES].reverse();
    expect([...render(rev).querySelectorAll(".curse-row .row-title")].map((e) => text(e))).toEqual(["Confirmshaming", "Ticking timer", "Fake scarcity"]);
  });

  test("a state without curses still renders", () => {
    const doc = render(undefined);
    expect(text(doc.querySelector('[data-count="curses"] .num'))).toBe("0");
    expect(text(doc.querySelector(".no-curses"))).toBe("No curses. This page plays fair.");
  });

  test("snippet text is set as text", () => {
    const evil = [{ kind: "scarcity", snippet: "<img src=x onerror=alert(1)>" }] as unknown as Curse[];
    const row = render(evil).querySelector(".curse-row")!;
    expect(row.querySelector("img")).toBeNull();
    expect(text(row.querySelector(".row-sub"))).toBe("“<img src=x onerror=alert(1)>”");
  });

  test("empty list shows No curses. This page plays fair.", () => {
    const doc = render([]);
    expect(text(doc.querySelector(".no-curses"))).toBe("No curses. This page plays fair.");
    expect(doc.querySelector(".curse-row")).toBeNull();
    expect(doc.querySelector(".curses-head")).toBeNull();
  });

  test("curse rows have tabindex 0 and an aria-label of kind name and snippet", () => {
    const rows = [...render(CURSES).querySelectorAll<HTMLElement>(".curse-row")];
    expect(rows.map((r) => r.tabIndex)).toEqual([0, 0, 0]);
    expect(rows[0]!.getAttribute("aria-label")).toBe("Fake scarcity: Only 2 left in stock!");
  });

  test("CSS: curse rows use the #6633cc focus ring", () => {
    expect(css()).toMatch(/--accent: #6633cc;/);
    expect(css()).toMatch(/:focus-visible \{[^}]*outline: 2px solid var\(--accent\);[^}]*outline-offset: 2px;/);
    expect(css()).toMatch(/\.curse-row \{[^}]*align-items: flex-start;/);
    expect(css()).toMatch(/\.curse-row \.row-line \{[^}]*margin-top: 4px;/);
  });

  test("CSS: the quote wraps", () => {
    expect(css()).toMatch(/\.curse-row \.row-sub\.quote \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  });
});
