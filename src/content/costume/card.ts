// The ghost (or vampire) card: a Win95 window in #cards, one at a time, beside its sprite toward the page centre.
// The tombstone card is the stone itself, in the same slot and placement.
import type { CompanyHit, ContentRequest, DeadLink } from "../../data/types";
import { caughtLine } from "../vampire";
import { categoryOf } from "./ghosts";
import { appendPath, statusText } from "./tombstones";
import { LAYOUT as L, MOTION as M } from "./tokens";

export interface CardOptions {
  exorcised: boolean;
  send: (msg: ContentRequest) => void;
  /** Viewport band the card must stay in: below the top bands, above the HUD. */
  bounds: { top: number; bottom: number };
  reduced?: boolean;
  /** A tracker company in trackers.json (false for an unlisted host: nothing to block, no Exorcise). */
  listed?: boolean;
}

const SHADOW = 4; // HARD_SHADOW's offset

const openers = new WeakMap<Element, HTMLElement>();

/** Close the open card, if any, and hand focus back to the ghost that opened it. */
export function closeCard(cards: HTMLElement): void {
  const card = cards.querySelector(".card");
  if (!card) return;
  card.remove();
  openers.get(card)?.focus();
}

/** Reflect the exorcised set on the open card's button. */
export function setCardExorcised(cards: HTMLElement, exorcised: ReadonlySet<string>): void {
  const card = cards.querySelector<HTMLElement>(".card");
  const act = card?.querySelector<HTMLElement>(".act");
  if (card && act) act.textContent = exorcised.has(card.dataset.company!) ? "Let it back" : act.dataset.label!;
}

const seenText = (count: number) => `Seen ${count} ${count === 1 ? "time" : "times"} on this page`;

/** Keep the open ghost card's "Seen N times" in step with the latest scan. */
export function setCardCount(cards: HTMLElement, companies: readonly CompanyHit[]): void {
  const card = cards.querySelector<HTMLElement>(".card");
  const seen = card?.querySelector<HTMLElement>(".seen");
  const hit = companies.find((c) => c.company === card?.dataset.company);
  if (seen && hit) seen.textContent = seenText(hit.count);
}

/** A host or script URL as text that may break only after a "/". */
const breakAtSlash = (doc: Document, url: string) => {
  const li = doc.createElement("li");
  url.split(/(?<=\/)/).forEach((part, i) => li.append(...(i ? [doc.createElement("wbr")] : []), part));
  return li;
};

const VAMPIRE_BODY =
  `<p class="who"></p><p>Script from:</p><ul class="domains"></ul><p class="did"></p>` +
  `<p class="what">Fingerprinting reads tiny quirks of your browser to recognise you again without cookies.</p>`;

export function openCard(cards: HTMLElement, hit: CompanyHit, opener: HTMLElement, opts: CardOptions): HTMLElement {
  cards.querySelector(".card")?.remove();
  const doc = cards.ownerDocument;
  const vampire = hit.vampire;
  const exorcisable = !vampire || opts.listed !== false;
  const card = doc.createElement("section");
  card.className = vampire ? "card vampire-card" : "card";
  card.dataset.company = hit.company;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "card-title");
  card.innerHTML =
    `<div class="bar"><h2 id="card-title"></h2><button class="close win95" type="button" aria-label="Close">x</button></div>` +
    `<div class="card-body">${vampire ? VAMPIRE_BODY : `<p class="cat"></p><p>Haunts these domains:</p><ul class="domains"></ul><p class="seen"></p>`}` +
    (exorcisable ? `<button class="act win95 default" type="button"></button><p class="foot">Blocked until you close the browser.</p>` : "") +
    `</div>`;
  const domains = card.querySelector(".domains")!;
  if (vampire) {
    card.querySelector("h2")!.textContent = "Vampire identified";
    const who = card.querySelector(".who")!;
    if (exorcisable) who.textContent = hit.company;
    else who.remove(); // an unlisted host: the script host below is all there is to name
    domains.append(...hit.domains.map((d) => breakAtSlash(doc, d)));
    const did = card.querySelector(".did")!;
    if (vampire.caught.length) {
      did.append("Caught doing: ", Object.assign(doc.createElement("b"), { textContent: caughtLine(vampire.caught) }));
      did.after(Object.assign(doc.createElement("p"), { className: "honest", textContent: "Caught since you haunted this page." }));
    } else did.textContent = "Known to fingerprint (Tracker Radar)";
  } else {
    card.querySelector("h2")!.textContent = hit.company;
    card.querySelector(".cat")!.textContent = categoryOf(hit);
    domains.append(...hit.domains.map((d) => Object.assign(doc.createElement("li"), { textContent: d })));
    card.querySelector(".seen")!.textContent = seenText(hit.count);
  }
  const act = card.querySelector<HTMLButtonElement>(".act");
  if (act) {
    act.dataset.label = vampire ? `Exorcise ${hit.company}` : "Exorcise";
    act.textContent = opts.exorcised ? "Let it back" : act.dataset.label;
    act.addEventListener("click", () =>
      opts.send(act.textContent === "Let it back" ? { type: "LET_BACK", company: hit.company } : { type: "EXORCISE", company: hit.company, domains: hit.domains }),
    );
  }
  card.style.maxHeight = `${Math.max(120, Math.min(320, opts.bounds.bottom - opts.bounds.top - 16))}px`;
  show(cards, card, opener, L.cardWidth, opts);
  (act ?? card.querySelector<HTMLElement>(".close")!).focus();
  return card;
}

/**
 * Wire [x] and Esc, remember the opener for focus, then put the card beside the opener toward the page
 * centre, clamped to the viewport between the bands and the HUD.
 */
function show(cards: HTMLElement, card: HTMLElement, opener: HTMLElement, width: number, opts: Pick<CardOptions, "bounds" | "reduced">): void {
  card.querySelector(".close")!.addEventListener("click", () => closeCard(cards));
  card.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    closeCard(cards);
  });
  openers.set(card, opener);
  cards.append(card);

  const win = card.ownerDocument.defaultView!;
  const g = opener.getBoundingClientRect();
  const toRight = g.left + g.width / 2 < win.innerWidth / 2;
  const left = toRight ? g.right + 8 : g.left - 8 - width;
  const top = Math.min(g.top, opts.bounds.bottom - 8 - card.offsetHeight);
  card.style.left = `${Math.max(8, Math.min(left, win.innerWidth - 8 - SHADOW - width))}px`; // the 4px hard shadow keeps 8px off the edge too
  card.style.top = `${Math.max(opts.bounds.top + 8, top)}px`;
  if (!opts.reduced) card.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "scale(1)" }], { duration: M.fast, easing: M.easeOut });
}

/** The tombstone card: the stone itself, inscribed HERE LIES, the path, the status (and the host when cross-site). */
export function openTombstoneCard(cards: HTMLElement, dead: DeadLink, opener: HTMLElement, opts: Pick<CardOptions, "bounds" | "reduced">): HTMLElement {
  cards.querySelector(".card")?.remove();
  const doc = cards.ownerDocument;
  const card = doc.createElement("section");
  card.className = "card tombstone-card";
  card.dataset.url = dead.url;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "stone-inscription");
  card.innerHTML =
    `<button class="close win95" type="button" aria-label="Close">x</button>` +
    `<div class="inscription" id="stone-inscription"><p class="here-lies">HERE LIES</p><p class="path"></p><p class="status"></p></div>` +
    `<div class="moss" aria-hidden="true"></div>`;
  appendPath(card.querySelector<HTMLElement>(".path")!, dead.path);
  const status = card.querySelector(".status")!;
  status.textContent = statusText(dead.status);
  const url = new URL(dead.url);
  if (url.origin !== doc.defaultView!.location.origin) status.after(Object.assign(doc.createElement("p"), { className: "host", textContent: url.hostname }));
  show(cards, card, opener, L.tombstoneWidth, opts);
  card.querySelector<HTMLElement>(".close")!.focus();
  return card;
}
