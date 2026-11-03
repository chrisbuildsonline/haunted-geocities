import { hauntKey, type ContentMessage, type PopupRequest, type TabState } from "../data/types";
import { isRestrictedUrl } from "./restricted";

const TYPES = new Set(["HAUNT", "UNHAUNT", "GET_STATE"]);

const isRequest = (m: unknown): m is PopupRequest =>
  typeof m === "object" && m !== null && TYPES.has((m as PopupRequest).type) && Number.isInteger((m as PopupRequest).tabId);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The service worker's logic, with chrome passed in so tests can hand it a mock. */
export function createBackground(api: typeof chrome) {
  const session = api.storage.session;

  async function getState(tabId: number): Promise<TabState> {
    const tab = await api.tabs.get(tabId);
    const url = tab.url || tab.pendingUrl || null;
    const fileAccess = url?.startsWith("file:") ? await api.extension.isAllowedFileSchemeAccess() : false;
    const key = hauntKey(tabId);
    const stored = await session.get(key);
    return { haunted: stored[key] === true, restricted: isRestrictedUrl(url ?? undefined, fileAccess), url };
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
    return getState(tabId);
  }

  async function handle(msg: PopupRequest, _sender: chrome.runtime.MessageSender): Promise<TabState> {
    if (msg.type === "HAUNT") return haunt(msg.tabId);
    if (msg.type === "UNHAUNT") return unhaunt(msg.tabId);
    return getState(msg.tabId);
  }

  function register() {
    api.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
      if (sender.id !== api.runtime.id || !isRequest(msg)) return false;
      handle(msg, sender).then(sendResponse, (e) =>
        sendResponse({ haunted: false, restricted: true, url: null, error: message(e) } satisfies TabState),
      );
      return true; // keep the channel open for the async answer
    });
    api.tabs.onRemoved.addListener((tabId) => session.remove(hauntKey(tabId)));
    // A navigation or reload throws the overlay away with the old document.
    api.tabs.onUpdated.addListener((tabId, info) => {
      if (info.status === "loading") return session.remove(hauntKey(tabId));
    });
  }

  return { handle, register, getState };
}
