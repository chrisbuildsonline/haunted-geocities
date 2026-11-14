import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { openCard } from "../../src/content/costume/card";
import type { CompanyHit } from "../../src/data/types";

const FOOT = "Blocked on this tab until you un-haunt or leave the page.";
const OLD = "Blocked until you close the browser.";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

function card(hit: CompanyHit, listed?: boolean) {
  const win = new Window({ url: "https://haunt.example/" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const cards = doc.createElement("div");
  const opener = doc.createElement("button");
  doc.body.append(cards, opener);
  openCard(cards, hit, opener, { exorcised: false, listed, send: () => undefined, bounds: { top: 48, bottom: 700 } });
  return cards.querySelector(".card")!;
}

const hit = (company: string): CompanyHit => ({ company, domains: [`${company.toLowerCase()}.com`], count: 2, categories: ["Advertising"], fingerprinting: 0 });

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe("ghost card footnote", () => {
  test("the ghost card footnote is exactly Blocked on this tab until you un-haunt or leave the page.", () => {
    expect(card(hit("Criteo")).querySelector(".foot")!.textContent).toBe(FOOT);
  });

  test("the vampire card has the same footnote", () => {
    const c = card({ ...hit("Hotjar"), vampire: { caught: ["canvas"], knownOnly: false } }, true);
    expect(c.classList.contains("vampire-card")).toBe(true);
    expect(c.querySelector(".foot")!.textContent).toBe(FOOT);
  });

  test("a card with no Exorcise button has no footnote", () => {
    const c = card({ company: "nightowl-metrics.test", domains: ["nightowl-metrics.test"], count: 0, categories: [], fingerprinting: 0, vampire: { caught: ["audio"], knownOnly: false } }, false);
    expect(c.querySelector("button.act")).toBeNull();
    expect(c.querySelector(".foot")).toBeNull();
  });

  test("the old text appears nowhere in src/", () => {
    const src = join(import.meta.dir, "..", "..", "src");
    const hits = files(src).filter((f) => /\.(ts|html|css|json)$/.test(f) && readFileSync(f, "utf8").includes(OLD));
    expect(hits).toEqual([]);
  });
});
