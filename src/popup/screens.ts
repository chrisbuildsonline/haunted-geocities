import { assignTints, byCountThenName, categoryOf } from "../content/costume/ghosts";
import { appendPath } from "../content/costume/tombstones";
import type { CompanyHit, Curse, DeadLink, TabState } from "../data/types";
import { h } from "./dom";
import { caughtLine } from "../content/vampire";
import { sprite, curseTile, tintedGhost, tombTile, vampireTile, type SpriteName } from "./sprites";
import { KIND_INFO } from "../content/dark-patterns";
import { resolveNeighborhood } from "../data/neighborhood";
import { siteOf } from "../background/site-haunt";

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
  /** "Haunt this whole site": the haunt follows every link on the site (Chrome asks once). */
  onSite?: () => void;
  /** Exorcise (or, when `exorcised`, let back) a company. */
  onExorcise: (company: string, exorcised: boolean) => void;
  error?: string;
}

/** A Win95 group box: an etched frame with its legend. */
const group = (doc: Document, legend: HTMLLegendElement | string, cls: string, ...children: (Node | null)[]) =>
  h(doc, "fieldset", { class: cls ? `group ${cls}` : "group" }, typeof legend === "string" ? h(doc, "legend", {}, legend) : legend, ...children);

/** The legend of a list's group box: "Ghosts (7)". */
const listHead = (doc: Document, label: string, cls: string, n: number) =>
  h(doc, "legend", { class: `list-head ${cls}` }, `${label} `, h(doc, "span", { class: "list-count" }, `(${n})`));

/** The hit-counter zeros that pad a count to four digits (drawn by CSS, not read out). */
const padFor = (n: number) => "000".slice(0, Math.max(0, 4 - String(n).length));

function ghostRow(doc: Document, g: CompanyHit, tint: string, exorcised: boolean, onExorcise: ScreenProps["onExorcise"]): HTMLElement {
  const n = g.domains.length;
  const button = h(doc, "button", { type: "button", class: "btn", "data-company": g.company }, exorcised ? "Let it back" : "Exorcise");
  button.setAttribute("aria-label", `${exorcised ? "Let it back" : "Exorcise"}: ${g.company}`);
  button.addEventListener("click", () => onExorcise(g.company, exorcised));
  return h(
    doc,
    "li",
    { class: exorcised ? "ghost-row exorcised" : "ghost-row" },
    h(doc, "span", { class: "icon-tile" }, tintedGhost(doc, tint)),
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
    button = h(doc, "button", { type: "button", class: "btn", "data-company": v.company }, exorcised ? "Let it back" : "Exorcise");
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
        h(doc, "span", { class: "row-sub" }, isCaught ? did[0]!.toUpperCase() + did.slice(1) : "On the Tracker Radar fingerprint list"),
      ),
    ),
    button,
  );
}

/** A dead link: its path (breaking only after a "/") over a status pill, and the host when it is on another site. */
function tombstoneRow(doc: Document, t: DeadLink, pageOrigin: string | null): HTMLElement {
  const what = t.status === 410 ? "Gone" : "Not found";
  let host = "";
  try {
    const u = new URL(t.url);
    if (pageOrigin && u.origin !== pageOrigin) host = u.hostname;
  } catch {
    // not a URL: no host to show
  }
  const path = h(doc, "span", { class: "row-title tomb-path" });
  appendPath(path, t.path);
  return h(
    doc,
    "li",
    { class: "ghost-row tombstone-row", tabindex: "0", "aria-label": `Dead link: ${t.path}, ${t.status} ${what}${host ? `, on ${host}` : ""}` },
    h(doc, "span", { class: "icon-tile" }, tombTile(doc)),
    h(
      doc,
      "span",
      { class: "row-text" },
      path,
      h(doc, "span", { class: "row-line" }, h(doc, "span", { class: `tag-pill dead-${t.status}` }, String(t.status)), h(doc, "span", { class: "row-sub" }, host ? `${what} · ${host}` : what)),
    ),
  );
}

/** A dark pattern: its kind name over the quoted snippet, which wraps. */
function curseRow(doc: Document, c: Curse): HTMLElement {
  const info = KIND_INFO[c.kind];
  return h(
    doc,
    "li",
    { class: "ghost-row curse-row", tabindex: "0", "aria-label": `${info.name}: ${c.snippet}` },
    h(doc, "span", { class: "icon-tile" }, curseTile(doc)),
    h(
      doc,
      "span",
      { class: "row-text" },
      h(doc, "span", { class: "row-title" }, info.name),
      h(doc, "span", { class: "row-line" }, h(doc, "span", { class: "row-sub quote" }, `“${c.snippet}”`)),
    ),
  );
}

const originOf =(url: string | null) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/** The GeoCities address of the page's host; null when the URL has no host. */
const addressOf = (url: string | null): string | null => {
  try {
    const host = url ? new URL(url).hostname : "";
    return host ? resolveNeighborhood(host).address : null;
  } catch {
    return null;
  }
};

/** Everything that goes inside #app for one screen. */
export function renderScreen(doc: Document, { state, settings, onPrimary, onSite, onExorcise, error }: ScreenProps): Node[] {
  const screen = screenFor(state);
  const titlebar = h(doc, "header", { class: "titlebar" }, sprite(doc, "ghost", 16, "mark"), h(doc, "span", { class: "brand" }, "Haunted GeoCities"));
  const title = h(doc, "h1", { class: "title" }, screen === "restricted" ? "This page is protected" : hostname(state.url));
  const address = screen === "haunted" ? addressOf(state.url) : null;
  const addressLine = address ? h(doc, "p", { class: "address muted" }, address) : null;
  const siteLine = screen === "haunted" && state.site ? h(doc, "p", { class: "site-line muted" }, `Haunting all of ${state.site}`) : null;

  const primary = (label: string) => {
    const b = h(doc, "button", { type: "button", class: "primary" }, label);
    b.addEventListener("click", onPrimary);
    return b;
  };
  const alert = error ? h(doc, "p", { class: "error", role: "alert" }, error) : null;

  let groups: HTMLElement[];
  if (screen === "idle") {
    // The second, ordinary button: the only one that makes Chrome ask for anything.
    const site = siteOf(state.url);
    let siteHaunt: HTMLElement[] = [];
    if (site) {
      const hint = h(doc, "p", { class: "muted site-hint", id: "site-hint" }, `Follows every link on ${site}. Chrome asks once.`);
      const b = h(doc, "button", { type: "button", class: "btn site-haunt", "aria-describedby": hint.id }, "Haunt this whole site");
      b.addEventListener("click", () => onSite?.());
      siteHaunt = [b, hint];
    }
    groups = [
      group(
        doc,
        "Haunt",
        "",
        h(doc, "p", { class: "lead" }, "Turn this page into a 1998 crypt."),
        h(doc, "p", { class: "muted" }, "Ghosts, vampires and dead links show up."),
        primary("Haunt this page"),
        ...siteHaunt,
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
          h(doc, "span", { class: "num" }, "0"),
          sprite(doc, spr, 16, "tile-sprite"),
          " ",
          h(doc, "span", { class: "label" }, label),
        ),
      ),
    );
    const setCount = (key: string, n: number) => {
      const num = tiles.querySelector<HTMLElement>(`[data-count="${key}"] .num`)!;
      num.textContent = String(n);
      num.dataset.pad = padFor(n);
    };
    // Ghosts by request count, then vampires by name (a vampire is not also counted as a ghost).
    const ghosts = state.ghosts.filter((g) => !g.vampire).sort(byCountThenName);
    const vampires = state.ghosts.filter((g) => g.vampire).sort((a, b) => (a.company < b.company ? -1 : a.company > b.company ? 1 : 0));
    setCount("ghosts", ghosts.length);
    setCount("vampires", vampires.length);
    // The lanes' tints for the same order, so a company wears one hem colour everywhere.
    const tints = assignTints(ghosts.map((g) => g.company));
    const listBox = (rows: HTMLElement[]) => h(doc, "ul", { class: "rows listbox" }, ...rows);
    // Each kind is a group box with a list box, or a line saying there are none. The lines of
    // every empty kind share one "Nothing found" box at the head of the list, so a clean page
    // stays short and the lines are on screen as the popup opens, whatever the lists below hold.
    const ghostList = ghosts.length
      ? group(doc, listHead(doc, "Ghosts", "ghosts-head", ghosts.length), "", listBox(ghosts.map((g, i) => ghostRow(doc, g, tints[i]!, state.exorcised.includes(g.company), onExorcise))))
      : vampires.length
        ? []
        : [
            h(doc, "p", { class: "lead" }, "No ghosts here. Suspiciously clean."),
            h(doc, "p", { class: "muted" }, "Trackers that load later will appear here."),
          ];
    const vampireList = vampires.length
      ? group(doc, listHead(doc, "Vampires", "vampires-head", vampires.length), "", listBox(vampires.map((v) => vampireRow(doc, v, state.exorcised.includes(v.company), onExorcise))))
      : [h(doc, "p", { class: "muted no-vampires" }, "No vampires. Your blood is safe.")];
    const tombs = state.tombstones ?? [];
    setCount("tombstones", tombs.length);
    const pageOrigin = originOf(state.url);
    const tombList = tombs.length
      ? group(doc, listHead(doc, "Tombstones", "tombstones-head", tombs.length), "", listBox(tombs.map((t) => tombstoneRow(doc, t, pageOrigin))))
      : [h(doc, "p", { class: "muted no-tombstones" }, "No tombstones. Every link is alive.")];
    const curses = state.curses ?? [];
    setCount("curses", curses.length);
    const curseList = curses.length
      ? group(doc, listHead(doc, "Curses", "curses-head", curses.length), "", listBox(curses.map((c) => curseRow(doc, c))))
      : [h(doc, "p", { class: "muted no-curses" }, "No curses. This page plays fair.")];
    const parts: (HTMLElement | HTMLElement[])[] = [ghostList, vampireList, tombList, curseList];
    const empty = parts.filter((p) => Array.isArray(p)).flat();
    const found = parts.flatMap((p) => (Array.isArray(p) ? [] : [p]));
    const boxes = [...(empty.length ? [group(doc, "Nothing found", "found-none", ...empty)] : []), ...found];
    groups = [
      group(doc, "Found on this page", "", tiles, primary("Un-haunt"), alert),
      h(doc, "div", { class: "list", role: "group", "aria-label": "Ghosts, vampires, tombstones and curses" }, ...boxes),
    ];
  } else {
    groups = [
      group(doc, "Why not", "", h(doc, "p", { class: "lead" }, "Chrome doesn't let extensions draw on its own pages. Open any website and press Haunt there.")),
    ];
  }

  // The status bar: the state in one sunken field, the attribution in the other.
  // Keep the licence name on one line: "CC BY-NC-SA 4.0" must not break at its hyphens.
  const [source, licence] = ATTRIBUTION.split(", ");
  const statusbar = h(
    doc,
    "footer",
    { class: "statusbar" },
    h(doc, "p", { class: "status-field", "data-status": screen }, STATUS[screen]),
    h(doc, "p", { class: "status-field attribution" }, `${source}, `, h(doc, "span", { class: "nowrap" }, licence)),
  );
  const client = h(doc, "div", { class: "client" }, title, addressLine, siteLine, ...groups, settings);
  return [titlebar, client, statusbar];
}
