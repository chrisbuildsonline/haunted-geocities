// The secrets (design/DESIGN.md "Secrets (easter eggs)"): four small surprises on a haunted page.
// They live and die with the costume (stop() on Un-haunt), only change classes and elements inside
// the costume's own shadow root, and never fire while the visitor types into a field.
import { mapToPx, svgMarkup, type Legend } from "./art";
import { PALETTE as P, PIXEL } from "./tokens";

export const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"] as const;
export const FRENZY_MS = 3000;
export const SKELETON_MS = 5000;
export const BOO_MS = 2000;
/** Clicks on the hit counter that summon the skeleton, each within this long of the one before. */
const CLICKS = 13;
const CLICK_GAP_MS = 3000;

/** The 16x16 dancing skeleton, drawn like the other sprites at 3px art pixels (48px). */
const SKELETON = [
  ".....WWWWWW.....",
  "....WWWWWWWW....",
  "....WkkWWkkW....",
  "....WWWWWWWW....",
  ".....WkWkWW.....",
  "......WWWW......",
  "....W..WW..W....",
  "...WWWWWWWWWW...",
  "..W...WWWW...W..",
  ".W....WWWW....W.",
  "......WWWW......",
  "......W..W......",
  ".....W....W.....",
  "....W......W....",
  "...WW......WW...",
  "................",
];
const SKELETON_LEGEND: Legend = { W: P.bone, k: P.ink };

/** Oct 31 is Halloween all day; otherwise local 00:00-00:59 is the witching hour. */
export function specialDay(d: Date): "halloween" | "witching" | null {
  if (d.getMonth() === 9 && d.getDate() === 31) return "halloween";
  return d.getHours() === 0 ? "witching" : null;
}

type Timers = { set(fn: () => void, ms: number): number; clear(id: number): void };

export interface SecretsDeps {
  win: Window;
  croot: HTMLElement;
  footer: HTMLElement;
  hud: HTMLElement;
  reduced: () => boolean;
  /** Puts one line on the marquee. */
  say: (line: string) => void;
  now?: () => Date;
  timers?: Timers;
}

/** Typing into something: an input, a text area, a select or editable content. */
function typing(e: KeyboardEvent): boolean {
  const el = (e.composedPath?.()[0] ?? e.target) as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']") || el.isContentEditable === true;
}

export function mountSecrets({ win, croot, footer, hud, reduced, say, now = () => new Date(), timers }: SecretsDeps) {
  const t: Timers = timers ?? { set: (fn, ms) => win.setTimeout(fn, ms), clear: (id) => win.clearTimeout(id) };
  const pending = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = t.set(() => {
      pending.delete(id);
      fn();
    }, ms);
    pending.add(id);
  };
  const both = (cls: string, on: boolean) => [croot, footer].forEach((el) => el.classList.toggle(cls, on));

  // Witching hour and Halloween: read once, at haunt.
  const day = specialDay(now());
  if (day) {
    croot.classList.add(day);
    say(day === "halloween" ? "Happy Halloween from 1998!" : "It's the witching hour.");
  }

  let konami = 0;
  let typed = "";
  const onKey = (e: KeyboardEvent) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konami = key === KONAMI[konami] ? konami + 1 : key === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) {
      konami = 0;
      say("!!! FULL HAUNT !!!");
      if (!reduced()) {
        croot.classList.add("frenzy");
        later(() => croot.classList.remove("frenzy"), FRENZY_MS);
      }
    }
    if (key.length !== 1) return;
    typed = (typed + key).slice(-3);
    if (typed === "boo") {
      typed = "";
      both("fled", true);
      later(() => both("fled", false), BOO_MS);
    }
  };
  // On the document, not the window: the window's key listeners are the haunt moment's skip.
  win.document.addEventListener("keydown", onKey);

  // The hit counter, clicked 13 times (each within 3 s of the last): a dancing skeleton for 5 s.
  const hits = hud.querySelector<HTMLElement>(".hits");
  let clicks = 0;
  let reset = 0;
  const onHit = () => {
    clicks++;
    t.clear(reset);
    pending.delete(reset);
    reset = t.set(() => (clicks = 0), CLICK_GAP_MS);
    pending.add(reset);
    if (clicks < CLICKS || hud.querySelector(".skeleton")) return;
    clicks = 0;
    const skeleton = win.document.createElement("span");
    skeleton.className = "skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.innerHTML = svgMarkup(mapToPx(SKELETON, SKELETON_LEGEND, PIXEL.spriteScale), 48, 48);
    hits?.after(skeleton);
    later(() => skeleton.remove(), SKELETON_MS);
  };
  hits?.addEventListener("click", onHit);

  return {
    stop() {
      win.document.removeEventListener("keydown", onKey);
      hits?.removeEventListener("click", onHit);
      for (const id of pending) t.clear(id);
      pending.clear();
      both("fled", false);
      croot.classList.remove("frenzy");
      hud.querySelector(".skeleton")?.remove();
    },
  };
}
