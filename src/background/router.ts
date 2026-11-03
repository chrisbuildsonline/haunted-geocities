import { lookup } from "../content/matcher";
import trackerJson from "../data/trackers.json";
import {
  ghostsKey,
  hauntKey,
  type CompanyHit,
  type ContentMessage,
  type ContentRequest,
  type PopupRequest,
  type TabState,
  type TrackerData,
} from "../data/types";
import { Exorcist } from "./exorcise";
import { isRestrictedUrl } from "./restricted";

type Request = PopupRequest | ContentRequest;

const TYPES = new Set(["HAUNT", "UNHAUNT", "GET_STATE", "EXORCISE", "LET_BACK", "CLEAR_EXORCISE", "TRACKER_UPDATE"]);

const isRequest = (m: unknown): m is Request => typeof m === "object" && m !== null && TYPES.has((m as Request).type);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isHit = (c: unknown): c is CompanyHit =>
  typeof c === "object" && c !== null && typeof (c as CompanyHit).company === "string" && Array.isArray((c as CompanyHit).domains) && typeof (c as CompanyHit).count === "number";

const byCountThenName = (a: CompanyHit, b: CompanyHit) => b.count - a.count || (a.company < b.company ? -1 : a.company > b.company ? 1 : 0);

/** The service worker's logic, with chrome (and the tracker data) passed in so tests can hand it mocks. */
export function createBackground(api: typeof chrome, data: TrackerData = trackerJson as TrackerData) {
  const session = api.storage.session;
  const exorcist = new Exorcist(api);

  /**
   * The tab a request is about. Popup requests name it in the body; for content-script requests
   * it is sender.tab.id and a tabId in the body is ignored. An extension page opened as a tab
   * (the e2e popup) is not the target, so it counts as the popup.
   */
  function tabOf(msg: Request, sender: chrome.runtime.MessageSender): number | undefined {
    const fromPage = sender.url?.startsWith(`chrome-extension://${api.runtime.id}/`) ?? false;
    let id: unknown;
    if (msg.type === "CLEAR_EXORCISE" || msg.type === "TRACKER_UPDATE") id = sender.tab?.id;
    else if ((msg.type === "EXORCISE" || msg.type === "LET_BACK") && sender.tab && !fromPage) id = sender.tab.id;
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
    };
  }

  /** Drop everything the tab's haunt left behind: its block rules and what it reported. */
  async function clearTab(tabId: number) {
    await exorcist.clearTab(tabId);
    await session.remove(ghostsKey(tabId));
  }

  async function haunt(tabId: number): Promise<TabState> {
    const state = await getState(tabId);
    if (state.restricted) return state;
    try {
      // content.js haunts on injection and is idempotent, so re-injecting is harmless.
      await api.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch (e) {
      return { ...state, error: message(e) };
    }
    await session.set({ [hauntKey(tabId)]: true });
    return { ...state, haunted: true };
  }

  async function unhaunt(tabId: number): Promise<TabState> {
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

  async function handle(msg: Request, sender: chrome.runtime.MessageSender): Promise<TabState> {
    const tabId = tabOf(msg, sender);
    if (tabId === undefined) throw new Error("No tab for this request.");
    switch (msg.type) {
      case "HAUNT":
        return haunt(tabId);
      case "UNHAUNT":
        return unhaunt(tabId);
      case "EXORCISE":
        await exorcise(tabId, msg.company, msg.domains);
        break;
      case "LET_BACK":
        if (typeof msg.company === "string") await exorcist.letBack(tabId, msg.company);
        break;
      case "CLEAR_EXORCISE":
        await clearTab(tabId);
        break;
      case "TRACKER_UPDATE":
        if (Array.isArray(msg.companies) && msg.companies.every(isHit) && Number.isFinite(msg.total)) {
          await session.set({ [ghostsKey(tabId)]: { companies: msg.companies, total: msg.total } });
        }
        break;
    }
    return getState(tabId);
  }

  function register() {
    api.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
      if (sender.id !== api.runtime.id || !isRequest(msg) || tabOf(msg, sender) === undefined) return false;
      handle(msg, sender).then(sendResponse, (e) =>
        sendResponse({ haunted: false, restricted: true, url: null, ghosts: [], exorcised: [], error: message(e) } satisfies TabState),
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
