// Real-site blocks: on a light page, the dark hero panels and bands a photo-heavy site draws get the
// crypt costume (square corners, the HUD bevel, the crypt ground, dark-page link colours), and search
// boxes become 1998 sunken fields, all as page-sheet rules addressed by a structural path.
import { describe, expect, test } from "bun:test";
import { addPageSheet } from "../../src/content/costume/body-padding";
import { blocksCss, cssPath, findBlocks, isDarkBlock, type Blocks } from "../../src/content/costume/page-blocks";
import { themeFor } from "../../src/content/costume/page-theme";
import { PALETTE as P } from "../../src/content/costume/tokens";
import { domRect, pageCss, setup } from "./helpers";

const PAGE = `<!doctype html><html><head><title>t</title></head><body style="background:#ffffff;color:#222222">
<header style="background:#000000;color:#ffffff"><a id="logo" href="/">Parks</a></header>
<div class="top" style="background:#000000;color:#ffffff">
  <form id="pill" role="search" style="background-color:#333333;border-radius:20px"><input id="q" type="search" placeholder="Search or ask anything" style="background-color:transparent"></form>
</div>
<section id="hero" style="background-image:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=);color:#ffffff">
  <div id="panel" style="background-color:rgba(0, 0, 0, 0.6);color:#ffffcc;border-radius:12px">
    <p>Winter is Coming</p><a id="cta" href="/x" style="background-color:#ffffcc;color:#224422">Plan</a>
    <p><a id="credit" href="/y">Pinecrest Lake</a></p>
  </div>
</section>
<section id="pale" style="background-color:#eeeeee;color:#222222"><p>Light band</p></section>
<section id="gradient" style="background-image:linear-gradient(#000, #333);color:#222222"><p>Dark text on a picture: not a dark block</p></section>
<section id="small" style="background-color:#000000;color:#ffffff"><p>Too small</p></section>
<main><p>Body text <a id="plain" href="/z">link</a></p><input id="name" name="name"><input id="find" name="site-search" type="text"><input id="hid" type="hidden" name="search"></main>
</body></html>`;

/** happy-dom has no layout: every block is 1280×300 except the 64px top bar, #small (1280×40), the pill and inputs. */
function sized(win: { Element: { prototype: object } }) {
  const proto = win.Element.prototype as { getBoundingClientRect(this: Element): DOMRect };
  proto.getBoundingClientRect = function (this: Element) {
    if (this.localName === "input") return this.getAttribute("type") === "hidden" ? domRect({ left: 0, right: 0, top: 0, bottom: 0 }) : domRect({ left: 0, right: 240, top: 0, bottom: 21 });
    if (this.id === "pill") return domRect({ left: 0, right: 260, top: 0, bottom: 40 });
    if (this.classList.contains("top")) return domRect({ left: 0, right: 1280, top: 0, bottom: 64 });
    if (this.id === "small") return domRect({ left: 0, right: 1280, top: 0, bottom: 40 });
    return domRect({ left: 0, right: 1280, top: 0, bottom: 300 });
  };
}

describe("cssPath", () => {
  test("a structural path from body that selects the element and nothing else", () => {
    const { doc } = setup({ html: PAGE });
    for (const id of ["hero", "panel", "credit", "q", "pill", "plain"]) {
      const el = doc.getElementById(id)!;
      const path = cssPath(el);
      expect(path.startsWith("body > ")).toBe(true);
      expect([...doc.querySelectorAll(path)]).toEqual([el]);
    }
  });
});

describe("isDarkBlock", () => {
  test("light text on a dark colour or on a picture; never dark text, never a pale or faint ground", () => {
    const none = "none";
    expect(isDarkBlock({ color: "rgb(255, 255, 255)", background: "rgb(0, 0, 0)", image: none })).toBe(true);
    expect(isDarkBlock({ color: "rgb(255, 255, 204)", background: "rgba(0, 0, 0, 0.6)", image: none })).toBe(true);
    expect(isDarkBlock({ color: "rgb(255, 255, 255)", background: "rgba(0, 0, 0, 0)", image: "url(x.jpg)" })).toBe(true);
    expect(isDarkBlock({ color: "rgb(34, 34, 34)", background: "rgba(0, 0, 0, 0)", image: "url(x.jpg)" })).toBe(false);
    expect(isDarkBlock({ color: "rgb(255, 255, 255)", background: "rgb(238, 238, 238)", image: none })).toBe(false);
    expect(isDarkBlock({ color: "rgb(255, 255, 255)", background: "rgba(0, 0, 0, 0.1)", image: none })).toBe(false);
    expect(isDarkBlock({ color: "rgb(255, 255, 255)", background: "rgba(0, 0, 0, 0)", image: none })).toBe(false);
  });
});

describe("findBlocks", () => {
  test("the dark hero and its panel, not the site header, a pale band, dark text on a picture or a small bar", () => {
    const { win, doc } = setup({ html: PAGE });
    sized(win);
    const b = findBlocks(doc);
    const ids = b.dark.map((d) => doc.querySelector(d.path)!.id);
    expect(ids).toEqual(["hero", "panel"]);
    // the panel's own colour is swapped for the crypt; the hero keeps its picture
    expect(b.dark.map((d) => d.ground)).toEqual([false, true]);
    // a link dressed as a button (its own ground) keeps the light page's colours
    const panel = b.dark.find((d) => doc.querySelector(d.path)!.id === "panel")!;
    expect(panel.keep.map((p) => doc.querySelector(p)!.id)).toEqual(["cta"]);
  });

  test("search boxes: the visible pill around a bare input, a named search field; never a plain or hidden input", () => {
    const { win, doc } = setup({ html: PAGE });
    sized(win);
    const fields = findBlocks(doc).search.map((s) => [doc.querySelector(s.path)!.id, s.input]);
    expect(fields).toEqual([
      ["pill", false],
      ["find", true],
    ]);
  });

  test("on a dark page nothing is a dark block (the whole page already wears the dark costume)", () => {
    const { win, doc } = setup({ html: PAGE.replace("background:#ffffff;color:#222222", "background:#111111;color:#eeeeee") });
    sized(win);
    expect(findBlocks(doc, { darkPage: true }).dark).toEqual([]);
    expect(findBlocks(doc, { darkPage: true }).search).toHaveLength(2);
  });
});

describe("blocksCss", () => {
  const blocks: Blocks = {
    dark: [
      { path: "body > :nth-child(3)", ground: false, keep: [] },
      { path: "body > :nth-child(3) > :nth-child(1)", ground: true, keep: ["body > :nth-child(3) > :nth-child(1) > :nth-child(2)"] },
    ],
    search: [
      { path: "body > :nth-child(2) > :nth-child(1)", input: false },
      { path: "body > :nth-child(6) > :nth-child(3)", input: true },
    ],
  };
  const css = blocksCss(blocks);
  const dark = themeFor(P.crypt);

  test("dark blocks: square, the HUD's bevel, 1px line and hard shadow; the crypt ground only where the page had a colour", () => {
    expect(css).toMatch(/body > :nth-child\(3\) \{[^}]*border-radius: 0 !important/);
    expect(css).toContain(`box-shadow: inset 0 0 0 1px ${P.ink}, inset 3px 3px 0 ${P.hudBevelLight}, inset -3px -3px 0 ${P.bevelDark}, 4px 4px 0 ${P.ink} !important`);
    expect(css).toMatch(new RegExp(`body > :nth-child\\(3\\) > :nth-child\\(1\\) \\{[^}]*background-color: ${P.crypt} !important`));
    expect(css).not.toMatch(new RegExp(`body > :nth-child\\(3\\) \\{[^}]*background-color`));
  });

  test("dark blocks: their text links take the dark-page colours, button links and site chrome keep theirs", () => {
    expect(dark.link).toBe("#66ccff");
    const linkRule = css.match(/([^\n{}]*a:link[^{]*)\{([^}]*)\}/)!;
    expect(linkRule[2]).toContain(`color: ${dark.link} !important`);
    expect(linkRule[1]).toContain(":is(body > :nth-child(3), body > :nth-child(3) > :nth-child(1)) a:link");
    expect(linkRule[1]).toContain(":not(body > :nth-child(3) > :nth-child(1) > :nth-child(2))");
    expect(linkRule[1]).toContain('[class*="btn"]');
    expect(css).toContain(`color: ${dark.visited} !important`);
    expect(css).toContain(`color: ${dark.hover} !important`);
  });

  test("search boxes: a sunken white field with black text and a readable placeholder, square", () => {
    const field = css.match(/body > :nth-child\(2\) > :nth-child\(1\) \{([^}]*)\}/)![1]!;
    for (const d of [
      `background-color: ${P.ghostWhite} !important`, "background-image: none !important", `color: ${P.ink} !important`, "border-radius: 0 !important",
      `box-shadow: inset 1px 1px 0 ${P.stoneShadow}, inset 2px 2px 0 ${P.ink}, inset -1px -1px 0 ${P.ghostWhite}, inset -2px -2px 0 ${P.stone} !important`,
    ]) {
      expect({ d, ok: field.includes(d) }).toEqual({ d, ok: true });
    }
    // the bare input inside the pill turns black on the field, its placeholder #666666 (5.7:1 on white)
    expect(css).toMatch(/body > :nth-child\(2\) > :nth-child\(1\) input \{[^}]*color: #000000 !important/);
    expect(css).toMatch(/body > :nth-child\(2\) > :nth-child\(1\) input::placeholder[^{]*\{[^}]*color: #666666 !important/);
    expect(css).toMatch(/body > :nth-child\(6\) > :nth-child\(3\)::placeholder \{[^}]*color: #666666 !important/);
  });

  test("nothing found draws nothing", () => {
    expect(blocksCss({ dark: [], search: [] })).toBe("");
  });

  test("the page sheet carries the block rules and drops them with the haunt", () => {
    const { doc } = setup();
    const page = addPageSheet(doc);
    page.set({ theme: themeFor("#ffffff"), blocks });
    expect(pageCss(doc)).toContain(`background-color: ${P.crypt} !important`);
    page.set({ blocks: null });
    expect(pageCss(doc)).not.toContain(`background-color: ${P.crypt} !important`);
  });
});
