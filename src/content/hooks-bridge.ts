// Isolated-world end of the vampire hooks: listens for the MAIN-world reports, validates them,
// and names the company behind the script. A spoofed event can only change the costume: the
// Exorcise whitelist in the background checks domains against trackers.json, not against this.
import trackerJson from "../data/trackers.json";
import type { TrackerData } from "../data/types";
import { lookup, matchTracker } from "./matcher";

export type Api = "canvas" | "audio" | "fonts";
const APIS: readonly string[] = ["canvas", "audio", "fonts"];

const isSameOrSub = (host: string, parent: string) => host === parent || host.endsWith(`.${parent}`);

/**
 * The company (or the bare host, when it is not a known tracker) behind a script at `scriptUrl`
 * on a page at `siteHost`; null for first-party scripts and anything that is not http(s).
 */
export function attribute(scriptUrl: string, siteHost: string, data: TrackerData): string | null {
  let host: string;
  try {
    const url = new URL(scriptUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  const site = siteHost.toLowerCase().replace(/\.$/, "");
  if (isSameOrSub(host, site) || isSameOrSub(site, host)) return null;
  if (lookup(host, data)) return matchTracker(host, data, siteHost); // null: the site's own company
  return host;
}

export function createVampireBridge(data: TrackerData = trackerJson as TrackerData) {
  let stopListening: (() => void) | undefined;
  const stop = () => {
    stopListening?.();
    stopListening = undefined;
  };
  return {
    start(nonce: string, siteHost: string, onVampire: (company: string, api: Api) => void, win: Window = window) {
      stop();
      const seen = new Set<string>();
      const handler = (e: Event) => {
        const d = (e as CustomEvent).detail as { api?: unknown; scriptUrl?: unknown } | null;
        if (typeof d !== "object" || d === null || typeof d.scriptUrl !== "string" || typeof d.api !== "string" || !APIS.includes(d.api)) return;
        const key = `${d.api}|${d.scriptUrl}`;
        if (seen.has(key)) return;
        seen.add(key);
        const company = attribute(d.scriptUrl, siteHost, data);
        if (company) onVampire(company, d.api as Api);
      };
      win.addEventListener(nonce, handler);
      stopListening = () => win.removeEventListener(nonce, handler);
    },
    stop,
  };
}
