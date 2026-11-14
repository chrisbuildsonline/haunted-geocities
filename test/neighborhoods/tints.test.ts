import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { assignTints, hemTint, updateGhosts, type Slot } from "../../src/content/costume/ghosts";
import { HEM_TINTS } from "../../src/content/costume/tokens";
import { renderScreen } from "../../src/popup/screens";
import type { CompanyHit, TabState } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const T = HEM_TINTS as readonly string[];
const at = (i: number) => T[((i % T.length) + T.length) % T.length]!;
const idx = (tint: string) => T.indexOf(tint);

/** Names grouped by base tint: byTint[i] lists names whose hemTint is HEM_TINTS[i]. */
const byTint: string[][] = T.map(() => []);
for (let i = 0; i < 400; i++) byTint[idx(hemTint(`Co${i}`))]!.push(`Co${i}`);
const named = (tintIndex: number, nth = 0) => byTint[tintIndex]![nth]!;

/** The hem tint drawn in an SVG: the one HEM_TINTS colour in its markup. */
const tintIn = (el: Element) => {
  const html = el.outerHTML.toLowerCase();
  const found = T.filter((t) => html.includes(t));
  expect(found).toHaveLength(1);
  return found[0]!;
};

const hit = (company: string, count: number, vampire = false): CompanyHit => ({
  company, count, domains: [`${company.toLowerCase()}.com`], categories: ["Advertising"], fingerprinting: 0,
  ...(vampire ? { vampire: { caught: ["canvas"], knownOnly: false } } : {}),
});

type Rec = { el: Element };
function lanesSetup() {
  const win = new Window({ url: "https://haunt.example/" });
  windows.push(win);
  const recs: Rec[] = [];
  (win.Element.prototype as unknown as { animate: unknown }).animate = function (this: Element) {
    recs.push({ el: this });
    return { finished: Promise.resolve(), finish() {}, cancel() {} };
  };
  const doc = win.document as unknown as Document;
  const lanes = doc.createElement("div");
  doc.body.append(lanes);
  return { doc, lanes, recs };
}
const slots = (n: number): Slot[] => Array.from({ length: n }, (_, i) => ({ side: i % 2 ? "right" : "left", x: i % 2 ? 1200 : 0, y: 8 + Math.floor(i / 2) * 72, w: 64 }));
const opts = { exorcised: new Set<string>(), onOpen() {}, rise: false };
const laneGhosts = (lanes: HTMLElement) => [...lanes.querySelectorAll<HTMLElement>("button.ghost")];

describe("assignTints", () => {
  test("the first company has its base tint", () => {
    for (let i = 0; i < T.length; i++) expect(assignTints([named(i)])).toEqual([at(i)]);
  });

  test("a company whose base tint equals the previous one takes the next tint", () => {
    expect(assignTints([named(2, 0), named(2, 1)])).toEqual([at(2), at(3)]);
  });

  test("a company whose base tint equals the one two back also moves", () => {
    expect(assignTints([named(1, 0), named(4), named(1, 1)])).toEqual([at(1), at(4), at(2)]);
  });

  test("it wraps from the last tint to the first", () => {
    expect(assignTints([named(5, 0), named(5, 1)])).toEqual([at(5), at(0)]);
  });

  test("it moves more than one step when the next tint is also taken", () => {
    expect(assignTints([named(0, 0), named(1), named(0, 1)])).toEqual([at(0), at(1), at(2)]);
    expect(assignTints([named(3, 0), named(3, 1), named(3, 2)])).toEqual([at(3), at(4), at(5)]);
  });

  test("no two adjacent companies share a tint, for 12 names", () => {
    const names = [0, 0, 0, 1, 1, 2, 2, 2, 5, 5, 0, 0].map((t, i) => named(t, i));
    const tints = assignTints(names);
    expect(tints).toHaveLength(12);
    for (let i = 1; i < tints.length; i++) {
      expect(tints[i]).not.toBe(tints[i - 1]!);
      if (i > 1) expect(tints[i]).not.toBe(tints[i - 2]!);
    }
  });

  test("the same list gives the same tints", () => {
    const names = ["Criteo", "Hotjar", "Taboola", named(2, 0), named(2, 1)];
    expect(assignTints(names)).toEqual(assignTints([...names]));
  });

  test("hemTint is unchanged: hash mod 6", () => {
    const ref = (s: string) => {
      let h = 0;
      for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return T[h % 6]!;
    };
    for (const n of ["Criteo", "Hotjar", "Taboola", "Google", "", "x"]) expect(hemTint(n)).toBe(ref(n));
  });
});

describe("lane tints", () => {
  test("lane ghosts that are neighbours have different hem colours", () => {
    const { lanes } = lanesSetup();
    const names = [named(4, 0), named(4, 1), named(4, 2), named(4, 3)];
    updateGhosts(lanes, names.map((n, i) => hit(n, 10 - i)), slots(6), opts);
    const tints = laneGhosts(lanes).map((g) => tintIn(g.querySelector(".sprite")!));
    expect(tints).toEqual(assignTints(names));
    for (let i = 1; i < tints.length; i++) expect(tints[i]).not.toBe(tints[i - 1]!);
    expect(laneGhosts(lanes).map((g) => g.dataset.tint)).toEqual(tints);
  });

  test("a ghost keeps its element, focus and aria-label when its tint changes", () => {
    const { doc, lanes } = lanesSetup();
    const a = named(3, 0);
    const b = named(3, 1);
    updateGhosts(lanes, [hit(a, 2)], slots(4), opts);
    const el = laneGhosts(lanes)[0]!;
    expect(el.dataset.tint).toBe(at(3));
    el.focus();
    const label = el.getAttribute("aria-label");
    // b arrives with more requests: it takes the slot first and the base tint, so a moves on.
    updateGhosts(lanes, [hit(a, 2), hit(b, 5)], slots(4), opts);
    const after = laneGhosts(lanes).find((g) => g.dataset.company === a)!;
    expect(after).toBe(el);
    expect(doc.activeElement).toBe(el);
    expect(el.getAttribute("aria-label")).toBe(label);
    expect(el.dataset.tint).toBe(at(4));
    expect(tintIn(el.querySelector(".sprite")!)).toBe(at(4));
    expect(el.querySelector(".tag")!.textContent).toBe(a);
  });

  test("a ghost past the slots still counts in the order", () => {
    const { lanes } = lanesSetup();
    const names = [named(0, 0), named(0, 1), named(0, 2), named(0, 3), named(0, 4)];
    updateGhosts(lanes, names.map((n, i) => hit(n, 10 - i)), slots(3), opts);
    const shown = laneGhosts(lanes);
    expect(shown).toHaveLength(2);
    expect(lanes.querySelector(".stack")!.textContent).toBe("+3");
    expect(shown.map((g) => g.dataset.tint)).toEqual(assignTints(names).slice(0, 2));
  });

  test("vampires are not part of the tint order", () => {
    const { lanes } = lanesSetup();
    const g1 = named(2, 0);
    const g2 = named(2, 1);
    // A vampire with many requests sits between nothing: it is drawn after the ghosts and has no hem.
    updateGhosts(lanes, [hit(g1, 5), hit("Vamp", 9, true), hit(g2, 1)], slots(6), opts);
    expect(laneGhosts(lanes).map((g) => g.dataset.tint)).toEqual(assignTints([g1, g2]));
    const vamp = lanes.querySelector<HTMLElement>("button.vampire")!;
    expect(vamp.dataset.tint).toBeUndefined();
  });

  test("a re-tint does not start an animation", () => {
    const { lanes, recs } = lanesSetup();
    const a = named(1, 0);
    const b = named(1, 1);
    updateGhosts(lanes, [hit(a, 2)], slots(4), { ...opts, rise: true });
    const el = laneGhosts(lanes)[0]!;
    recs.length = 0;
    updateGhosts(lanes, [hit(a, 2), hit(b, 5)], slots(4), { ...opts, rise: true });
    expect(el.dataset.tint).toBe(at(2));
    // Only the new ghost rises; the re-tinted one and its sprite start nothing.
    expect(recs.filter((r) => r.el === el || el.contains(r.el))).toHaveLength(0);
  });
});

describe("popup tints", () => {
  function popupRows(ghosts: CompanyHit[]) {
    const win = new Window({ url: "chrome-extension://x/popup.html" });
    windows.push(win);
    const doc = win.document as unknown as Document;
    const state: TabState = { haunted: true, restricted: false, url: "https://example.org/", ghosts, exorcised: [], tombstones: [], curses: [] };
    doc.body.append(...renderScreen(doc, { state, settings: doc.createElement("div"), onPrimary() {}, onExorcise() {} }));
    return [...doc.querySelectorAll(".ghost-row:not(.vampire-row)")].map((r) => [r.querySelector(".row-title")!.textContent, tintIn(r.querySelector(".icon-tile")!)]);
  }

  test("the popup ghost rows use the same tints as the lanes for the same list", () => {
    const names = [named(5, 0), named(5, 1), named(0, 0), named(5, 2)];
    const hits = names.map((n, i) => hit(n, 10 - i));
    const { lanes } = lanesSetup();
    updateGhosts(lanes, hits, slots(8), opts);
    // A missing data attribute reads as "", which no row title or tint equals, so it still fails.
    const lane = laneGhosts(lanes).map((g) => [g.dataset.company ?? "", g.dataset.tint ?? ""]);
    expect(lane.every(([c, t]) => c !== "" && T.includes(t!))).toBe(true);
    expect(popupRows([...hits].reverse())).toEqual(lane);
  });

  test("adjacent popup rows have different hem colours", () => {
    const names = [0, 0, 0, 0, 3, 3].map((t, i) => named(t, i));
    const rows = popupRows([...names.map((n, i) => hit(n, 20 - i)), hit("Vamp", 3, true)]);
    expect(rows.map((r) => r[0])).toEqual(names);
    for (let i = 1; i < rows.length; i++) expect(rows[i]![1]).not.toBe(rows[i - 1]![1]!);
  });
});
