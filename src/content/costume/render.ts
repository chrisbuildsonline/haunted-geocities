// Renders the 1998 crypt costume into the overlay's closed shadow root, plays the haunt moment,
// and on leave plays the reverse before the host and the page sheet go in one step.
import { HOST_TAG, haunt, onUnhaunt, unhaunt } from "../overlay";
import { checkLinks } from "../link-check";
import { collectLinks } from "../links";
import { buildBands, MARQUEE_LINES, marqueeSeconds, topOffset } from "./bands";
import { addPageSheet } from "./body-padding";
import { documentHeight, FRAME, FRAME_OUT, frameBox, TINT, tintBox, type Box } from "./column-layers";
import { paradeOf, playHaunt, playUnhaunt, type Moment, type Reveal } from "./haunt-moment";
import { buildHud, icon, sampleBottomLift, setCounts, setOdometer } from "./hud";
import { findBlocks } from "./page-blocks";
import { htmlBackground, pageTheme } from "./page-theme";
import { watchReducedMotion } from "./reduced-motion";
import { buildEdgeFrame, buildStarfield, computeContentColumn, gutterWidths, layoutStarfield, pageMediaRects, pageTextRects, paintTile, type Column } from "./starfield";
import { costumeCss } from "./styles";
import { LAYOUT } from "./tokens";
import { pickLook } from "./themes";
import { buildWelcome, fontsOf, lookBackgrounds, lookPageCss, lookShadowCss, lookSprites, lookTiles, paletteOf, rainbowHeadings, spriteMarkup, tintPattern } from "./theme-css";
import { trailSvg } from "./theme-art";
import { buildColumn, buildPiece, buildTabs, findOverflow, harvest, heldCss, layoutCss, layoutGeometry, placeFurniture, type Geometry } from "./furniture";
import { cssPath } from "./page-blocks";
import trackerJson from "../../data/trackers.json";
import { resolveNeighborhood } from "../../data/neighborhood";
import { LINK_CHECK_ORIGINS, type ContentRequest, type Curse, type DeadLink, type TrackerData } from "../../data/types";
import { startScanner, type ScanResult } from "../scanner";
import { createVampireBridge, type Api } from "../hooks-bridge";
import { markKnownVampires, mergeVampire } from "../vampire";
import { closeCard, openCard, openCurseCard, openTombstoneCard, setCardCount, setCardExorcised } from "./card";
import { planSlots, updateGhosts, type Slot } from "./ghosts";
import { buildGraveyard, updateDocked } from "./graveyard";
import { mountSecrets } from "./secrets";
import { mountTombstones } from "./tombstones";
import { mountCurses } from "./curses";
import { detectDarkPatterns, mergeCurses, type DarkPattern } from "../dark-patterns";
import { watchTimers } from "../timers";
import { createPlayer, type SoundKind } from "../../audio/sound";

const RESCAN_DEBOUNCE = 500;
const RESCAN_SPACING = 2000;

type Costume = {
  root: ShadowRoot;
  croot: HTMLElement;
  reduced: () => boolean;
  setExorcised: (companies: string[]) => void;
  stopScan: () => void;
  startVampires: (nonce: string) => void;
  addDead: (found: DeadLink[]) => void;
  /** The slot for the tombstone visuals: called with the full dead list whenever it changes. */
  onTombstones?: (dead: DeadLink[]) => void;
  dead: () => DeadLink[];
  /** The page-sheet layers (tint, frame) drawn now, for the wipe. */
  reveals: () => Reveal[];
  moment?: Moment;
  leaving?: Promise<void>;
  rehaunt?: boolean;
};

/** To the background; the tab id comes from sender.tab. Quiet when there is no extension context (unit tests). */
const send = (msg: ContentRequest) => {
  try {
    (globalThis as { chrome?: typeof chrome }).chrome?.runtime?.sendMessage(msg)?.catch(() => undefined);
  } catch {
    // extension context gone (reloaded): nothing to tell
  }
};

// On the isolated world's global, like the overlays, so a re-injected bundle finds it.
const KEY = "__hauntedGeoCitiesCostumes";
const costumes = ((globalThis as Record<string, unknown>)[KEY] ??= new WeakMap<Document, Costume>()) as WeakMap<Document, Costume>;

const el = (doc: Document, id: string) => Object.assign(doc.createElement("div"), { id });

/**
 * Haunt `doc` and dress it in the costume. Idempotent. `quiet` (the next page of a haunted site)
 * skips the haunt moment and arrives settled, as a background tab does.
 */
export function renderCostume(doc: Document = document, { quiet = false }: { quiet?: boolean } = {}): ShadowRoot {
  const root = haunt(doc);
  const existing = costumes.get(doc);
  if (existing?.root === root) {
    if (existing.leaving) existing.rehaunt = true;
    return root;
  }
  const win = doc.defaultView!;

  // Card sounds, from this isolated world's own AudioContext (never the page's). Made lazily on the
  // first card opened with sound on; nothing when there is no extension storage (unit tests).
  const storage = (globalThis as { chrome?: typeof chrome }).chrome?.storage;
  const player = storage ? createPlayer({ storage, createContext: () => new AudioContext() }) : undefined;
  const play = (kind: SoundKind) => player?.play(kind);

  // The site's seeded 1998 look (design/DESIGN.md "Themes"). The e2e build may force a preset with ?hgtheme=.
  const force = import.meta.env.MODE === "e2e" ? new URLSearchParams(win.location.search).get("hgtheme") : null;
  const look = pickLook(win.location.hostname, force);
  const palette = paletteOf(look);
  const classic = look.preset === "classic-crypt";
  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(costumeCss(classic ? { stars: paintTile(doc, "stars"), twinkle: paintTile(doc, "twinkle") } : lookTiles(look)) + "\n" + lookShadowCss(look));
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

  const croot = el(doc, "crypt-root");
  const starfield = buildStarfield(doc);
  const edgeFrame = buildEdgeFrame(doc);
  starfield.append(edgeFrame);
  const bands = buildBands(doc, resolveNeighborhood(win.location.hostname));
  const hud = buildHud(doc);
  // The ghost icon: the one fixed thing at the bottom. It counts the trackers still haunting and
  // jumps to the footer graveyard (and brings a hidden costume back first).
  const tab = doc.createElement("button");
  Object.assign(tab, { id: "show-tab", type: "button", className: "win95" });
  tab.innerHTML = `${icon("ghost")}<span class="count" aria-hidden="true">0</span>`;
  // The findings strip beside it: the footer's HUD is below the fold, so this one line keeps the
  // findings on the first screen until the HUD is wholly in view (the icon and the HUD say it to screen readers).
  const findings = el(doc, "findings");
  findings.setAttribute("aria-hidden", "true");
  const setTab = (n: number, vampires: number) => {
    tab.querySelector(".count")!.textContent = String(n);
    tab.setAttribute("aria-label", `Jump to the graveyard: ${n} ${n === 1 ? "tracker" : "trackers"}`);
    findings.textContent = `Trackers ${n} / Vampires ${vampires}`;
  };
  setTab(0, 0);
  const lanes = el(doc, "lanes");
  const cards = el(doc, "cards");
  const markers = el(doc, "markers");
  // The footer, in flow at the end of the page (the host is static): the graveyard with every
  // company, the HUD, the 88x31 badges and the sign-off. Only #crypt-root is fixed.
  const graveyard = buildGraveyard(doc);
  graveyard.hidden = false;
  graveyard.tabIndex = -1;
  const footer = doc.createElement("footer");
  footer.id = "crypt-footer";
  const buttons88 = doc.createElement("div");
  buttons88.className = "badges";
  for (const [text, cls] of [["Best viewed in Netscape 4.0", ""], ["Made with Notepad", ""], ["Under construction", " construction"], ["Sign my guestbook", ""]] as const) {
    buttons88.append(Object.assign(doc.createElement("span"), { className: `badge${cls}`, textContent: text }));
  }
  const signoff = doc.createElement("p");
  signoff.className = "signoff";
  const setSignoff = (n: number) => (signoff.textContent = `You are visitor #${String(n).padStart(6, "0")} to this crypt. (c) 1998 The Webmaster`);
  setSignoff(0);
  const footerDivider = Object.assign(doc.createElement("div"), { className: "footer-divider" });
  footerDivider.setAttribute("aria-hidden", "true");
  const footerSprites = Object.assign(doc.createElement("div"), { className: "footer-sprites" });
  footerSprites.setAttribute("aria-hidden", "true");
  footerSprites.innerHTML = lookSprites(look).footer.map(spriteMarkup).join("");
  // The look's furniture (design/DESIGN.md "Themes"): side columns beside the page's table, the rest at the
  // bottom, just after the page; built from the page's own links and headings, read once.
  const harvested = harvest(doc, HOST_TAG);
  const furBottom = el(doc, "fur-bottom");
  furBottom.setAttribute("aria-hidden", "true");
  const furLeft = buildColumn(doc, "fur-left");
  const furRight = buildColumn(doc, "fur-right");
  footer.append(furBottom, graveyard, hud, buttons88, signoff, footerDivider, footerSprites);
  const trail = el(doc, "trail");
  trail.setAttribute("aria-hidden", "true");
  croot.append(starfield, lanes, markers, bands, cards, findings, tab, trail);
  // The banner scrolls with the page, under the fixed bands (before #crypt-root, so the fixed layers stay above it).
  const welcome = buildWelcome(doc, look);
  if (look.furniture.includes("tabbar")) welcome.append(buildTabs(doc, harvested));
  root.append(welcome, furLeft, furRight, croot, footer);
  // px the table has moved left so no page box ends off screen (sticky for the haunt, as `held` is)
  let shift = 0;
  let geom: Geometry = layoutGeometry(look, doc.documentElement.clientWidth || win.innerWidth);
  let placedKey = "";
  const placeKeyOf = (g: Geometry) => JSON.stringify(placeFurniture(look.furniture, g));
  const fill = () => {
    const key = placeKeyOf(geom);
    if (key === placedKey) return;
    placedKey = key;
    const at = placeFurniture(look.furniture, geom);
    for (const [box, items] of [[furLeft, at.left], [furRight, at.right], [furBottom, at.bottom]] as const) {
      box.replaceChildren(...items.map((f) => buildPiece(doc, f, look, harvested)));
    }
  };
  let rainbow: string[] = [];
  let dark = false;
  // The page's boxes that stuck out past the viewport once the body was held to its cell (sticky for the haunt).
  const held = new Set<string>();
  // The page's own html background, read before the look puts its tile there (light or dark is judged on it).
  const htmlBg = htmlBackground(doc);
  const page = addPageSheet(doc, {
    fonts: fontsOf(look),
    css: () => [lookPageCss(look, { rainbow, dark }), layoutCss(geom), geom.main ? heldCss(held) : ""].join("\n"),
    backgrounds: (tint) => lookBackgrounds(look, tint),
    layers: { tint: palette.tint, pattern: tintPattern(look), bevel: look.bevel, light: palette.bevelLight, dark: palette.bevelDark, glow: palette.glow },
  });
  let lift = 0;
  // Only the ghost icon follows the page's own bottom UI (--hg-lift); nothing pads the page's end.
  const pad = () => page.update(lift);

  // Measure with the page sheet on: the restyle changes the page's fonts, so it moves the text.
  // Full-overlay mode (no gutter of 64px) adds 12px inline padding, which narrows the column, so
  // its gutters are judged as if that padding were not there, and the column is measured again.
  let gutters: Column | null = null;
  let overlay = false;
  let drawn: { tint: Box | null; frame: Box | null } = { tint: null, frame: null };
  const vw = () => doc.documentElement.clientWidth || win.innerWidth;
  const measure = () => {
    geom = layoutGeometry(look, vw(), shift);
    fill();
    // A page that pins its body while a dialog is open (a cookie wall's scroll lock) leaves our in-flow footer
    // as the document's only content, at its top: keep the footer out of sight until the body is back in flow.
    footer.classList.toggle("page-locked", win.getComputedStyle(doc.body).position === "fixed");
    const theme = pageTheme(doc, palette, htmlBg);
    dark = theme.dark;
    rainbow = look.heading === "rainbow" && !dark ? rainbowHeadings(doc) : [];
    page.set({ theme, blocks: findBlocks(doc, { darkPage: theme.dark }) });
    // Nothing of the page may end up off screen: a box wider than the cell (a 100vw header) is held to it.
    if (geom.main) {
      const { added, over } = findOverflow(doc, HOST_TAG, vw(), held, cssPath);
      // still sticking out after the box is held to the cell (a box placed past the cell's edge): move the table left
      if (over > 0 && shift < vw()) {
        shift += over + 8;
        geom = layoutGeometry(look, vw(), shift);
        fill();
      }
      if (added || over > 0) page.set({});
    }
    const top = topOffset(doc);
    bands.style.top = `${top}px`;
    welcome.style.top = `${top + LAYOUT.neighborhoodBar + LAYOUT.marquee}px`;
    // Over a 1998 table the banner is the table's own header: as wide as the table, furniture columns included.
    const first = geom.left ?? geom.main;
    const last = geom.right ?? geom.main;
    Object.assign(welcome.style, first && last ? { left: `${first.x + win.scrollX - FRAME_OUT}px`, right: "auto", width: `${last.x + last.w - first.x + 2 * FRAME_OUT}px` } : { left: "", right: "", width: "" });
    lift = sampleBottomLift(doc);
    pad();
    // The furniture columns are part of the 1998 table: the frame and the tint go round them too.
    const widen = (c: Column): Column => {
      if (!geom.main) return c;
      const first = geom.left ?? geom.main;
      const last = geom.right ?? geom.main;
      return { left: Math.min(c.left, first.x), right: Math.max(c.right, last.x + last.w) };
    };
    let col = widen(computeContentColumn(doc));
    const inset = overlay ? LAYOUT.edgeFrame : 0;
    const full = gutterWidths({ left: col.left - inset, right: col.right + inset }, vw()) === null;
    if (full !== overlay) {
      overlay = full;
      page.set({ overlay });
      col = widen(computeContentColumn(doc));
    }
    gutters = overlay ? null : gutterWidths(col, vw());
    // The haunt moment's parade drifts up these gutters, beside the table, never over the page.
    croot.dataset.gutters = gutters ? `${gutters.left},${gutters.right}` : "";
    layoutStarfield(starfield, gutters, FRAME_OUT);
    edgeFrame.hidden = !overlay;
    // Document x; in full-overlay mode the whole page is the column, so the tint spans it.
    const width = vw() + win.scrollX;
    // The tint and the frame end where the crypt footer (in flow after the page) starts: on a page
    // shorter than the viewport the footer starts inside it.
    const foot = footer.getBoundingClientRect();
    const pageEnd = foot.height > 0 ? Math.min(documentHeight(doc), Math.ceil(foot.top + win.scrollY)) : documentHeight(doc);
    const span = { ...(overlay ? { left: 0, right: width } : { left: col.left + win.scrollX, right: col.right + win.scrollX }), height: pageEnd };
    const empty = col.right <= col.left;
    drawn = {
      // a seeded look draws its tint as the body's own background, not as a layer over the page
      tint: null,
      frame: !empty && !overlay ? frameBox(span, width) : null,
    };
    page.set(drawn);
    // The side columns run from under the banner to the footer, in document coordinates.
    const colTop = welcome.offsetTop + welcome.offsetHeight;
    for (const [box, span] of [[furLeft, geom.left], [furRight, geom.right]] as const) {
      box.hidden = !span || overlay;
      if (!span) continue;
      Object.assign(box.style, { left: `${span.x + win.scrollX + 4}px`, width: `${span.w - 8}px`, top: `${colTop + 8}px`, height: `${Math.max(0, pageEnd - colTop - 16)}px` });
    }
    // A short page has a short column: what does not fit moves down to the bottom furniture, whole.
    for (const box of [furLeft, furRight]) {
      while (!box.hidden && box.clientHeight > 0 && box.scrollHeight > box.clientHeight && box.lastElementChild) furBottom.prepend(box.lastElementChild);
    }
  };
  measure();
  const reveals = (): Reveal[] =>
    ([[TINT, drawn.tint], [FRAME, drawn.frame]] as const).flatMap(([pseudo, b]) => (b ? [{ el: doc.documentElement, pseudo, left: b.left - win.scrollX }] : []));

  // Ghosts: one per tracker company, in the lanes between the bands and the HUD (offsets, not
  // rects, so the haunt moment's transforms do not move the slots).
  let scanned: ScanResult = { companies: [], total: 0 };
  let scan: ScanResult = scanned;
  const catches: [string, Api][] = [];
  let dead: DeadLink[] = [];
  // Curses: static patterns by element (the first kind and snippet seen stay), ticking timers, and what was last sent.
  const known = new Map<Element, DarkPattern>();
  let timers: DarkPattern[] = [];
  let curses: Curse[] = [];
  let lastSent = "";
  // Ghosts and vampires count the companies still haunting: Exorcise lowers them, Let it back raises them.
  const renderCounts = (tick = false) => {
    const haunting = scan.companies.filter((c) => !exorcised.has(c.company));
    const vampires = haunting.filter((c) => c.vampire).length;
    const counts = { ghosts: haunting.length - vampires, vampires, tombstones: dead.length, curses: curses.length };
    setCounts(hud, counts, { tick, found: scan.companies.length > 0 });
    setTab(haunting.length, vampires);
  };
  const refresh = () => {
    scan = { ...scanned, companies: markKnownVampires(catches.reduce((all, [company, api]) => mergeVampire(all, company, api), scanned.companies)) };
    renderCounts();
    setOdometer(hud, scan.total);
    setSignoff(scan.total);
    placeGhosts();
    setCardCount(cards, scan.companies);
    send({ type: "TRACKER_UPDATE", companies: scan.companies, total: scan.total });
  };
  let exorcised = new Set<string>();
  let settled = false;
  const bounds = () => ({ top: bands.offsetTop + bands.offsetHeight, bottom: win.innerHeight });
  let slots: Slot[] = [];
  // Lane mode fills the lanes and hides the strip; full-overlay mode (no lane) empties the lanes and
  // docks every company in the strip. A company is never in both.
  const placeGhosts = () => {
    const opts = { exorcised, onOpen, rise: settled && !motion.matches };
    // The footer graveyard is the full roll: every company, in lane mode too.
    updateDocked(graveyard, scan.companies, opts);
    const b = bounds();
    // Ghosts stand only where the page has nothing: clear of its text and of its pictures and frames.
    slots = planSlots(gutters, doc.documentElement.clientWidth || win.innerWidth, b.top, b.bottom, [...pageTextRects(doc), ...pageMediaRects(doc)]);
    updateGhosts(lanes, overlay ? [] : scan.companies, slots, opts);
    pad();
  };
  // Tombstone markers: beside their links, or in those same gutter lanes at the link's y.
  const tombs = mountTombstones(markers, {
    slots: () => slots,
    fade: () => settled && !motion.matches,
    onOpen: (d, opener) => openTombstoneCard(cards, d, opener, { bounds: bounds(), reduced: motion.matches, play }),
  });
  // Curse badges: beside their elements, never on them.
  const badges = mountCurses(markers, {
    slots: () => slots,
    fade: () => settled && !motion.matches,
    onOpen: (c, opener) => openCurseCard(cards, c, opener, { bounds: bounds(), reduced: motion.matches, play }),
  });
  let stopped = false;
  const commit = () => {
    const patterns = mergeCurses([...known.values()], timers);
    badges.update(patterns);
    curses = patterns.map(({ kind, snippet }) => ({ kind, snippet }));
    renderCounts();
    const key = JSON.stringify(curses);
    if (key === lastSent || stopped) return;
    lastSent = key;
    send({ type: "CURSE_UPDATE", curses });
  };
  const rescan = () => {
    for (const p of detectDarkPatterns(doc, HOST_TAG)) if (!known.has(p.element)) known.set(p.element, p);
    for (const e of known.keys()) if (!e.isConnected) known.delete(e);
    timers = timers.filter((t) => t.element.isConnected);
    commit();
  };
  // A trailing 500 ms debounce that never runs sooner than 2 s after the last rescan.
  let rescanTimer: number | undefined;
  let lastRescan = -Infinity;
  const scheduleRescan = () => {
    win.clearTimeout(rescanTimer);
    rescanTimer = win.setTimeout(() => {
      rescanTimer = undefined;
      lastRescan = Date.now();
      rescan();
    }, Math.max(RESCAN_DEBOUNCE, lastRescan + RESCAN_SPACING - Date.now()));
  };
  const onOpen = (company: string, opener: HTMLElement) => {
    const hit = scan.companies.find((c) => c.company === company);
    const listed = Object.hasOwn((trackerJson as TrackerData).entities, company);
    if (hit) openCard(cards, hit, opener, { exorcised: exorcised.has(company), listed, send, bounds: bounds(), reduced: motion.matches, play });
  };
  const setExorcised = (companies: string[]) => {
    exorcised = new Set(companies);
    renderCounts(settled && !motion.matches);
    placeGhosts();
    setCardExorcised(cards, exorcised);
  };

  // Marquee: one line at a time from the right edge at 60px/s; static under reduced motion.
  const track = bands.querySelector(".marquee-track") as HTMLElement;
  let line = 0;
  const showLine = (delayMs: number) => {
    track.textContent = MARQUEE_LINES[line % MARQUEE_LINES.length]!;
    track.style.animation = "none";
    void track.offsetWidth; // restart the CSS animation
    track.style.animation = "";
    track.style.animationDuration = `${marqueeSeconds(track.scrollWidth) || 20}s`;
    track.style.animationDelay = `${delayMs}ms`;
  };
  track.addEventListener("animationend", () => {
    line++;
    showLine(0);
  });

  const onVisibility = () => [croot, footer, welcome, furLeft, furRight].forEach((el) => el.classList.toggle("tab-hidden", doc.hidden));
  doc.addEventListener("visibilitychange", onVisibility);
  onVisibility();

  const motion = watchReducedMotion(win, (reduced) => {
    for (const el of [croot, footer, welcome, furLeft, furRight]) el.classList.toggle("reduced-motion", reduced);
    if (reduced) costume.moment?.finish();
  });
  for (const el of [croot, footer, welcome, furLeft, furRight]) el.classList.toggle("reduced-motion", motion.matches);

  // The cursor trail: a small glyph every 50ms at most, 12 at once, each falling and fading. None under reduced motion.
  let lastSpark = -Infinity;
  const onPointer = (e: PointerEvent) => {
    if (motion.matches || doc.hidden || croot.classList.contains("costume-hidden") || e.timeStamp - lastSpark < 50) return;
    lastSpark = e.timeStamp;
    if (trail.childElementCount >= 12) trail.firstElementChild!.remove();
    const spark = doc.createElement("span");
    spark.className = "spark";
    spark.innerHTML = trailSvg(look.trail);
    spark.style.left = `${Math.round(e.clientX)}px`;
    spark.style.top = `${Math.round(e.clientY)}px`;
    spark.addEventListener("animationend", () => spark.remove());
    trail.append(spark);
  };
  win.addEventListener("pointermove", onPointer, { passive: true });

  // Hide / Show keep the haunt; only the costume's visibility changes. The ghost icon stays.
  const hide = hud.querySelector("button.hide") as HTMLButtonElement;
  hide.addEventListener("click", () => {
    croot.classList.add("costume-hidden");
    footer.classList.add("costume-hidden");
    for (const e of [welcome, furLeft, furRight]) e.classList.add("costume-hidden");
    page.set({ hidden: true }); // tint and frame fade; the restyle stays (haunt state is kept)
    tab.focus();
  });
  tab.addEventListener("click", () => {
    if (croot.classList.contains("costume-hidden")) {
      croot.classList.remove("costume-hidden");
      footer.classList.remove("costume-hidden");
      for (const e of [welcome, furLeft, furRight]) e.classList.remove("costume-hidden");
      page.set({ hidden: false });
      if (motion.matches) {
        line++;
        showLine(0);
      }
    }
    graveyard.scrollIntoView?.({ behavior: motion.matches ? "auto" : "smooth", block: "start" });
    graveyard.focus({ preventScroll: true });
  });

  // Page UI pinned to the edges and the content column can change: re-check on resize and mutation.
  let queued = false;
  const relayout = () => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      if (!croot.isConnected) return;
      measure();
      placeGhosts();
      tombs.place();
      badges.place();
      clipToFooter(); // the page may have grown: the footer moved
    });
  };
  win.addEventListener("resize", relayout);
  // The fixed starfield and lanes stop at the footer's top while it is on screen (it is in flow, under them).
  let clipQueued = false;
  const clipToFooter = () => {
    if (clipQueued) return;
    clipQueued = true;
    win.requestAnimationFrame(() => {
      clipQueued = false;
      const into = Math.max(0, Math.round(win.innerHeight - footer.getBoundingClientRect().top));
      croot.style.setProperty("--hg-footer-in", `${into}px`);
      const h = hud.getBoundingClientRect();
      findings.hidden = h.height > 0 && h.top >= 0 && h.bottom <= win.innerHeight;
    });
  };
  win.addEventListener("scroll", clipToFooter, { passive: true });
  win.addEventListener("resize", clipToFooter);
  clipToFooter();
  const mo = new win.MutationObserver(() => {
    relayout();
    scheduleRescan();
  });
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  // Light or dark can change with a class or style on <html> (theme switches) or the colour scheme.
  mo.observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  const scheme = win.matchMedia?.("(prefers-color-scheme: dark)");
  scheme?.addEventListener?.("change", relayout);
  // Web fonts arriving change the text metrics, and so the column.
  doc.fonts?.addEventListener?.("loadingdone", relayout);
  const ro = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(pad) : undefined;
  ro?.observe(hud);
  ro?.observe(graveyard);

  // Tracker requests, read-only from Resource Timing: counts, hit counter, ghosts, popup list.
  const scanner = startScanner({
    data: trackerJson as TrackerData,
    siteHost: win.location.hostname,
    performance: win.performance,
    PerformanceObserver: (win as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver,
    onUpdate: (result) => {
      scanned = result;
      refresh();
    },
  });
  placeGhosts(); // the strip (or its empty state) shows even when nothing is found

  // Runtime vampires: catches reported by the MAIN-world hooks are merged over every scan result.
  const bridge = createVampireBridge();
  const startVampires = (nonce: string) =>
    bridge.start(nonce, win.location.hostname, (company, api) => {
      catches.push([company, api]);
      refresh();
    }, win);

  // Tombstones: dead links from the page-origin check here and the background's cross-site check.
  // Results that arrive once the costume is leaving are ignored.
  const addDead = (found: DeadLink[]) => {
    const known = new Set(dead.map((d) => d.url));
    const fresh = found.filter((d, i) => !known.has(d.url) && found.findIndex((f) => f.url === d.url) === i);
    if (stopped || !fresh.length) return;
    dead = [...dead, ...fresh];
    refresh();
    send({ type: "TOMBSTONE_UPDATE", dead });
    costume.onTombstones?.(dead);
  };
  const findDead = async () => {
    const { sameOrigin, crossSite } = collectLinks(doc, win.location.origin, HOST_TAG);
    // Content scripts have no chrome.permissions: then the background, which checks the grant itself, decides.
    const perms = (globalThis as { chrome?: typeof chrome }).chrome?.permissions;
    if (crossSite.length && (!perms?.contains || (await perms.contains({ origins: LINK_CHECK_ORIGINS }).catch(() => false)))) {
      send({ type: "CHECK_LINKS", urls: crossSite });
    }
    addDead(await checkLinks(sameOrigin));
  };

  const costume: Costume = {
    root,
    croot,
    reduced: () => motion.matches,
    setExorcised,
    stopScan: () => {
      stopped = true;
      scanner.stop();
    },
    startVampires,
    addDead,
    onTombstones: tombs.update,
    dead: () => dead,
    reveals,
  };
  costumes.set(doc, costume);
  // Curses: what is on the page now, then every clock that starts to tick.
  lastRescan = Date.now();
  rescan();
  const stopTimers = watchTimers(doc, HOST_TAG, (p) => {
    timers.push(p);
    commit();
  });
  onUnhaunt(doc, () => {
    costume.stopScan();
    stopTimers();
    badges.stop();
    win.clearTimeout(rescanTimer);
    bridge.stop();
    closeCard(cards);
    player?.dispose();
    tombs.stop();
    page.remove();
    motion.stop();
    mo.disconnect();
    scheme?.removeEventListener?.("change", relayout);
    doc.fonts?.removeEventListener?.("loadingdone", relayout);
    ro?.disconnect();
    win.removeEventListener("resize", relayout);
    win.removeEventListener("scroll", clipToFooter);
    win.removeEventListener("pointermove", onPointer);
    win.removeEventListener("resize", clipToFooter);
    doc.removeEventListener("visibilitychange", onVisibility);
    if (costumes.get(doc) === costume) costumes.delete(doc);
  });

  // Nobody sees a wipe in a background tab: arrive settled there.
  const animate = !doc.hidden && !quiet;
  showLine(animate && !motion.matches ? 1100 : 0);
  // The secrets: Konami frenzy, 13 clicks on the hit counter, "boo", the witching hour and Halloween.
  const secrets = mountSecrets({
    win,
    croot,
    footer,
    hud,
    reduced: () => motion.matches,
    // The e2e build (tests and screenshots) lives on an ordinary afternoon, whatever the real clock says.
    now: import.meta.env.MODE === "e2e" ? () => new Date(2026, 10, 3, 15, 0) : undefined,
    say: (said) => {
      track.textContent = said;
      track.style.animation = "none";
      void track.offsetWidth; // restart the CSS animation
      track.style.animation = "";
      track.style.animationDuration = `${marqueeSeconds(track.scrollWidth) || 20}s`;
      track.style.animationDelay = "0ms";
    },
  });
  onUnhaunt(doc, () => secrets.stop());
  // The restyle lands at t=0 with the padding (one reflow); the tint and frame wipe in behind the ghost.
  // The parade is the companies found so far (the scanner reads the buffered requests at once); its caption counts them all.
  if (animate) costume.moment = playHaunt(croot, motion.matches, reveals(), paradeOf(scan.companies), scan.companies.length);
  if (costume.moment) costume.moment.done.then(() => (settled = true));
  else settled = true;
  // Only inside the extension: unit tests (no chrome global) never touch the network.
  if ((globalThis as { chrome?: typeof chrome }).chrome?.runtime) void findDead();
  return root;
}

/** Dead links found so far (same-origin and cross-site), for the tombstone visuals. [] when not haunted. */
export function deadLinks(doc: Document = document): DeadLink[] {
  return costumes.get(doc)?.dead() ?? [];
}

/** The hook for the tombstone visuals: `cb` is called with the full, deduped dead list each time it changes. */
export function onTombstones(cb: (dead: DeadLink[]) => void, doc: Document = document): void {
  const c = costumes.get(doc);
  if (c) c.onTombstones = cb;
}

/** The background found dead cross-site links: merge them into the costume's list. */
export function addTombstones(found: DeadLink[], doc: Document = document): void {
  costumes.get(doc)?.addDead(found);
}

/** The background says which companies are exorcised in this tab (from the card or the popup). */
export function applyExorcised(companies: string[], doc: Document = document): void {
  costumes.get(doc)?.setExorcised(companies);
}

/** The background says the MAIN-world hooks are in: listen for their reports under `nonce`. */
export function startVampires(nonce: string, doc: Document = document): void {
  costumes.get(doc)?.startVampires(nonce);
}

/** Play the un-haunt, then remove the host and the page sheet together. */
export function leaveCostume(doc: Document = document): Promise<void> {
  const c = costumes.get(doc);
  if (!c) {
    unhaunt(doc);
    return Promise.resolve();
  }
  if (c.leaving) return c.leaving;
  c.stopScan();
  send({ type: "CLEAR_EXORCISE" });
  c.moment?.finish();
  const played = doc.hidden ? Promise.resolve() : playUnhaunt(c.croot, c.reduced(), c.reduced() ? [] : c.reveals());
  c.leaving = played.then(() => {
    unhaunt(doc);
    if (c.rehaunt) renderCostume(doc);
  });
  return c.leaving;
}
