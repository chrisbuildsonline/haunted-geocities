import { describe, expect, test } from "bun:test";
import { createBackground } from "../src/background/router";
import { hauntKey } from "../src/data/types";
import { asChrome, createChromeMock } from "./chrome-mock";

const WEB = { id: 7, url: "https://example.org/page", active: true };
const CHROME_PAGE = { id: 8, url: "chrome://settings" };
const self = { id: "test-extension-id" };

const setup = (opts: Parameters<typeof createChromeMock>[0] = { tabs: [WEB, CHROME_PAGE] }) => {
  const m = createChromeMock(opts);
  const bg = createBackground(asChrome(m));
  return { m, bg };
};

describe("storage keys", () => {
  test("haunted state is keyed haunt:<tabId>", () => {
    expect(hauntKey(7)).toBe("haunt:7");
    expect(hauntKey(1234567)).toBe("haunt:1234567");
  });
});

describe("GET_STATE", () => {
  test("a fresh web tab is idle and not restricted", async () => {
    const { bg } = setup();
    expect(await bg.handle({ type: "GET_STATE", tabId: 7 }, self)).toEqual({
      haunted: false,
      restricted: false,
      url: "https://example.org/page",
      ghosts: [],
      exorcised: [],
    });
  });
  test("a chrome:// tab is restricted", async () => {
    const { bg } = setup();
    expect(await bg.handle({ type: "GET_STATE", tabId: 8 }, self)).toEqual({
      haunted: false,
      restricted: true,
      url: "chrome://settings",
      ghosts: [],
      exorcised: [],
    });
  });
  test("reads haunted from storage.session", async () => {
    const { m, bg } = setup();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    expect((await bg.handle({ type: "GET_STATE", tabId: 7 }, self)).haunted).toBe(true);
  });
  test("file:// follows isAllowedFileSchemeAccess", async () => {
    const tab = { id: 9, url: "file:///tmp/a.html" };
    expect((await setup({ tabs: [tab], fileAccess: false }).bg.handle({ type: "GET_STATE", tabId: 9 }, self)).restricted).toBe(true);
    expect((await setup({ tabs: [tab], fileAccess: true }).bg.handle({ type: "GET_STATE", tabId: 9 }, self)).restricted).toBe(false);
  });
  test("a tab whose URL we cannot read is restricted", async () => {
    const { bg } = setup({ tabs: [{ id: 3 }] });
    expect(await bg.handle({ type: "GET_STATE", tabId: 3 }, self)).toEqual({ haunted: false, restricted: true, url: null, ghosts: [], exorcised: [] });
  });
});

describe("HAUNT", () => {
  test("injects content.js into the tab and marks it haunted", async () => {
    const { m, bg } = setup();
    const res = await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    expect(m.calls.executeScript[0]).toEqual({ target: { tabId: 7 }, files: ["content.js"] }); // then the MAIN-world hooks (test/vampire/background.test.ts)
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBe(true);
    expect(res).toEqual({ haunted: true, restricted: false, url: "https://example.org/page", ghosts: [], exorcised: [] });
  });
  test("refuses a restricted tab without injecting", async () => {
    const { m, bg } = setup();
    const res = await bg.handle({ type: "HAUNT", tabId: 8 }, self);
    expect(m.calls.executeScript).toEqual([]);
    expect(m.chrome.storage.session.data[hauntKey(8)]).toBeUndefined();
    expect(res.haunted).toBe(false);
    expect(res.restricted).toBe(true);
  });
  test("an injection failure leaves the tab idle and reports an error", async () => {
    const { m, bg } = setup();
    m.chrome.scripting.executeScript = async () => {
      throw new Error("Cannot access contents of the page.");
    };
    const res = await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    expect(res.haunted).toBe(false);
    expect(res.error).toBe("Cannot access contents of the page.");
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBeUndefined();
  });
});

describe("UNHAUNT", () => {
  test("tells the content script to unhaunt and clears the state", async () => {
    const { m, bg } = setup();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    const res = await bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(m.calls.sendMessage).toEqual([{ tabId: 7, msg: { type: "unhaunt" } }]);
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBeUndefined();
    expect(res.haunted).toBe(false);
  });
  test("clears the state even if the content script is gone", async () => {
    const { m, bg } = setup();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    m.contentReply = () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    };
    const res = await bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(res.haunted).toBe(false);
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBeUndefined();
  });
});

describe("router", () => {
  test("register() adds one runtime.onMessage listener and the tab listeners", () => {
    const { m, bg } = setup();
    bg.register();
    expect(m.chrome.runtime.onMessage.listeners).toHaveLength(1);
    expect(m.chrome.tabs.onRemoved.listeners).toHaveLength(1);
    expect(m.chrome.tabs.onUpdated.listeners).toHaveLength(1);
  });
  test("the listener answers asynchronously through sendResponse", async () => {
    const { m, bg } = setup();
    bg.register();
    const listener = m.chrome.runtime.onMessage.listeners[0]!;
    const reply = await new Promise((resolve) => {
      const keepOpen = listener({ type: "GET_STATE", tabId: 7 }, self, resolve);
      expect(keepOpen).toBe(true);
    });
    expect(reply).toEqual({ haunted: false, restricted: false, url: "https://example.org/page", ghosts: [], exorcised: [] });
  });
  test("ignores messages from other extensions and unknown types", () => {
    const { m, bg } = setup();
    bg.register();
    const listener = m.chrome.runtime.onMessage.listeners[0]!;
    let answered = false;
    expect(listener({ type: "GET_STATE", tabId: 7 }, { id: "someone-else" }, () => (answered = true))).toBe(false);
    expect(listener({ type: "NOPE" }, self, () => (answered = true))).toBe(false);
    expect(listener(null, self, () => (answered = true))).toBe(false);
    expect(answered).toBe(false);
  });
});

describe("tab lifecycle", () => {
  test("tabs.onRemoved deletes that tab's entry only", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    m.chrome.storage.session.data[hauntKey(8)] = true;
    await m.chrome.tabs.onRemoved.listeners[0]!(7, { windowId: 1, isWindowClosing: false });
    expect(m.chrome.storage.session.data).toEqual({ [hauntKey(8)]: true });
  });
  test("a navigation (status loading) clears the state because the overlay died with the page", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    m.contentReply = () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    };
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, WEB);
    expect(m.calls.sendMessage).toEqual([{ tabId: 7, msg: { type: "ping" } }]);
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBeUndefined();
  });
  test("a same-document navigation (loading, content script still there) keeps the state", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading", url: "https://example.org/pushed" }, WEB);
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBe(true);
  });
  test("a listener that answers nothing does not count as alive", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    m.contentReply = () => undefined;
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, WEB);
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBeUndefined();
  });
  test("other tab updates (title, complete) keep the state", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[hauntKey(7)] = true;
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { title: "x" }, WEB);
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "complete" }, WEB);
    expect(m.chrome.storage.session.data[hauntKey(7)]).toBe(true);
  });
});
