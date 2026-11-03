// Exorcise: declarativeNetRequest session rules, driven through the Exorcist and the background router.
import { describe, expect, test } from "bun:test";
import { Exorcist } from "../src/background/exorcise";
import { createBackground } from "../src/background/router";
import { exorcisedKey, ghostsKey, hauntKey, RULE_SEQ_KEY, type CompanyHit, type TrackerData } from "../src/data/types";
import { asChrome, createChromeMock } from "./chrome-mock";

const WEB = { id: 7, url: "https://example.org/page", active: true };
const TABS = [WEB, { id: 8, url: "https://example.org/other" }];
const rec = (company: string) => ({ company, prevalence: 0.1, categories: [], fingerprinting: 0 });
const DATA: TrackerData = {
  source: "x",
  licence: "x",
  fetched: "2026-11-03",
  domains: { "pixel.example": rec("Pixco"), "cdn.pixco-media.net": rec("Pixco"), "ads.other": rec("Other") },
  entities: {},
};
const content = (tabId: number) => ({ id: "test-extension-id", tab: { id: tabId }, url: "https://example.org/page" }) as chrome.runtime.MessageSender;
const popup = { id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html" } as chrome.runtime.MessageSender;
const hit = (company: string, count: number, domains: string[]): CompanyHit => ({ company, domains, count, categories: [], fingerprinting: 0 });
const blockRule = (id: number, tabId: number, requestDomains: string[]) => ({
  id,
  priority: 1,
  action: { type: "block" },
  condition: { requestDomains, tabIds: [tabId] },
});

const exorcist = () => {
  const m = createChromeMock();
  return { m, ex: new Exorcist(asChrome(m)) };
};

describe("Exorcist", () => {
  test("exorcise adds a block rule for the tab and records it in storage.session", async () => {
    const { m, ex } = exorcist();
    expect(await ex.exorcise(7, "Pixco", ["pixel.example"])).toBe(true);
    expect(m.dnr.rules).toEqual([blockRule(1, 7, ["pixel.example"])]);
    expect(m.chrome.storage.session.data[exorcisedKey(7)]).toEqual({ Pixco: 1 });
    expect(await ex.exorcised(7)).toEqual(["Pixco"]);
  });
  test("rule ids come from a counter in storage.session, so a restarted worker never reuses one", async () => {
    const { m, ex } = exorcist();
    await ex.exorcise(7, "Pixco", ["pixel.example"]);
    await ex.exorcise(7, "Other", ["ads.other"]);
    expect(m.dnr.rules.map((r) => r.id)).toEqual([1, 2]);
    expect(m.chrome.storage.session.data[RULE_SEQ_KEY]).toBe(2);
    const restarted = new Exorcist(asChrome(m)); // the worker was killed: nothing in memory
    expect(await restarted.exorcise(8, "Pixco", ["pixel.example"])).toBe(true);
    expect(m.dnr.rules.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  test("exorcising a company again on the same tab replaces its rule", async () => {
    const { m, ex } = exorcist();
    await ex.exorcise(7, "Pixco", ["pixel.example"]);
    await ex.exorcise(7, "Pixco", ["pixel.example", "cdn.pixco-media.net"]);
    expect(m.dnr.rules).toEqual([blockRule(2, 7, ["pixel.example", "cdn.pixco-media.net"])]);
    expect(m.chrome.storage.session.data[exorcisedKey(7)]).toEqual({ Pixco: 2 });
  });
  test("simultaneous calls get distinct ids", async () => {
    const { m, ex } = exorcist();
    expect(await Promise.all([ex.exorcise(7, "Pixco", ["pixel.example"]), ex.exorcise(7, "Other", ["ads.other"])])).toEqual([true, true]);
    expect(new Set(m.dnr.rules.map((r) => r.id)).size).toBe(2);
  });
  test("letBack removes that tab+company rule only", async () => {
    const { m, ex } = exorcist();
    await ex.exorcise(7, "Pixco", ["pixel.example"]);
    await ex.exorcise(7, "Other", ["ads.other"]);
    await ex.exorcise(8, "Pixco", ["pixel.example"]);
    await ex.letBack(7, "Pixco");
    expect(m.dnr.rules.map((r) => [r.condition.tabIds[0], r.condition.requestDomains[0]])).toEqual([
      [7, "ads.other"],
      [8, "pixel.example"],
    ]);
    expect(await ex.exorcised(7)).toEqual(["Other"]);
    expect(await ex.exorcised(8)).toEqual(["Pixco"]);
  });
  test("clearTab removes every rule for the tab and its storage key, and none of another tab's", async () => {
    const { m, ex } = exorcist();
    await ex.exorcise(7, "Pixco", ["pixel.example"]);
    await ex.exorcise(7, "Other", ["ads.other"]);
    await ex.exorcise(8, "Pixco", ["pixel.example"]);
    await ex.clearTab(7);
    expect(m.dnr.rules.map((r) => r.condition.tabIds)).toEqual([[8]]);
    expect(m.chrome.storage.session.data[exorcisedKey(7)]).toBeUndefined();
    expect(await ex.exorcised(8)).toEqual(["Pixco"]);
  });
  test("clearTab finds rules by their tabIds even when storage.session lost the map", async () => {
    const { m, ex } = exorcist();
    await ex.exorcise(7, "Pixco", ["pixel.example"]);
    delete m.chrome.storage.session.data[exorcisedKey(7)];
    await ex.clearTab(7);
    expect(m.dnr.rules).toEqual([]);
  });
  test("exorcise returns false instead of throwing when the API fails; letBack and clearTab swallow errors", async () => {
    const { m, ex } = exorcist();
    await ex.exorcise(7, "Pixco", ["pixel.example"]);
    m.dnr.fail = true;
    expect(await ex.exorcise(7, "Other", ["ads.other"])).toBe(false);
    await ex.letBack(7, "Pixco");
    await ex.clearTab(7);
    m.dnr.fail = false;
    expect(await ex.exorcise(7, "Other", ["ads.other"])).toBe(true); // the queue still works after a failure
  });
  test("a failed exorcise leaves no record of the company", async () => {
    const { m, ex } = exorcist();
    m.dnr.fail = true;
    expect(await ex.exorcise(7, "Pixco", ["pixel.example"])).toBe(false);
    expect(await ex.exorcised(7)).toEqual([]);
  });
  test("no domains, no rule", async () => {
    const { m, ex } = exorcist();
    expect(await ex.exorcise(7, "Pixco", [])).toBe(false);
    expect(m.dnr.rules).toEqual([]);
  });
});

describe("EXORCISE / LET_BACK / CLEAR_EXORCISE / TRACKER_UPDATE routing", () => {
  const setup = () => {
    const m = createChromeMock({ tabs: TABS });
    return { m, bg: createBackground(asChrome(m), DATA) };
  };

  test("a content script's EXORCISE blocks for sender.tab.id", async () => {
    const { m, bg } = setup();
    const res = await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(7));
    expect(m.dnr.rules).toEqual([blockRule(1, 7, ["pixel.example"])]);
    expect(res.exorcised).toEqual(["Pixco"]);
  });
  test("a popup's EXORCISE uses the tabId in the body (the popup's own sender.tab, if any, is not the target)", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "EXORCISE", tabId: 7, company: "Pixco", domains: ["pixel.example"] }, { ...popup, tab: { id: 99 } } as chrome.runtime.MessageSender);
    expect(m.dnr.rules).toEqual([blockRule(1, 7, ["pixel.example"])]);
  });
  test("a content script cannot aim EXORCISE at another tab with a tabId in the body", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "EXORCISE", tabId: 8, company: "Pixco", domains: ["pixel.example"] } as never, content(7));
    expect(m.dnr.rules.map((r) => r.condition.tabIds)).toEqual([[7]]);
  });
  test("a content script cannot name another tab for UNHAUNT or GET_STATE: sender.tab.id wins", async () => {
    const { m, bg } = setup();
    const state = await bg.handle({ type: "GET_STATE", tabId: 999 }, content(7));
    expect(state.url).toBe("https://example.org/page");
    await bg.handle({ type: "UNHAUNT", tabId: 8 }, content(7));
    expect(m.calls.sendMessage).toEqual([{ tabId: 7, msg: { type: "unhaunt" } }]);
    bg.register();
    const listener = m.chrome.runtime.onMessage.listeners[0]!;
    await new Promise((resolve) => listener({ type: "HAUNT", tabId: 8 }, content(7), resolve));
    expect(m.calls.executeScript.map((c: any) => c.target.tabId)).toEqual([7, 7]); // content.js and the MAIN-world hooks, both into tab 7
  });
  test("only domains that belong to the named company are blocked; the rest are dropped silently", async () => {
    const { m, bg } = setup();
    await bg.handle(
      { type: "EXORCISE", company: "Pixco", domains: ["example.org", "ads.other", "a.b.pixel.example", "PIXEL.example", "notpixel.example", "cdn.pixco-media.net"] },
      content(7),
    );
    expect(m.dnr.rules).toEqual([blockRule(1, 7, ["a.b.pixel.example", "pixel.example", "cdn.pixco-media.net"])]);
  });
  test("when nothing is valid no rule is added", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["example.org"] }, content(7));
    await bg.handle({ type: "EXORCISE", company: "Nobody", domains: ["pixel.example"] }, content(7));
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: "pixel.example" } as never, content(7));
    expect(m.dnr.rules).toEqual([]);
  });
  test("without domains, EXORCISE blocks the hosts the tab reported for that company", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "TRACKER_UPDATE", companies: [hit("Pixco", 2, ["pixel.example"]), hit("Other", 1, ["ads.other"])], total: 3 }, content(7));
    await bg.handle({ type: "EXORCISE", tabId: 7, company: "Pixco" }, popup);
    expect(m.dnr.rules).toEqual([blockRule(1, 7, ["pixel.example"])]);
  });
  test("LET_BACK removes the rule (content script and popup)", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(7));
    await bg.handle({ type: "EXORCISE", company: "Other", domains: ["ads.other"] }, content(7));
    await bg.handle({ type: "LET_BACK", company: "Pixco" }, content(7));
    expect(m.dnr.rules.map((r) => r.condition.requestDomains)).toEqual([["ads.other"]]);
    const res = await bg.handle({ type: "LET_BACK", tabId: 7, company: "Other" }, popup);
    expect(m.dnr.rules).toEqual([]);
    expect(res.exorcised).toEqual([]);
  });
  test("CLEAR_EXORCISE removes all of the sender tab's rules", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(7));
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(8));
    await bg.handle({ type: "CLEAR_EXORCISE" }, content(7));
    expect(m.dnr.rules.map((r) => r.condition.tabIds)).toEqual([[8]]);
  });
  test("TRACKER_UPDATE stores { companies, total } under ghostsKey(sender.tab.id) and GET_STATE returns them sorted", async () => {
    const { m, bg } = setup();
    const companies = [hit("Zed", 1, ["ads.other"]), hit("Pixco", 3, ["pixel.example"]), hit("Abe", 1, ["ads.other"])];
    await bg.handle({ type: "TRACKER_UPDATE", companies, total: 5 }, content(7));
    expect(m.chrome.storage.session.data[ghostsKey(7)]).toEqual({ companies, total: 5 });
    expect((await bg.handle({ type: "GET_STATE", tabId: 7 }, popup)).ghosts.map((g) => g.company)).toEqual(["Pixco", "Abe", "Zed"]);
    expect((await bg.handle({ type: "GET_STATE", tabId: 8 }, popup)).ghosts).toEqual([]);
  });
  test("a malformed TRACKER_UPDATE is dropped", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "TRACKER_UPDATE", companies: "x", total: 1 } as never, content(7));
    expect(m.chrome.storage.session.data[ghostsKey(7)]).toBeUndefined();
  });
  test("after EXORCISE and LET_BACK the tab is told which companies are exorcised, so the costume follows the popup", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "EXORCISE", tabId: 7, company: "Pixco", domains: ["pixel.example"] }, popup);
    expect(m.calls.sendMessage.at(-1)).toEqual({ tabId: 7, msg: { type: "exorcised", companies: ["Pixco"] } });
    await bg.handle({ type: "LET_BACK", company: "Pixco" }, content(7));
    expect(m.calls.sendMessage.at(-1)).toEqual({ tabId: 7, msg: { type: "exorcised", companies: [] } });
    m.contentReply = () => {
      throw new Error("no receiving end");
    };
    expect((await bg.handle({ type: "EXORCISE", tabId: 7, company: "Pixco", domains: ["pixel.example"] }, popup)).exorcised).toEqual(["Pixco"]);
  });
  test("GET_STATE lists the exorcised companies", async () => {
    const { bg } = setup();
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(7));
    expect((await bg.handle({ type: "GET_STATE", tabId: 7 }, popup)).exorcised).toEqual(["Pixco"]);
  });
  test("through the listener: content-script messages carry no tabId and still work; other extensions are ignored", async () => {
    const { m, bg } = setup();
    bg.register();
    const listener = m.chrome.runtime.onMessage.listeners[0]!;
    await new Promise((resolve) => listener({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(7), resolve));
    expect(m.dnr.rules).toEqual([blockRule(1, 7, ["pixel.example"])]);
    expect(listener({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, { id: "someone-else", tab: { id: 7 } }, () => {})).toBe(false);
    expect(listener({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, { id: "test-extension-id" }, () => {})).toBe(false); // no tab, no tabId
  });
});

describe("exorcise cleanup", () => {
  const haunted = async () => {
    const m = createChromeMock({ tabs: TABS });
    const bg = createBackground(asChrome(m), DATA);
    bg.register();
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(7));
    await bg.handle({ type: "EXORCISE", company: "Pixco", domains: ["pixel.example"] }, content(8));
    await bg.handle({ type: "TRACKER_UPDATE", companies: [hit("Pixco", 1, ["pixel.example"])], total: 1 }, content(7));
    m.chrome.storage.session.data[hauntKey(7)] = true;
    return { m, bg };
  };
  const onlyTab8Left = (m: ReturnType<typeof createChromeMock>) => {
    expect(m.dnr.rules.map((r) => r.condition.tabIds)).toEqual([[8]]);
    expect(m.chrome.storage.session.data[ghostsKey(7)]).toBeUndefined();
    expect(m.chrome.storage.session.data[exorcisedKey(7)]).toBeUndefined();
  };

  test("UNHAUNT clears the tab's rules, ghosts and exorcised list", async () => {
    const { m, bg } = await haunted();
    await bg.handle({ type: "UNHAUNT", tabId: 7 }, popup);
    onlyTab8Left(m);
  });
  test("tabs.onRemoved clears them", async () => {
    const { m } = await haunted();
    await m.chrome.tabs.onRemoved.listeners[0]!(7, { windowId: 1, isWindowClosing: false });
    onlyTab8Left(m);
  });
  test("a real reload or navigation clears them", async () => {
    const { m } = await haunted();
    m.contentReply = () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    };
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, WEB);
    onlyTab8Left(m);
  });
  test("a same-document navigation keeps them", async () => {
    const { m } = await haunted();
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading", url: "https://example.org/pushed" }, WEB);
    expect(m.dnr.rules).toHaveLength(2);
    expect(m.chrome.storage.session.data[ghostsKey(7)]).toBeDefined();
  });
});
