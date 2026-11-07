import { describe, expect, test } from "bun:test";
import { installHooks } from "../../src/content/hooks";
import { createBackground } from "../../src/background/router";
import { buildManifest } from "../../src/manifest";
import { ghostsKey, hauntKey, nonceKey, type CompanyHit } from "../../src/data/types";
import { asChrome, createChromeMock } from "../chrome-mock";

const WEB = { id: 7, url: "https://example.org/page", active: true };
const self = { id: "test-extension-id" };
const fromTab = { id: "test-extension-id", tab: { id: 7 } as chrome.tabs.Tab, url: "https://example.org/page" };

const setup = () => {
  const m = createChromeMock({ tabs: [WEB] });
  m.chrome.storage.session.data[hauntKey(7)] = true; // ghost reports are only kept for a haunted tab
  const log: { kind: "script" | "message"; arg: any }[] = [];
  const { executeScript } = m.chrome.scripting;
  m.chrome.scripting.executeScript = async (i: unknown) => {
    log.push({ kind: "script", arg: i });
    return executeScript(i);
  };
  const { sendMessage } = m.chrome.tabs;
  m.chrome.tabs.sendMessage = async (tabId: number, msg: unknown) => {
    log.push({ kind: "message", arg: msg });
    return sendMessage(tabId, msg);
  };
  return { m, log, bg: createBackground(asChrome(m)) };
};

const hit = (company: string, over: Partial<CompanyHit> = {}): CompanyHit => ({ company, domains: [], count: 1, categories: [], fingerprinting: 0, ...over });

describe("haunt injects the MAIN-world hooks", () => {
  test("content.js, then the nonce to the content script, then installHooks(nonce) in the MAIN world", async () => {
    const { m, log, bg } = setup();
    await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    const nonce = m.chrome.storage.session.data[nonceKey(7)] as string;
    expect(nonceKey(7)).toBe("nonce:7");
    expect(nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(log.map((l) => l.kind)).toEqual(["script", "message", "script"]);
    expect(log[0]!.arg).toEqual({ target: { tabId: 7 }, files: ["content.js"] });
    expect(log[1]!.arg).toEqual({ type: "vampires", nonce });
    expect(log[2]!.arg).toEqual({ target: { tabId: 7 }, world: "MAIN", func: installHooks, args: [nonce] });
  });
  test("a re-haunt reuses the tab's nonce", async () => {
    const { m, log, bg } = setup();
    await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    const nonce = m.chrome.storage.session.data[nonceKey(7)];
    await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    expect(log.filter((l) => l.kind === "script" && l.arg.func).map((l) => l.arg.args[0])).toEqual([nonce, nonce]);
  });
  test("haunt still succeeds when the hooks cannot be injected", async () => {
    const { m, bg } = setup();
    const { executeScript } = m.chrome.scripting;
    m.chrome.scripting.executeScript = async (i: any) => {
      if (i.func) throw new Error("no MAIN world");
      return executeScript(i);
    };
    const state = await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    expect([state.haunted, state.error]).toEqual([true, undefined]);
  });
  test("unhaunt restores the originals in the MAIN world before the unhaunt message, and forgets the nonce", async () => {
    const { m, log, bg } = setup();
    await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    const nonce = m.chrome.storage.session.data[nonceKey(7)];
    log.length = 0;
    await bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    expect(log.map((l) => l.kind)).toEqual(["script", "message"]);
    expect(log[0]!.arg).toMatchObject({ target: { tabId: 7 }, world: "MAIN", args: [nonce] });
    expect(typeof log[0]!.arg.func).toBe("function");
    expect(log[0]!.arg.func).not.toBe(installHooks);
    expect(log[1]!.arg).toEqual({ type: "unhaunt" });
    expect(nonceKey(7) in m.chrome.storage.session.data).toBe(false);
  });
  test("the restore func is self-contained: it dispatches <nonce>:restore", async () => {
    const { log, bg } = setup();
    await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    log.length = 0;
    await bg.handle({ type: "UNHAUNT", tabId: 7 }, self);
    const events: string[] = [];
    const fake = { dispatchEvent: (e: Event) => events.push(e.type), CustomEvent };
    // Chrome serializes the function: run it from its source text with only globals around it.
    const src = log[0]!.arg.func.toString();
    new Function("window", "globalThis", `return (${src})(...arguments[2])`)(fake, { ...fake }, log[0]!.arg.args);
    expect(events.length).toBe(1);
    expect(events[0]).toBe(`${log[0]!.arg.args[0]}:restore`);
  });
  test("closing the tab or clearing it forgets the nonce too", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "HAUNT", tabId: 7 }, self);
    await bg.handle({ type: "CLEAR_EXORCISE" }, fromTab);
    expect(nonceKey(7) in m.chrome.storage.session.data).toBe(false);
  });
  test("no new permissions in the manifest", () => {
    expect(buildManifest("production").permissions).toEqual(["activeTab", "scripting", "declarativeNetRequest", "storage"]);
    expect("host_permissions" in buildManifest("production")).toBe(false);
  });
});

describe("TRACKER_UPDATE with vampire info", () => {
  test("accepts it and keeps only the allowed catches and a boolean knownOnly", async () => {
    const { m, bg } = setup();
    const dirty = hit("Criteo", { vampire: { caught: ["canvas", "webgl", "audio", "canvas", 3], knownOnly: "yes" } as any });
    await bg.handle({ type: "TRACKER_UPDATE", companies: [dirty, hit("Plain"), hit("Known", { vampire: { caught: [], knownOnly: true } })], total: 3 }, fromTab);
    const stored = (m.chrome.storage.session.data[ghostsKey(7)] as { companies: CompanyHit[] }).companies;
    const by = Object.fromEntries(stored.map((c) => [c.company, c]));
    expect(by.Criteo!.vampire).toEqual({ caught: ["canvas", "audio"], knownOnly: false });
    expect("vampire" in by.Plain!).toBe(false);
    expect(by.Known!.vampire).toEqual({ caught: [], knownOnly: true });
  });
  test("a vampire field that is not an object is dropped", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "TRACKER_UPDATE", companies: [hit("A", { vampire: "x" as any })], total: 1 }, fromTab);
    expect("vampire" in (m.chrome.storage.session.data[ghostsKey(7)] as { companies: CompanyHit[] }).companies[0]!).toBe(false);
  });
});

describe("Exorcise whitelist", () => {
  test("a spoofed vampire for an unlisted host can never get a block rule", async () => {
    const { m, bg } = setup();
    const evil = hit("evil.example", { domains: ["evil.example", "criteo.com"], count: 0, vampire: { caught: ["canvas"], knownOnly: false } });
    await bg.handle({ type: "TRACKER_UPDATE", companies: [evil], total: 0 }, fromTab);
    await bg.handle({ type: "EXORCISE", tabId: 7, company: "evil.example" }, self); // domains default to the reported ones
    await bg.handle({ type: "EXORCISE", tabId: 7, company: "evil.example", domains: ["evil.example"] }, self);
    await bg.handle({ type: "EXORCISE", company: "evil.example", domains: ["evil.example"] }, fromTab);
    expect(m.dnr.rules).toEqual([]);
    expect(await bg.getState(7)).toMatchObject({ exorcised: [] });
  });
});
