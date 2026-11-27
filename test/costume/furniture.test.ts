import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { buildPiece, buildTabs, harvest, layoutCss, layoutGeometry, placeFurniture } from "../../src/content/costume/furniture";
import { FURNITURE, pickLook, type Look } from "../../src/content/costume/themes";

const look = (layout: Look["layout"], furniture: Look["furniture"] = []) => ({ ...pickLook("x.test", "flame-skull"), layout, furniture });

describe("layoutGeometry", () => {
  test("a centred three-column table at 1280", () => {
    expect(layoutGeometry(look("links3"), 1280)).toEqual({ collapsed: false, left: { x: 190, w: 170 }, main: { x: 360, w: 560 }, right: { x: 920, w: 170 } });
  });

  test("left760 keeps 64px of starfield on the left", () => {
    expect(layoutGeometry(look("left760"), 1280)).toEqual({ collapsed: false, left: null, main: { x: 64, w: 760 }, right: null });
  });

  test("too narrow: the right column goes first, then the left, then it collapses to one column", () => {
    expect(layoutGeometry(look("links3"), 1000)).toMatchObject({ collapsed: false, left: { w: 170 }, right: null });
    expect(layoutGeometry(look("links3"), 800)).toMatchObject({ collapsed: false, left: null, right: null, main: { w: 560 } });
    expect(layoutGeometry(look("links3"), 375)).toEqual({ collapsed: true, main: null, left: null, right: null });
  });

  test("full width leaves the page alone: no rules", () => {
    const g = layoutGeometry(look("full"), 1280);
    expect(g.main).toBeNull();
    expect(layoutCss(g)).toBe("");
  });

  test("the body is held to its cell, with padding so text never touches a column", () => {
    const css = layoutCss(layoutGeometry(look("nav2"), 1280));
    expect(css).toContain("max-width: 620px !important;");
    expect(css).toContain("margin-left: 420px !important;");
    expect(css).toContain("padding-left: 16px !important; padding-right: 16px !important; overflow-x: clip !important;");
  });
});

describe("placeFurniture", () => {
  test("every piece goes somewhere; nav buttons head the left column; Cool Links and awards prefer the right", () => {
    const all = FURNITURE.filter((f) => f !== "tabbar");
    const at = placeFurniture(["awards", "navbuttons", ...all.filter((f) => f !== "awards" && f !== "navbuttons")], layoutGeometry(look("links3"), 1280));
    expect(at.left[0]).toBe("navbuttons");
    expect(at.right).toContain("awards");
    expect(at.right).toContain("coollinks");
    expect(at.bottom.sort()).toEqual(["bestviewed", "updated", "webring"]);
    expect([...at.left, ...at.right, ...at.bottom].sort()).toEqual([...all].sort());
  });

  test("with no side column, everything is at the bottom", () => {
    const at = placeFurniture(["navbuttons", "coollinks", "counter"], layoutGeometry(look("links3"), 375));
    expect(at).toEqual({ left: [], right: [], bottom: ["navbuttons", "coollinks", "counter"] });
  });
});

describe("harvest and the pieces", () => {
  const windows: Window[] = [];
  afterEach(() => windows.splice(0).forEach((w) => w.happyDOM.abort()));
  const page = (body: string) => {
    const win = new Window({ url: "https://site.test/" });
    windows.push(win);
    win.document.write(`<!doctype html><html><body>${body}</body></html>`);
    return win.document as unknown as Document;
  };

  test("harvest reads the page's site links, outbound links and headings, skipping script links", () => {
    const doc = page(`<a href="#main">Skip to main content</a><a href="/#top">Top</a><nav><a href="/">Home</a><a href="/about">About</a><a href="javascript:alert(1)">Bad</a></nav>
      <h2>First news</h2><h3>Second news</h3><a href="https://other.test/x">A friend's page</a>`);
    const h = harvest(doc, "hg-crypt");
    expect(h.nav.map((n) => n.text)).toEqual(["Home", "About"]);
    expect(h.out).toEqual([{ text: "A friend's page", href: "https://other.test/x" }]);
    expect(h.headings).toEqual(["First news", "Second news"]);
  });

  test("nav buttons are copies of the page's links, out of the tab order; made-up ones are not links", () => {
    const doc = page(`<a href="/">Home</a><a href="/about">About</a>`);
    const real = buildPiece(doc, "navbuttons", look("nav2"), harvest(doc, "hg-crypt"));
    expect([...real.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href"), a.tabIndex])).toEqual([["Home", "https://site.test/", -1], ["About", "https://site.test/about", -1]]);
    const fake = buildPiece(doc, "navbuttons", look("nav2"), { nav: [], out: [], headings: [] });
    expect(fake.querySelectorAll("a")).toHaveLength(0);
    expect([...fake.querySelectorAll(".navbtn")].map((b) => b.textContent)).toEqual(["Home", "About Me", "My Links", "Guestbook", "Photos"]);
    expect(buildTabs(doc, harvest(doc, "hg-crypt")).querySelectorAll("a.tab")).toHaveLength(2);
  });

  test("every piece builds, page text goes in as text, and the same site gets the same awards", () => {
    const doc = page(`<h2>&lt;img src=x onerror=alert(1)&gt;</h2>`);
    const h = harvest(doc, "hg-crypt");
    for (const f of FURNITURE) expect(buildPiece(doc, f, look("nav2"), h).className).toBe(`fur fur-${f}`);
    const news = buildPiece(doc, "whatsnew", look("nav2"), h);
    expect(news.querySelector("img")).toBeNull();
    expect(news.textContent).toContain("<img src=x onerror=alert(1)>");
    const awards = () => buildPiece(doc, "awards", look("nav2"), h).textContent;
    expect(awards()).toBe(awards());
  });
});
