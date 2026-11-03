// Pure tracker matching: just hostnames and the tracker data, no browser APIs.
import type { TrackerData } from "../data/types";

const normalise = (host: string) => host.toLowerCase().replace(/\.$/, "");

/** `host`, then each parent domain down to (not including) the bare last label. */
function* suffixes(host: string): Generator<string> {
  const labels = normalise(host).split(".");
  for (let i = 0; i < labels.length - 1; i++) yield labels.slice(i).join(".");
}

const isSameOrSub = (host: string, parent: string) => host === parent || host.endsWith(`.${parent}`);

/** The tracker domain `hostname` falls under (itself or a parent), or null. */
export function lookup(hostname: string, data: TrackerData): string | null {
  for (const d of suffixes(hostname)) if (Object.hasOwn(data.domains, d)) return d;
  return null;
}

const ownerIndex = new WeakMap<TrackerData, Map<string, string[]>>();
/** entity domain → companies owning it */
function owners(data: TrackerData): Map<string, string[]> {
  let index = ownerIndex.get(data);
  if (!index) {
    index = new Map();
    for (const [company, domains] of Object.entries(data.entities)) {
      for (const d of domains) index.set(d, [...(index.get(d) ?? []), company]);
    }
    ownerIndex.set(data, index);
  }
  return index;
}

/**
 * The company behind a request to `requestHost` made by a page on `siteHost`, or null when it
 * is not a known tracker or is first party (the site's own host or subdomains, or any domain
 * owned by the same company as the site).
 */
export function matchTracker(requestHost: string, data: TrackerData, siteHost: string): string | null {
  const domain = lookup(requestHost, data);
  if (!domain) return null;
  const req = normalise(requestHost);
  const site = normalise(siteHost);
  if (isSameOrSub(req, site) || isSameOrSub(site, domain)) return null;
  const company = data.domains[domain]!.company;
  const index = owners(data);
  for (const d of suffixes(site)) if (index.get(d)?.includes(company)) return null;
  return company;
}
