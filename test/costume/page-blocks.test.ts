// Real-site blocks: on a light page, the dark hero panels and bands a photo-heavy site draws get the
// crypt costume (square corners, the HUD bevel, the crypt ground, dark-page link colours), and search
// boxes become 1998 sunken fields, all as page-sheet rules addressed by a structural path.
import { describe, expect, test } from "bun:test";
import { addPageSheet } from "../../src/content/costume/body-padding";
import { blocksCss, cssPath, findBlocks, groundOf, isDarkBlock, type Blocks } from "../../src/content/costume/page-blocks";
import { contrastRatio, relativeLuminance, themeFor } from "../../src/content/costume/page-theme";
import { PALETTE as P } from "../../src/content/costume/tokens";
import { domRect, pageCss, setup } from "./helpers";

const PAGE = `<!doctype html><html><head><title>t</title></head><body style="background:#ffffff;color:#222222">
<header style="background:#000000;color:#ffffff"><a id="logo" href="/">Parks</a><button id="nav-search" type="button">Search</button></header>
<div class="top" style="background:#000000;color:#ffffff">
  <form id="pill" role="search" style="background-color:#333333;border-radius:20px"><input id="q" type="search" placeholder="Search or ask anything" style="background-color:transparent"></form>
  <div id="ask" style="background-color:rgba(255, 255, 255, 0.12);border-radius:40px;overflow:hidden"><button id="launch" type="button" aria-label="Search or ask DOI" style="background-color:transparent"><span>Search or ask anything</span></button></div>
  <button id="lens" type="button" aria-label="Search" style="background-color:#333333;border-radius:20px"></button>
</div>
<div id="indicators" style="background-image:linear-gradient(90deg, rgb(76, 43, 100) 0px, rgb(0, 94, 162) 51%, rgb(0, 129, 161) 98%);color:#1c1d1f"><div>
  <span id="slide" style="color:#ffffff"><a id="slide-link" href="/e" style="color:#ffffff">Ebola Situation Summary</a></span>
  <span id="slide-on" style="background-image:linear-gradient(90deg, rgb(12, 67, 120) 0px, rgb(0, 81, 138) 95%);color:#ffffff"><a href="/f">Steps to Food Safety</a></span>
  <span id="slide-plain" style="color:#ffffff">No link here</span>
</div></div>
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

/**
 * happy-dom has no layout: every block is 1280×300 except the 64px top bar, #small (1280×40), the pill,
 * inputs and search buttons, and the 80px slide band (three 427×80 slides).
 */
function sized(win: { Element: { prototype: object } }) {
  const proto = win.Element.prototype as { getBoundingClientRect(this: Element): DOMRect };
  proto.getBoundingClientRect = function (this: Element) {
    if (this.localName === "input") return this.getAttribute("type") === "hidden" ? domRect({ left: 0, right: 0, top: 0, bottom: 0 }) : domRect({ left: 0, right: 240, top: 0, bottom: 21 });
    if (this.id === "pill") return domRect({ left: 0, right: 260, top: 0, bottom: 40 });
    if (this.id === "ask" || this.id === "launch") return domRect({ left: 0, right: 220, top: 0, bottom: 44 });
    // the launcher's label overflows it by 16px (nps.gov: 236px of content in a 220px pill)
    if (this.parentElement?.id === "launch") return domRect({ left: 31, right: 236, top: 14, bottom: 30 });
    if (this.id === "lens") return domRect({ left: 0, right: 40, top: 0, bottom: 40 });
    if (this.id === "nav-search") return domRect({ left: 0, right: 100, top: 0, bottom: 40 });
    if (this.id === "indicators" || this.parentElement?.id === "indicators") return domRect({ left: 0, right: 1280, top: 0, bottom: 80 });
    if (this.closest("#indicators")) return domRect({ left: 0, right: 427, top: 0, bottom: 80 });
    if (this.id === "ask-wide") return domRect({ left: 0, right: 232, top: 0, bottom: 52 });
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
    const fields = findBlocks(doc).search.filter((s) => !s.label).map((s) => [doc.querySelector(s.path)!.id, s.input]);
    expect(fields).toEqual([
      ["pill", false],
      ["find", true],
    ]);
  });

  test("a search launcher (a button reading Search or ask anything) in a pill is a search box too, its button the label that must read whole at its measured width; an icon or a bare nav button is not", () => {
    const { win, doc } = setup({ html: PAGE });
    sized(win);
    const fields = findBlocks(doc).search.map((s) => [doc.querySelector(s.path)!.id, s.input, s.width, s.label && [doc.querySelector(s.label.path)!.id, s.label.width]]);
    expect(fields).toEqual([
      ["pill", false, undefined, undefined],
      ["ask", false, 236, ["launch", 236]],
      ["find", true, undefined, undefined],
    ]);
    // a pill wider than its button (its padding) grows by the same amount
    doc.getElementById("ask")!.id = "ask-wide";
    expect(findBlocks(doc).search[1]).toMatchObject({ width: 248, label: { width: 236 } });
  });

  test("bands: light text on a dark gradient band, too small to be a block, has its links' ground noted (the band's lightest colour); text without links, light grounds and blocks are not bands", () => {
    const { win, doc } = setup({ html: PAGE });
    sized(win);
    const b = findBlocks(doc);
    // the current slide's own darker gradient sits on the band's: its links are checked on the lighter of
    // the two, so they still read when a carousel moves the current slide on
    expect(b.bands.map((x) => [doc.querySelector(x.path)!.id, x.on])).toEqual([
      ["slide", "#0081a1"],
      ["slide-on", "#0081a1"],
    ]);
    expect(b.dark.map((d) => doc.querySelector(d.path)!.id)).toEqual(["hero", "panel"]);
  });

  test("groundOf: a colour 40% opaque or more, a gradient's opaque stops (dark only if all are), a picture (dark, its links checked on the crypt); nothing for a faint or no ground", () => {
    const none = "none";
    expect(groundOf("rgb(0, 0, 0)", none)).toEqual({ dark: true, on: "#000000" });
    expect(groundOf("rgb(238, 238, 238)", none)).toEqual({ dark: false, on: "#eeeeee" });
    expect(groundOf("rgba(0, 0, 0, 0.1)", none)).toBeNull();
    expect(groundOf("rgba(0, 0, 0, 0)", none)).toBeNull();
    expect(groundOf("rgba(0, 0, 0, 0)", "linear-gradient(90deg, rgb(76, 43, 100) 0px, rgb(0, 129, 161) 98%)")).toEqual({ dark: true, on: "#0081a1" });
    expect(groundOf("rgba(0, 0, 0, 0)", "linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))")).toEqual({ dark: false, on: "#ffffff" });
    expect(groundOf("rgba(0, 0, 0, 0)", "linear-gradient(rgba(183, 218, 222, 0), rgba(0, 0, 0, 0.2))")).toBeNull();
    expect(groundOf("rgba(0, 0, 0, 0)", 'url("x.jpg")')).toEqual({ dark: true, on: P.crypt });
    expect(groundOf("rgba(0, 0, 0, 0)", 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("x.jpg")')).toEqual({ dark: true, on: P.crypt });
  });

  test("on a dark page nothing is a dark block or a band (the whole page already wears the dark costume)", () => {
    const { win, doc } = setup({ html: PAGE.replace("background:#ffffff;color:#222222", "background:#111111;color:#eeeeee") });
    sized(win);
    expect(findBlocks(doc, { darkPage: true }).dark).toEqual([]);
    expect(findBlocks(doc, { darkPage: true }).bands).toEqual([]);
    expect(findBlocks(doc, { darkPage: true }).search).toHaveLength(3);
  });
});

// A photo hero like cdc.gov's: an <img> fills the slide (under a gradient overlay), and the title and an
// outline "Learn More" button sit straight on the photo in a column; no box draws a ground of its own.
const PHOTO = `<!doctype html><html><head><title>t</title></head><body style="background:#ffffff;color:#222222">
<div id="carousel"><div id="item" style="position:relative">
  <img id="photo" alt="" src="data:,">
  <div id="over" style="position:absolute"><div id="row"><div id="col" style="color:#1c1d1f">
    <span id="title" style="color:#ffffff">Ebola Situation Summary</span>
    <a id="learn" href="/e" style="color:#ffffff;background-color:rgba(0, 0, 0, 0);border:2px solid #f8f9fa;border-radius:13.5px 0">Learn More</a>
    <a id="more" href="/m" style="color:#ffffff">All stories</a>
  </div></div></div>
</div></div>
<section id="card"><img id="thumb" alt="" src="data:,"><p>A dark caption on a picture card: no panel</p></section>
<section id="full"><img id="full-photo" alt="" src="data:,"><div id="cover" style="position:absolute;color:#ffffff"><p>Light text over the whole picture</p></div></section>
<main><p><a id="plain-outline" href="/x" style="color:#0000ff;border:1px solid #000000;border-radius:4px">An outlined link on the light page</a></p></main>
</body></html>`;

/** happy-dom has no layout: the cdc.gov hero's measured boxes (1280px wide), everything else 1280×40. */
function sizedPhoto(win: { Element: { prototype: object } }) {
  const proto = win.Element.prototype as { getBoundingClientRect(this: Element): DOMRect };
  const at: Record<string, [number, number, number, number]> = {
    carousel: [0, 37, 1280, 578], item: [0, 37, 1280, 578], photo: [0, 37, 1280, 578], over: [0, 37, 1280, 578],
    row: [70, 237, 1140, 200], col: [735, 237, 475, 200], title: [749, 237, 448, 144], learn: [749, 394, 135, 43], more: [900, 394, 90, 20],
    card: [0, 700, 600, 300], thumb: [0, 700, 600, 280], full: [0, 1000, 1280, 400], "full-photo": [0, 1000, 1280, 400], cover: [0, 1000, 1280, 400],
  };
  proto.getBoundingClientRect = function (this: Element) {
    const [left, top, w, h] = at[this.id] ?? [0, 0, 1280, 40];
    return domRect({ left, top, right: left + w, bottom: top + h });
  };
}

describe("photo heroes (cdc.gov)", () => {
  test("light text straight on a picture that fills its box: the smallest box holding all of it (240×96 or more, a part of the picture) becomes a crypt panel; an outline button on it is noted", () => {
    const { win, doc } = setup({ html: PHOTO });
    sizedPhoto(win);
    const b = findBlocks(doc);
    const id = (p: string) => doc.querySelector(p)!.id;
    expect(b.dark.map((d) => [id(d.path), d.ground, !!d.photo, d.keep.map(id)])).toEqual([["col", true, true, ["learn"]]]);
    // the outline button (no ground of its own, a visible border, light text on the dark picture) is noted;
    // an outlined link on the light page is not
    expect(b.outline.map(id)).toEqual(["learn"]);
    // a picture card with dark text gets nothing, and light text over the whole picture is no panel (it would hide the photo)
    expect(b.dark.map((d) => id(d.path))).not.toContain("card");
    expect(b.dark.map((d) => id(d.path))).not.toContain("cover");
  });

  test("measured again with its costume on, the panel and the outline button are found the same (no flip back on a relayout)", () => {
    const html = PHOTO.replace(
      'style="color:#ffffff;background-color:rgba(0, 0, 0, 0);border:2px solid #f8f9fa;border-radius:13.5px 0"',
      `style="color:${P.bone};background-color:transparent;background-image:none;border:2px solid ${P.hudBevelLight};border-radius:0;box-shadow:inset 0 0 0 999px ${P.cryptViolet}"`,
    ).replace('id="col" style="color:#1c1d1f"', `id="col" style="color:#1c1d1f;background-color:${P.crypt}"`);
    expect(html).not.toBe(PHOTO);
    const { win, doc } = setup({ html });
    sizedPhoto(win);
    const b = findBlocks(doc);
    const id = (p: string) => doc.querySelector(p)!.id;
    expect(b.dark.map((d) => [id(d.path), !!d.photo])).toEqual([["col", true]]);
    expect(b.outline.map(id)).toEqual(["learn"]);
  });

  test("on a dark page nothing on a photo is a panel or an outline button", () => {
    const { win, doc } = setup({ html: PHOTO });
    sizedPhoto(win);
    expect(findBlocks(doc, { darkPage: true })).toMatchObject({ dark: [], outline: [] });
  });

  test("css: the panel is a crypt window drawn round its text, outside its box (nothing moves); the outline button a raised 1998 button", () => {
    const css = blocksCss({ dark: [{ path: "body > :nth-child(1)", ground: true, keep: [], photo: true }], bands: [], search: [], outline: ["body > :nth-child(2)"] });
    const panel = css.match(/(?:^|\n)body > :nth-child\(1\) \{([^}]*)\}/)![1]!;
    expect(panel).toContain("border-radius: 0 !important");
    expect(panel).toContain(`background-color: ${P.crypt} !important`);
    // 12px of crypt ground round the text, a 3px bevel, a 1px line and the hard shadow, all outside the box
    expect(panel).toContain(
      `box-shadow: 0 0 0 12px ${P.crypt}, -3px -3px 0 12px ${P.hudBevelLight}, 3px 3px 0 12px ${P.bevelDark}, 0 0 0 15px ${P.bevelDark}, 0 0 0 16px ${P.ink}, 4px 4px 0 16px ${P.ink} !important`,
    );
    expect(panel).not.toMatch(/inset|padding|margin|width/);
    // its text links take the dark page's colours, as in a dark block
    expect(css).toContain(`:is(body > :nth-child(1)) a:link`);
    const button = css.match(/(?:^|\n)body > :nth-child\(2\) \{([^}]*)\}/)![1]!;
    for (const d of [
      "border-radius: 0 !important", "border-style: solid !important", `border-color: ${P.hudBevelLight} ${P.bevelDark} ${P.bevelDark} ${P.hudBevelLight} !important`,
      // its violet face is an inset shadow over no ground, so it still reads as an outline button when measured again
      "background-color: transparent !important", "background-image: none !important", `color: ${P.bone} !important`, `box-shadow: inset 0 0 0 999px ${P.cryptViolet}, 2px 2px 0 ${P.ink} !important`,
    ]) {
      expect({ d, ok: button.includes(d) }).toEqual({ d, ok: true });
    }
    // its border keeps its width, so nothing moves; bone on the violet reads
    expect(button).not.toMatch(/border-width|padding|margin/);
    expect(contrastRatio(P.bone, P.cryptViolet)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("blocksCss", () => {
  const blocks: Blocks = {
    outline: [],
    dark: [
      { path: "body > :nth-child(3)", ground: false, keep: [] },
      { path: "body > :nth-child(3) > :nth-child(1)", ground: true, keep: ["body > :nth-child(3) > :nth-child(1) > :nth-child(2)"] },
    ],
    bands: [
      { path: "body > :nth-child(4) > :nth-child(1) > :nth-child(1)", on: "#0081a1", keep: [] },
      { path: "body > :nth-child(4) > :nth-child(1) > :nth-child(2)", on: "#00518a", keep: [] },
    ],
    search: [
      { path: "body > :nth-child(2) > :nth-child(1)", input: false },
      { path: "body > :nth-child(2) > :nth-child(2)", input: false, width: 248, label: { path: "body > :nth-child(2) > :nth-child(2) > :nth-child(1)", width: 236 } },
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

  test("bands: their text links take a light colour that reads 4.5:1 or more on the band's lightest colour", () => {
    for (const [n, on] of [["1", "#0081a1"], ["2", "#00518a"]] as const) {
      const path = `body > :nth-child(4) > :nth-child(1) > :nth-child(${n})`;
      for (const state of [":link", ":visited", ":is(:link, :visited):hover"]) {
        const rule = [...css.matchAll(/([^\n{}]*)\{([^}]*)\}/g)].find((m) => m[1]!.includes(path) && m[1]!.includes(`a${state}`));
        expect({ path, state, found: !!rule }).toEqual({ path, state, found: true });
        expect(rule![1]).toContain('[class*="btn"]'); // site chrome and button links keep theirs
        const colour = rule![2]!.match(/color: (#[0-9a-f]{6}) !important/)![1]!;
        expect({ path, state, light: relativeLuminance(colour) >= 0.4, readable: contrastRatio(colour, on) >= 4.5 }).toEqual({ path, state, light: true, readable: true });
      }
    }
  });

  test("a search launcher: its pill and button grow to the label's measured whole width (never clipped), the label black on the field", () => {
    const field = "body > :nth-child(2) > :nth-child(2)";
    const label = `${field} > :nth-child(1)`;
    expect(css).toMatch(new RegExp(`${field.replace(/[()]/g, "\\$&")} \\{[^}]*border-radius: 0 !important[^}]*\\}`));
    expect(css).toContain(`${field} { min-width: 248px !important; }`);
    expect(css).toContain(`${label} { min-width: 236px !important; }`);
    expect(css).toContain(`:is(${label}, ${label} *) { color: ${P.ink} !important; }`);
    // the other fields keep their width
    expect(css.match(/min-width/g)).toHaveLength(2);
  });

  test("nothing found draws nothing", () => {
    expect(blocksCss({ dark: [], bands: [], search: [], outline: [] })).toBe("");
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
