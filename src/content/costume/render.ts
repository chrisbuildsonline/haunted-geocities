// Renders the 1998 crypt costume into the overlay's closed shadow root, plays the haunt moment,
// and on leave plays the reverse before the host and the page sheet go in one step.
import { haunt, onUnhaunt, unhaunt } from "../overlay";
import { buildBands, MARQUEE_LINES, marqueeSeconds, neighborhoodFor, topOffset } from "./bands";
import { addPageSheet } from "./body-padding";
import { playHaunt, playUnhaunt, type Moment } from "./haunt-moment";
import { buildHud, icon, sampleBottomLift } from "./hud";
import { watchReducedMotion } from "./reduced-motion";
import { buildStarfield, computeContentColumn, gutterWidths, layoutStarfield, paintTile } from "./starfield";
import { costumeCss } from "./styles";

type Costume = { root: ShadowRoot; croot: HTMLElement; reduced: () => boolean; moment?: Moment; leaving?: Promise<void>; rehaunt?: boolean };

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
  croot.append(starfield, el(doc, "lanes"), el(doc, "markers"), bands, hud, el(doc, "cards"), tab);

  // Measure the page before the padding sheet moves anything.
  const measure = () => {
    layoutStarfield(starfield, gutterWidths(computeContentColumn(doc), doc.documentElement.clientWidth || win.innerWidth));
    bands.style.top = `${topOffset(doc)}px`;
    return sampleBottomLift(doc);
  };
  let lift = measure();
  root.append(croot);
  const page = addPageSheet(doc);
  const pad = () => page.update(Math.ceil(hud.offsetHeight), lift);
  pad();

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
    });
  };
  win.addEventListener("resize", relayout);
  const mo = new win.MutationObserver(relayout);
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  const ro = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(pad) : undefined;
  ro?.observe(hud);

  const costume: Costume = { root, croot, reduced: () => motion.matches };
  costumes.set(doc, costume);
  onUnhaunt(doc, () => {
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
  return root;
}

/** Play the un-haunt, then remove the host and the page sheet together. */
export function leaveCostume(doc: Document = document): Promise<void> {
  const c = costumes.get(doc);
  if (!c) {
    unhaunt(doc);
    return Promise.resolve();
  }
  if (c.leaving) return c.leaving;
  c.moment?.finish();
  const played = doc.hidden ? Promise.resolve() : playUnhaunt(c.croot, c.reduced());
  c.leaving = played.then(() => {
    unhaunt(doc);
    if (c.rehaunt) renderCostume(doc);
  });
  return c.leaving;
}
