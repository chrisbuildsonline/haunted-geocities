// Site haunt (.kiro/specs/site-haunt): the same-site rule and the per-tab state machine
// (idle, haunted-page, haunted-site) in the background, with the chrome mock.
import { describe, expect, test } from "bun:test";
import { createBackground } from "../src/background/router";
import { onSite, siteOf, siteOrigins } from "../src/background/site-haunt";
import { COVER_MARKER, ghostsKey, hauntKey, LINK_CHECK_ORIGINS, nonceKey, QUIET_FLAG, siteKey } from "../src/data/types";
import { asChrome, createChromeMock } from "./chrome-mock";

describe("same-site rule", () => {
  test("siteOf lower-cases and strips one www", () => {
    expect(siteOf("https://WWW.NPS.gov/index.htm")).toBe("nps.gov");
    expect(siteOf("http://www.www.nps.gov/")).toBe("www.nps.gov");
    expect(siteOf("https://home.nps.gov:8443/a?b#c")).toBe("home.nps.gov");
    expect(siteOf("http://127.0.0.1:4321/index.html")).toBe("127.0.0.1");
  });
  test("siteOf is null for non-http URLs and garbage", () => {
    for (const u of ["ftp://nps.gov/", "chrome://settings", "file:///tmp/a.html", "about:blank", "not a url", "", null, undefined]) {
      expect(siteOf(u)).toBeNull();
    }
  });
  test("onSite accepts the site and its subdomains", () => {
    expect(onSite("https://nps.gov/", "nps.gov")).toBe(true);
    expect(onSite("https://www.nps.gov/subjects", "nps.gov")).toBe(true);
    expect(onSite("http://home.nps.gov/yell/index.htm", "nps.gov")).toBe(true);
    expect(onSite("https://a.b.nps.gov/", "nps.gov")).toBe(true);
  });
  test("onSite rejects evilnps.gov, nps.gov.evil.com and other schemes", () => {
    expect(onSite("https://evilnps.gov/", "nps.gov")).toBe(false);
    expect(onSite("https://nps.gov.evil.com/", "nps.gov")).toBe(false);
    expect(onSite("https://cdc.gov/", "nps.gov")).toBe(false);
    expect(onSite("ftp://nps.gov/", "nps.gov")).toBe(false);
    expect(onSite(undefined, "nps.gov")).toBe(false);
  });
  test("onSite is exact for an IP and for localhost, any port", () => {
    expect(onSite("http://127.0.0.1:4321/b.html", "127.0.0.1")).toBe(true);
    expect(onSite("http://localhost:4321/", "127.0.0.1")).toBe(false);
    expect(onSite("http://localhost:3000/", "localhost")).toBe(true);
    expect(onSite("http://1.127.0.0.1/", "127.0.0.1")).toBe(false);
  });
  test("siteOrigins gives four patterns, two for an IP or a dotless host", () => {
    expect(siteOrigins("nps.gov")).toEqual(["http://nps.gov/*", "https://nps.gov/*", "http://*.nps.gov/*", "https://*.nps.gov/*"]);
    expect(siteOrigins("127.0.0.1")).toEqual(["http://127.0.0.1/*", "https://127.0.0.1/*"]);
    expect(siteOrigins("localhost")).toEqual(["http://localhost/*", "https://localhost/*"]);
  });
  test("a www host with no dot after it keeps its www (www.com is not the site com)", () => {
    expect(siteOf("https://www.com/")).toBe("www.com");
    expect(onSite("https://www.com/a", "www.com")).toBe(true);
  });
  test("siteKey is site:<id>", () => {
    expect(siteKey(7)).toBe("site:7");
  });
});

const NPS = { id: 7, url: "https://www.nps.gov/index.htm", active: true };
const OTHER = { id: 8, url: "https://www.nps.gov/subjects/" };
const self = { id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html" } as chrome.runtime.MessageSender;
const ORIGINS = siteOrigins("nps.gov");
const gone = () => {
  throw new Error("Could not establish connection. Receiving end does not exist.");
};

function setup() {
  const m = createChromeMock({ tabs: [NPS, OTHER].map((t) => ({ ...t })) });
  const bg = createBackground(asChrome(m));
  bg.register();
  const data = m.chrome.storage.session.data;
  const grant = (origins = ORIGINS) => origins.forEach((o) => m.granted.add(o));
  /** Haunt tab 7 through the router, as the popup's HAUNT does. */
  const haunt = () => bg.handle({ type: "HAUNT", tabId: 7 }, self);
  const follow = () => bg.handle({ type: "FOLLOW_SITE", tabId: 7 }, self);
  /** A new document in tab 7 at `url`: the old content script is gone. */
  const navigate = async (url: string, status = "loading") => {
    m.tabsById.get(7)!.url = url;
    m.contentReply = (msg: any) => (msg?.type === "ping" ? gone() : undefined);
    for (const l of m.chrome.tabs.onUpdated.listeners) await l(7, { status, url }, { ...m.tabsById.get(7) });
  };
  const injected = () =>
    (m.calls.executeScript as any[]).map((i) => (i.files ? i.files[0] : i.world === "MAIN" ? "hooks" : i.args?.[0] === QUIET_FLAG ? "quiet" : i.args?.[0] === COVER_MARKER ? "marker" : "func"));
  return { m, bg, data, grant, haunt, follow, navigate, injected };
}

describe("FOLLOW_SITE", () => {
  test("stores the site of a haunted tab when the origins are granted", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    const state = await t.follow();
    expect(t.data[siteKey(7)]).toBe("nps.gov");
    expect(state.site).toBe("nps.gov");
  });
  test("on an un-haunted tab stores nothing", async () => {
    const t = setup();
    t.grant();
    await t.follow();
    expect(t.data[siteKey(7)]).toBeUndefined();
  });
  test("without the grant (declined) stores nothing: one-page haunt", async () => {
    const t = setup();
    await t.haunt();
    expect((await t.follow()).site).toBeUndefined();
    expect(t.data[siteKey(7)]).toBeUndefined();
  });
  test("from a content script is ignored", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    const content = { id: "test-extension-id", tab: { id: 7 }, url: NPS.url } as chrome.runtime.MessageSender;
    await t.bg.handle({ type: "FOLLOW_SITE", tabId: 7 }, content);
    expect(t.data[siteKey(7)]).toBeUndefined();
  });
  test("state.site is null-ish without a haunt", async () => {
    const t = setup();
    t.data[siteKey(7)] = "nps.gov";
    expect((await t.bg.handle({ type: "GET_STATE", tabId: 7 }, self)).site).toBeUndefined();
  });
});

describe("permissions.onAdded (the prompt closed the popup)", () => {
  test("every site origin added stores the entry for the haunted tab", async () => {
    const t = setup();
    await t.haunt();
    t.grant();
    for (const l of t.m.chrome.permissions.onAdded.listeners) await l({ origins: ORIGINS });
    expect(t.data[siteKey(7)]).toBe("nps.gov");
    expect(t.data[siteKey(8)]).toBeUndefined(); // tab 8 is on nps.gov but not haunted
  });
  test("a partial grant or the link-check grant stores nothing", async () => {
    const t = setup();
    await t.haunt();
    t.grant(LINK_CHECK_ORIGINS);
    for (const l of t.m.chrome.permissions.onAdded.listeners) await l({ origins: LINK_CHECK_ORIGINS });
    for (const l of t.m.chrome.permissions.onAdded.listeners) await l({ origins: ORIGINS.slice(0, 2) });
    expect(t.data[siteKey(7)]).toBeUndefined();
  });
});

describe("navigation while haunting a site", () => {
  test("a new page on the site keeps the haunt and injects quietly, with fresh reports and nonce", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    const nonce = t.data[nonceKey(7)];
    t.data[ghostsKey(7)] = { companies: [], total: 3 };
    t.m.calls.executeScript.length = 0;
    await t.navigate("https://home.nps.gov/yell/index.htm");
    expect(t.data[hauntKey(7)]).toBe(true);
    expect(t.data[siteKey(7)]).toBe("nps.gov");
    expect(t.data[ghostsKey(7)]).toBeUndefined();
    expect(t.injected()).toEqual(["quiet", "content.js", "hooks"]);
    expect(t.data[nonceKey(7)]).toBeString();
    expect(t.data[nonceKey(7)]).not.toBe(nonce);
  });
  test("a reload stays haunted", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    await t.navigate(NPS.url);
    expect(t.data[hauntKey(7)]).toBe(true);
    expect(t.injected()).toContain("quiet");
  });
  test("a page on another site stops, clears and hands the site origins back", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.calls.executeScript.length = 0;
    await t.navigate("https://www.cdc.gov/");
    expect(t.data[hauntKey(7)]).toBeUndefined();
    expect(t.data[siteKey(7)]).toBeUndefined();
    expect(t.injected()).toEqual([]);
    expect(t.m.calls.remove).toEqual([{ origins: ORIGINS }]);
  });
  test("without a site entry a new page stops, as today", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.navigate("https://www.nps.gov/subjects/");
    expect(t.data[hauntKey(7)]).toBeUndefined();
    expect(t.m.calls.remove).toEqual([]);
  });
  test("with the origins gone a new page stops", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.granted.clear();
    await t.navigate("https://www.nps.gov/subjects/");
    expect(t.data[hauntKey(7)]).toBeUndefined();
    expect(t.data[siteKey(7)]).toBeUndefined();
  });
  test("the content script answering the ping (same document): nothing happens", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.calls.executeScript.length = 0;
    for (const l of t.m.chrome.tabs.onUpdated.listeners) await l(7, { status: "loading", url: NPS.url + "#x" }, NPS);
    expect(t.injected()).toEqual([]);
    expect(t.data[siteKey(7)]).toBe("nps.gov");
  });
  test("complete retries a missed injection, and loading then complete injects once", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.calls.executeScript.length = 0;
    // complete alone (the loading injection failed): inject quietly
    await t.navigate("https://www.nps.gov/a", "complete");
    expect(t.injected()).toEqual(["quiet", "content.js", "hooks"]);
    // loading, then complete with the content script answering: one injection
    t.m.calls.executeScript.length = 0;
    await t.navigate("https://www.nps.gov/b");
    t.m.contentReply = () => ({ ok: true });
    for (const l of t.m.chrome.tabs.onUpdated.listeners) await l(7, { status: "complete" }, { ...t.m.tabsById.get(7) });
    expect(t.injected()).toEqual(["quiet", "content.js", "hooks"]);
  });
  test("complete alone (loading saw the old page) clears the old page's reports before injecting", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.data[ghostsKey(7)] = { companies: [], total: 3 };
    await t.navigate("https://www.nps.gov/a", "complete");
    expect(t.data[ghostsKey(7)]).toBeUndefined();
  });
  test("an Un-haunt that lands while a page is being re-haunted takes the costume off again", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    const run = t.m.chrome.scripting.executeScript;
    t.m.chrome.scripting.executeScript = async (i: any) => {
      if (i.files) delete t.data[hauntKey(7)]; // UNHAUNT finished during the injection
      return run(i);
    };
    t.m.calls.sendMessage.length = 0;
    t.m.calls.executeScript.length = 0;
    await t.navigate("https://www.nps.gov/a");
    expect((t.m.calls.sendMessage as any[]).map((c) => c.msg.type)).toContain("unhaunt");
    expect(t.injected()).not.toContain("hooks");
  });
  test("the Haunt button injection is not quiet", async () => {
    const t = setup();
    await t.haunt();
    expect(t.injected()).toEqual(["content.js", "hooks"]);
  });
});

describe("the end of a site haunt", () => {
  test("Un-haunt removes the entry and the site origins", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    const state = await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(state.site).toBeUndefined();
    expect(t.data[siteKey(7)]).toBeUndefined();
    expect(t.m.calls.remove).toEqual([{ origins: ORIGINS }]);
  });
  test("tab close removes the entry and the site origins", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    for (const l of t.m.chrome.tabs.onRemoved.listeners) await l(7, {});
    expect(t.data[siteKey(7)]).toBeUndefined();
    expect(t.m.calls.remove).toEqual([{ origins: ORIGINS }]);
  });
  test("a second tab following the same site keeps the origins until it ends too", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    await t.bg.handle({ type: "HAUNT", tabId: 8 }, self);
    await t.bg.handle({ type: "FOLLOW_SITE", tabId: 8 }, self);
    await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(t.m.calls.remove).toEqual([]);
    await t.bg.handle({ type: "UNHAUNT", tabId: 8 }, self);
    expect(t.m.calls.remove).toEqual([{ origins: ORIGINS }]);
  });
  test("with the link-check origins granted nothing is removed", async () => {
    const t = setup();
    t.grant();
    t.grant(LINK_CHECK_ORIGINS);
    await t.haunt();
    await t.follow();
    await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(t.m.calls.remove).toEqual([]);
  });
  test("a rejecting remove (a required permission in the e2e build) is ignored", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.chrome.permissions.remove = async () => {
      throw new Error("You cannot remove required permissions.");
    };
    expect((await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self)).haunted).toBe(false);
  });
  test("a one-page haunt makes no permissions call when it ends", async () => {
    const t = setup();
    await t.haunt();
    await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(t.m.calls.remove).toEqual([]);
  });
  test("Chrome removing the site access drops the entry but keeps this page haunted", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.granted.clear();
    for (const l of t.m.chrome.permissions.onRemoved.listeners) await l({ origins: ORIGINS });
    expect(t.data[siteKey(7)]).toBeUndefined();
    expect(t.data[hauntKey(7)]).toBe(true);
  });
  test("at browser start no tab haunts a site, so site access left from before is handed back (link checks kept)", async () => {
    const t = setup();
    t.grant();
    t.grant(LINK_CHECK_ORIGINS);
    t.grant(siteOrigins("cdc.gov"));
    for (const l of t.m.chrome.runtime.onStartup.listeners) await l();
    expect(t.m.calls.remove).toEqual([{ origins: [...ORIGINS, ...siteOrigins("cdc.gov")] }]);
    expect([...t.m.granted]).toEqual(LINK_CHECK_ORIGINS);
  });
  test("at browser start with nothing left over there is no permissions call", async () => {
    const t = setup();
    t.grant(LINK_CHECK_ORIGINS);
    for (const l of t.m.chrome.runtime.onStartup.listeners) await l();
    expect(t.m.calls.remove).toEqual([]);
  });
  test("nothing is written to storage.local", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    await t.navigate("https://www.nps.gov/b");
    await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(t.m.chrome.storage.local.data).toEqual({});
  });
});

describe("the page-change cover's registration", () => {
  const COVER = {
    id: "cover-nps.gov",
    matches: ORIGINS,
    js: ["cover.js"],
    runAt: "document_start",
    allFrames: false,
    persistAcrossSessions: false,
  };
  /** COVER_CHECK as a content script in tab `id` at `url` sends it. */
  const check = (t: ReturnType<typeof setup>, id: number, url: string, fromPage = false) =>
    new Promise((resolve) => {
      const sender = fromPage ? self : ({ id: "test-extension-id", tab: { id, url }, url } as chrome.runtime.MessageSender);
      const keep = t.m.chrome.runtime.onMessage.listeners[0]!({ type: "COVER_CHECK" }, sender, resolve);
      if (keep !== true) resolve(undefined);
    });

  test("following a site registers its cover once, at document_start, top frame, this session only", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    expect([...t.m.registered.values()]).toEqual([COVER]);
    await t.bg.handle({ type: "HAUNT", tabId: 8 }, self);
    await t.bg.handle({ type: "FOLLOW_SITE", tabId: 8 }, self);
    expect(t.m.registered.size).toBe(1);
  });
  test("following marks the tab (its sessionStorage) so its next page is covered at once", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    t.m.calls.executeScript.length = 0;
    await t.follow();
    expect(t.injected()).toEqual(["marker"]);
    expect((t.m.calls.executeScript[0] as any).target).toEqual({ tabId: 7 });
  });
  test("the quiet re-haunt marks the new page too, in the same call as the quiet flag", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.calls.executeScript.length = 0;
    await t.navigate("https://www.nps.gov/b");
    expect((t.m.calls.executeScript[0] as any).args).toEqual([QUIET_FLAG, COVER_MARKER]);
  });
  test("a declined site (no follow) registers nothing", async () => {
    const t = setup();
    await t.haunt();
    await t.follow();
    expect(t.m.calls.register).toEqual([]);
  });
  test("the end of the site haunt unregisters it, but not while another tab still follows the site", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    await t.bg.handle({ type: "HAUNT", tabId: 8 }, self);
    await t.bg.handle({ type: "FOLLOW_SITE", tabId: 8 }, self);
    await t.bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(t.m.registered.size).toBe(1);
    await t.navigate("https://www.cdc.gov/"); // tab 7 is no longer haunted: nothing changes
    await t.bg.handle({ type: "UNHAUNT", tabId: 8 }, self);
    expect(t.m.registered.size).toBe(0);
  });
  test("leaving the site unregisters it, even when link checks keep the access", async () => {
    const t = setup();
    t.grant();
    t.grant(LINK_CHECK_ORIGINS);
    await t.haunt();
    await t.follow();
    await t.navigate("https://www.cdc.gov/");
    expect(t.m.registered.size).toBe(0);
  });
  test("Chrome taking the access away unregisters it", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    t.m.granted.clear();
    for (const l of t.m.chrome.permissions.onRemoved.listeners) await l({ origins: ORIGINS });
    expect(t.m.registered.size).toBe(0);
  });
  test("at browser start every cover left registered goes", async () => {
    const t = setup();
    t.m.registered.set("cover-cdc.gov", { id: "cover-cdc.gov" });
    t.m.registered.set("other", { id: "other" });
    for (const l of t.m.chrome.runtime.onStartup.listeners) await l();
    expect([...t.m.registered.keys()]).toEqual(["other"]);
  });
  test("COVER_CHECK: yes only for a tab that haunts the site its page is on", async () => {
    const t = setup();
    t.grant();
    await t.haunt();
    await t.follow();
    expect(await check(t, 7, "https://home.nps.gov/yell/")).toBe(true);
    expect(await check(t, 8, "https://www.nps.gov/subjects/")).toBe(false); // same site, not haunted
    expect(await check(t, 7, "https://www.cdc.gov/")).toBe(false); // off the site
    expect(await check(t, 7, "https://www.nps.gov/", true)).toBe(false); // an extension page
  });
});
