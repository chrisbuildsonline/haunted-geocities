// Where sounds play: the popup's Haunt click (whoosh) and the click that opens each kind of card
// (ghost, organ, thud, sting). Nothing plays on a close, a re-click, a marker appearing, hover, focus,
// the haunt moment or un-haunt, and the MAIN-world hooks never import the sound module.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Window } from "happy-dom";
import { mountPopup } from "../../src/popup/app";
import { closeCard, openCard, openCurseCard, openTombstoneCard } from "../../src/content/costume/card";
import { addTombstones, leaveCostume, renderCostume } from "../../src/content/costume/render";
import { AUDIO_KEY, type CompanyHit, type DeadLink, type TabState } from "../../src/data/types";
import type { SoundKind } from "../../src/audio/sound";
import { asChrome, createChromeMock } from "../chrome-mock";
import { FakeAudioContext } from "./fake-audio";

const root = join(import.meta.dir, "..", "..");
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};
const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

// ---------- popup ----------

async function popup(opts: { state?: Partial<TabState>; play?: boolean; haunt?: "ok" | "error" } = {}) {
  const win = new Window({ url: "chrome-extension://test/popup.html" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const el = doc.createElement("div");
  doc.body.appendChild(el);
  const m = createChromeMock({ tabs: [{ id: 5, url: "https://example.org/a", active: true }] });
  let state: TabState = { haunted: false, restricted: false, url: "https://example.org/a", ghosts: [], exorcised: [], tombstones: [], curses: [], ...opts.state };
  const log: string[] = [];
  let release = () => {};
  m.backgroundReply = async (msg: { type: string }) => {
    if (msg.type === "HAUNT") {
      log.push("HAUNT sent");
      await new Promise<void>((r) => (release = r));
      log.push("HAUNT replied");
      state = opts.haunt === "error" ? { ...state, error: "inject failed" } : { ...state, haunted: true };
    }
    if (msg.type === "UNHAUNT") state = { ...state, haunted: false };
    return state;
  };
  const played: SoundKind[] = [];
  const play = (k: SoundKind) => {
    played.push(k);
    log.push(`play ${k}`);
  };
  await mountPopup(el, asChrome(m), "", opts.play === false ? undefined : { play });
  await flush();
  const pill = () => el.querySelector<HTMLButtonElement>(".primary");
  return { el, m, played, log, pill, release: () => release() };
}

describe("popup whoosh", () => {
  test("mountPopup works with three arguments", async () => {
    const { pill, release, el } = await popup({ play: false });
    pill()!.click();
    await flush();
    release();
    await flush();
    expect(el.dataset.screen).toBe("haunted");
  });

  test("first render plays nothing", async () => {
    const { played } = await popup();
    expect(played).toEqual([]);
  });

  test("Haunt click plays whoosh once, before the HAUNT reply", async () => {
    const { pill, played, log, release } = await popup();
    pill()!.click();
    expect(played).toEqual(["whoosh"]); // in the click's own task
    await flush();
    expect(log).toEqual(["play whoosh", "HAUNT sent"]);
    release();
    await flush();
    expect(log).toEqual(["play whoosh", "HAUNT sent", "HAUNT replied"]);
    expect(played).toEqual(["whoosh"]);
  });

  test("the HAUNT message is sent exactly as before", async () => {
    const { pill, m, release, el } = await popup();
    pill()!.click();
    await flush();
    release();
    await flush();
    expect(m.calls.runtimeMessages.filter((x: any) => x.type !== "GET_STATE")).toEqual([{ type: "HAUNT", tabId: 5 }]);
    expect(el.dataset.screen).toBe("haunted");
  });

  test("a failed haunt still shows the error line", async () => {
    const { pill, release, el } = await popup({ haunt: "error" });
    pill()!.click();
    await flush();
    release();
    await flush();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  test("Un-haunt plays nothing", async () => {
    const { pill, played } = await popup({ state: { haunted: true } });
    pill()!.click();
    await flush();
    expect(played).toEqual([]);
  });

  test("the restricted screen plays nothing", async () => {
    const { el, played } = await popup({ state: { restricted: true, url: "chrome://settings" } });
    for (const b of el.querySelectorAll("button")) b.click();
    await flush();
    expect(played).toEqual([]);
  });
});

// ---------- card openers ----------

function page() {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  const doc = win.document as unknown as Document;
  (win.Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {} });
  const cards = doc.createElement("div");
  const a = doc.createElement("button");
  const b = doc.createElement("button");
  doc.body.append(a, b, cards);
  const played: SoundKind[] = [];
  const play = (k: SoundKind) => void played.push(k);
  return { doc, cards, a, b, played, play };
}
const bounds = { top: 48, bottom: 740 };
const GHOST: CompanyHit = { company: "Criteo", domains: ["criteo.com"], count: 3, categories: ["Advertising"], fingerprinting: 0 };
const VAMPIRE: CompanyHit = { ...GHOST, company: "AdTheorent", vampire: { caught: ["canvas"], knownOnly: false } };
const KNOWN: CompanyHit = { ...GHOST, company: "Known", vampire: { caught: [], knownOnly: true } };
const DEAD: DeadLink = { url: "https://haunt.example/missing.html", path: "/missing.html", status: 404 };

describe("card sounds", () => {
  test("opening a ghost card plays ghost", () => {
    const { cards, a, played, play } = page();
    openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play });
    expect(played).toEqual(["ghost"]);
  });

  test("opening a vampire card plays organ, caught or known", () => {
    const { cards, a, b, played, play } = page();
    openCard(cards, VAMPIRE, a, { exorcised: false, send: () => {}, bounds, play });
    openCard(cards, KNOWN, b, { exorcised: false, send: () => {}, bounds, play });
    expect(played).toEqual(["organ", "organ"]);
  });

  test("opening a tombstone card plays thud", () => {
    const { cards, a, played, play } = page();
    openTombstoneCard(cards, DEAD, a, { bounds, play });
    expect(played).toEqual(["thud"]);
  });

  test("opening a curse card plays sting", () => {
    const { cards, a, played, play } = page();
    openCurseCard(cards, { kind: "scarcity", snippet: "Only 2 left" }, a, { bounds, play });
    expect(played).toEqual(["sting"]);
  });

  test("closing a card plays nothing", () => {
    const { cards, a, played, play } = page();
    const card = openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play });
    played.length = 0;
    card.querySelector<HTMLButtonElement>(".close")!.click();
    closeCard(cards);
    expect(played).toEqual([]);
  });

  test("re-clicking an open card plays nothing", () => {
    const { cards, a, b, played, play } = page();
    openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play });
    openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play });
    openTombstoneCard(cards, DEAD, b, { bounds, play });
    openTombstoneCard(cards, DEAD, b, { bounds, play });
    openCurseCard(cards, { kind: "countdown", snippet: "Ends soon" }, a, { bounds, play });
    openCurseCard(cards, { kind: "countdown", snippet: "Ends soon" }, a, { bounds, play });
    expect(played).toEqual(["ghost", "thud", "sting"]);
    // a card whose opener is another marker does play
    openCard(cards, VAMPIRE, b, { exorcised: false, send: () => {}, bounds, play });
    expect(played).toEqual(["ghost", "thud", "sting", "organ"]);
  });

  test("a card closed then opened again plays again", () => {
    const { cards, a, played, play } = page();
    openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play });
    closeCard(cards);
    openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play });
    expect(played).toEqual(["ghost", "ghost"]);
  });

  test("reduced motion plays the same sounds", () => {
    const { cards, a, b, played, play } = page();
    openCard(cards, GHOST, a, { exorcised: false, send: () => {}, bounds, play, reduced: true });
    openTombstoneCard(cards, DEAD, b, { bounds, play, reduced: true });
    openCurseCard(cards, { kind: "timer", snippet: "09:59" }, a, { bounds, play, reduced: true });
    openCard(cards, VAMPIRE, b, { exorcised: false, send: () => {}, bounds, play, reduced: true });
    expect(played).toEqual(["ghost", "thud", "sting", "organ"]);
  });
});

// ---------- the costume's player ----------

const SHOP = `<!doctype html><html><head><title>t</title></head><body><main>
<p id="s">Only 2 left in stock</p>
<p><a href="/missing.html">an old page</a></p>
</main></body></html>`;

const g = globalThis as Record<string, unknown>;
const saved = { chrome: g.chrome, fetch: g.fetch, AudioContext: g.AudioContext };

describe("the costume's player", () => {
  let m: ReturnType<typeof createChromeMock>;
  beforeEach(() => {
    FakeAudioContext.reset();
    m = createChromeMock();
    g.chrome = { runtime: { id: "x", sendMessage: async () => undefined }, storage: m.chrome.storage };
    g.fetch = async () => ({ status: 200, type: "basic" });
    g.AudioContext = FakeAudioContext;
  });
  afterEach(() => {
    Object.assign(g, saved);
    FakeAudioContext.reset();
  });

  function shop(reduced = false) {
    const win = new Window({ url: "https://shop.test/", width: 1280, height: 800 });
    windows.push(win);
    win.document.write(SHOP);
    const w = win as any;
    w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {} });
    w.matchMedia = (q: string) => ({ media: q, matches: reduced && q.includes("reduced"), addEventListener() {}, removeEventListener() {} });
    return win.document as unknown as Document;
  }
  const on = (v: boolean) => {
    m.chrome.storage.local.data[AUDIO_KEY] = v;
    for (const l of [...m.chrome.storage.onChanged.listeners]) l({ [AUDIO_KEY]: { newValue: v } }, "local");
  };
  const badge = (root: ShadowRoot) => root.querySelector<HTMLButtonElement>("#markers .curse-badge")!;
  const stone = (root: ShadowRoot) => root.querySelector<HTMLButtonElement>("#markers .tomb-marker")!;
  const types = () => FakeAudioContext.instances.flatMap((c) => c.sources.map((s) => s.type || s.kind));

  test("the haunt moment, new markers, hover and focus play nothing", async () => {
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const doc = shop();
    const root = renderCostume(doc);
    await flush();
    addTombstones([{ url: "https://shop.test/missing.html", path: "/missing.html", status: 404 }], doc);
    await flush();
    expect(badge(root)).not.toBeNull(); // a new curse badge appeared
    expect(stone(root)).not.toBeNull(); // a new tombstone marker appeared
    const win = doc.defaultView as any;
    for (const el of [badge(root), stone(root)]) {
      for (const type of ["mouseover", "mouseenter", "pointerover", "focus", "focusin"]) el.dispatchEvent(new win.Event(type, { bubbles: true }));
      el.focus();
    }
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  test("with sound off, opening cards constructs no context", async () => {
    const doc = shop();
    const root = renderCostume(doc);
    await flush();
    addTombstones([{ url: "https://shop.test/missing.html", path: "/missing.html", status: 404 }], doc);
    badge(root).click();
    stone(root).click();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  test("with sound on, a curse badge plays sting and a tombstone plays thud, in one context", async () => {
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const doc = shop();
    const root = renderCostume(doc);
    await flush();
    addTombstones([{ url: "https://shop.test/missing.html", path: "/missing.html", status: 404 }], doc);
    badge(root).click();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(types().filter((t) => t === "sawtooth")).toHaveLength(2); // sting
    stone(root).click();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(types()).toContain("bufferSource"); // thud's knock
    // re-clicking the open stone adds nothing
    const n = types().length;
    stone(root).click();
    expect(types().length).toBe(n);
  });

  test("the live toggle reaches the costume's player", async () => {
    const doc = shop();
    const root = renderCostume(doc);
    await flush();
    on(true);
    badge(root).click();
    expect(FakeAudioContext.instances).toHaveLength(1);
    on(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(FakeAudioContext.instances[0]!.closes).toBe(1);
  });

  test("un-haunt disposes the player and each haunt makes a new player", async () => {
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const doc = shop();
    let root = renderCostume(doc);
    await flush();
    expect(m.chrome.storage.onChanged.listeners).toHaveLength(1);
    badge(root).click();
    expect(FakeAudioContext.instances).toHaveLength(1);
    await leaveCostume(doc);
    await new Promise((r) => setTimeout(r, 60));
    expect(m.chrome.storage.onChanged.listeners).toHaveLength(0);
    expect(FakeAudioContext.instances[0]!.closes).toBe(1);
    expect(FakeAudioContext.instances).toHaveLength(1); // un-haunt plays nothing

    root = renderCostume(doc);
    await flush();
    expect(m.chrome.storage.onChanged.listeners).toHaveLength(1);
    badge(root).click();
    expect(FakeAudioContext.instances).toHaveLength(2);
  });

  test("reduced motion: the same card plays the same sound", async () => {
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const doc = shop(true);
    const root = renderCostume(doc);
    await flush();
    badge(root).click();
    expect(types().filter((t) => t === "sawtooth")).toHaveLength(2);
  });
});

// ---------- the MAIN world ----------

/** Every file a module imports, followed through relative imports. */
function importsOf(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  for (const [, spec] of src.matchAll(/^\s*import\s[^"']*["']([^"']+)["']/gm)) {
    if (!spec!.startsWith(".")) continue;
    let target = resolve(dirname(file), spec!);
    if (!/\.\w+$/.test(target)) target += ".ts";
    if (target.endsWith(".ts")) importsOf(target, seen);
  }
  return seen;
}

describe("MAIN world", () => {
  test("the MAIN-world hooks do not import the sound module", () => {
    const files = importsOf(join(root, "src", "content", "hooks.ts"));
    expect([...files].filter((f) => f.includes(`${join("src", "audio")}`))).toEqual([]);
    for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/AudioContext\(|createPlayer|audio\/sound/);
  });

  test("the sound module is imported by the popup and the costume only", () => {
    const users = ["src/popup/popup.ts", "src/content/costume/render.ts"];
    for (const u of users) expect(readFileSync(join(root, u), "utf8")).toContain("audio/sound");
    for (const f of ["src/content/hooks.ts", "src/content/hooks-bridge.ts", "src/content/index.ts", "src/background/router.ts", "src/manifest.ts"]) {
      expect({ f, imports: readFileSync(join(root, f), "utf8").includes("audio/sound") }).toEqual({ f, imports: false });
    }
  });
});
