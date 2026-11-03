// Messages and state shared by the popup, background and content script.

/** One tracker company seen on the page (from the Resource Timing entries). */
export interface CompanyHit {
  /** Company display name, e.g. "ICF". */
  company: string;
  /** Deduped request hostnames seen for this company. */
  domains: string[];
  /** Number of requests. */
  count: number;
  categories: string[];
  /** Highest fingerprinting score (0-3) over the company's tracker domains. */
  fingerprinting: number;
}

/** src/data/trackers.json, written by scripts/ingest-trackers.ts. */
export interface TrackerData {
  source: string;
  licence: string;
  fetched: string;
  /** tracker domain → its company, prevalence, categories (may be empty) and fingerprinting score (0-3) */
  domains: Record<string, { company: string; prevalence: number; categories: string[]; fingerprinting: number }>;
  /** company display name → every domain its entity owns (for the same-company check) */
  entities: Record<string, string[]>;
}

/** Popup → background, via chrome.runtime.sendMessage. */
export type PopupRequest =
  | { type: "HAUNT"; tabId: number }
  | { type: "UNHAUNT"; tabId: number }
  | { type: "GET_STATE"; tabId: number }
  /** `domains` defaults to the hosts the tab reported for the company; the background filters them either way. */
  | { type: "EXORCISE"; tabId: number; company: string; domains?: string[] }
  | { type: "LET_BACK"; tabId: number; company: string };

/** Content script → background; the tab id comes from sender.tab.id, never from the message. */
export type ContentRequest =
  | { type: "TRACKER_UPDATE"; companies: CompanyHit[]; total: number }
  | { type: "EXORCISE"; company: string; domains?: string[] }
  | { type: "LET_BACK"; company: string }
  | { type: "CLEAR_EXORCISE" };

/** Background → content script, via chrome.tabs.sendMessage. */
export type ContentMessage = { type: "unhaunt" } | { type: "ping" } | { type: "exorcised"; companies: string[] };

/** What the background answers to every PopupRequest. */
export interface TabState {
  haunted: boolean;
  restricted: boolean;
  /** null when the extension cannot read the tab's URL (no access). */
  url: string | null;
  /** Tracker companies found on the page, most requests first, then by name. */
  ghosts: CompanyHit[];
  /** Companies the user has exorcised in this tab (their domains are blocked). */
  exorcised: string[];
  /** Set when a HAUNT or UNHAUNT could not be carried out. */
  error?: string;
}

/** chrome.storage.session key holding `true` while a tab is haunted. */
export const hauntKey = (tabId: number) => `haunt:${tabId}`;

/** chrome.storage.session key holding `{ companies: CompanyHit[], total: number }` last reported by the tab. */
export const ghostsKey = (tabId: number) => `ghosts:${tabId}`;

/** chrome.storage.session key holding `{ [company]: dnrRuleId }` for the tab's exorcised companies. */
export const exorcisedKey = (tabId: number) => `exorcised:${tabId}`;

/** chrome.storage.session key holding the last declarativeNetRequest rule id handed out. */
export const RULE_SEQ_KEY = "dnrRuleSeq";

/** chrome.storage.local key for the sound preference (default false). */
export const AUDIO_KEY = "audioEnabled";

/** Optional host permissions requested by "Check links to other sites". */
export const LINK_CHECK_ORIGINS = ["http://*/*", "https://*/*"];
