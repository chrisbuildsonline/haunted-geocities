import type { TabState } from "../data/types";
import { h } from "./dom";
import { sprite, type SpriteName } from "./sprites";

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
  error?: string;
}

/** Everything that goes inside #app for one screen. */
export function renderScreen(doc: Document, { state, settings, onPrimary, error }: ScreenProps): Node[] {
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
    surfaces = [
      h(doc, "section", { class: "surface", "aria-label": "Haunting" }, tiles, pill("Un-haunt"), alert),
      h(
        doc,
        "section",
        { class: "surface list", "aria-label": "Ghosts and vampires" },
        h(doc, "p", { class: "lead" }, "No ghosts here. Suspiciously clean."),
        h(doc, "p", { class: "muted" }, "Trackers that load later will appear here."),
      ),
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
