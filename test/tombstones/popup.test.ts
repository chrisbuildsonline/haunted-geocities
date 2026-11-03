import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderScreen } from "../../src/popup/screens";
import type { CompanyHit, DeadLink, TabState } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const VAMP: CompanyHit = { company: "AdTheorent", domains: ["adentifi.com"], count: 2, categories: [], fingerprinting: 0, vampire: { caught: ["canvas"], knownOnly: false } };
const DEAD: DeadLink[] = [
  { url: "https://example.org/missing.html", path: "/missing.html", status: 404 },
  { url: "https://example.org/gone/", path: "/gone/", status: 410 },
  { url: "https://other.example/blog/2019/old-post.html", path: "/blog/2019/old-post.html", status: 404 },
];

function render(tombstones: DeadLink[], ghosts: CompanyHit[] = []) {
  const win = new Window({ url: "chrome-extension://x/popup.html" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const state: TabState = { haunted: true, restricted: false, url: "https://example.org/links.html", ghosts, exorcised: [], tombstones };
  doc.body.append(...renderScreen(doc, { state, settings: doc.createElement("div"), onPrimary: () => undefined, onExorcise: () => undefined }));
  return doc;
}
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("popup tombstones (req 46-48, 58)", () => {
  test("the Tombstones tile shows the count", () => {
    expect(text(render(DEAD).querySelector('[data-count="tombstones"] .num'))).toBe("3");
    expect(text(render([]).querySelector('[data-count="tombstones"] .num'))).toBe("0");
  });

  test("rows after the vampires: path on line 1 (wbr after every '/'), status pill on line 2, host only when cross-site", () => {
    const doc = render(DEAD, [VAMP]);
    const head = doc.querySelector(".tombstones-head")!;
    expect(text(head)).toBe("Tombstones 3");
    expect(doc.querySelector(".vampires-head")!.compareDocumentPosition(head) & 4).toBeTruthy(); // FOLLOWING
    const rows = [...doc.querySelectorAll(".tombstone-row")];
    expect(rows.map((r) => [text(r.querySelector(".row-title")), text(r.querySelector(".tag-pill")), text(r.querySelector(".row-sub"))])).toEqual([
      ["/missing.html", "404", "Not found"],
      ["/gone/", "410", "Gone"],
      ["/blog/2019/old-post.html", "404", "Not found · other.example"],
    ]);
    expect(rows[2]!.querySelector(".row-title")!.querySelectorAll("wbr")).toHaveLength(3);
    expect(rows.map((r) => r.querySelector(".tag-pill")!.className)).toEqual(["tag-pill dead-404", "tag-pill dead-410", "tag-pill dead-404"]);
  });

  test("rows are keyboard reachable and say what they are", () => {
    const rows = [...render(DEAD).querySelectorAll<HTMLElement>(".tombstone-row")];
    expect(rows.map((r) => r.tabIndex)).toEqual([0, 0, 0]);
    expect(rows[2]!.getAttribute("aria-label")).toBe("Dead link: /blog/2019/old-post.html, 404 Not found, on other.example");
  });

  test("empty: No tombstones. Every link is alive.", () => {
    const doc = render([]);
    expect(text(doc.querySelector(".no-tombstones"))).toBe("No tombstones. Every link is alive.");
    expect(doc.querySelector(".tombstone-row")).toBeNull();
  });

  test("CSS: pills tinted inside the one-accent system, path wraps only at '/', rows hover like the others", () => {
    const css = readFileSync(join(import.meta.dir, "../../src/popup/styles.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(".tag-pill.dead-404 { background: var(--accent-tint); color: var(--accent); }");
    expect(css).toContain(".tag-pill.dead-410 { background: #e3e6ec; color: var(--muted); }");
    expect(css).toMatch(/\.tombstone-row \.row-title \{[^}]*overflow-wrap: normal;[^}]*word-break: keep-all;/);
    expect(css).toMatch(/\.tomb-path \.seg \{[^}]*direction: rtl;[^}]*text-overflow: ellipsis;/);
  });
});
