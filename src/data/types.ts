// Messages and state shared by the popup, background and content script.

/** Popup → background, via chrome.runtime.sendMessage. */
export type PopupRequest =
  | { type: "HAUNT"; tabId: number }
  | { type: "UNHAUNT"; tabId: number }
  | { type: "GET_STATE"; tabId: number };

/** Background → content script, via chrome.tabs.sendMessage. */
export type ContentMessage = { type: "unhaunt" };

/** What the background answers to every PopupRequest. */
export interface TabState {
  haunted: boolean;
  restricted: boolean;
  /** null when the extension cannot read the tab's URL (no access). */
  url: string | null;
  /** Set when a HAUNT or UNHAUNT could not be carried out. */
  error?: string;
}

/** chrome.storage.session key holding `true` while a tab is haunted. */
export const hauntKey = (tabId: number) => `haunt:${tabId}`;

/** chrome.storage.local key for the sound preference (default false). */
export const AUDIO_KEY = "audioEnabled";

/** Optional host permissions requested by "Check links to other sites". */
export const LINK_CHECK_ORIGINS = ["http://*/*", "https://*/*"];
