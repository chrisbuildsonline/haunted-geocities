// The secrets (design/DESIGN.md "Secrets (easter eggs)", .kiro/specs/crypt-footer): only on a haunted
// page, never while typing in a field, reduced-motion safe, and gone with the costume.
import { describe, expect, test } from "bun:test";
import { BOO_MS, FRENZY_MS, KONAMI, mountSecrets, SKELETON_MS, specialDay } from "../../src/content/costume/secrets";
import { leaveCostume, renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { flush, setup } from "./helpers";

/** A manual clock for the secrets' timers. */
function clock() {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn: () => void, ms: number) => (due.set(++seq, { at: now + ms, fn }), seq),
    clear: (id: number) => void due.delete(id),
    run(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...due].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        due.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}

function rig(opts: { reduced?: boolean; date?: Date } = {}) {
  const { win, doc } = setup();
  doc.body.insertAdjacentHTML("beforeend", `<input id="field"><div id="editable" contenteditable="true"></div>`);
  const croot = doc.createElement("div");
  const footer = doc.createElement("footer");
  const hud = doc.createElement("div");
  hud.innerHTML = `<div class="hits" role="group"><span class="odometer"></span></div>`;
  footer.append(hud);
  doc.body.append(croot, footer);
  const said: string[] = [];
  const timers = clock();
  const secrets = mountSecrets({
    win: win as unknown as Window,
    croot,
    footer,
    hud,
    reduced: () => !!opts.reduced,
    now: () => opts.date ?? new Date(2026, 10, 25, 14, 0),
    say: (line) => said.push(line),
    timers,
  });
  const key = (k: string, target: EventTarget = doc.body) =>
    target.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, composed: true }) as unknown as Event);
  const type = (keys: readonly string[], target?: EventTarget) => keys.forEach((k) => key(k, target));
  const hits = () => hud.querySelector(".hits") as HTMLElement;
  return { win, doc, croot, footer, hud, said, timers, secrets, key, type, hits };
}

describe("Konami code", () => {
  test("↑↑↓↓←→←→BA: a 3-second frenzy, with the marquee line", () => {
    const r = rig();
    r.type(KONAMI);
    expect(r.croot.classList.contains("frenzy")).toBe(true);
    expect(r.said).toEqual(["!!! FULL HAUNT !!!"]);
    r.timers.run(FRENZY_MS);
    expect(r.croot.classList.contains("frenzy")).toBe(false);
  });
  test("a wrong key resets it; a near miss does nothing", () => {
    const r = rig();
    r.type(KONAMI.slice(0, 5));
    r.key("x");
    r.type(KONAMI.slice(5));
    expect(r.croot.classList.contains("frenzy")).toBe(false);
  });
  test("reduced motion: only the marquee line, no frenzy", () => {
    const r = rig({ reduced: true });
    r.type(KONAMI);
    expect(r.croot.classList.contains("frenzy")).toBe(false);
    expect(r.said).toEqual(["!!! FULL HAUNT !!!"]);
  });
});

describe("the hit counter, clicked 13 times", () => {
  test("a dancing skeleton for 5 seconds", () => {
    const r = rig();
    for (let i = 0; i < 12; i++) r.hits().click();
    expect(r.hud.querySelector(".skeleton")).toBeNull();
    r.hits().click();
    const skel = r.hud.querySelector(".skeleton") as HTMLElement;
    expect(skel).not.toBeNull();
    expect(skel.getAttribute("aria-hidden")).toBe("true");
    expect(skel.querySelector("svg")!.getAttribute("width")).toBe("48");
    r.timers.run(SKELETON_MS);
    expect(r.hud.querySelector(".skeleton")).toBeNull();
  });
  test("the clicks must come within 3 seconds of each other", () => {
    const r = rig();
    for (let i = 0; i < 12; i++) r.hits().click();
    r.timers.run(3001);
    r.hits().click();
    expect(r.hud.querySelector(".skeleton")).toBeNull();
  });
});

describe("typing boo", () => {
  test("every ghost flees, then floats back 2 seconds later", () => {
    const r = rig();
    r.type(["b", "o", "o"]);
    expect(r.croot.classList.contains("fled")).toBe(true);
    expect(r.footer.classList.contains("fled")).toBe(true);
    r.timers.run(BOO_MS);
    expect(r.croot.classList.contains("fled")).toBe(false);
    expect(r.footer.classList.contains("fled")).toBe(false);
  });
  test("case does not matter, other letters in between break it", () => {
    const r = rig();
    r.type(["B", "o", "x", "o"]);
    expect(r.croot.classList.contains("fled")).toBe(false);
    r.type(["B", "O", "O"]);
    expect(r.croot.classList.contains("fled")).toBe(true);
  });
});

describe("never while typing in a field", () => {
  test("keys in an input or a contenteditable count for nothing", () => {
    const r = rig();
    const field = r.doc.getElementById("field")!;
    const editable = r.doc.getElementById("editable")!;
    r.type(["b", "o", "o"], field);
    r.type(KONAMI, editable);
    expect(r.croot.classList.contains("fled")).toBe(false);
    expect(r.croot.classList.contains("frenzy")).toBe(false);
  });
});

describe("witching hour and Halloween", () => {
  test("specialDay: Oct 31 is halloween all day, local 00:00-00:59 the witching hour, Halloween wins", () => {
    expect(specialDay(new Date(2026, 9, 31, 15, 0))).toBe("halloween");
    expect(specialDay(new Date(2026, 9, 31, 0, 30))).toBe("halloween");
    expect(specialDay(new Date(2026, 10, 25, 0, 0))).toBe("witching");
    expect(specialDay(new Date(2026, 10, 25, 0, 59))).toBe("witching");
    expect(specialDay(new Date(2026, 10, 25, 1, 0))).toBeNull();
    expect(specialDay(new Date(2026, 10, 25, 23, 59))).toBeNull();
  });
  test("the look is a class on the costume and the marquee opens with its line", () => {
    const h = rig({ date: new Date(2026, 9, 31, 12, 0) });
    expect(h.croot.classList.contains("halloween")).toBe(true);
    expect(h.said).toEqual(["Happy Halloween from 1998!"]);
    const w = rig({ date: new Date(2026, 10, 25, 0, 13) });
    expect(w.croot.classList.contains("witching")).toBe(true);
    expect(w.said).toEqual(["It's the witching hour."]);
    const n = rig();
    expect(n.croot.classList.contains("witching") || n.croot.classList.contains("halloween")).toBe(false);
    expect(n.said).toEqual([]);
  });
});

describe("stop", () => {
  test("after stop nothing fires and the classes are gone", () => {
    const r = rig();
    r.type(["b", "o", "o"]);
    r.secrets.stop();
    expect(r.croot.classList.contains("fled")).toBe(false);
    r.type(KONAMI);
    for (let i = 0; i < 13; i++) r.hits().click();
    expect(r.croot.classList.contains("frenzy")).toBe(false);
    expect(r.hud.querySelector(".skeleton")).toBeNull();
  });
});

describe("in the costume", () => {
  test("renderCostume wires them; after un-haunt the page is byte-identical and keys do nothing", async () => {
    const { win, doc } = setup();
    const before = doc.documentElement.outerHTML;
    const root = renderCostume(doc);
    const croot = root.getElementById("crypt-root")!;
    for (const k of ["b", "o", "o"]) doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true }) as unknown as Event);
    expect(croot.classList.contains("fled")).toBe(true);
    await flush();
    await leaveCostume(doc);
    expect(doc.documentElement.outerHTML).toBe(before);
    for (const k of ["b", "o", "o"]) doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true }) as unknown as Event);
    expect(croot.isConnected).toBe(false);
  });
  test("the CSS: the frenzy keeps every loop at or under 3 Hz, and reduced motion stills the skeleton and the flight", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    expect(css).toMatch(/\.frenzy \.ghost, \.frenzy \.vampire[^{]*\{[^}]*animation-duration: 334ms/);
    expect(css).toMatch(/\.skeleton \{[^}]*animation: dance 2000ms steps\(1\) infinite/);
    expect(css).toMatch(/\.fled \.sprite \{[^}]*transform: translateY\(120vh\)/);
    expect(css).toMatch(/\.reduced-motion\.fled \.sprite \{[^}]*transform: none/);
    expect(css).toMatch(/\.halloween #neighborhood[^{]*\{[^}]*#ff9900/);
  });
});
