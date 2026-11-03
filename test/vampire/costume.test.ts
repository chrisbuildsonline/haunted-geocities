import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { VAMPIRE, VAMPIRE_LEGEND } from "../../src/content/costume/art";
import { closeCard, openCard, setCardExorcised } from "../../src/content/costume/card";
import { updateGhosts, vampireIn, vampireSvg, type Slot } from "../../src/content/costume/ghosts";
import { costumeCss } from "../../src/content/costume/styles";
import type { CompanyHit, ContentRequest } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});
const page = () => {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  return win.document as unknown as Document;
};

const hit = (company: string, count: number, vampire?: CompanyHit["vampire"]): CompanyHit => ({
  company,
  domains: [company.includes(".") ? company : `${company.toLowerCase()}.com`],
  count,
  categories: count ? ["Advertising"] : [],
  fingerprinting: 0,
  ...(vampire && { vampire }),
});
const caught = (...apis: ("canvas" | "audio" | "fonts")[]) => ({ caught: apis, knownOnly: false });
const known = { caught: [], knownOnly: true };

describe("vampire sprite", () => {
  test("16×18 art, 4 web-safe colours, outline, lining and eyes from the palette", () => {
    expect(VAMPIRE).toHaveLength(18);
    for (const row of VAMPIRE) expect(row).toHaveLength(16);
    const used = new Set(VAMPIRE.join("").replaceAll(".", ""));
    expect([...used].sort()).toEqual(["L", "R", "W", "o"]);
    expect(VAMPIRE_LEGEND).toEqual({ o: "#000033", W: "#ffffff", L: "#660000", R: "#ff0033" });
    for (const c of Object.values(VAMPIRE_LEGEND)) expect(c).toMatch(/^#([0369cf])\1([0369cf])\2([0369cf])\3$/);
  });

  test("renders 48×54 at 3px art pixels with crisp edges", () => {
    const svg = vampireSvg();
    expect(svg).toContain('width="48" height="54" viewBox="0 0 48 54"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#ff0033"');
    expect(svg).toContain('fill="#660000"');
  });

  test("CSS: hot glow, known at 60% with no glow and no drift, drift ±2px over 3000ms", () => {
    const css = costumeCss({ stars: "", twinkle: "" });
    expect(css).toContain(".vampire .sprite { width: 48px; height: 54px; filter: drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999);");
    expect(css).toMatch(/\.vampire\.known \.sprite \{[^}]*filter: none;/);
    expect(css).toMatch(/\.vampire\.known:not\(\.exorcised\) \.sprite \{ opacity: \.6; \}/);
    expect(css).toMatch(/\.vampire\.known \.bob \{ animation: none; \}/);
    expect(css).toContain("animation: hg-drift 3000ms ease-in-out var(--phase, 0ms) infinite alternate");
    expect(css).toContain("@keyframes hg-drift { from { transform: translateY(-2px); } to { transform: translateY(2px); } }");
    expect(css).toMatch(/\.vampire:focus-visible \{ outline: 2px dotted #ffff66/);
  });
});

describe("vampires in the lanes", () => {
  const slots: Slot[] = Array.from({ length: 6 }, (_, i) => ({ side: i % 2 ? "right" : "left", x: i % 2 ? 1200 : 0, y: 56 + Math.floor(i / 2) * 72, w: 64 }));
  const opts = { exorcised: new Set<string>(), onOpen: () => undefined, rise: false };
  const lanes = () => {
    const doc = page();
    return doc.body.appendChild(doc.createElement("div"));
  };

  test("ghosts by count, then vampires by name, in the same slots; known vampires marked", () => {
    const el = lanes();
    updateGhosts(el, [hit("zz-metrics.test", 0, caught("canvas")), hit("Criteo", 1), hit("Hotjar", 2, known), hit("Taboola", 5), hit("AdTheorent", 3, caught("canvas", "fonts"))], slots, opts);
    const kids = [...el.children] as HTMLElement[];
    expect(kids.map((k) => [k.className, k.dataset.company])).toEqual([
      ["ghost", "Taboola"],
      ["ghost", "Criteo"],
      ["vampire", "AdTheorent"],
      ["vampire known", "Hotjar"],
      ["vampire", "zz-metrics.test"],
    ]);
    expect(kids[2]!.style.top).toBe(`${slots[2]!.y}px`);
    expect(kids[2]!.localName).toBe("button");
    expect(kids[2]!.querySelector(".tag")!.textContent).toBe("AdTheorent");
    expect(kids[4]!.querySelector(".tag")!.textContent).toBe("zz-metrics.test");
    expect(kids[2]!.getAttribute("aria-label")).toBe("AdTheorent, vampire, caught doing canvas readback · font probing");
    expect(kids[3]!.getAttribute("aria-label")).toBe("Hotjar, vampire, known to fingerprint");
    expect(kids[2]!.querySelector(".sprite svg")!.getAttribute("height")).toBe("54");
  });

  test("the +N token still takes the last slot when vampires overflow", () => {
    const el = lanes();
    const many = [hit("A", 9), hit("B", 8), ...["c", "d", "e", "f", "g"].map((n) => hit(`${n}.test`, 0, caught("audio")))];
    updateGhosts(el, many, slots, opts);
    expect([...el.querySelectorAll(".ghost, .vampire")]).toHaveLength(5);
    expect(el.querySelector(".stack")!.textContent).toBe("+2");
    expect(el.querySelector(".stack")!.getAttribute("aria-label")).toBe("2 more ghosts and vampires");
  });

  test("a ghost that is caught becomes a vampire", () => {
    const el = lanes();
    updateGhosts(el, [hit("Criteo", 3)], slots, opts);
    updateGhosts(el, [hit("Criteo", 3, caught("canvas"))], slots, opts);
    expect([...el.children].map((k) => k.className)).toEqual(["vampire"]);
  });

  test("arrival: fade at the delay, then one glow swell 0 → 6px; known vampires only fade", () => {
    const el = lanes();
    const recs: { cls: string; kf: Keyframe[]; o: KeyframeAnimationOptions }[] = [];
    const proto = el.ownerDocument.defaultView!.Element.prototype as unknown as { animate: unknown };
    const original = proto.animate; // happy-dom shares the prototype across windows
    proto.animate = function (this: Element, kf: Keyframe[], o: KeyframeAnimationOptions) {
      recs.push({ cls: this.className, kf, o });
      return { finished: Promise.resolve() };
    };
    try {
      updateGhosts(el, [hit("zz.test", 0, caught("canvas")), hit("Hotjar", 2, known)], slots, { ...opts, rise: true });
      expect(recs.map((r) => [r.cls, r.o.delay, r.o.duration, Object.keys(r.kf[1]!)])).toEqual([
        ["vampire known", 0, 300, ["transform", "opacity"]],
        ["vampire", 0, 300, ["transform", "opacity"]],
        ["sprite", 300, 300, ["filter"]],
      ]);
      expect(recs[2]!.kf.map((k) => k.filter)).toEqual(["drop-shadow(0 0 0px #ff0033) drop-shadow(0 0 0px #ff9999)", "drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999)"]);
      recs.length = 0;
      vampireIn(el.querySelector<HTMLElement>(".vampire:not(.known)")!, 1800);
      expect(recs.map((r) => r.o.delay)).toEqual([1800, 2100]);
    } finally {
      proto.animate = original;
    }
  });

  test("no lane: no vampire is drawn", () => {
    const el = lanes();
    updateGhosts(el, [hit("x.test", 0, caught("canvas"))], [], opts);
    expect(el.children).toHaveLength(0);
  });
});

describe("vampire card", () => {
  const open = (h: CompanyHit, listed: boolean, exorcised = false) => {
    const doc = page();
    const cards = doc.body.appendChild(doc.createElement("div"));
    const opener = doc.body.appendChild(doc.createElement("button"));
    const sent: ContentRequest[] = [];
    const card = openCard(cards, h, opener, { exorcised, listed, send: (m) => sent.push(m), bounds: { top: 48, bottom: 740 }, reduced: true });
    const text = (card.textContent ?? "").replace(/\s+/g, " ");
    return { doc, cards, card, opener, sent, text, act: card.querySelector<HTMLButtonElement>(".act") };
  };

  test("caught, tracker company: title, host, what it did, honest line, what fingerprinting is, Exorcise <company>", () => {
    const c = open(hit("AdTheorent", 2, caught("canvas", "audio", "fonts")), true);
    expect(c.card.classList.contains("vampire-card")).toBe(true);
    expect(c.card.querySelector("h2")!.textContent).toBe("Vampire identified");
    expect(c.card.querySelector(".who")!.textContent).toBe("AdTheorent");
    expect(c.card.querySelector(".domains")!.textContent).toBe("adtheorent.com");
    expect(c.text).toContain("Caught doing: canvas readback · AudioContext · font probing");
    expect(c.text).toContain("Caught since you haunted this page");
    expect(c.text).toContain("Fingerprinting");
    expect(c.text).not.toContain("Known to fingerprint");
    expect(c.act!.textContent).toBe("Exorcise AdTheorent");
    expect(c.doc.activeElement).toBe(c.act);
    c.act!.click();
    expect(c.sent).toEqual([{ type: "EXORCISE", company: "AdTheorent", domains: ["adtheorent.com"] }]);
    setCardExorcised(c.cards, new Set(["AdTheorent"]));
    expect(c.act!.textContent).toBe("Let it back");
    c.act!.click();
    expect(c.sent.at(-1)).toEqual({ type: "LET_BACK", company: "AdTheorent" });
    setCardExorcised(c.cards, new Set());
    expect(c.act!.textContent).toBe("Exorcise AdTheorent");
  });

  test("only what was caught is listed", () => {
    expect(open(hit("AdTheorent", 2, caught("audio")), true).card.querySelector(".did")!.textContent).toBe("Caught doing: AudioContext");
  });

  test("known only: Tracker Radar line, no caught or honest line", () => {
    const c = open(hit("Hotjar", 2, known), true);
    expect(c.text).toContain("Known to fingerprint (Tracker Radar)");
    expect(c.text).not.toContain("Caught doing");
    expect(c.text).not.toContain("Caught since you haunted this page");
    expect(c.act!.textContent).toBe("Exorcise Hotjar");
  });

  test("an unlisted host gets no Exorcise; the host wraps at /", () => {
    const c = open(hit("nightowl-metrics.test", 0, caught("canvas")), false);
    expect(c.act).toBeNull();
    expect(c.card.querySelector(".foot")).toBeNull();
    expect(c.card.querySelector(".who")).toBeNull();
    expect(c.card.querySelector(".domains")!.textContent).toBe("nightowl-metrics.test");
    const d = open({ ...hit("x.test", 0, caught("canvas")), domains: ["cdn.x.test/fp/v2.js"] }, false);
    expect(d.card.querySelector(".domains li")!.innerHTML).toBe("cdn.x.test/<wbr>fp/<wbr>v2.js");
    expect(d.doc.activeElement).toBe(d.card.querySelector(".close"));
  });

  test("Esc closes it and returns focus to the opener", () => {
    const c = open(hit("nightowl-metrics.test", 0, caught("canvas")), false);
    c.card.dispatchEvent(new (c.doc.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(c.cards.querySelector(".card")).toBeNull();
    expect(c.doc.activeElement).toBe(c.opener);
    closeCard(c.cards);
  });
});
