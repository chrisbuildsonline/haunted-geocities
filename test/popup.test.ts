import { describe, expect, test } from "bun:test";
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
  let state: TabState = { haunted: false, restricted: false, url: "https://example.org/a", ...opts.state };
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
  test("idle: hostname title, Idle pill, one Haunt button, settings, attribution", async () => {
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

  test("haunted: Haunted pill, four zero tiles, empty list text, one Un-haunt button", async () => {
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

  test("restricted: protected title, Can't haunt pill, no button", async () => {
    const { root } = await mount({ state: { restricted: true, url: "chrome://version" } });
    expect(root.dataset.screen).toBe("restricted");
    expect(text(root.querySelector("h1"))).toBe("This page is protected");
    expect(text(root.querySelector('[data-status]'))).toBe("Can't haunt");
    expect(buttons(root)).toHaveLength(0);
    expect(text(root)).toContain("Chrome doesn't let extensions draw on its own pages. Open any website and press Haunt there.");
    expect(text(root)).toContain(ATTRIBUTION);
  });

  test("the ghost mark is an inline 24px SVG hidden from assistive tech", async () => {
    const { root } = await mount();
    const svg = root.querySelector("header svg")!;
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
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
  test("turning on requests the http/https origins; granted stays on", async () => {
    const { root, m } = await mount({ grant: true });
    const sw = switchNamed(root, "Check links to other sites");
    await toggle(sw);
    expect(m.calls.request).toEqual([{ origins: ["http://*/*", "https://*/*"] }]);
    expect(sw.checked).toBe(true);
    expect(description(root, sw)).toBe("Checking links on other sites too.");
  });
  test("denied springs back and says so", async () => {
    const { root, m } = await mount({ grant: false });
    const sw = switchNamed(root, "Check links to other sites");
    await toggle(sw);
    expect(m.calls.request).toHaveLength(1);
    expect(sw.checked).toBe(false);
    expect(description(root, sw)).toBe("Permission not granted.");
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
