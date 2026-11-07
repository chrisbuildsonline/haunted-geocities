import { installHooks, restoreHooks } from "../content/hooks";
import { checkLinks } from "../content/link-check";
import { lookup } from "../content/matcher";
import trackerJson from "../data/trackers.json";
import {
  ghostsKey,
  hauntKey,
  LINK_CHECK_ORIGINS,
  nonceKey,
  tombstonesKey,
  type CompanyHit,
  type ContentMessage,
  type ContentRequest,
  type DeadLink,
  type PopupRequest,
  type TabState,
  type TrackerData,
  type VampireInfo,
} from "../data/types";
import { Exorcist } from "./exorcise";
import { refusedHost } from "./link-guard";
import { isRestrictedUrl } from "./restricted";

type Request = PopupRequest | ContentRequest;

const TYPES = new Set(["HAUNT", "UNHAUNT", "GET_STATE", "EXORCISE", "LET_BACK", "CLEAR_EXORCISE", "TRACKER_UPDATE", "CHECK_LINKS", "TOMBSTONE_UPDATE"]);

const isDead = (d: unknown): d is DeadLink =>
  typeof d === "object" && d !== null && typeof (d as DeadLink).url === "string" && typeof (d as DeadLink).path === "string" && [404, 410].includes((d as DeadLink).status);

/** A URL the cross-site checker may fetch: http(s), and not this machine or the local network. */
function checkable(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return (url.protocol === "http:" || url.protocol === "https:") && !refusedHost(url.hostname);
  } catch {
    return false;
  }
}

const isRequest = (m: unknown): m is Request => typeof m === "object" && m !== null && TYPES.has((m as Request).type);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isHit = (c: unknown): c is CompanyHit =>
  typeof c === "object" && c !== null && typeof (c as CompanyHit).company === "string" && Array.isArray((c as CompanyHit).domains) && typeof (c as CompanyHit).count === "number";

const CATCHES = ["canvas", "audio", "fonts"];

/** A reported hit with its vampire field cut down to the three known catches and a boolean. */
function clean(c: CompanyHit): CompanyHit {
  const v = c.vampire as Partial<VampireInfo> | null | undefined;
  const { vampire: _, ...rest } = c;
  if (typeof v !== "object" || v === null) return rest;
  const reported = Array.isArray(v.caught) ? (v.caught as unknown[]) : [];
  return { ...rest, vampire: { caught: CATCHES.filter((a) => reported.includes(a)) as VampireInfo["caught"], knownOnly: v.knownOnly === true } };
}

const byCountThenName = (a: CompanyHit, b: CompanyHit) => b.count - a.count || (a.company < b.company ? -1 : a.company > b.company ? 1 : 0);

/** The service worker's logic, with chrome (and the tracker data) passed in so tests can hand it mocks. */
export function createBackground(api: typeof chrome, data: TrackerData = trackerJson as TrackerData, fetchFn: typeof fetch = fetch) {
  const session = api.storage.session;
  const exorcist = new Exorcist(api);

  /**
   * The tab a request is about. Only extension pages (the popup) name it in the body; for any
   * other sender with a tab it is sender.tab.id and a tabId in the body is ignored. An extension
   * page opened as a tab (the e2e popup) is not the target.
   */
  function tabOf(msg: Request, sender: chrome.runtime.MessageSender): number | undefined {
    const fromPage = sender.url?.startsWith(`chrome-extension://${api.runtime.id}/`) ?? false;
    let id: unknown;
    if (msg.type === "CLEAR_EXORCISE" || msg.type === "TRACKER_UPDATE" || msg.type === "TOMBSTONE_UPDATE" || msg.type === "CHECK_LINKS" || (sender.tab && !fromPage)) id = sender.tab?.id;
    else id = (msg as PopupRequest).tabId;
    return Number.isInteger(id) ? (id as number) : undefined;
  }

  async function reportedGhosts(tabId: number): Promise<CompanyHit[]> {
    const key = ghostsKey(tabId);
    const stored = (await session.get(key))[key] as { companies?: CompanyHit[] } | undefined;
    return [...(stored?.companies ?? [])].sort(byCountThenName);
  }

  async function getState(tabId: number): Promise<TabState> {
    const tab = await api.tabs.get(tabId);
    const url = tab.url || tab.pendingUrl || null;
    const fileAccess = url?.startsWith("file:") ? await api.extension.isAllowedFileSchemeAccess() : false;
    const key = hauntKey(tabId);
    const stored = await session.get(key);
    return {
      haunted: stored[key] === true,
      restricted: isRestrictedUrl(url ?? undefined, fileAccess),
      url,
      ghosts: await reportedGhosts(tabId),
      exorcised: await exorcist.exorcised(tabId),
      tombstones: ((await session.get(tombstonesKey(tabId)))[tombstonesKey(tabId)] as DeadLink[] | undefined) ?? [],
    };
  }

  /** Drop everything the tab's haunt left behind: its block rules and what it reported. */
  async function clearTab(tabId: number) {
    await exorcist.clearTab(tabId);
    await session.remove([ghostsKey(tabId), nonceKey(tabId), tombstonesKey(tabId)]);
  }

  async function haunt(tabId: number): Promise<TabState> {
    const state = await getState(tabId);
    if (state.restricted) return state;
    // Marked before injecting: the costume's first reports are dropped for a tab that is not haunted.
    await session.set({ [hauntKey(tabId)]: true });
    try {
      // content.js haunts on injection and is idempotent, so re-injecting is harmless.
      await api.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch (e) {
      if (!state.haunted) await session.remove(hauntKey(tabId));
      return { ...state, error: message(e) };
    }
    await installVampireHooks(tabId);
    // Fresh, not the state from before the injection: the costume has reported ghosts by now, and a
    // stale answer arriving after the popup's storage-change refresh would wipe them from the list.
    return getState(tabId);
  }

  /** One nonce per haunted tab, reused on a re-haunt so the MAIN-world hooks know they are already in. */
  async function nonceOf(tabId: number): Promise<string> {
    const key = nonceKey(tabId);
    const stored = (await session.get(key))[key];
    if (typeof stored === "string") return stored;
    const nonce = crypto.randomUUID();
    await session.set({ [key]: nonce });
    return nonce;
  }

  /** Tell the content script the nonce, then hook the page's MAIN world. Best effort: the costume works without it. */
  async function installVampireHooks(tabId: number) {
    try {
      const nonce = await nonceOf(tabId);
      await api.tabs.sendMessage(tabId, { type: "vampires", nonce } satisfies ContentMessage);
      await api.scripting.executeScript({ target: { tabId }, world: "MAIN", func: installHooks, args: [nonce] });
    } catch {
      // no hooks: known vampires (the Tracker Radar score) still show
    }
  }

  async function unhaunt(tabId: number): Promise<TabState> {
    try {
      const key = nonceKey(tabId);
      const nonce = (await session.get(key))[key];
      if (typeof nonce === "string") await api.scripting.executeScript({ target: { tabId }, world: "MAIN", func: restoreHooks, args: [nonce] });
    } catch {
      // the page is gone, and the hooks with it
    }
    try {
      await api.tabs.sendMessage(tabId, { type: "unhaunt" } satisfies ContentMessage);
    } catch {
      // No receiving end: the page (and the overlay with it) is already gone.
    }
    await session.remove(hauntKey(tabId));
    await clearTab(tabId);
    return getState(tabId);
  }

  /** Requested domains that fall under a tracker domain owned by `company` (requirement 47a); the rest are dropped. */
  function ownedDomains(company: string, requested: unknown): string[] {
    if (!Array.isArray(requested)) return [];
    const ok = new Set<string>();
    for (const d of requested) {
      if (typeof d !== "string") continue;
      const host = d.toLowerCase().replace(/\.$/, "");
      const tracker = /^[a-z0-9.-]+$/.test(host) ? lookup(host, data) : null;
      if (tracker && data.domains[tracker]!.company === company) ok.add(host);
    }
    return [...ok];
  }

  async function exorcise(tabId: number, company: unknown, requested: unknown) {
    if (typeof company !== "string") return;
    const domains = ownedDomains(company, requested ?? (await reportedGhosts(tabId)).find((g) => g.company === company)?.domains);
    if (domains.length) await exorcist.exorcise(tabId, company, domains);
  }

  async function isHaunted(tabId: number): Promise<boolean> {
    return (await session.get(hauntKey(tabId)))[hauntKey(tabId)] === true;
  }

  /** Check a haunted content script's cross-site links, if the user granted the origins, and send back the dead ones. */
  async function checkCrossSite(tabId: number, urls: unknown, sender: chrome.runtime.MessageSender) {
    if (sender.url?.startsWith(`chrome-extension://${api.runtime.id}/`) || !Array.isArray(urls)) return;
    if (!(await isHaunted(tabId))) return;
    if (!(await api.permissions.contains({ origins: LINK_CHECK_ORIGINS }))) return;
    const dead = await checkLinks(urls.filter(checkable).slice(0, 30), fetchFn, { getRetry: false });
    if (dead.length) await api.tabs.sendMessage(tabId, { type: "tombstones", dead } satisfies ContentMessage).catch(() => undefined);
  }

  async function handle(msg: Request, sender: chrome.runtime.MessageSender): Promise<TabState> {
    const tabId = tabOf(msg, sender);
    if (tabId === undefined) throw new Error("No tab for this request.");
    switch (msg.type) {
      case "HAUNT":
        return haunt(tabId);
      case "UNHAUNT":
        return unhaunt(tabId);
      case "EXORCISE":
      case "LET_BACK":
        if (msg.type === "EXORCISE") await exorcise(tabId, msg.company, msg.domains);
        else if (typeof msg.company === "string") await exorcist.letBack(tabId, msg.company);
        // The costume follows whichever side (card or popup) made the change.
        await api.tabs
          .sendMessage(tabId, { type: "exorcised", companies: await exorcist.exorcised(tabId) } satisfies ContentMessage)
          .catch(() => undefined);
        break;
      case "CLEAR_EXORCISE":
        await clearTab(tabId);
        break;
      case "TRACKER_UPDATE":
        if (!(await isHaunted(tabId))) break;
        if (Array.isArray(msg.companies) && msg.companies.every(isHit) && Number.isFinite(msg.total)) {
          await session.set({ [ghostsKey(tabId)]: { companies: msg.companies.map(clean), total: msg.total } });
        }
        break;
      case "TOMBSTONE_UPDATE":
        if (!(await isHaunted(tabId))) break;
        if (Array.isArray(msg.dead)) await session.set({ [tombstonesKey(tabId)]: msg.dead.filter(isDead).map(({ url, path, status }) => ({ url, path, status })) });
        break;
      case "CHECK_LINKS":
        await checkCrossSite(tabId, msg.urls, sender);
        break;
    }
    return getState(tabId);
  }

  function register() {
    api.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
      if (sender.id !== api.runtime.id || !isRequest(msg) || tabOf(msg, sender) === undefined) return false;
      handle(msg, sender).then(sendResponse, (e) =>
        sendResponse({ haunted: false, restricted: true, url: null, ghosts: [], exorcised: [], tombstones: [], error: message(e) } satisfies TabState),
      );
      return true; // keep the channel open for the async answer
    });
    api.tabs.onRemoved.addListener((tabId) => Promise.all([session.remove(hauntKey(tabId)), clearTab(tabId)]));
    // A navigation or reload throws the overlay away with the old document. Chrome also fires
    // status "loading" (with a url) for pushState and hash changes, where the document and its
    // overlay survive, so only clear when our content script no longer answers.
    api.tabs.onUpdated.addListener(async (tabId, info) => {
      if (info.status !== "loading") return;
      const r = await api.tabs.sendMessage(tabId, { type: "ping" } satisfies ContentMessage).catch(() => null);
      if (r?.ok) return; // answered: same document
      await session.remove(hauntKey(tabId));
      await clearTab(tabId);
    });
  }

  return { handle, register, getState };
}
