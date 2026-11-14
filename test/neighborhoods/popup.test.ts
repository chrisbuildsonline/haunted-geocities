import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderScreen } from "../../src/popup/screens";
import { openCard } from "../../src/content/costume/card";
import { updateGhosts } from "../../src/content/costume/ghosts";
import { resolveNeighborhood } from "../../src/data/neighborhood";
import type { CompanyHit, TabState } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const CSS = readFileSync(join(import.meta.dir, "..", "..", "src", "popup", "styles.css"), "utf8");

const ghost = (company: string, count: number): CompanyHit => ({ company, domains: [`${company.toLowerCase()}.com`], count, categories: ["Analytics"], fingerprinting: 0 });
const HOTJAR: CompanyHit = { ...ghost("Hotjar", 4), fingerprinting: 2, vampire: { caught: [], knownOnly: true } };
const ADTHEORENT: CompanyHit = { ...ghost("AdTheorent", 2), vampire: { caught: ["fonts", "canvas"], knownOnly: false } };

function render(state: Partial<TabState>) {
  const win = new Window({ url: "chrome-extension://x/popup.html" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const full: TabState = { haunted: true, restricted: false, url: "https://shop.example.com/cart", ghosts: [], exorcised: [], tombstones: [], curses: [], ...state };
  doc.body.append(...renderScreen(doc, { state: full, settings: doc.createElement("div"), onPrimary: () => undefined, onExorcise: () => undefined }));
  return doc;
}

const luminance = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const cssVar = (name: string) => CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))![1]!.toLowerCase();

describe("popup address line", () => {
  test("haunted screen shows the address under the title", () => {
    const doc = render({});
    const line = doc.querySelector("p.address")!;
    expect(line).not.toBeNull();
    expect(line.classList.contains("muted")).toBe(true);
    expect(line.textContent).toBe(resolveNeighborhood("shop.example.com").address);
    expect(line.textContent).toMatch(/^WallStreet\/[A-Za-z]+\/\d{4}$/);
  });

  test("the line is the h1's next sibling", () => {
    const doc = render({});
    const h1 = doc.querySelector("h1")!;
    expect(h1.textContent).toBe("shop.example.com");
    expect(h1.nextElementSibling).toBe(doc.querySelector("p.address"));
  });

  test("the address equals resolveNeighborhood(host).address", () => {
    for (const url of ["https://www.example.com/", "http://127.0.0.1:4321/index.html", "https://agency.gov.uk/x", "http://localhost:3000/"]) {
      const doc = render({ url });
      expect([url, doc.querySelector("p.address")!.textContent]).toEqual([url, resolveNeighborhood(new URL(url).hostname).address]);
    }
  });

  test("idle screen has no address line", () => {
    const doc = render({ haunted: false });
    expect(doc.querySelector("h1")!.textContent).toBe("shop.example.com");
    expect(doc.querySelector(".address")).toBeNull();
  });

  test("restricted screen has no address line", () => {
    const doc = render({ restricted: true, haunted: false, url: "chrome://settings/" });
    expect(doc.querySelector(".address")).toBeNull();
  });

  test("a file: URL has no address line", () => {
    expect(render({ url: "file:///home/me/page.html" }).querySelector(".address")).toBeNull();
  });

  test("a null url has no address line", () => {
    expect(render({ url: null }).querySelector(".address")).toBeNull();
  });

  test("an unparseable url has no address line", () => {
    expect(render({ url: "not a url" }).querySelector(".address")).toBeNull();
  });

  test("the line is set as text", () => {
    const line = render({}).querySelector("p.address")!;
    expect(line.children).toHaveLength(0);
    expect(line.childNodes).toHaveLength(1);
    expect(line.firstChild!.nodeType).toBe(3);
  });

  test("CSS: .address is 13px, muted, and may break anywhere", () => {
    const rule = CSS.match(/(?:^|\n)\.address\s*\{([^}]*)\}/)?.[1];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/font-size:\s*13px/);
    expect(rule).toMatch(/color:\s*var\(--muted\)/);
    expect(rule).toMatch(/margin-top:\s*-8px/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });

  test("CSS: muted text meets 4.5:1 on the canvas", () => {
    expect(contrast(cssVar("muted"), cssVar("canvas"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("known vampire row", () => {
  const vampireRows = (doc: Document) => [...doc.querySelectorAll(".vampire-row")];
  const txt = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

  test("a known vampire row has the pill Known and the line On the Tracker Radar fingerprint list", () => {
    const [row] = vampireRows(render({ ghosts: [HOTJAR] }));
    expect(txt(row!.querySelector(".tag-pill"))).toBe("Known");
    expect(row!.querySelector(".tag-pill")!.className).toBe("tag-pill known");
    expect(txt(row!.querySelector(".row-sub"))).toBe("On the Tracker Radar fingerprint list");
  });

  test("the word Known appears once in a known vampire row's text", () => {
    const [row] = vampireRows(render({ ghosts: [HOTJAR] }));
    expect(row!.textContent!.match(/known/gi)).toHaveLength(1);
  });

  test("a caught vampire row is unchanged", () => {
    const [row] = vampireRows(render({ ghosts: [ADTHEORENT] }));
    expect(txt(row!.querySelector(".tag-pill"))).toBe("Caught");
    expect(txt(row!.querySelector(".row-sub"))).toBe("Canvas readback · font probing");
  });

  test("the card still says Known to fingerprint (Tracker Radar)", () => {
    const win = new Window({ url: "https://haunt.example/" });
    windows.push(win);
    const doc = win.document as unknown as Document;
    const cards = doc.createElement("div");
    const opener = doc.createElement("button");
    doc.body.append(cards, opener);
    openCard(cards, HOTJAR, opener, { exorcised: false, send: () => undefined, bounds: { top: 48, bottom: 700 } });
    expect(cards.textContent).toContain("Known to fingerprint (Tracker Radar)");
  });

  test("the lane label still says known to fingerprint", () => {
    const win = new Window({ url: "https://haunt.example/" });
    windows.push(win);
    const lanes = (win.document as unknown as Document).createElement("div");
    updateGhosts(lanes, [HOTJAR], [{ side: "left", x: 0, y: 8, w: 64 }], { exorcised: new Set(), onOpen() {}, rise: false });
    expect(lanes.querySelector(".vampire")!.getAttribute("aria-label")).toBe("Hotjar, vampire, known to fingerprint");
  });
});
