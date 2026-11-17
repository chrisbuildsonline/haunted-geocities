import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { mountPopup } from "../src/popup/app";
import { AUDIO_KEY, LINK_CHECK_ORIGINS, type TabState } from "../src/data/types";
import { asChrome, createChromeMock } from "./chrome-mock";

const ATTRIBUTION = "Tracker data: DuckDuckGo Tracker Radar, CC BY-NC-SA 4.0";

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

type Opts = { state?: Partial<TabState>; search?: string; grant?: boolean; granted?: boolean; audio?: boolean };

async function mount(opts: Opts = {}) {
  const win = new Window({ url: "chrome-extension://test/popup.html" });
  const doc = win.document as unknown as Document;
  const root = doc.createElement("div");
  root.id = "app";
  doc.body.appendChild(root);
  const m = createChromeMock({ tabs: [{ id: 5, url: "https://example.org/a", active: true }], grant: opts.grant });
  if (opts.granted) for (const o of LINK_CHECK_ORIGINS) m.granted.add(o);
  if (opts.audio !== undefined) m.chrome.storage.local.data[AUDIO_KEY] = opts.audio;
  let state: TabState = { haunted: false, restricted: false, url: "https://example.org/a", ghosts: [], exorcised: [], tombstones: [], curses: [], ...opts.state };
  m.backgroundReply = async (msg: { type: string }) => {
    if (msg.type === "HAUNT") state = { ...state, haunted: true };
    if (msg.type === "UNHAUNT") state = { ...state, haunted: false };
    return state;
  };
  await mountPopup(root, asChrome(m), opts.search ?? "");
  await flush();
  return { win, doc, root, m };
}

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const buttons = (root: HTMLElement) => [...root.querySelectorAll("button")];
const switchNamed = (root: HTMLElement, name: string) => {
  const sw = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][role="switch"]')].find(
    (i) => text(root.querySelector(`label[for="${i.id}"]`)) === name,
  );
  if (!sw) throw new Error(`no switch named ${name}`);
  return sw;
};
const description = (root: HTMLElement, el: Element) =>
  text(root.querySelector(`#${el.getAttribute("aria-describedby")}`));
const toggle = async (input: HTMLInputElement) => {
  input.click();
  await flush();
};

describe("popup screens", () => {
  test("idle: hostname title, Idle status, one Haunt button, settings, attribution", async () => {
    const { root } = await mount();
    expect(root.dataset.screen).toBe("idle");
    expect(text(root.querySelector("h1"))).toBe("example.org");
    expect(text(root.querySelector("header"))).toContain("Haunted GeoCities");
    expect(text(root.querySelector('[data-status]'))).toBe("Idle");
    expect(buttons(root).map(text)).toEqual(["Haunt this page"]);
    expect(text(root)).toContain("Turn this page into a 1998 crypt.");
    expect(text(root)).toContain(ATTRIBUTION);
    expect(root.querySelectorAll('input[type="checkbox"][role="switch"]')).toHaveLength(2);
  });

  test("haunted: Haunted status, four zero counters, empty list text, one Un-haunt button", async () => {
    const { root } = await mount({ state: { haunted: true } });
    expect(root.dataset.screen).toBe("haunted");
    expect(text(root.querySelector('[data-status]'))).toBe("Haunted");
    expect(buttons(root).map(text)).toEqual(["Un-haunt"]);
    const tiles = [...root.querySelectorAll("[data-count]")].map((t) => [t.getAttribute("data-count"), text(t)]);
    expect(tiles).toEqual([
      ["ghosts", "0 Ghosts"],
      ["vampires", "0 Vampires"],
      ["tombstones", "0 Tombstones"],
      ["curses", "0 Curses"],
    ]);
    expect(text(root)).toContain("No ghosts here. Suspiciously clean.");
    expect(text(root)).toContain("Trackers that load later will appear here.");
    expect(text(root)).toContain(ATTRIBUTION);
  });

  test("restricted: protected title, Can't haunt status, no button", async () => {
    const { root } = await mount({ state: { restricted: true, url: "chrome://version" } });
    expect(root.dataset.screen).toBe("restricted");
    expect(text(root.querySelector("h1"))).toBe("This page is protected");
    expect(text(root.querySelector('[data-status]'))).toBe("Can't haunt");
    expect(buttons(root)).toHaveLength(0);
    expect(text(root)).toContain("Chrome doesn't let extensions draw on its own pages. Open any website and press Haunt there.");
    expect(text(root)).toContain(ATTRIBUTION);
  });

  test("the ghost mark is an inline 16px SVG hidden from assistive tech", async () => {
    const { root } = await mount();
    const svg = root.querySelector("header svg")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  test("nothing in the popup references an external URL", async () => {
    const { root } = await mount({ state: { haunted: true } });
    expect(root.innerHTML).not.toMatch(/https?:\/\//);
  });
});

describe("target tab", () => {
  test("defaults to the active tab of the current window", async () => {
    const { m } = await mount();
    expect(m.calls.runtimeMessages[0]).toEqual({ type: "GET_STATE", tabId: 5 });
  });
  test("?tab=<id> overrides the target tab", async () => {
    const { m } = await mount({ search: "?tab=42" });
    expect(m.calls.runtimeMessages[0]).toEqual({ type: "GET_STATE", tabId: 42 });
  });
});

describe("primary action", () => {
  test("Haunt sends HAUNT for the tab, then shows the haunted screen with focus on Un-haunt", async () => {
    const { root, m, doc } = await mount();
    buttons(root)[0]!.click();
    await flush();
    expect(m.calls.runtimeMessages).toContainEqual({ type: "HAUNT", tabId: 5 });
    expect(root.dataset.screen).toBe("haunted");
    expect(text(doc.activeElement)).toBe("Un-haunt");
  });
  test("Un-haunt sends UNHAUNT and returns to idle", async () => {
    const { root, m } = await mount({ state: { haunted: true } });
    buttons(root)[0]!.click();
    await flush();
    expect(m.calls.runtimeMessages).toContainEqual({ type: "UNHAUNT", tabId: 5 });
    expect(root.dataset.screen).toBe("idle");
  });
  test("a failed haunt stays idle and says so", async () => {
    const { root, m } = await mount();
    m.backgroundReply = async () => ({ haunted: false, restricted: false, url: "https://example.org/a", error: "nope" });
    buttons(root)[0]!.click();
    await flush();
    expect(root.dataset.screen).toBe("idle");
    expect(text(root.querySelector('[role="alert"]'))).toBe("Couldn't haunt this page. Reload it and try again.");
  });
});

describe("Check links to other sites", () => {
  test("off by default with the off sub-line", async () => {
    const { root } = await mount();
    const sw = switchNamed(root, "Check links to other sites");
    expect(sw.checked).toBe(false);
    expect(description(root, sw)).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("reflects an existing grant from permissions.contains", async () => {
    const { root } = await mount({ granted: true });
    const sw = switchNamed(root, "Check links to other sites");
    expect(sw.checked).toBe(true);
    expect(description(root, sw)).toBe("Checking links on other sites too.");
  });
  test("turning on opens permissions.html in a tab instead of asking from the popup", async () => {
    const { root, m } = await mount({ grant: true });
    const sw = switchNamed(root, "Check links to other sites");
    await toggle(sw);
    expect(m.calls.createTab).toEqual([{ url: "chrome-extension://test-extension-id/permissions.html" }]);
    expect(m.calls.request).toEqual([]);
  });
  test("turning on springs back and points at the new page", async () => {
    const { root } = await mount();
    const sw = switchNamed(root, "Check links to other sites");
    await toggle(sw);
    expect(sw.checked).toBe(false);
    expect(description(root, sw)).toBe("Finish on the page that just opened.");
  });
  test("a grant made while the popup is open turns the switch on", async () => {
    const { root, m } = await mount();
    const sw = switchNamed(root, "Check links to other sites");
    for (const o of LINK_CHECK_ORIGINS) m.granted.add(o);
    for (const l of m.chrome.permissions.onAdded.listeners) l({ origins: LINK_CHECK_ORIGINS });
    await flush();
    expect(sw.checked).toBe(true);
    expect(description(root, sw)).toBe("Checking links on other sites too.");
  });
  test("turning off removes the origins", async () => {
    const { root, m } = await mount({ granted: true });
    const sw = switchNamed(root, "Check links to other sites");
    await toggle(sw);
    expect(m.calls.remove).toEqual([{ origins: ["http://*/*", "https://*/*"] }]);
    expect(sw.checked).toBe(false);
    expect(description(root, sw)).toBe("Asks Chrome to visit linked sites. Off.");
  });
});

describe("Sound effects", () => {
  test("muted by default", async () => {
    const { root } = await mount();
    const sw = switchNamed(root, "Sound effects");
    expect(sw.checked).toBe(false);
    expect(description(root, sw)).toBe("Muted");
  });
  test("turning on persists audioEnabled and updates the sub-line", async () => {
    const { root, m } = await mount();
    const sw = switchNamed(root, "Sound effects");
    await toggle(sw);
    expect(m.chrome.storage.local.data[AUDIO_KEY]).toBe(true);
    expect(description(root, sw)).toBe("On · plays only after you click");
    await toggle(sw);
    expect(m.chrome.storage.local.data[AUDIO_KEY]).toBe(false);
    expect(description(root, sw)).toBe("Muted");
  });
  test("reads the stored preference on open", async () => {
    const { root } = await mount({ audio: true });
    expect(switchNamed(root, "Sound effects").checked).toBe(true);
  });
});

describe("ghost list", () => {
  const g = (company: string, count: number, domains: string[], categories = ["Advertising"]) => ({ company, count, domains, categories, fingerprinting: 0 });
  const GHOSTS = [
    g("Taboola", 1, ["taboola.com"]),
    g("Hotjar", 2, ["hotjar.com", "script.hotjar.com"], ["Analytics"]),
    g("Criteo", 3, ["criteo.com"]),
    g("Adzerk", 1, ["adzerk.net"], []),
  ];
  const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".ghost-row")];

  test("rows sorted by count, then name; name, N domains · category, Exorcise; the ghost tile counts them", async () => {
    const { root } = await mount({ state: { haunted: true, ghosts: GHOSTS } });
    expect(rows(root).map((r) => text(r.querySelector(".row-title")))).toEqual(["Criteo", "Hotjar", "Adzerk", "Taboola"]);
    expect(rows(root).map((r) => text(r.querySelector(".row-sub")))).toEqual([
      "1 domain · Advertising",
      "2 domains · Analytics",
      "1 domain · Tracker",
      "1 domain · Advertising",
    ]);
    expect(rows(root).map((r) => text(r.querySelector("button")))).toEqual(["Exorcise", "Exorcise", "Exorcise", "Exorcise"]);
    expect(rows(root)[0]!.querySelector(".icon-tile svg")).not.toBeNull();
    expect(text(root.querySelector('[data-count="ghosts"] .num'))).toBe("4");
    expect(text(root.querySelector(".list-head"))).toBe("Ghosts (4)");
    expect(text(root)).not.toContain("Suspiciously clean");
  });

  test("an exorcised row shows the Exorcised tag and offers Let it back", async () => {
    const { root } = await mount({ state: { haunted: true, ghosts: GHOSTS, exorcised: ["Hotjar"] } });
    const row = rows(root)[1]!;
    expect(row.classList.contains("exorcised")).toBe(true);
    expect(text(row.querySelector(".tag-pill"))).toBe("Exorcised");
    expect(row.querySelector(".row-sub")).toBeNull();
    expect(text(row.querySelector("button"))).toBe("Let it back");
  });

  test("Exorcise and Let it back send the tab id and re-render from the answer", async () => {
    const { root, m } = await mount({ state: { haunted: true, ghosts: GHOSTS } });
    let exorcised: string[] = [];
    m.backgroundReply = async (msg: { type: string; company?: string }) => {
      if (msg.type === "EXORCISE") exorcised = [msg.company!];
      if (msg.type === "LET_BACK") exorcised = [];
      return { haunted: true, restricted: false, url: "https://example.org/a", ghosts: GHOSTS, exorcised };
    };
    rows(root)[0]!.querySelector("button")!.click();
    await flush();
    expect(m.calls.runtimeMessages).toContainEqual({ type: "EXORCISE", tabId: 5, company: "Criteo" });
    expect(text(rows(root)[0]!.querySelector("button"))).toBe("Let it back");
    rows(root)[0]!.querySelector("button")!.click();
    await flush();
    expect(m.calls.runtimeMessages).toContainEqual({ type: "LET_BACK", tabId: 5, company: "Criteo" });
    expect(text(rows(root)[0]!.querySelector("button"))).toBe("Exorcise");
  });

  test("a session storage change refreshes the list, so trackers that load later appear", async () => {
    const { root, m } = await mount({ state: { haunted: true } });
    expect(text(root)).toContain("No ghosts here. Suspiciously clean.");
    m.backgroundReply = async () => ({ haunted: true, restricted: false, url: "https://example.org/a", ghosts: GHOSTS, exorcised: [], tombstones: [], curses: [] });
    for (const l of m.chrome.storage.onChanged.listeners) l({ "ghosts:5": { newValue: {} } }, "session");
    await flush();
    expect(rows(root)).toHaveLength(4);
    // keyboard focus survives a refresh
    (root.querySelector(".primary") as HTMLElement).focus();
    for (const l of m.chrome.storage.onChanged.listeners) l({ "ghosts:5": { newValue: {} } }, "session");
    await flush();
    expect(text(root.ownerDocument.activeElement)).toBe("Un-haunt");
    rows(root)[1]!.querySelector("button")!.focus();
    for (const l of m.chrome.storage.onChanged.listeners) l({ "ghosts:5": { newValue: {} } }, "session");
    await flush();
    expect((root.ownerDocument.activeElement as HTMLElement).dataset.company).toBe("Hotjar");
    for (const l of m.chrome.storage.onChanged.listeners) l({ audioEnabled: { newValue: true } }, "local");
    await flush();
    expect(m.calls.runtimeMessages.filter((x) => (x as { type: string }).type === "GET_STATE")).toHaveLength(4);
  });
});

describe("popup costume (1998)", () => {
  const SRC = join(import.meta.dir, "..", "src", "popup");
  const css = readFileSync(join(SRC, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  const legends = (root: HTMLElement) => [...root.querySelectorAll("fieldset.group > legend")].map(text);
  const FULL: Partial<TabState> = {
    haunted: true,
    ghosts: [
      { company: "Criteo", count: 3, domains: ["criteo.com"], categories: ["Advertising"], fingerprinting: 0 },
      { company: "Hotjar", count: 2, domains: ["hotjar.com"], categories: ["Analytics"], fingerprinting: 2, vampire: { caught: [], knownOnly: true } },
    ],
    tombstones: [{ url: "https://example.org/missing.html", path: "/missing.html", status: 404 }],
    curses: [{ kind: "scarcity", snippet: "Only 2 left!" }] as unknown as TabState["curses"],
  };

  test("window has a navy title bar with the ghost sprite and Haunted GeoCities", async () => {
    const { root } = await mount();
    const bar = root.firstElementChild!;
    expect(bar.matches("header.titlebar")).toBe(true);
    expect(text(bar)).toBe("Haunted GeoCities");
    const svg = bar.querySelector("svg")!;
    expect([svg.getAttribute("width"), svg.getAttribute("height"), svg.getAttribute("aria-hidden")]).toEqual(["16", "16", "true"]);
    expect(bar.querySelector("[data-status]")).toBeNull(); // the status lives in the status bar now
  });

  test("content sits in group boxes with legends", async () => {
    expect(legends((await mount()).root)).toEqual(["Haunt", "Settings"]);
    expect(legends((await mount({ state: { restricted: true, url: "chrome://version" } })).root)).toEqual(["Why not", "Settings"]);
    expect(legends((await mount({ state: FULL })).root)).toEqual(["Found on this page", "Ghosts (1)", "Vampires (1)", "Tombstones (1)", "Curses (1)", "Settings"]);
    expect(legends((await mount({ state: { haunted: true } })).root)).toEqual(["Found on this page", "Nothing found", "Settings"]);
    const { root } = await mount();
    expect(root.querySelector(".surface")).toBeNull();
    expect(root.querySelector(".client")!.contains(root.querySelector("h1"))).toBe(true);
  });

  test("one Nothing found box comes first in the list, so its lines are on screen before any list scrolls", async () => {
    // Ghost and vampire found, no tombstones or curses: the empty lines lead, the lists follow.
    const some = await mount({ state: { ...FULL, tombstones: [], curses: [] } });
    expect(legends(some.root)).toEqual(["Found on this page", "Nothing found", "Ghosts (1)", "Vampires (1)", "Settings"]);
    // Only tombstones: the empty kinds on both sides of it share the one box, in kind order.
    const tombsOnly = await mount({ state: { ...FULL, ghosts: [], curses: [] } });
    expect(legends(tombsOnly.root)).toEqual(["Found on this page", "Nothing found", "Tombstones (1)", "Settings"]);
    expect([...tombsOnly.root.querySelectorAll(".found-none p")].map(text)).toEqual([
      "No ghosts here. Suspiciously clean.",
      "Trackers that load later will appear here.",
      "No vampires. Your blood is safe.",
      "No curses. This page plays fair.",
    ]);
    expect(tombsOnly.root.querySelector(".list > .found-none")).toBe(tombsOnly.root.querySelector(".list")!.firstElementChild);
  });

  test("idle screen has one primary push button labelled Haunt this page", async () => {
    const { root } = await mount();
    expect([...root.querySelectorAll("button.primary")].map(text)).toEqual(["Haunt this page"]);
    expect(root.querySelector(".pill")).toBeNull();
  });

  test("haunted screen has one primary push button labelled Un-haunt", async () => {
    const { root } = await mount({ state: FULL });
    expect([...root.querySelectorAll("button.primary")].map(text)).toEqual(["Un-haunt"]);
  });

  test("restricted screen has no primary push button", async () => {
    const { root } = await mount({ state: { restricted: true, url: "chrome://version" } });
    expect(root.querySelectorAll("button.primary")).toHaveLength(0);
    expect(root.querySelectorAll("button")).toHaveLength(0);
  });

  test("counts render as hit-counter cells with a 16px sprite and a label", async () => {
    const { root } = await mount({ state: FULL });
    const cells = [...root.querySelectorAll<HTMLElement>("[data-count]")];
    expect(cells.map((c) => [...c.children].map((k) => k.getAttribute("class")))).toEqual(Array(4).fill(["num", "tile-sprite", "label"]));
    for (const c of cells) expect(c.querySelector("svg")!.getAttribute("width")).toBe("16");
    // Hit-counter zeros pad each count to four digits, outside the text a screen reader reads.
    expect(cells.map((c) => [text(c.querySelector(".num")), c.querySelector<HTMLElement>(".num")!.dataset.pad])).toEqual([
      ["1", "000"],
      ["1", "000"],
      ["1", "000"],
      ["1", "000"],
    ]);
    expect(css).toMatch(/\.num::before \{[^}]*content: attr\(data-pad\) \/ "";/);
  });

  test("ghost, vampire, tombstone and curse lists sit in a sunken list box", async () => {
    const { root } = await mount({ state: FULL });
    const boxes = [...root.querySelectorAll("ul.rows")];
    expect(boxes).toHaveLength(4);
    for (const b of boxes) {
      expect(b.classList.contains("listbox")).toBe(true);
      expect(b.parentElement!.matches("fieldset.group")).toBe(true);
    }
    expect(boxes.map((b) => [...b.children].map((r) => r.classList[0]))).toEqual([["ghost-row"], ["ghost-row"], ["ghost-row"], ["ghost-row"]]);
    expect([...root.querySelectorAll(".ghost-row button")].every((b) => b.classList.contains("btn"))).toBe(true);
  });

  test("settings controls are checkboxes that keep their toggle behaviour", async () => {
    const { root, m } = await mount();
    const boxes = [...root.querySelectorAll<HTMLInputElement>("fieldset.settings input")];
    expect(boxes.map((b) => [b.type, b.className])).toEqual([
      ["checkbox", "check"],
      ["checkbox", "check"],
    ]);
    // A Win95 checkbox sits to the left of its label.
    for (const b of boxes) expect(b.compareDocumentPosition(root.querySelector(`label[for="${b.id}"]`)!) & 4).toBeTruthy();
    expect(boxes.map((b) => b.checked)).toEqual([false, false]);
    await toggle(switchNamed(root, "Sound effects"));
    expect(m.chrome.storage.local.data[AUDIO_KEY]).toBe(true);
    await toggle(switchNamed(root, "Check links to other sites"));
    expect(m.calls.createTab).toHaveLength(1);
    expect(css).toMatch(/\.check \{[^}]*width: 13px;[^}]*height: 13px;/);
    expect(css).toMatch(/\.check:checked::before \{[^}]*box-shadow:/);
  });

  test("status bar shows the state and the attribution line", async () => {
    for (const [state, label] of [
      [{}, "Idle"],
      [{ haunted: true }, "Haunted"],
      [{ restricted: true, url: "chrome://version" }, "Can't haunt"],
    ] as const) {
      const { root } = await mount({ state });
      const bar = root.lastElementChild!;
      expect(bar.matches("footer.statusbar")).toBe(true);
      expect(text(bar.querySelector("[data-status]"))).toBe(label);
      expect(text(bar.querySelector(".attribution"))).toBe(ATTRIBUTION);
      expect(root.querySelectorAll("[data-status]")).toHaveLength(1);
    }
  });

  test("popup is 360px wide and at most 600px tall", () => {
    const html = readFileSync(join(SRC, "popup.html"), "utf8");
    expect(html).toContain('<body class="popup">');
    expect(html).toContain('<main id="app" class="window">');
    expect(css).toMatch(/body\.popup \{[^}]*width: 360px;[^}]*max-height: 600px;/);
    expect(css).toMatch(/body\.popup #app \{[^}]*max-height: 600px;/);
    expect(css).toMatch(/\.client \{[^}]*overflow-y: auto;/);
  });

  test("prefers-reduced-motion disables popup motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{ transition: none !important; animation: none !important; \} \}/);
    expect(css).not.toMatch(/transition: (?!none)/);
  });
});
