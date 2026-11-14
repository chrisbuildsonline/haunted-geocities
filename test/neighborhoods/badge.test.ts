import { describe, expect, test } from "bun:test";
import { BADGE_BG, BADGE_FG, badgeText, createBadge } from "../../src/background/badge";
import { createBackground } from "../../src/background/router";
import { buildManifest } from "../../src/manifest";
import { cursesKey, ghostsKey, hauntKey, tombstonesKey, type CompanyHit, type Curse, type DeadLink } from "../../src/data/types";
import { asChrome, createChromeMock, type ChromeMock } from "../chrome-mock";

const hit = (company: string, vampire = false): CompanyHit => ({
  company,
  domains: [`${company.toLowerCase()}.example`],
  count: 1,
  categories: [],
  fingerprinting: vampire ? 3 : 0,
  ...(vampire ? { vampire: { caught: ["canvas" as const], knownOnly: false } } : {}),
});
const dead = (n: number): DeadLink => ({ url: `https://example.org/gone${n}`, path: `/gone${n}`, status: 404 });
const curse = (n: number): Curse => ({ kind: "scarcity", snippet: `Only ${n} left` });

const sender = (tabId: number) => ({ id: "test-extension-id", tab: { id: tabId }, url: "https://example.org/page" }) as chrome.runtime.MessageSender;

function setup(o: { haunted?: number[] } = {}) {
  const m = createChromeMock({ tabs: [{ id: 7, url: "https://example.org/page", active: true }, { id: 8, url: "https://example.net/" }] });
  const bg = createBackground(asChrome(m));
  for (const id of o.haunted ?? [7]) m.chrome.storage.session.data[hauntKey(id)] = true;
  return { m, bg };
}
const badgeOf = (m: ChromeMock, tabId: number) => m.badges.get(tabId)?.text;
const trackers = (bg: ReturnType<typeof createBackground>, tabId: number, companies: CompanyHit[]) =>
  bg.handle({ type: "TRACKER_UPDATE", companies, total: companies.length }, sender(tabId));

describe("badgeText", () => {
  test("badgeText(0) is empty", () => expect(badgeText(0)).toBe(""));
  test("badgeText(1) is 1 and badgeText(99) is 99", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
  });
  test("badgeText(100) is 99+", () => expect(badgeText(100)).toBe("99+"));
  test("badgeText(1000) is 99+", () => expect(badgeText(1000)).toBe("99+"));
});

describe("createBadge", () => {
  test("a non-empty badge sets text, background #6633cc and text colour #ffffff for the tab", async () => {
    const m = createChromeMock({ tabs: [{ id: 7 }] });
    await createBadge(asChrome(m)).show(7, 3);
    expect(m.badges.get(7)).toEqual({ text: "3", color: "#6633cc", textColor: "#ffffff" });
    expect([BADGE_BG, BADGE_FG]).toEqual(["#6633cc", "#ffffff"]);
  });
  test("an empty badge sets only the text", async () => {
    const m = createChromeMock({ tabs: [{ id: 7 }] });
    await createBadge(asChrome(m)).show(7, 0);
    expect(m.calls.action).toEqual([{ fn: "setBadgeText", arg: { tabId: 7, text: "" } }]);
  });
  test("every call passes tabId and none is global", async () => {
    const m = createChromeMock({ tabs: [{ id: 7 }, { id: 8 }] });
    const badge = createBadge(asChrome(m));
    await badge.show(7, 5);
    await badge.show(8, 120);
    await badge.clear(7);
    expect(m.calls.action.length).toBe(7);
    for (const c of m.calls.action) expect(Number.isInteger(c.arg.tabId)).toBe(true);
    expect(m.badges.get(8)?.text).toBe("99+");
  });
  test("a rejected setBadgeText is swallowed", async () => {
    const m = createChromeMock({ tabs: [{ id: 7 }] });
    m.actionFail = true;
    await expect(createBadge(asChrome(m)).show(7, 4)).resolves.toBeUndefined();
    await expect(createBadge(asChrome(m)).show(404, 4)).resolves.toBeUndefined();
  });
  test("a missing action API is swallowed", async () => {
    const m = createChromeMock({ tabs: [{ id: 7 }] });
    const api = { ...m.chrome, action: undefined } as unknown as typeof chrome;
    await expect(createBadge(api).show(7, 4)).resolves.toBeUndefined();
    await expect(createBadge(api).clear(7)).resolves.toBeUndefined();
  });
});

describe("router keeps the badge", () => {
  test("TRACKER_UPDATE sets the badge to the company count", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, [hit("Criteo"), hit("Hotjar")]);
    expect(badgeOf(m, 7)).toBe("2");
    expect(m.badges.get(7)).toEqual({ text: "2", color: "#6633cc", textColor: "#ffffff" });
  });
  test("a vampire counts once, with the ghosts", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, [hit("Criteo"), hit("Hotjar", true)]);
    expect(badgeOf(m, 7)).toBe("2");
  });
  test("TOMBSTONE_UPDATE adds the tombstones", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, [hit("Criteo")]);
    await bg.handle({ type: "TOMBSTONE_UPDATE", dead: [dead(1), dead(2)] }, sender(7));
    expect(badgeOf(m, 7)).toBe("3");
  });
  test("CURSE_UPDATE adds the curses", async () => {
    const { m, bg } = setup();
    await bg.handle({ type: "CURSE_UPDATE", curses: [curse(1), curse(2), curse(3)] }, sender(7));
    expect(badgeOf(m, 7)).toBe("3");
  });
  test("the badge is the sum of all four kinds", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, [hit("Criteo"), hit("Taboola"), hit("Hotjar", true)]);
    await bg.handle({ type: "TOMBSTONE_UPDATE", dead: [dead(1)] }, sender(7));
    await bg.handle({ type: "CURSE_UPDATE", curses: [curse(1), curse(2)] }, sender(7));
    expect(badgeOf(m, 7)).toBe("6");
  });
  test("over 99 reads 99+", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, Array.from({ length: 80 }, (_, i) => hit(`Co${i}`)));
    await bg.handle({ type: "CURSE_UPDATE", curses: Array.from({ length: 30 }, (_, i) => curse(i)) }, sender(7));
    expect(badgeOf(m, 7)).toBe("99+");
  });
  test("an update that brings the count to 0 sets an empty badge", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, [hit("Criteo")]);
    expect(badgeOf(m, 7)).toBe("1");
    await trackers(bg, 7, []);
    expect(badgeOf(m, 7)).toBe("");
  });
  test("an update from a tab that is not haunted does not touch the badge", async () => {
    const { m, bg } = setup({ haunted: [] });
    await trackers(bg, 7, [hit("Criteo")]);
    await bg.handle({ type: "TOMBSTONE_UPDATE", dead: [dead(1)] }, sender(7));
    await bg.handle({ type: "CURSE_UPDATE", curses: [curse(1)] }, sender(7));
    expect(m.calls.action).toEqual([]);
  });
  test("two tabs keep separate counts", async () => {
    const { m, bg } = setup({ haunted: [7, 8] });
    await trackers(bg, 7, [hit("Criteo"), hit("Hotjar")]);
    await trackers(bg, 8, [hit("Taboola")]);
    expect(badgeOf(m, 7)).toBe("2");
    expect(badgeOf(m, 8)).toBe("1");
  });
  test("the badge count equals the popup tiles' sum from getState", async () => {
    const { m, bg } = setup();
    await trackers(bg, 7, [hit("Criteo"), hit("Hotjar", true)]);
    await bg.handle({ type: "TOMBSTONE_UPDATE", dead: [dead(1), dead(2)] }, sender(7));
    await bg.handle({ type: "CURSE_UPDATE", curses: [curse(1)] }, sender(7));
    const s = await bg.getState(7);
    expect(badgeOf(m, 7)).toBe(String(s.ghosts.length + s.tombstones.length + s.curses.length));
  });
});

describe("clearing the badge", () => {
  const haunted = async () => {
    const ctx = setup({ haunted: [7, 8] });
    await trackers(ctx.bg, 7, [hit("Criteo")]);
    await trackers(ctx.bg, 8, [hit("Hotjar"), hit("Taboola")]);
    return ctx;
  };
  test("UNHAUNT clears the badge of that tab only", async () => {
    const { m, bg } = await haunted();
    await bg.handle({ type: "UNHAUNT", tabId: 7 }, { id: "test-extension-id", url: "chrome-extension://test-extension-id/popup.html" });
    expect(badgeOf(m, 7)).toBe("");
    expect(badgeOf(m, 8)).toBe("2");
  });
  test("CLEAR_EXORCISE clears the badge", async () => {
    const { m, bg } = await haunted();
    await bg.handle({ type: "CLEAR_EXORCISE" }, sender(7));
    expect(badgeOf(m, 7)).toBe("");
  });
  test("closing the tab clears its badge", async () => {
    const { m, bg } = await haunted();
    bg.register();
    await m.chrome.tabs.onRemoved.listeners[0]!(7, { windowId: 1, isWindowClosing: false });
    expect(m.calls.action.at(-1)).toEqual({ fn: "setBadgeText", arg: { tabId: 7, text: "" } });
    expect(badgeOf(m, 8)).toBe("2");
  });
  test("a navigation that kills the content script clears the badge", async () => {
    const { m, bg } = await haunted();
    bg.register();
    m.contentReply = () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    };
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading" }, {});
    expect(badgeOf(m, 7)).toBe("");
  });
  test("a same-document change (the script still answers) keeps the badge", async () => {
    const { m, bg } = await haunted();
    bg.register();
    await m.chrome.tabs.onUpdated.listeners[0]!(7, { status: "loading", url: "https://example.org/page#x" }, {});
    expect(badgeOf(m, 7)).toBe("1");
  });
  test("clearing a tab that is already gone does not throw", async () => {
    const { m, bg } = await haunted();
    bg.register();
    m.tabsById.delete(7);
    await expect(m.chrome.tabs.onRemoved.listeners[0]!(7, { windowId: 1, isWindowClosing: false })).resolves.toBeDefined();
    expect(m.calls.action.at(-1)).toEqual({ fn: "setBadgeText", arg: { tabId: 7, text: "" } });
  });
});

describe("no new permission", () => {
  test("the badge calls need no permission beyond the manifest's", () => {
    const man = buildManifest("production");
    expect([...man.permissions].sort()).toEqual(["activeTab", "declarativeNetRequest", "scripting", "storage"]);
    expect("host_permissions" in man).toBe(false);
    expect(man.action.default_popup).toBe("popup.html");
  });
});

describe("contrast", () => {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  test("white on #6633cc is at least 4.5:1", () => {
    const [hi, lo] = [lum(BADGE_FG), lum(BADGE_BG)].sort((a, b) => b - a);
    expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
