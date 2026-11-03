import { byCountThenName, categoryOf, hemTint } from "../content/costume/ghosts";
import type { CompanyHit, TabState } from "../data/types";
import { h } from "./dom";
import { caughtLine } from "../content/vampire";
import { sprite, tintedGhost, vampireTile, type SpriteName } from "./sprites";

export type Screen = "idle" | "haunted" | "restricted";

export const screenFor = (s: TabState): Screen => (s.restricted ? "restricted" : s.haunted ? "haunted" : "idle");

const STATUS: Record<Screen, string> = { idle: "Idle", haunted: "Haunted", restricted: "Can't haunt" };
export const ATTRIBUTION = "Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0";
export const HAUNT_ERROR = "Couldn't haunt this page. Reload it and try again.";

const TILES: [string, string, SpriteName][] = [
  ["ghosts", "Ghosts", "ghost"],
  ["vampires", "Vampires", "vampire"],
  ["tombstones", "Tombstones", "tombstone"],
  ["curses", "Curses", "curse"],
];

const hostname = (url: string | null) => {
  if (!url) return "This page";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
};

export interface ScreenProps {
  state: TabState;
  settings: HTMLElement;
  onPrimary: () => void;
  /** Exorcise (or, when `exorcised`, let back) a company. */
  onExorcise: (company: string, exorcised: boolean) => void;
  error?: string;
}

function ghostRow(doc: Document, g: CompanyHit, exorcised: boolean, onExorcise: ScreenProps["onExorcise"]): HTMLElement {
  const n = g.domains.length;
  const button = h(doc, "button", { type: "button", class: exorcised ? "quiet" : "secondary", "data-company": g.company }, exorcised ? "Let it back" : "Exorcise");
  button.setAttribute("aria-label", `${exorcised ? "Let it back" : "Exorcise"}: ${g.company}`);
  button.addEventListener("click", () => onExorcise(g.company, exorcised));
  return h(
    doc,
    "li",
    { class: exorcised ? "ghost-row exorcised" : "ghost-row" },
    h(doc, "span", { class: "icon-tile" }, tintedGhost(doc, hemTint(g.company))),
    h(
      doc,
      "span",
      { class: "row-text" },
      h(doc, "span", { class: "row-title" }, g.company),
      h(
        doc,
        "span",
        { class: "row-line" },
        // Beside "Let it back" the pill fills the line; once exorcised, the state is what matters.
        exorcised
          ? h(doc, "span", { class: "tag-pill" }, "Exorcised")
          : h(doc, "span", { class: "row-sub" }, `${n} ${n === 1 ? "domain" : "domains"} · ${categoryOf(g)}`),
      ),
    ),
    button,
  );
}

/** A vampire whose name is its own host: an unlisted script, no company to block. */
const unlisted = (v: CompanyHit) => v.count === 0 && v.domains.length === 1 && v.domains[0] === v.company;

function vampireRow(doc: Document, v: CompanyHit, exorcised: boolean, onExorcise: ScreenProps["onExorcise"]): HTMLElement {
  const isCaught = !!v.vampire?.caught.length;
  const did = caughtLine(v.vampire?.caught ?? []);
  let button: HTMLElement | null = null;
  if (!unlisted(v)) {
    button = h(doc, "button", { type: "button", class: exorcised ? "quiet" : "secondary", "data-company": v.company }, exorcised ? "Let it back" : "Exorcise");
    button.setAttribute("aria-label", `${exorcised ? "Let it back" : "Exorcise"}: ${v.company}`);
    button.addEventListener("click", () => onExorcise(v.company, exorcised));
  }
  return h(
    doc,
    "li",
    { class: exorcised ? "ghost-row vampire-row exorcised" : "ghost-row vampire-row" },
    h(doc, "span", { class: "icon-tile" }, vampireTile(doc)),
    h(
      doc,
      "span",
      { class: "row-text" },
      h(doc, "span", { class: "row-title" }, v.company),
      // The name gets its own line; the pill leads what it did, which may wrap under the button.
      h(
        doc,
        "span",
        { class: "row-line" },
        h(doc, "span", { class: isCaught ? "tag-pill caught" : "tag-pill known" }, exorcised ? "Exorcised" : isCaught ? "Caught" : "Known"),
        h(doc, "span", { class: "row-sub" }, isCaught ? did[0]!.toUpperCase() + did.slice(1) : "Known to fingerprint"),
      ),
    ),
    button,
  );
}

/** Everything that goes inside #app for one screen. */
export function renderScreen(doc: Document, { state, settings, onPrimary, onExorcise, error }: ScreenProps): Node[] {
  const screen = screenFor(state);
  const header = h(
    doc,
    "header",
    { class: "top" },
    sprite(doc, "ghost", 24, "mark"),
    h(doc, "span", { class: "brand" }, "Haunted GeoCities"),
    h(doc, "span", { class: "status", "data-status": screen }, STATUS[screen]),
  );
  const title = h(doc, "h1", { class: "title" }, screen === "restricted" ? "This page is protected" : hostname(state.url));

  const pill = (label: string) => {
    const b = h(doc, "button", { type: "button", class: "pill" }, label);
    b.addEventListener("click", onPrimary);
    return b;
  };
  const alert = error ? h(doc, "p", { class: "error", role: "alert" }, error) : null;

  let surfaces: HTMLElement[];
  if (screen === "idle") {
    surfaces = [
      h(
        doc,
        "section",
        { class: "surface", "aria-label": "Haunt" },
        h(doc, "p", { class: "lead" }, "Turn this page into a 1998 crypt."),
        h(doc, "p", { class: "muted" }, "Ghosts, vampires and dead links show up."),
        pill("Haunt this page"),
        alert,
      ),
    ];
  } else if (screen === "haunted") {
    const tiles = h(
      doc,
      "ul",
      { class: "tiles", "aria-label": "Found on this page" },
      ...TILES.map(([key, label, spr]) =>
        h(
          doc,
          "li",
          { class: "tile", "data-count": key },
          sprite(doc, spr, 16, "tile-sprite"),
          h(doc, "span", { class: "num" }, "0"),
          " ",
          h(doc, "span", { class: "label" }, label),
        ),
      ),
    );
    // Ghosts by request count, then vampires by name (a vampire is not also counted as a ghost).
    const ghosts = state.ghosts.filter((g) => !g.vampire).sort(byCountThenName);
    const vampires = state.ghosts.filter((g) => g.vampire).sort((a, b) => (a.company < b.company ? -1 : a.company > b.company ? 1 : 0));
    tiles.querySelector('[data-count="ghosts"] .num')!.textContent = String(ghosts.length);
    tiles.querySelector('[data-count="vampires"] .num')!.textContent = String(vampires.length);
    const ghostList = ghosts.length
      ? [
          h(doc, "h2", { class: "list-head" }, "Ghosts ", h(doc, "span", { class: "list-count" }, String(ghosts.length))),
          h(doc, "ul", { class: "rows" }, ...ghosts.map((g) => ghostRow(doc, g, state.exorcised.includes(g.company), onExorcise))),
        ]
      : vampires.length
        ? []
        : [
            h(doc, "p", { class: "lead" }, "No ghosts here. Suspiciously clean."),
            h(doc, "p", { class: "muted" }, "Trackers that load later will appear here."),
          ];
    const vampireList = vampires.length
      ? [
          h(doc, "h2", { class: "list-head vampires-head" }, "Vampires ", h(doc, "span", { class: "list-count" }, String(vampires.length))),
          h(doc, "ul", { class: "rows" }, ...vampires.map((v) => vampireRow(doc, v, state.exorcised.includes(v.company), onExorcise))),
        ]
      : [h(doc, "p", { class: "muted no-vampires" }, "No vampires. Your blood is safe.")];
    const list = [...ghostList, ...vampireList];
    surfaces = [
      h(doc, "section", { class: "surface", "aria-label": "Haunting" }, tiles, pill("Un-haunt"), alert),
      h(doc, "section", { class: "surface list", "aria-label": "Ghosts and vampires" }, ...list),
    ];
  } else {
    surfaces = [
      h(
        doc,
        "section",
        { class: "surface", "aria-label": "Why not" },
        h(doc, "p", { class: "muted" }, "Chrome doesn't let extensions draw on its own pages. Open any website and press Haunt there."),
      ),
    ];
  }

  // Keep the licence name on one line: "CC BY-NC-SA 4.0" must not break at its hyphens.
  const [source, licence] = ATTRIBUTION.split(", ");
  const attribution = h(doc, "p", { class: "attribution" }, `${source}, `, h(doc, "span", { class: "nowrap" }, licence));
  return [header, title, ...surfaces, settings, attribution];
}
