// Renders the 1998 crypt costume into the overlay's closed shadow root, plays the haunt moment,
// and on leave plays the reverse before the host and the page sheet go in one step.
import { HOST_TAG, haunt, onUnhaunt, unhaunt } from "../overlay";
import { checkLinks } from "../link-check";
import { collectLinks } from "../links";
import { buildBands, MARQUEE_LINES, marqueeSeconds, topOffset } from "./bands";
import { addPageSheet } from "./body-padding";
import { documentHeight, FRAME, FRAME_OUT, frameBox, TINT, tintBox, type Box } from "./column-layers";
import { playHaunt, playUnhaunt, type Moment, type Reveal } from "./haunt-moment";
import { buildHud, icon, sampleBottomLift, setCounts, setOdometer } from "./hud";
import { pageTheme } from "./page-theme";
import { watchReducedMotion } from "./reduced-motion";
import { buildEdgeFrame, buildStarfield, computeContentColumn, gutterWidths, layoutStarfield, pageTextRects, paintTile, type Column } from "./starfield";
import { costumeCss } from "./styles";
import { LAYOUT } from "./tokens";
import trackerJson from "../../data/trackers.json";
import { resolveNeighborhood } from "../../data/neighborhood";
import { LINK_CHECK_ORIGINS, type ContentRequest, type Curse, type DeadLink, type TrackerData } from "../../data/types";
import { startScanner, type ScanResult } from "../scanner";
import { createVampireBridge, type Api } from "../hooks-bridge";
import { markKnownVampires, mergeVampire } from "../vampire";
import { closeCard, openCard, openCurseCard, openTombstoneCard, setCardCount, setCardExorcised } from "./card";
import { planSlots, updateGhosts, type Slot } from "./ghosts";
import { buildGraveyard, updateDocked } from "./graveyard";
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

/** Haunt `doc` and dress it in the costume. Idempotent. */
export function renderCostume(doc: Document = document): ShadowRoot {
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

  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(costumeCss({ stars: paintTile(doc, "stars"), twinkle: paintTile(doc, "twinkle") }));
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

  const croot = el(doc, "crypt-root");
  const starfield = buildStarfield(doc);
  const edgeFrame = buildEdgeFrame(doc);
  starfield.append(edgeFrame);
  const bands = buildBands(doc, resolveNeighborhood(win.location.hostname));
  const hud = buildHud(doc);
  const tab = doc.createElement("button");
  Object.assign(tab, { id: "show-tab", type: "button", className: "win95", hidden: true });
  tab.setAttribute("aria-label", "Show the haunted costume");
  tab.innerHTML = `${icon("ghost")}<span aria-hidden="true">Show</span>`;
  const lanes = el(doc, "lanes");
  const cards = el(doc, "cards");
  const markers = el(doc, "markers");
  // The graveyard strip: where the ghosts and vampires dock when there is no gutter lane.
  const graveyard = buildGraveyard(doc);
  croot.append(starfield, lanes, markers, bands, hud, graveyard, cards, tab);

  root.append(croot);
  const page = addPageSheet(doc);
  let lift = 0;
  // The strip sits on the HUD's measured height (--hg-hud-h), and the page is padded clear of both.
  const pad = () => {
    const h = Math.ceil(hud.offsetHeight);
    croot.style.setProperty("--hg-hud-h", `${h}px`);
    page.update(h + (graveyard.hidden ? 0 : Math.ceil(graveyard.offsetHeight) + LAYOUT.graveyardGap), lift);
  };

  // Measure with the page sheet on: the restyle changes the page's fonts, so it moves the text.
  // Full-overlay mode (no gutter of 64px) adds 12px inline padding, which narrows the column, so
  // its gutters are judged as if that padding were not there, and the column is measured again.
  let gutters: Column | null = null;
  let overlay = false;
  let drawn: { tint: Box | null; frame: Box | null } = { tint: null, frame: null };
  const vw = () => doc.documentElement.clientWidth || win.innerWidth;
  const measure = () => {
    const theme = pageTheme(doc);
    page.set({ theme });
    bands.style.top = `${topOffset(doc)}px`;
    lift = sampleBottomLift(doc);
    pad();
    let col = computeContentColumn(doc);
    const inset = overlay ? LAYOUT.edgeFrame : 0;
    const full = gutterWidths({ left: col.left - inset, right: col.right + inset }, vw()) === null;
    if (full !== overlay) {
      overlay = full;
      page.set({ overlay });
      col = computeContentColumn(doc);
    }
    gutters = overlay ? null : gutterWidths(col, vw());
    layoutStarfield(starfield, gutters, FRAME_OUT);
    edgeFrame.hidden = !overlay;
    // Document x; in full-overlay mode the whole page is the column, so the tint spans it.
    const width = vw() + win.scrollX;
    const span = { ...(overlay ? { left: 0, right: width } : { left: col.left + win.scrollX, right: col.right + win.scrollX }), height: documentHeight(doc) };
    const empty = col.right <= col.left;
    drawn = {
      tint: !empty && theme.tint ? tintBox(span, width) : null,
      frame: !empty && !overlay ? frameBox(span, width) : null,
    };
    page.set(drawn);
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
  const renderCounts = () => {
    const vampires = scan.companies.filter((c) => c.vampire).length;
    setCounts(hud, { ghosts: scan.companies.length - vampires, vampires, tombstones: dead.length, curses: curses.length });
  };
  const refresh = () => {
    scan = { ...scanned, companies: markKnownVampires(catches.reduce((all, [company, api]) => mergeVampire(all, company, api), scanned.companies)) };
    renderCounts();
    setOdometer(hud, scan.total);
    placeGhosts();
    setCardCount(cards, scan.companies);
    send({ type: "TRACKER_UPDATE", companies: scan.companies, total: scan.total });
  };
  let exorcised = new Set<string>();
  let settled = false;
  const bounds = () => ({ top: bands.offsetTop + bands.offsetHeight, bottom: (graveyard.hidden ? hud.offsetTop : graveyard.offsetTop) || win.innerHeight });
  let slots: Slot[] = [];
  // Lane mode fills the lanes and hides the strip; full-overlay mode (no lane) empties the lanes and
  // docks every company in the strip. A company is never in both.
  const placeGhosts = () => {
    const opts = { exorcised, onOpen, rise: settled && !motion.matches };
    // Empty, it stays hidden: the HUD already says "No ghosts here", and a tracker-free phone page keeps its room.
    graveyard.hidden = !overlay || scan.companies.length === 0;
    updateDocked(graveyard, overlay ? scan.companies : [], opts);
    const b = bounds();
    slots = planSlots(gutters, doc.documentElement.clientWidth || win.innerWidth, b.top, b.bottom, pageTextRects(doc));
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

  const onVisibility = () => croot.classList.toggle("tab-hidden", doc.hidden);
  doc.addEventListener("visibilitychange", onVisibility);
  onVisibility();

  const motion = watchReducedMotion(win, (reduced) => {
    croot.classList.toggle("reduced-motion", reduced);
    if (reduced) costume.moment?.finish();
  });
  croot.classList.toggle("reduced-motion", motion.matches);

  // Hide / Show keep the haunt; only the costume's visibility changes.
  const hide = hud.querySelector("button.hide") as HTMLButtonElement;
  hide.addEventListener("click", () => {
    croot.classList.add("costume-hidden");
    page.set({ hidden: true }); // tint and frame fade; the restyle stays (haunt state is kept)
    tab.hidden = false;
    tab.focus();
  });
  tab.addEventListener("click", () => {
    croot.classList.remove("costume-hidden");
    page.set({ hidden: false });
    tab.hidden = true;
    if (motion.matches) {
      line++;
      showLine(0);
    }
    hide.focus();
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
    });
  };
  win.addEventListener("resize", relayout);
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
    doc.removeEventListener("visibilitychange", onVisibility);
    if (costumes.get(doc) === costume) costumes.delete(doc);
  });

  // Nobody sees a wipe in a background tab: arrive settled there.
  const animate = !doc.hidden;
  showLine(animate && !motion.matches ? 1100 : 0);
  // The restyle lands at t=0 with the padding (one reflow); the tint and frame wipe in behind the ghost.
  if (animate) costume.moment = playHaunt(croot, motion.matches, reveals());
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
