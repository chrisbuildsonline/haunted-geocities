import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { openCard, openCurseCard } from "../../src/content/costume/card";
import { costumeCss } from "../../src/content/costume/styles";
import { MOTION as M, PALETTE as P } from "../../src/content/costume/tokens";
import { KIND_INFO } from "../../src/content/dark-patterns";
import { DARK_PATTERN_KINDS, type Curse } from "../../src/data/types";

const css = costumeCss({ stars: "", twinkle: "" });

describe("KIND_INFO", () => {
  test("KIND_INFO titles match DESIGN.md plus Ticking timer", () => {
    expect(DARK_PATTERN_KINDS.map((k) => KIND_INFO[k].title)).toEqual([
      "Cursed: Fake scarcity",
      "Cursed: Countdown",
      "Cursed: Ticking timer",
      "Cursed: Confirmshaming",
      "Cursed: Pre-checked opt-in",
    ]);
    expect(DARK_PATTERN_KINDS.map((k) => KIND_INFO[k].name)).toEqual(["Fake scarcity", "Countdown", "Ticking timer", "Confirmshaming", "Pre-checked opt-in"]);
  });
  test("every trick is one sentence", () => {
    for (const k of DARK_PATTERN_KINDS) {
      const { trick } = KIND_INFO[k];
      expect(trick.trim()).toBe(trick);
      expect(trick.endsWith(".")).toBe(true);
      expect(trick).not.toMatch(/[\r\n]/);
    }
  });
});

// ---- the card itself (req 48-52, 59-61) ----
const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});
function setup(width = 1280) {
  const win = new Window({ url: "https://haunt.example/", width, height: 800 });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const animations: { kf: unknown; o: any }[] = [];
  (win.Element.prototype as unknown as { animate: unknown }).animate = (kf: unknown, o: unknown) => {
    animations.push({ kf, o });
    return { finished: Promise.resolve(), cancel() {}, finish() {} };
  };
  const cards = doc.createElement("div");
  const opener = doc.createElement("button");
  doc.body.append(opener, cards);
  return { win, doc, cards, opener, animations };
}
const bounds = { top: 48, bottom: 740 };
const curse = (kind: Curse["kind"], snippet = "Only 2 left"): Curse => ({ kind, snippet });
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("openCurseCard (req 48-52)", () => {
  test.each([
    ["scarcity", "Cursed: Fake scarcity"],
    ["countdown", "Cursed: Countdown"],
    ["timer", "Cursed: Ticking timer"],
    ["confirmshaming", "Cursed: Confirmshaming"],
    ["prechecked", "Cursed: Pre-checked opt-in"],
  ] as const)("title is %s -> %s", (kind, title) => {
    const { cards, opener } = setup();
    const card = openCurseCard(cards, curse(kind), opener, { bounds });
    expect(card.querySelector("h2")!.textContent).toBe(title);
    expect(card.dataset.kind).toBe(kind);
    expect(card.getAttribute("role")).toBe("dialog");
    expect(card.classList.contains("curse-card")).toBe(true);
  });
  test("title is Cursed: Fake scarcity for scarcity", () => {
    const { cards, opener } = setup();
    expect(openCurseCard(cards, curse("scarcity"), opener, { bounds }).querySelector("h2")!.textContent).toBe("Cursed: Fake scarcity");
  });
  test("title is Cursed: Countdown", () => {
    const { cards, opener } = setup();
    expect(openCurseCard(cards, curse("countdown"), opener, { bounds }).querySelector("h2")!.textContent).toBe("Cursed: Countdown");
  });
  test("title is Cursed: Ticking timer", () => {
    const { cards, opener } = setup();
    expect(openCurseCard(cards, curse("timer"), opener, { bounds }).querySelector("h2")!.textContent).toBe("Cursed: Ticking timer");
  });
  test("title is Cursed: Confirmshaming", () => {
    const { cards, opener } = setup();
    expect(openCurseCard(cards, curse("confirmshaming"), opener, { bounds }).querySelector("h2")!.textContent).toBe("Cursed: Confirmshaming");
  });
  test("title is Cursed: Pre-checked opt-in", () => {
    const { cards, opener } = setup();
    expect(openCurseCard(cards, curse("prechecked"), opener, { bounds }).querySelector("h2")!.textContent).toBe("Cursed: Pre-checked opt-in");
  });
  test("body quotes the snippet and has one trick line", () => {
    const { cards, opener } = setup();
    const card = openCurseCard(cards, curse("scarcity"), opener, { bounds });
    expect(card.querySelector(".quote")!.textContent).toBe("“Only 2 left”");
    expect(card.querySelectorAll(".card-body p")).toHaveLength(2);
    expect(card.querySelector(".trick")!.textContent).toBe(KIND_INFO.scarcity.trick);
  });
  test("a snippet with <img onerror> is text, not markup", () => {
    const { cards, opener } = setup();
    const evil = `<img src=x onerror="alert(1)">`;
    const card = openCurseCard(cards, curse("scarcity", evil), opener, { bounds });
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector(".quote")!.textContent).toBe(`“${evil}”`);
  });
  test("title bar is not the vampire colour", () => {
    const { cards, opener } = setup();
    const card = openCurseCard(cards, curse("scarcity"), opener, { bounds });
    expect(card.classList.contains("vampire-card")).toBe(false);
    expect(css).toMatch(/\.card \.bar \{[^}]*background: #330066;/);
    expect(css).not.toMatch(/\.curse-card \.bar/);
  });
  test("opening a curse card closes an open ghost card", () => {
    const { cards, opener } = setup();
    openCard(cards, { company: "Criteo", domains: ["criteo.com"], count: 2, categories: ["Advertising"], fingerprinting: 0 }, opener, { exorcised: false, send: () => undefined, bounds });
    openCurseCard(cards, curse("scarcity"), opener, { bounds });
    expect([...cards.querySelectorAll(".card")].map((c) => c.className)).toEqual(["card curse-card"]);
  });
});

describe("curse card focus, Esc and placement (req 51, 52)", () => {
  test("focus moves to the close button", () => {
    const { doc, cards, opener } = setup();
    const card = openCurseCard(cards, curse("scarcity"), opener, { bounds });
    expect(doc.activeElement).toBe(card.querySelector(".close"));
  });
  test("Esc closes the card and returns focus to the badge", () => {
    const { win, doc, cards, opener } = setup();
    const card = openCurseCard(cards, curse("scarcity"), opener, { bounds });
    card.querySelector<HTMLElement>(".close")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    expect(cards.querySelector(".card")).toBeNull();
    expect(doc.activeElement).toBe(opener);
  });
  test("[x] closes the card", () => {
    const { doc, cards, opener } = setup();
    const card = openCurseCard(cards, curse("scarcity"), opener, { bounds });
    card.querySelector<HTMLButtonElement>(".close")!.click();
    expect(cards.querySelector(".card")).toBeNull();
    expect(doc.activeElement).toBe(opener);
  });
  test.each([1280, 375])("the card keeps 8px from both viewport edges at %ipx (stub geometry)", (width) => {
    for (const [left, right] of [[0, 20], [width - 20, width]] as const) {
      const { cards, opener } = setup(width);
      opener.getBoundingClientRect = () => ({ left, right, top: 300, bottom: 318, width: right - left, height: 18 }) as DOMRect;
      const card = openCurseCard(cards, curse("scarcity"), opener, { bounds });
      const x = parseFloat(card.style.left);
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x + 248 + 4).toBeLessThanOrEqual(width - 8 + 4); // the 4px hard shadow rides along
      expect(x + 248).toBeLessThanOrEqual(width - 8);
    }
  });
  test("no animation under reduced motion", () => {
    const { cards, opener, animations } = setup();
    openCurseCard(cards, curse("scarcity"), opener, { bounds, reduced: true });
    expect(animations).toHaveLength(0);
  });
  test("reduced motion: the card has no open animation", () => {
    const { cards, opener, animations } = setup();
    openCurseCard(cards, curse("timer"), opener, { bounds, reduced: true });
    expect(animations).toEqual([]);
    openCurseCard(cards, curse("timer"), opener, { bounds, reduced: false });
    expect(animations).toHaveLength(1);
  });
});

describe("curse card contrast and strobing (req 59, 60)", () => {
  test("card text meets 4.5:1", () => {
    expect(contrast(P.bone, P.crypt)).toBeGreaterThanOrEqual(4.5); // body
    expect(contrast(P.bone, P.cryptViolet)).toBeGreaterThanOrEqual(4.5); // title bar
    expect(css).toMatch(/\.card-body \{[^}]*color: #ffffcc;/);
    expect(css).toMatch(/\.card \.bar \{[^}]*color: #ffffcc;/);
  });
  test("no badge or card animation has a period under 333ms", () => {
    const { cards, opener, animations } = setup();
    openCurseCard(cards, curse("scarcity"), opener, { bounds });
    // the open animation plays once (no iterations); badges and cards declare no looping CSS animation
    for (const a of animations) expect(a.o.iterations).toBeUndefined();
    for (const sel of [".curse-badge", ".curse-card"]) {
      for (const rule of css.match(new RegExp(`\\${sel}[^{]*\\{[^}]*\\}`, "g")) ?? []) expect(rule).not.toMatch(/animation/);
    }
    // the only periodic animations in the costume are the twinkle and sign (2000ms, 1000ms), neither on a badge or card
    expect(M.twinkleMs).toBeGreaterThanOrEqual(333);
  });
});
