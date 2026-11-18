import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { openCard, openTombstoneCard } from "../../src/content/costume/card";
import { costumeCss } from "../../src/content/costume/styles";
import { appendPath, fitPath } from "../../src/content/costume/tombstones";
import type { DeadLink } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});
function setup() {
  const win = new Window({ url: "https://haunt.example/links.html", width: 1280, height: 800 });
  windows.push(win);
  const doc = win.document as unknown as Document;
  (win.Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {} });
  const cards = doc.createElement("div");
  const opener = doc.createElement("button");
  doc.body.append(opener, cards);
  return { doc, cards, opener };
}
const BLOG: DeadLink = { url: "https://haunt.example/blog/2019/the-very-long-haunted-filename-that-must-not-break.html", path: "/blog/2019/the-very-long-haunted-filename-that-must-not-break.html", status: 404 };
const bounds = { top: 48, bottom: 740 };

describe("the stone card (req 36-43)", () => {
  test("inscription: HERE LIES, the path with <wbr> after every '/', the status; same-origin shows no host", () => {
    const { cards, opener } = setup();
    const card = openTombstoneCard(cards, BLOG, opener, { bounds });
    expect(card.classList.contains("tombstone-card")).toBe(true);
    expect(card.getAttribute("role")).toBe("dialog");
    expect(card.querySelector(".here-lies")!.textContent).toBe("HERE LIES");
    const path = card.querySelector(".path")!;
    expect(path.textContent).toBe(BLOG.path);
    expect(path.querySelectorAll("wbr")).toHaveLength(3);
    expect(path.getAttribute("title")).toBe(BLOG.path); // the full path on hover, however it is cut
    expect(card.querySelector(".status")!.textContent).toBe("404 · Not Found");
    expect(card.querySelector(".host")).toBeNull();
    expect(card.querySelector(".moss")).not.toBeNull();
  });

  test("410 reads Gone; a cross-site link also shows its host", () => {
    const { cards, opener } = setup();
    const card = openTombstoneCard(cards, { url: "https://other.example/old/", path: "/old/", status: 410 }, opener, { bounds });
    expect(card.querySelector(".status")!.textContent).toBe("410 · Gone");
    expect(card.querySelector(".host")!.textContent).toBe("other.example");
  });

  test("Win95 [x] closes; Esc closes and hands focus back to the marker", () => {
    const { doc, cards, opener } = setup();
    let card = openTombstoneCard(cards, BLOG, opener, { bounds });
    const close = card.querySelector<HTMLButtonElement>("button.close.win95")!;
    expect(close.getAttribute("aria-label")).toBe("Close");
    expect(doc.activeElement).toBe(close);
    close.click();
    expect(cards.querySelector(".card")).toBeNull();
    expect(doc.activeElement).toBe(opener);

    card = openTombstoneCard(cards, BLOG, opener, { bounds });
    card.querySelector<HTMLElement>(".close")!.dispatchEvent(new (doc.defaultView as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cards.querySelector(".card")).toBeNull();
    expect(doc.activeElement).toBe(opener);
  });

  test("one card at a time, shared with the ghost and vampire cards", () => {
    const { cards, opener } = setup();
    openCard(cards, { company: "Criteo", domains: ["criteo.com"], count: 2, categories: ["Advertising"], fingerprinting: 0 }, opener, { exorcised: false, send: () => undefined, bounds });
    openTombstoneCard(cards, BLOG, opener, { bounds });
    expect([...cards.querySelectorAll(".card")].map((c) => c.className)).toEqual(["card tombstone-card"]);
    openCard(cards, { company: "Criteo", domains: ["criteo.com"], count: 2, categories: ["Advertising"], fingerprinting: 0 }, opener, { exorcised: false, send: () => undefined, bounds });
    expect([...cards.querySelectorAll(".card")].map((c) => c.className)).toEqual(["card"]);
  });

  test("CSS: 176px #cccccc slab, 88px arch, #ffffff/#666666 bevel, Times New Roman #000000 inscription pinned 16px in", () => {
    const css = costumeCss({ stars: "", twinkle: "" });
    const stone = css.match(/\.card\.tombstone-card \{[^}]*\}/)![0];
    for (const d of ["width: 176px", "background: #cccccc", "border-radius: 88px 88px 0 0", "border-color: #ffffff #666666 #666666 #ffffff", "box-shadow: 4px 4px 0 #000000"]) expect(stone).toContain(d);
    const ins = css.match(/\.tombstone-card \.inscription \{[^}]*\}/)![0];
    for (const d of ["position: absolute", "inset: 16px", "color: #000000", `"Times New Roman"`]) expect(ins).toContain(d);
    expect(css).toMatch(/\.tombstone-card \.here-lies \{[^}]*font-size: 12px;[^}]*letter-spacing: 2px;/);
    expect(css).toMatch(/\.tombstone-card \.status \{[^}]*font-size: 12px;/);
    expect(css).toMatch(/\.tombstone-card \.host \{[^}]*font-size: 12px;/);
    expect(css).toMatch(/\.tombstone-card \.moss \{[^}]*%23336633/); // moss pixels: an inline SVG strip in the moss token
  });

  test("fitPath: a segment taller than its box loses its start to '…' until it fits; a path past 3 lines goes tight", () => {
    const { doc } = setup();
    const size = (el: Element, k: string, v: number) => Object.defineProperty(el, k, { value: v, configurable: true });
    // a stand-in layout: 20 characters to a 17px line
    const lines = (el: Element) => Object.defineProperty(el, "offsetHeight", { get: () => Math.ceil(el.textContent!.length / 20) * 17, configurable: true });
    const stone = (p: string, scroll: number) => {
      const path = doc.createElement("p");
      appendPath(path, p);
      [size(path, "scrollHeight", scroll), size(path, "clientHeight", 51)];
      for (const s of path.querySelectorAll(".seg")) [size(s, "clientHeight", s.textContent!.length > 20 ? 34 : 17), lines(s.firstElementChild!)];
      return path;
    };
    const path = stone(BLOG.path, 51);
    fitPath(path);
    expect(path.classList.contains("tight")).toBe(false);
    const segs = [...path.querySelectorAll<HTMLElement>(".seg")];
    expect(segs.map((s) => s.classList.contains("cut"))).toEqual([false, false, false, true]);
    // the folders are untouched; the filename shows its last 39 characters after "…", two lines of 20
    expect(segs.slice(0, 3).map((s) => s.textContent)).toEqual(["/", "blog/", "2019/"]);
    const long = segs.at(-1)!;
    const shown = long.querySelector("bdi")!;
    expect(shown.textContent).toBe(`…${"the-very-long-haunted-filename-that-must-not-break.html".slice(-39)}`);
    expect(shown.getAttribute("aria-hidden")).toBe("true");
    // screen readers still get the whole name (and the title has the whole path)
    expect(long.querySelector(".sr")!.textContent).toBe("the-very-long-haunted-filename-that-must-not-break.html");
    // a deeper path would run past 3 lines: tight (the CSS gives its long segment one line)
    const deep = stone(BLOG.path, 68);
    fitPath(deep);
    expect(deep.classList.contains("tight")).toBe(true);
    // no layout (all zero): nothing marked
    const bare = doc.createElement("p");
    appendPath(bare, "/a/b.html");
    fitPath(bare);
    expect([bare.className, [...bare.querySelectorAll(".cut")].length]).toEqual(["", 0]);
  });

  test("CSS: a filename too wide for a line wraps onto two, its start cut with '…'; the path keeps to 3 lines of 13px", () => {
    const css = costumeCss({ stars: "", twinkle: "" });
    const path = css.match(/\.tombstone-card \.path \{[^}]*\}/)![0];
    for (const d of ["font-size: 13px", "line-height: 17px", "-webkit-line-clamp: 3", "max-height: 51px"]) expect(path).toContain(d);
    const seg = css.match(/\.tombstone-card \.seg \{[^}]*\}/)![0];
    // two lines at most, bottom-aligned, so what overflows is the start and the end stays readable
    for (const d of ["max-height: 34px", "flex-direction: column", "justify-content: flex-end", "overflow: hidden"]) expect(seg).toContain(d);
    expect(css).toMatch(/\.tombstone-card \.seg bdi \{[^}]*overflow-wrap: anywhere/);
    // a path that would run past 3 lines gives its long segment one line back
    expect(css).toMatch(/\.tombstone-card \.path\.tight \.seg \{ max-height: 17px; \}/);
  });
});
