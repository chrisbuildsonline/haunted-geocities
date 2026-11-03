import { describe, expect, test } from "bun:test";
import { createBackground } from "../../src/background/router";
import { hauntKey, LINK_CHECK_ORIGINS, tombstonesKey, type DeadLink } from "../../src/data/types";
import { asChrome, createChromeMock } from "../chrome-mock";

const WEB = { id: 7, url: "https://example.org/page", active: true };
const content = { id: "test-extension-id", tab: { id: 7 }, url: "https://example.org/page" } as chrome.runtime.MessageSender;
const popupTab = { id: "test-extension-id", tab: { id: 7 }, url: "chrome-extension://test-extension-id/popup.html" } as chrome.runtime.MessageSender;
const DEAD: DeadLink = { url: "https://a.test/gone", path: "/gone", status: 410 };

/** A fetch that answers 404 for paths containing "missing", 200 otherwise, recording the URLs asked. */
const setup = (o: { haunted?: boolean; granted?: boolean } = {}) => {
  const m = createChromeMock({ tabs: [WEB] });
  const asked: string[] = [];
  const fetchFn = (async (url: string) => {
    asked.push(url);
    return { status: url.includes("missing") ? 404 : 200, type: "basic" } as Response;
  }) as unknown as typeof fetch;
  const bg = createBackground(asChrome(m), undefined, fetchFn);
  if (o.haunted ?? true) m.chrome.storage.session.data[hauntKey(7)] = true;
  if (o.granted ?? true) for (const origin of LINK_CHECK_ORIGINS) m.granted.add(origin);
  const tombstones = () => m.calls.sendMessage.filter((c: any) => c.msg.type === "tombstones") as { tabId: number; msg: { type: string; dead: DeadLink[] } }[];
  return { m, bg, asked, tombstones };
};

describe("tombstone state (requirements 23-27)", () => {
  test("req 24: tombstonesKey is tombstones:<tabId>", () => {
    expect(tombstonesKey(7)).toBe("tombstones:7");
  });
  test("req 23-24, 26-27: TOMBSTONE_UPDATE is stored under the sender's tab and returned by getState", async () => {
    const { m, bg } = setup();
    const state = await bg.handle({ type: "TOMBSTONE_UPDATE", dead: [DEAD] }, content);
    expect(m.chrome.storage.session.data[tombstonesKey(7)]).toEqual([DEAD]);
    expect(state.tombstones).toEqual([DEAD]);
    expect((await bg.getState(7)).tombstones).toEqual([DEAD]);
  });
  test("req 26: tombstones default to []", async () => {
    expect((await setup().bg.getState(7)).tombstones).toEqual([]);
  });
  test("req 23: junk entries are dropped and the tab comes from the sender, not the message", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "TOMBSTONE_UPDATE", dead: [DEAD, { url: 1 }, { url: "x", path: "/x", status: 200 }, null], tabId: 99 } as any, content);
    expect(m.chrome.storage.session.data[tombstonesKey(7)]).toEqual([DEAD]);
    expect(tombstonesKey(99) in m.chrome.storage.session.data).toBe(false);
  });
  test("req 25: Un-haunt clears the tombstones", async () => {
    const { m, bg } = setup();
    m.chrome.storage.session.data[tombstonesKey(7)] = [DEAD];
    await bg.handle({ type: "UNHAUNT", tabId: 7 }, { id: "test-extension-id" });
    expect(tombstonesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
  test("req 25: a navigation (content script gone) clears the tombstones; same document keeps them", async () => {
    const { m, bg } = setup();
    bg.register();
    m.chrome.storage.session.data[tombstonesKey(7)] = [DEAD];
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, WEB);
    expect(tombstonesKey(7) in m.chrome.storage.session.data).toBe(true);
    m.contentReply = () => {
      throw new Error("Receiving end does not exist.");
    };
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, WEB);
    expect(tombstonesKey(7) in m.chrome.storage.session.data).toBe(false);
  });
});

describe("CHECK_LINKS (requirements 14-21, 66)", () => {
  test("req 16, 21: from a haunted tab with the permission, dead links go back to that tab", async () => {
    const { bg, asked, tombstones } = setup();
    await bg.handle({ type: "CHECK_LINKS", urls: ["https://a.test/ok", "https://a.test/missing"] }, content);
    expect(asked).toEqual(["https://a.test/ok", "https://a.test/missing"]);
    expect(tombstones()).toEqual([{ tabId: 7, msg: { type: "tombstones", dead: [{ url: "https://a.test/missing", path: "/missing", status: 404 }] } }]);
  });
  test("req 16, 66: refused when the tab is not haunted", async () => {
    const { bg, asked, tombstones } = setup({ haunted: false });
    await bg.handle({ type: "CHECK_LINKS", urls: ["https://a.test/missing"] }, content);
    expect(asked).toEqual([]);
    expect(tombstones()).toEqual([]);
  });
  test("req 17, 66: refused when the optional permission is missing", async () => {
    const { bg, asked, tombstones } = setup({ granted: false });
    await bg.handle({ type: "CHECK_LINKS", urls: ["https://a.test/missing"] }, content);
    expect(asked).toEqual([]);
    expect(tombstones()).toEqual([]);
  });
  test("req 16: refused from an extension page, even one that is a tab", async () => {
    const { bg, asked } = setup();
    await bg.handle({ type: "CHECK_LINKS", urls: ["https://a.test/missing"] }, popupTab);
    await bg.handle({ type: "CHECK_LINKS", urls: ["https://a.test/missing"], tabId: 7 } as any, { id: "test-extension-id" }).catch(() => undefined);
    expect(asked).toEqual([]);
  });
  test("req 19: refused hosts and non-http(s) schemes are dropped before any fetch", async () => {
    const { bg, asked } = setup();
    const urls = ["http://localhost/missing", "http://192.168.1.1/missing", "http://[::1]/missing", "ftp://a.test/missing", "file:///etc/passwd", "not a url", "https://ok.test/missing"];
    await bg.handle({ type: "CHECK_LINKS", urls }, content);
    expect(asked).toEqual(["https://ok.test/missing"]);
  });
  test("req 15: capped at 30 URLs", async () => {
    const { bg, asked } = setup();
    await bg.handle({ type: "CHECK_LINKS", urls: Array.from({ length: 45 }, (_, i) => `https://a.test/${i}`) }, content);
    expect(asked).toHaveLength(30);
  });
  test("req 15: junk in urls is ignored", async () => {
    const { bg, asked } = setup();
    await bg.handle({ type: "CHECK_LINKS", urls: "https://a.test/missing" } as any, content);
    await bg.handle({ type: "CHECK_LINKS", urls: [1, null, "https://a.test/missing"] } as any, content);
    expect(asked).toEqual(["https://a.test/missing"]);
  });
  test("req 21: nothing dead, nothing sent", async () => {
    const { bg, tombstones } = setup();
    await bg.handle({ type: "CHECK_LINKS", urls: ["https://a.test/ok"] }, content);
    expect(tombstones()).toEqual([]);
  });
});
