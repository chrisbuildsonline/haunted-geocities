// Runtime vampires spec tasks 8.4, 9.4, 10.1, 10.2, 11.2, 12.6, 12.7.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { openCard } from "../../src/content/costume/card";
import { updateGhosts, type Slot } from "../../src/content/costume/ghosts";
import { playHaunt } from "../../src/content/costume/haunt-moment";
import { leaveCostume, renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { PALETTE as P } from "../../src/content/costume/tokens";
import { renderScreen } from "../../src/popup/screens";
import type { CompanyHit, ContentRequest, TabState } from "../../src/data/types";

const windows: Window[] = [];
const g = globalThis as { chrome?: unknown };
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
  delete g.chrome;
});
const newWindow = (url = "https://haunt.example/") => {
  const win = new Window({ url, width: 1280, height: 800 });
  windows.push(win);
  return win;
};
const hit = (company: string, count: number, vampire?: CompanyHit["vampire"]): CompanyHit => ({
  company,
  domains: [`${company.toLowerCase()}.com`],
  count,
  categories: count ? ["Advertising"] : [],
  fingerprinting: 0,
  ...(vampire && { vampire }),
});
const caught = { caught: ["canvas" as const], knownOnly: false };
const known = { caught: [], knownOnly: true };
const css = costumeCss({ stars: "", twinkle: "" });
/** The declarations of the one rule whose selector is exactly `selector`. */
const rule = (sheet: string, selector: string) => {
  const m = sheet.match(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1]!.replace(/\s+/g, " ").trim();
};

describe("8.4 vampire label", () => {
  test("is the ghost label: Comic Sans 11px bone on crypt, 1px spectral border, 12ch with ellipsis", () => {
    const tag = rule(css, ".tag, .stack");
    expect(tag).toContain("background: #000033;");
    expect(tag).toContain("color: #ffffcc;");
    expect(tag).toContain("border: 1px solid #6633cc;");
    expect(tag).toContain('font: 11px/14px "Comic Sans MS"');
    expect(tag).toContain("max-width: min(12ch, 100%);");
    expect(tag).toMatch(/overflow: hidden;.*text-overflow: ellipsis;.*white-space: nowrap;/);
  });

  test("the vampire rule only moves the label up and does not restyle it", () => {
    expect(rule(css, ".vampire .tag")).toBe("margin-top: 2px;");
  });

  test("shows the company, or the host for an unlisted script", () => {
    const doc = newWindow().document as unknown as Document;
    const lanes = doc.body.appendChild(doc.createElement("div"));
    const slots: Slot[] = [0, 1].map((i) => ({ side: "left", x: 0, y: 56 + i * 72, w: 64 }));
    const unlisted: CompanyHit = { company: "nightowl-metrics.test", domains: ["nightowl-metrics.test"], count: 0, categories: [], fingerprinting: 0, vampire: caught };
    updateGhosts(lanes, [hit("AdTheorent", 2, caught), unlisted], slots, { exorcised: new Set(), onOpen: () => undefined, rise: false });
    expect([...lanes.querySelectorAll(".vampire .tag")].map((t) => t.textContent)).toEqual(["AdTheorent", "nightowl-metrics.test"]);
  });
});

describe("9.4 vampire card focus and uniqueness", () => {
  const setup = () => {
    const doc = newWindow().document as unknown as Document;
    const cards = doc.body.appendChild(doc.createElement("div"));
    const openers = [doc.createElement("button"), doc.createElement("button")];
    doc.body.append(...openers);
    const open = (h: CompanyHit, opener: HTMLElement) =>
      openCard(cards, h, opener, { exorcised: false, listed: true, send: () => undefined, bounds: { top: 48, bottom: 740 }, reduced: true });
    const esc = (el: Element) => el.dispatchEvent(new (doc.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { doc, cards, openers, open, esc };
  };

  test("opening a second card replaces the first: one card at a time", () => {
    const s = setup();
    s.open(hit("AdTheorent", 2, caught), s.openers[0]!);
    s.open(hit("Hotjar", 2, known), s.openers[1]!);
    expect(s.cards.querySelectorAll(".card")).toHaveLength(1);
    expect((s.cards.querySelector(".card") as HTMLElement).dataset.company).toBe("Hotjar");
  });

  test("Esc pressed on the Exorcise button closes the card and focuses the opener of the card that was open", () => {
    const s = setup();
    s.open(hit("AdTheorent", 2, caught), s.openers[0]!);
    const card = s.open(hit("Hotjar", 2, known), s.openers[1]!);
    expect(s.doc.activeElement).toBe(card.querySelector(".act"));
    s.esc(card.querySelector(".act")!);
    expect(s.cards.querySelector(".card")).toBeNull();
    expect(s.doc.activeElement).toBe(s.openers[1]!);
  });
});

describe("10.1 / 10.2 haunt moment vampire phase", () => {
  type Rec = { el: HTMLElement; kf: Keyframe[]; o: KeyframeAnimationOptions };
  /** A croot with the layers playHaunt animates, one caught and one known vampire and one ghost; Element.animate recorded. */
  function croot() {
    const win = newWindow();
    const doc = win.document as unknown as Document;
    const el = doc.body.appendChild(doc.createElement("div"));
    el.innerHTML =
      `<div id="starfield"></div><div id="top-bands"></div><div id="markers"></div><div id="hud"></div>` +
      `<div id="lanes"><button class="ghost" data-company="Criteo"><span class="sprite"></span></button>` +
      `<button class="vampire" data-company="Caught"><span class="sprite"></span></button>` +
      `<button class="vampire known" data-company="Known"><span class="sprite"></span></button></div>`;
    const recs: Rec[] = [];
    const proto = win.Element.prototype as unknown as { animate: unknown };
    const original = proto.animate; // happy-dom shares the prototype across windows
    proto.animate = function (this: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions) {
      recs.push({ el: this, kf, o });
      return { finished: Promise.resolve(), finish() {} };
    };
    return { el, recs, restore: () => (proto.animate = original) };
  }
  const on = (recs: Rec[], el: Element | null) => recs.filter((r) => r.el === el);

  test("vampires fade in over 300ms from 8px low at 1800ms, once", () => {
    const c = croot();
    try {
      playHaunt(c.el, false);
      for (const name of ["Caught", "Known"]) {
        const v = c.el.querySelector(`.vampire[data-company="${name}"]`);
        const fade = on(c.recs, v);
        expect(fade).toHaveLength(1);
        expect(fade[0]!.kf).toEqual([{ transform: "translateY(8px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }]);
        expect([fade[0]!.o.delay, fade[0]!.o.duration, fade[0]!.o.iterations]).toEqual([1800, 300, undefined]);
      }
    } finally {
      c.restore();
    }
  });

  test("a caught vampire's sprite swells once from no glow to 6px after the fade; a known one has no swell", () => {
    const c = croot();
    try {
      playHaunt(c.el, false);
      const swell = on(c.recs, c.el.querySelector('.vampire[data-company="Caught"] .sprite'));
      expect(swell).toHaveLength(1);
      expect([swell[0]!.o.delay, swell[0]!.o.duration, swell[0]!.o.iterations, swell[0]!.o.direction]).toEqual([2100, 300, undefined, undefined]);
      expect(swell[0]!.kf.map((k) => k.filter)).toEqual(["drop-shadow(0 0 0px #ff0033) drop-shadow(0 0 0px #ff9999)", "drop-shadow(0 0 6px #ff0033) drop-shadow(0 0 2px #ff9999)"]);
      expect(on(c.recs, c.el.querySelector('.vampire[data-company="Known"] .sprite'))).toHaveLength(0);
    } finally {
      c.restore();
    }
  });

  test("the vampire phase does not touch ghosts, and ghosts rise earlier than vampires fade", () => {
    const c = croot();
    try {
      playHaunt(c.el, false);
      const rise = on(c.recs, c.el.querySelector(".ghost"));
      expect(rise).toHaveLength(1);
      expect(rise[0]!.o.delay).toBeLessThan(1800);
    } finally {
      c.restore();
    }
  });

  test("reduced motion: only the 300ms cross-fade of the whole costume, nothing on vampires or their sprites", () => {
    const c = croot();
    try {
      playHaunt(c.el, true);
      expect(c.recs).toHaveLength(1);
      expect(c.recs[0]!.el).toBe(c.el);
      expect(c.recs[0]!.kf).toEqual([{ opacity: 0 }, { opacity: 1 }]);
      expect(c.recs[0]!.o.duration).toBe(300);
      expect(c.el.querySelector("#fx")).toBeNull();
    } finally {
      c.restore();
    }
  });

  test("reduced motion: late vampires are placed without an arrival animation, and the costume CSS stops the drift", () => {
    const c = croot();
    try {
      const lanes = c.el.querySelector<HTMLElement>("#lanes")!;
      lanes.innerHTML = "";
      const slots: Slot[] = [{ side: "left", x: 0, y: 56, w: 64 }];
      c.recs.length = 0;
      updateGhosts(lanes, [hit("Caught", 0, caught)], slots, { exorcised: new Set(), onOpen: () => undefined, rise: false });
      expect(lanes.querySelectorAll(".vampire")).toHaveLength(1);
      expect(c.recs).toHaveLength(0);
      expect(rule(css, ".reduced-motion *, .reduced-motion *::before, .reduced-motion *::after")).toContain("animation: none !important;");
    } finally {
      c.restore();
    }
  });
});

describe("11.2 scanner update marks known vampires", () => {
  function haunted(entries: { name: string; startTime: number }[]) {
    const win = newWindow();
    win.document.write("<!doctype html><html><body><main><p>Hello</p></main></body></html>");
    (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ media: q, matches: true, addEventListener() {}, removeEventListener() {} });
    Object.defineProperty(win, "performance", { value: { getEntriesByType: () => entries }, configurable: true });
    const sent: ContentRequest[] = [];
    g.chrome = { runtime: { sendMessage: (m: ContentRequest) => (sent.push(m), Promise.resolve()) } };
    const doc = win.document as unknown as Document;
    const root = renderCostume(doc);
    const update = sent.find((m) => m.type === "TRACKER_UPDATE") as Extract<ContentRequest, { type: "TRACKER_UPDATE" }>;
    return { doc, update, counts: [...root.querySelectorAll("#hud .count .n")].map((n) => n.textContent) };
  }

  test("a company scored 2+ for fingerprinting (Hotjar) is a known vampire in the report and the HUD", async () => {
    const h = haunted([{ name: "https://static.hotjar.com/c.js", startTime: 1 }]);
    expect(h.update.companies.map((c) => [c.company, c.fingerprinting, c.vampire])).toEqual([["Hotjar", 2, { caught: [], knownOnly: true }]]);
    expect(h.counts.slice(0, 2)).toEqual(["0", "1"]);
    await leaveCostume(h.doc);
  });

  test("a company scored 1 (Criteo) stays an ordinary ghost", async () => {
    const h = haunted([{ name: "https://static.criteo.com/c.js", startTime: 1 }]);
    expect(h.update.companies.map((c) => [c.company, c.vampire])).toEqual([["Criteo", undefined]]);
    expect(h.counts.slice(0, 2)).toEqual(["1", "0"]);
    await leaveCostume(h.doc);
  });
});

describe("12.6 popup vampire controls (what is reachable)", () => {
  const popupCss = readFileSync(join(import.meta.dir, "../../src/popup/styles.css"), "utf8");
  const render = (ghosts: CompanyHit[]) => {
    const doc = newWindow("chrome-extension://x/popup.html").document as unknown as Document;
    const state: TabState = { haunted: true, restricted: false, url: "https://example.org/", ghosts, exorcised: [], tombstones: [] };
    doc.body.append(...renderScreen(doc, { state, settings: doc.createElement("div"), onPrimary: () => undefined, onExorcise: () => undefined }));
    return doc;
  };
  const listed = hit("AdTheorent", 2, caught);
  const unlisted: CompanyHit = { company: "nightowl-metrics.test", domains: ["nightowl-metrics.test"], count: 0, categories: [], fingerprinting: 0, vampire: caught };

  test("each listed vampire row has one native enabled button in tab order; unlisted hosts have none", () => {
    const doc = render([listed, unlisted]);
    const [a, b] = [...doc.querySelectorAll(".vampire-row")];
    const buttons = [...a!.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    expect([buttons[0]!.type, buttons[0]!.disabled, buttons[0]!.tabIndex, buttons[0]!.hasAttribute("hidden")]).toEqual(["button", false, 0, false]);
    expect(b!.querySelectorAll("button, [tabindex]")).toHaveLength(0);
  });

  test("the Caught pill and the row are static text: nothing in a vampire row except the button takes focus", () => {
    const doc = render([listed]);
    const focusable = [...doc.querySelectorAll(".vampire-row *")].filter((e) => e.matches("button, a[href], input, select, textarea, [tabindex]"));
    expect(focusable.map((e) => e.localName)).toEqual(["button"]);
  });

  test("the popup focus ring is a 2px #6633cc outline on every control and nothing removes it from vampire rows", () => {
    expect(popupCss).toMatch(/--accent: #6633cc;/);
    expect(popupCss.replace(/\s+/g, " ")).toContain(":focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }");
    const vampireRules = [...popupCss.matchAll(/([^{}]*vampire[^{}]*)\{([^{}]*)\}/g)];
    expect(vampireRules.length).toBeGreaterThan(3);
    for (const [, , body] of vampireRules) expect(body).not.toMatch(/outline\s*:\s*(none|0)/);
  });
});

describe("12.7 vampire text contrast and animation rate", () => {
  const lum = (h: string) => {
    const [r, gr, b] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * gr! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const popupCss = readFileSync(join(import.meta.dir, "../../src/popup/styles.css"), "utf8").replace(/\s+/g, " ");
  const popupVar = (name: string) => popupCss.match(new RegExp(`--${name}: (#[0-9a-f]{6});`, "i"))![1]!;
  const pill = (kind: string) => popupCss.match(new RegExp(`\\.tag-pill\\.${kind} \\{ background: (#[0-9a-f]{6}); color: var\\(--(\\w+)\\);`, "i"))!;

  test("costume vampire text pairs meet 4.5:1", () => {
    const pairs: [string, string, string][] = [
      ["label", P.bone, P.crypt],
      ["card title", P.bone, P.vampireLining],
      ["card body", P.bone, P.crypt],
      ["caught list", "#ff9999", P.crypt],
      ["honest line and footer", P.hudBevelLight, P.crypt],
    ];
    for (const [what, fg, bg] of pairs) expect({ [what]: contrast(fg, bg) >= 4.5 }).toEqual({ [what]: true });
  });

  test("the CSS draws those colours: card title on #660000, honest line #9999cc, caught list #ff9999", () => {
    expect(rule(css, ".vampire-card .bar")).toContain(`background: ${P.vampireLining};`);
    expect(rule(css, ".honest")).toContain(`color: ${P.hudBevelLight};`);
    expect(rule(css, ".did b")).toContain("color: #ff9999;");
  });

  test("popup Caught and Known pills and the row line meet 4.5:1", () => {
    const caughtPill = pill("caught");
    const knownPill = pill("known");
    expect(contrast(popupVar(caughtPill[2]!), caughtPill[1]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(popupVar(knownPill[2]!), knownPill[1]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(popupVar("muted"), popupVar("surface"))).toBeGreaterThanOrEqual(4.5);
  });

  test("no vampire animation period under 333ms (3 Hz): the only loop is the 3000ms alternating drift", () => {
    const declared = [...css.matchAll(/([^{}]*\.vampire[^{}]*)\{([^{}]*)\}/g)].flatMap(([, , body]) => [...body!.matchAll(/animation:([^;]*);/g)].map((m) => m[1]!.trim()));
    expect(declared.filter((a) => a !== "none")).toEqual(["hg-drift 3000ms ease-in-out var(--phase, 0ms) infinite alternate"]);
    for (const a of declared.filter((x) => x !== "none")) {
      const ms = Number(a.match(/(\d+)ms/)![1]);
      expect(ms * (a.includes("alternate") ? 2 : 1)).toBeGreaterThanOrEqual(333);
    }
    // And the keyframes are a 4px drift, not a blink.
    expect(css).toContain("@keyframes hg-drift { from { transform: translateY(-2px); } to { transform: translateY(2px); } }");
  });
});
