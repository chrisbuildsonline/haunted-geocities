import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderScreen } from "../../src/popup/screens";
import { VAMPIRE_BUST } from "../../src/popup/sprites";
import type { CompanyHit, TabState } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const ghost = (company: string, count: number): CompanyHit => ({ company, domains: [`${company.toLowerCase()}.com`], count, categories: ["Analytics"], fingerprinting: 0 });
const ADTHEORENT: CompanyHit = { ...ghost("AdTheorent", 2), vampire: { caught: ["fonts", "canvas"], knownOnly: false } };
const HOTJAR: CompanyHit = { ...ghost("Hotjar", 4), fingerprinting: 2, vampire: { caught: [], knownOnly: true } };
const NIGHTOWL: CompanyHit = { company: "nightowl-metrics.test", domains: ["nightowl-metrics.test"], count: 0, categories: [], fingerprinting: 0, vampire: { caught: ["audio"], knownOnly: false } };

function render(ghosts: CompanyHit[], exorcised: string[] = []) {
  const win = new Window({ url: "chrome-extension://x/popup.html" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const state: TabState = { haunted: true, restricted: false, url: "https://example.org/", ghosts, exorcised };
  const calls: [string, boolean][] = [];
  doc.body.append(...renderScreen(doc, { state, settings: doc.createElement("div"), onPrimary: () => undefined, onExorcise: (c, e) => calls.push([c, e]) }));
  const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const rows = (sel: string) =>
    [...doc.querySelectorAll(sel)].map((r) => [text(r.querySelector(".row-title")), text(r.querySelector(".tag-pill")), text(r.querySelector(".row-sub")), r.querySelector("button")?.textContent ?? null]);
  return { doc, calls, text, rows, num: (k: string) => text(doc.querySelector(`[data-count="${k}"] .num`)) };
}

describe("popup vampires", () => {
  test("counts split: ghosts are only the non-vampires", () => {
    const p = render([ghost("Criteo", 3), HOTJAR, ADTHEORENT, NIGHTOWL]);
    expect([p.num("ghosts"), p.num("vampires")]).toEqual(["1", "3"]);
  });

  test("vampires listed after ghosts by name: tile, name, pill, what it read, Exorcise only for tracker companies", () => {
    const p = render([NIGHTOWL, ghost("Criteo", 3), HOTJAR, ghost("Taboola", 9), ADTHEORENT]);
    expect(p.rows(".ghost-row:not(.vampire-row)").map((r) => r[0])).toEqual(["Taboola", "Criteo"]);
    expect(p.rows(".vampire-row")).toEqual([
      ["AdTheorent", "Caught", "Canvas readback · font probing", "Exorcise"],
      ["Hotjar", "Known", "Known to fingerprint", "Exorcise"],
      ["nightowl-metrics.test", "Caught", "AudioContext", null],
    ]);
    const heads = [...p.doc.querySelectorAll(".list-head")].map((h) => p.text(h));
    expect(heads).toEqual(["Ghosts 2", "Vampires 3"]);
    const first = p.doc.querySelector(".vampire-row")!;
    expect(first.querySelector(".tag-pill")!.className).toBe("tag-pill caught");
    expect(p.doc.querySelectorAll(".vampire-row")[1]!.querySelector(".tag-pill")!.className).toBe("tag-pill known");
    expect(first.querySelector(".icon-tile svg")!.getAttribute("width")).toBe("24");
    const btn = first.querySelector("button")!;
    expect(btn.getAttribute("aria-label")).toBe("Exorcise: AdTheorent");
    btn.click();
    expect(p.calls).toEqual([["AdTheorent", false]]);
  });

  test("an exorcised vampire offers Let it back", () => {
    const p = render([ADTHEORENT], ["AdTheorent"]);
    expect(p.rows(".vampire-row")).toEqual([["AdTheorent", "Exorcised", "Canvas readback · font probing", "Let it back"]]);
    expect(p.doc.querySelector(".vampire-row")!.classList.contains("exorcised")).toBe(true);
  });

  test("empty states: no vampires line; vampires only means no 'suspiciously clean'", () => {
    const none = render([ghost("Criteo", 3)]);
    expect(none.text(none.doc.querySelector(".no-vampires"))).toBe("No vampires. Your blood is safe.");
    const empty = render([]);
    expect([...empty.doc.querySelectorAll(".list p")].map((p) => p.textContent)).toEqual([
      "No ghosts here. Suspiciously clean.",
      "Trackers that load later will appear here.",
      "No vampires. Your blood is safe.",
    ]);
    const only = render([NIGHTOWL]);
    expect(only.text(only.doc.querySelector(".list"))).not.toContain("Suspiciously clean");
    expect(only.doc.querySelector(".no-vampires")).toBeNull();
  });

  test("bust art is 12×12 and the pills use the DESIGN tints", () => {
    expect(VAMPIRE_BUST).toHaveLength(12);
    for (const r of VAMPIRE_BUST) expect(r).toHaveLength(12);
    const css = readFileSync(join(import.meta.dir, "../../src/popup/styles.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(".tag-pill.caught { background: #f1ecfb; color: var(--accent); }");
    expect(css).toContain(".tag-pill.known { background: #e3e6ec; color: var(--muted); }");
  });
});
