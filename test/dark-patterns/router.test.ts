import { describe, expect, test } from "bun:test";
import { createBackground } from "../../src/background/router";
import { cursesKey, DARK_PATTERN_KINDS, hauntKey, type ContentRequest, type Curse, type TabState } from "../../src/data/types";
import { asChrome, createChromeMock } from "../chrome-mock";

const WEB = { id: 7, url: "https://example.org/page", active: true };
const content = { id: "test-extension-id", tab: { id: 7 }, url: "https://example.org/page" } as chrome.runtime.MessageSender;
const CURSE: Curse = { kind: "scarcity", snippet: "Only 2 left in stock!" };

const setup = (o: { haunted?: boolean } = {}) => {
  const m = createChromeMock({ tabs: [WEB] });
  const bg = createBackground(asChrome(m));
  if (o.haunted ?? true) m.chrome.storage.session.data[hauntKey(7)] = true;
  return { m, bg };
};

describe("types and keys", () => {
  test("DARK_PATTERN_KINDS lists the five kinds", () => {
    expect([...DARK_PATTERN_KINDS]).toEqual(["scarcity", "countdown", "timer", "confirmshaming", "prechecked"]);
  });
  test("ContentRequest has a CURSE_UPDATE variant", () => {
    const msg: ContentRequest = { type: "CURSE_UPDATE", curses: [CURSE] };
    expect(msg.type).toBe("CURSE_UPDATE");
  });
  test("cursesKey is curses:<tabId>", () => {
    expect(cursesKey(7)).toBe("curses:7");
  });
  test("TabState has a curses field", () => {
    const state: TabState = { haunted: false, restricted: false, url: null, ghosts: [], exorcised: [], tombstones: [], curses: [CURSE] };
    expect(state.curses).toEqual([CURSE]);
  });
});

describe("CURSE_UPDATE", () => {
  test("CURSE_UPDATE takes the tab from sender.tab.id, not from the body", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "CURSE_UPDATE", curses: [CURSE], tabId: 99 } as any, content);
    expect(m.chrome.storage.session.data[cursesKey(7)]).toEqual([CURSE]);
    expect(cursesKey(99) in m.chrome.storage.session.data).toBe(false);
  });
  test("CURSE_UPDATE from a haunted tab is stored under curses:<tabId>", async () => {
    const { m, bg } = setup();
    const state = await bg.handle({ type: "CURSE_UPDATE", curses: [CURSE] }, content);
    expect(m.chrome.storage.session.data[cursesKey(7)]).toEqual([CURSE]);
    expect(state.curses).toEqual([CURSE]);
  });
  test("CURSE_UPDATE from a tab that is not haunted is dropped", async () => {
    const { m, bg } = setup({ haunted: false });
    await bg.handle({ type: "CURSE_UPDATE", curses: [CURSE] }, content);
    expect(cursesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
  test("entries with an unknown kind or a non-string snippet are dropped", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "CURSE_UPDATE", curses: [CURSE, { kind: "nope", snippet: "x" }, { kind: "timer", snippet: 5 }, null, "x", { kind: "timer" }] } as any, content);
    expect(m.chrome.storage.session.data[cursesKey(7)]).toEqual([CURSE]);
  });
  test("extra fields are stripped", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "CURSE_UPDATE", curses: [{ ...CURSE, evil: 1 }] } as any, content);
    expect(m.chrome.storage.session.data[cursesKey(7)]).toEqual([CURSE]);
  });
  test("snippets are cut to 60 characters and the list to 30", async () => {
    const { m, bg } = setup();
    const many = Array.from({ length: 40 }, (_, i) => ({ kind: "timer", snippet: "x".repeat(100) + i }));
    await bg.handle({ type: "CURSE_UPDATE", curses: many } as any, content);
    const stored = m.chrome.storage.session.data[cursesKey(7)] as Curse[];
    expect(stored).toHaveLength(30);
    expect(stored.every((c) => c.snippet.length === 60)).toBe(true);
  });
  test("a non-array curses field is ignored", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "CURSE_UPDATE", curses: "Only 2 left" } as any, content);
    expect(cursesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
});

describe("curses in state", () => {
  test("getState returns the stored curses", async () => {
    const { m, bg } = setup();
    m.chrome.storage.session.data[cursesKey(7)] = [CURSE];
    expect((await bg.getState(7)).curses).toEqual([CURSE]);
  });
  test("getState returns [] when nothing is stored", async () => {
    expect((await setup().bg.getState(7)).curses).toEqual([]);
  });
  test("every answer includes curses, including the error answer", async () => {
    const { m, bg } = setup();
    bg.register();
    const listener = m.chrome.runtime.onMessage.listeners[0]!;
    let answer: any;
    listener({ type: "GET_STATE", tabId: 7 }, { id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html" }, (a: unknown) => (answer = a));
    await new Promise((r) => setTimeout(r, 0));
    expect(answer.curses).toEqual([]);
    // tab 55 does not exist: getState throws, so the error answer is sent
    listener({ type: "GET_STATE", tabId: 55 }, { id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html" }, (a: unknown) => (answer = a));
    await new Promise((r) => setTimeout(r, 0));
    expect(answer.error).toBeString();
    expect(answer.curses).toEqual([]);
  });
  test("UNHAUNT removes curses:<tabId>", async () => {
    const { m, bg } = setup();
    m.chrome.storage.session.data[cursesKey(7)] = [CURSE];
    await bg.handle({ type: "UNHAUNT", tabId: 7 }, { id: "test-extension-id" });
    expect(cursesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
  test("tab close removes curses:<tabId>", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[cursesKey(7)] = [CURSE];
    await m.chrome.tabs.onRemoved.listeners[0]!(7);
    expect(cursesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
  test("navigation removes curses:<tabId>", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[cursesKey(7)] = [CURSE];
    m.contentReply = () => {
      throw new Error("Receiving end does not exist.");
    };
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, WEB);
    expect(cursesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
});
