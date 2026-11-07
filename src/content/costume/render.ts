// Renders the 1998 crypt costume into the overlay's closed shadow root, plays the haunt moment,
// and on leave plays the reverse before the host and the page sheet go in one step.
import { HOST_TAG, haunt, onUnhaunt, unhaunt } from "../overlay";
import { checkLinks } from "../link-check";
import { collectLinks } from "../links";
import { buildBands, MARQUEE_LINES, marqueeSeconds, neighborhoodFor, topOffset } from "./bands";
import { addPageSheet } from "./body-padding";
import { playHaunt, playUnhaunt, type Moment } from "./haunt-moment";
import { buildHud, icon, sampleBottomLift, setCounts, setOdometer } from "./hud";
import { watchReducedMotion } from "./reduced-motion";
import { buildStarfield, computeContentColumn, gutterWidths, layoutStarfield, pageTextRects, paintTile, type Column } from "./starfield";
import { costumeCss } from "./styles";
import trackerJson from "../../data/trackers.json";
import { LINK_CHECK_ORIGINS, type ContentRequest, type DeadLink, type TrackerData } from "../../data/types";
import { startScanner, type ScanResult } from "../scanner";
import { createVampireBridge, type Api } from "../hooks-bridge";
import { markKnownVampires, mergeVampire } from "../vampire";
import { closeCard, openCard, openTombstoneCard, setCardCount, setCardExorcised } from "./card";
import { planSlots, updateGhosts, type Slot } from "./ghosts";
import { mountTombstones } from "./tombstones";

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

  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(costumeCss({ stars: paintTile(doc, "stars"), twinkle: paintTile(doc, "twinkle") }));
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

  const croot = el(doc, "crypt-root");
  const starfield = buildStarfield(doc);
  const bands = buildBands(doc, neighborhoodFor(win.location.hostname));
  const hud = buildHud(doc);
  const tab = doc.createElement("button");
  Object.assign(tab, { id: "show-tab", type: "button", className: "win95", hidden: true });
  tab.setAttribute("aria-label", "Show the haunted costume");
  tab.innerHTML = `${icon("ghost")}<span aria-hidden="true">Show</span>`;
  const lanes = el(doc, "lanes");
  const cards = el(doc, "cards");
  const markers = el(doc, "markers");
  croot.append(starfield, lanes, markers, bands, hud, cards, tab);

  // Measure the page before the padding sheet moves anything.
  let gutters: Column | null = null;
  const measure = () => {
    gutters = gutterWidths(computeContentColumn(doc), doc.documentElement.clientWidth || win.innerWidth);
    layoutStarfield(starfield, gutters);
    bands.style.top = `${topOffset(doc)}px`;
    return sampleBottomLift(doc);
  };
  let lift = measure();
  root.append(croot);
  const page = addPageSheet(doc);
  const pad = () => page.update(Math.ceil(hud.offsetHeight), lift);
  pad();

  // Ghosts: one per tracker company, in the lanes between the bands and the HUD (offsets, not
  // rects, so the haunt moment's transforms do not move the slots).
  let scanned: ScanResult = { companies: [], total: 0 };
  let scan: ScanResult = scanned;
  const catches: [string, Api][] = [];
  let dead: DeadLink[] = [];
  const refresh = () => {
    scan = { ...scanned, companies: markKnownVampires(catches.reduce((all, [company, api]) => mergeVampire(all, company, api), scanned.companies)) };
    const vampires = scan.companies.filter((c) => c.vampire).length;
    setCounts(hud, { ghosts: scan.companies.length - vampires, vampires, tombstones: dead.length, curses: 0 });
    setOdometer(hud, scan.total);
    placeGhosts();
    setCardCount(cards, scan.companies);
    send({ type: "TRACKER_UPDATE", companies: scan.companies, total: scan.total });
  };
  let exorcised = new Set<string>();
  let settled = false;
  const bounds = () => ({ top: bands.offsetTop + bands.offsetHeight, bottom: hud.offsetTop || win.innerHeight });
  let slots: Slot[] = [];
  const placeGhosts = () => {
    const b = bounds();
    slots = planSlots(gutters, doc.documentElement.clientWidth || win.innerWidth, b.top, b.bottom, pageTextRects(doc));
    updateGhosts(lanes, scan.companies, slots, { exorcised, onOpen, rise: settled && !motion.matches });
  };
  // Tombstone markers: beside their links, or in those same gutter lanes at the link's y.
  const tombs = mountTombstones(markers, {
    slots: () => slots,
    fade: () => settled && !motion.matches,
    onOpen: (d, opener) => openTombstoneCard(cards, d, opener, { bounds: bounds(), reduced: motion.matches }),
  });
  const onOpen = (company: string, opener: HTMLElement) => {
    const hit = scan.companies.find((c) => c.company === company);
    const listed = Object.hasOwn((trackerJson as TrackerData).entities, company);
    if (hit) openCard(cards, hit, opener, { exorcised: exorcised.has(company), listed, send, bounds: bounds(), reduced: motion.matches });
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
    tab.hidden = false;
    tab.focus();
  });
  tab.addEventListener("click", () => {
    croot.classList.remove("costume-hidden");
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
      lift = measure();
      pad();
      placeGhosts();
      tombs.place();
    });
  };
  win.addEventListener("resize", relayout);
  const mo = new win.MutationObserver(relayout);
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  const ro = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(pad) : undefined;
  ro?.observe(hud);

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

  // Runtime vampires: catches reported by the MAIN-world hooks are merged over every scan result.
  const bridge = createVampireBridge();
  const startVampires = (nonce: string) =>
    bridge.start(nonce, win.location.hostname, (company, api) => {
      catches.push([company, api]);
      refresh();
    }, win);

  // Tombstones: dead links from the page-origin check here and the background's cross-site check.
  // Results that arrive once the costume is leaving are ignored.
  let stopped = false;
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
  };
  costumes.set(doc, costume);
  onUnhaunt(doc, () => {
    costume.stopScan();
    bridge.stop();
    closeCard(cards);
    tombs.stop();
    page.remove();
    motion.stop();
    mo.disconnect();
    ro?.disconnect();
    win.removeEventListener("resize", relayout);
    doc.removeEventListener("visibilitychange", onVisibility);
    if (costumes.get(doc) === costume) costumes.delete(doc);
  });

  // Nobody sees a wipe in a background tab: arrive settled there.
  const animate = !doc.hidden;
  showLine(animate && !motion.matches ? 1100 : 0);
  if (animate) costume.moment = playHaunt(croot, motion.matches);
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
  const played = doc.hidden ? Promise.resolve() : playUnhaunt(c.croot, c.reduced());
  c.leaving = played.then(() => {
    unhaunt(doc);
    if (c.rehaunt) renderCostume(doc);
  });
  return c.leaving;
}
