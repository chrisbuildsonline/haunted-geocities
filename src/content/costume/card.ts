// The ghost card: a Win95 window in #cards, one at a time, beside its ghost toward the page centre.
import type { CompanyHit, ContentRequest } from "../../data/types";
import { categoryOf } from "./ghosts";
import { LAYOUT as L, MOTION as M } from "./tokens";

export interface CardOptions {
  exorcised: boolean;
  send: (msg: ContentRequest) => void;
  /** Viewport band the card must stay in: below the top bands, above the HUD. */
  bounds: { top: number; bottom: number };
  reduced?: boolean;
}

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
  if (card) card.querySelector(".act")!.textContent = exorcised.has(card.dataset.company!) ? "Let it back" : "Exorcise";
}

export function openCard(cards: HTMLElement, hit: CompanyHit, opener: HTMLElement, opts: CardOptions): HTMLElement {
  cards.querySelector(".card")?.remove();
  const doc = cards.ownerDocument;
  const card = doc.createElement("section");
  card.className = "card";
  card.dataset.company = hit.company;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "card-title");
  card.innerHTML =
    `<div class="bar"><h2 id="card-title"></h2><button class="close win95" type="button" aria-label="Close">x</button></div>` +
    `<div class="card-body"><p class="cat"></p><p>Haunts these domains:</p><ul class="domains"></ul><p class="seen"></p>` +
    `<button class="act win95 default" type="button"></button><p class="foot">Blocked until you close the browser.</p></div>`;
  card.querySelector("h2")!.textContent = hit.company;
  card.querySelector(".cat")!.textContent = categoryOf(hit);
  card.querySelector(".domains")!.append(...hit.domains.map((d) => Object.assign(doc.createElement("li"), { textContent: d })));
  card.querySelector(".seen")!.textContent = `Seen ${hit.count} ${hit.count === 1 ? "time" : "times"} on this page`;
  const act = card.querySelector<HTMLButtonElement>(".act")!;
  act.textContent = opts.exorcised ? "Let it back" : "Exorcise";
  act.addEventListener("click", () =>
    opts.send(act.textContent === "Exorcise" ? { type: "EXORCISE", company: hit.company, domains: hit.domains } : { type: "LET_BACK", company: hit.company }),
  );
  card.querySelector(".close")!.addEventListener("click", () => closeCard(cards));
  card.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    closeCard(cards);
  });
  openers.set(card, opener);
  cards.append(card);

  // Beside the ghost toward the page centre, clamped to the viewport between the bands and the HUD.
  const win = doc.defaultView!;
  const g = opener.getBoundingClientRect();
  const toRight = g.left + g.width / 2 < win.innerWidth / 2;
  const left = toRight ? g.right + 8 : g.left - 8 - L.cardWidth;
  const top = Math.min(g.top, opts.bounds.bottom - 8 - card.offsetHeight);
  card.style.left = `${Math.max(8, Math.min(left, win.innerWidth - 8 - L.cardWidth))}px`;
  card.style.top = `${Math.max(opts.bounds.top + 8, top)}px`;
  card.style.maxHeight = `${Math.max(120, Math.min(320, opts.bounds.bottom - opts.bounds.top - 16))}px`;
  if (!opts.reduced) card.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "scale(1)" }], { duration: M.fast, easing: M.easeOut });
  act.focus();
  return card;
}
