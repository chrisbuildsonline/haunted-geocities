// The look's 1998 structure (design/DESIGN.md "Themes: structure"): the page's own body held to a table
// width by page-sheet rules, and the furniture round it (nav frame, Cool Links, awards, guestbook, ...)
// drawn in the shadow root. No page node is touched; every fake piece is aria-hidden, and the links
// in it are copies of the page's own links, out of the tab order.
import { mapToPx, svgMarkup } from "./art";
import { fnv1a, mulberry32, pick } from "./seed";
import { spriteSvg } from "./theme-art";
import { LAYOUTS, type Furniture, type Look } from "./themes";

/** A furniture column or the page's main cell, in viewport x. */
export type Span = { x: number; w: number };
/** Where the layout puts things at this width; `collapsed`: too narrow, one column, furniture at the bottom. */
export type Geometry = { collapsed: boolean; main: Span | null; left: Span | null; right: Span | null };

/** Least room for the starfield (and the ghost lanes) on each side of the table. */
export const SIDE_ROOM = 64;
/** The body's own inline padding inside its cell, so text never touches a furniture column. */
export const CELL_PAD = 16;

/**
 * The layout at viewport width `vw`. When the whole table does not fit, the right column goes first,
 * then the left one; when the main cell alone does not fit, the page collapses to one column.
 */
export function layoutGeometry(l: Look, vw: number): Geometry {
  const L = LAYOUTS[l.layout];
  for (const [left, right] of [[L.left, L.right], [L.left, 0], [0, 0]] as const) {
    const total = left + L.main + right;
    if (vw < total + 2 * SIDE_ROOM) continue;
    const x0 = L.align === "center" ? Math.floor((vw - total) / 2) : SIDE_ROOM;
    return { collapsed: false, left: left ? { x: x0, w: left } : null, main: { x: x0 + left, w: L.main }, right: right ? { x: x0 + left + L.main, w: right } : null };
  }
  return { collapsed: true, main: null, left: null, right: null };
}

/** The page-sheet rules that hold the body to its cell. Nothing when the layout leaves the page alone. */
export function layoutCss(g: Geometry): string {
  if (!g.main) return "";
  return (
    `body { box-sizing: border-box !important; width: auto !important; min-width: 0 !important; max-width: ${g.main.w}px !important; ` +
    `margin-left: ${g.main.x}px !important; margin-right: 0 !important; padding-left: ${CELL_PAD}px !important; padding-right: ${CELL_PAD}px !important; }`
  );
}

export type Harvest = { nav: { text: string; href: string }[]; out: { text: string; href: string }[]; headings: string[] };

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** The page's own words for the furniture: its site links, its outbound links and its headings. Read only. */
export function harvest(doc: Document, skip: string): Harvest {
  const origin = doc.defaultView!.location.origin;
  const nav: Harvest["nav"] = [];
  const out: Harvest["out"] = [];
  const seen = new Set<string>();
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (a.closest(skip)) continue;
    let url: URL;
    try {
      url = new URL(a.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const text = clean(a.textContent);
    if (text.length < 2 || seen.has(text.toLowerCase())) continue;
    // skip links and jumps within this page are not places to go
    if (/^skip\b/i.test(text) || (url.hash && url.origin === origin && url.pathname === doc.defaultView!.location.pathname)) continue;
    if (url.origin === origin && text.length <= 22 && nav.length < 6) {
      seen.add(text.toLowerCase());
      nav.push({ text, href: url.href });
    } else if (url.origin !== origin && text.length <= 40 && out.length < 5) {
      seen.add(text.toLowerCase());
      out.push({ text, href: url.href });
    }
  }
  const headings = [...doc.querySelectorAll("h2, h3")].map((h) => clean(h.textContent)).filter((t) => t.length >= 3 && t.length <= 60).slice(0, 3);
  return { nav, out, headings };
}

/** Where each piece goes when there is room: a side column ("left", "right", "side": either) or the bottom. */
const SLOT: Record<Furniture, "left" | "right" | "side" | "bottom" | "top"> = {
  navbuttons: "left", coollinks: "right", awards: "right",
  whatsnew: "side", construction: "side", guestbook: "side", counter: "side",
  webring: "bottom", bestviewed: "bottom", updated: "bottom", tabbar: "top",
};

/** Which pieces go in which column at this geometry. Tab bar aside, every piece goes somewhere. */
export function placeFurniture(items: readonly Furniture[], g: Geometry): { left: Furniture[]; right: Furniture[]; bottom: Furniture[] } {
  const out = { left: [] as Furniture[], right: [] as Furniture[], bottom: [] as Furniture[] };
  // The nav buttons head their column, as on every 1998 homepage.
  for (const f of [...items].sort((a, b) => Number(b === "navbuttons") - Number(a === "navbuttons"))) {
    const slot = SLOT[f];
    if (slot === "top") continue;
    const want = slot === "side" ? (out.left.length <= out.right.length ? ["left", "right"] : ["right", "left"]) : slot === "left" ? ["left", "right"] : slot === "right" ? ["right", "left"] : [];
    const side = want.find((s) => (s === "left" ? g.left : g.right)) as "left" | "right" | undefined;
    out[side ?? "bottom"].push(f);
  }
  return out;
}

const AWARDS = ["Site of the Day!", "Top 5% of the Web", "Spooky Site Award", "Golden Cobweb Award", "Cool Page of the Week", "Webmaster's Choice"];
const FAKE_NAV = ["Home", "About Me", "My Links", "Guestbook", "Photos"];
const FAKE_LINKS = ["The Haunted Webring", "Pixel Ghost Gallery", "My Best Friend's Page", "Free MIDI Files!!"];
const FAKE_NEWS = ["Added a guestbook!", "New pictures up!!", "Fixed my links"];

const el = (doc: Document, tag: string, cls?: string, text?: string) => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
/** A copy of one of the page's own links: same address, out of the tab order (the page's own link is the real one). */
const link = (doc: Document, cls: string, text: string, href?: string) => {
  if (!href) return el(doc, "span", cls, text);
  const a = el(doc, "a", cls, text) as HTMLAnchorElement;
  a.href = href;
  a.tabIndex = -1;
  return a;
};
const sprite = (doc: Document, name: string) => {
  const s = el(doc, "span", "deco");
  s.dataset.sprite = name;
  s.innerHTML = spriteSvg(name);
  return s;
};
const DIGIT = [["XXX", "X.X", "X.X", "X.X", "XXX"], [".X.", "XX.", ".X.", ".X.", "XXX"], ["XXX", "..X", "XXX", "X..", "XXX"], ["XXX", "..X", ".XX", "..X", "XXX"], ["X.X", "X.X", "XXX", "..X", "..X"], ["XXX", "X..", "XXX", "..X", "XXX"], ["XXX", "X..", "XXX", "X.X", "XXX"], ["XXX", "..X", ".X.", ".X.", ".X."], ["XXX", "X.X", "XXX", "X.X", "XXX"], ["XXX", "X.X", "XXX", "..X", "XXX"]];

/** One piece of furniture, built from the look, the page's harvest and the seed. */
export function buildPiece(doc: Document, f: Furniture, l: Look, h: Harvest): HTMLElement {
  const rnd = mulberry32(fnv1a(`${l.site}:${f}`));
  const box = el(doc, "div", `fur fur-${f}`);
  const title = (t: string) => box.append(el(doc, "h4", "fur-title", t));
  switch (f) {
    case "navbuttons": {
      title("Navigation");
      const items = h.nav.length >= 2 ? h.nav : FAKE_NAV.map((text) => ({ text, href: "" }));
      for (const n of items.slice(0, 6)) box.append(link(doc, "navbtn", n.text, n.href || undefined));
      break;
    }
    case "coollinks": {
      title("Cool Links");
      const list = el(doc, "ul", "fur-list");
      const items = h.out.length ? h.out : FAKE_LINKS.map((text) => ({ text, href: "" }));
      for (const n of items.slice(0, 5)) {
        const li = el(doc, "li");
        li.append(link(doc, "", n.text, n.href || undefined));
        list.append(li);
      }
      box.append(list);
      break;
    }
    case "awards": {
      title("Awards");
      const pool = [...AWARDS];
      for (let i = 0; i < 3; i++) box.append(el(doc, "span", "award", pool.splice(Math.floor(rnd() * pool.length), 1)[0]!));
      break;
    }
    case "whatsnew": {
      title("What's New?");
      for (const t of h.headings.length ? h.headings : FAKE_NEWS) {
        const p = el(doc, "p", "news");
        p.append(el(doc, "span", "new", "NEW! "), doc.createTextNode(t));
        box.append(p);
      }
      break;
    }
    case "construction":
      box.append(sprite(doc, "worker"), el(doc, "p", "", "This page is under construction!"), el(doc, "div", "tape"));
      break;
    case "guestbook":
      box.append(sprite(doc, "mailbox"), el(doc, "p", "big", "Sign my Guestbook!"), el(doc, "p", "", "E-mail me!!"));
      break;
    case "counter": {
      const n = String(Math.floor(rnd() * 900000) + 1000).padStart(6, "0");
      box.append(el(doc, "p", "", "You are visitor #"));
      const odo = el(doc, "div", "odo-fake");
      odo.innerHTML = [...n].map((d) => svgMarkup(mapToPx(DIGIT[Number(d)]!, { X: "#66ff99" }, 3, 1, 2), 11, 19)).join("");
      box.append(odo);
      break;
    }
    case "webring":
      box.append(el(doc, "p", "", "This site is a proud member of the"), el(doc, "p", "big", "Haunted Homepages WebRing"), el(doc, "p", "", "<< Prev | Random | Next >>"));
      break;
    case "bestviewed":
      box.append(el(doc, "p", "", pick(rnd, ["Best viewed at 800x600 in 256 colors", "Best viewed with your eyes open", "Best viewed at 640x480 on a 14 inch monitor"])));
      break;
    case "updated": {
      const m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28), y = pick(rnd, [97, 98, 99]);
      box.append(el(doc, "p", "", `Last updated: ${m}/${d}/${y}`));
      break;
    }
    case "tabbar":
      break;
  }
  return box;
}

/** The tab bar under the banner: the page's own site links as 1998 tabs, else made-up ones. */
export function buildTabs(doc: Document, h: Harvest): HTMLElement {
  const bar = el(doc, "div", "wb-tabs");
  const items = h.nav.length >= 2 ? h.nav : FAKE_NAV.map((text) => ({ text, href: "" }));
  for (const n of items.slice(0, 6)) bar.append(link(doc, "tab", n.text, n.href || undefined));
  return bar;
}

/** A furniture column: the panel and its pieces. */
export function buildColumn(doc: Document, id: string): HTMLElement {
  const c = el(doc, "div", "fur-col");
  c.id = id;
  c.setAttribute("aria-hidden", "true");
  c.hidden = true;
  return c;
}
