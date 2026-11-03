// Finds tracker requests the page has made, read-only: Resource Timing entries only, nothing is
// intercepted, blocked or changed. Hits are grouped per company.
import type { CompanyHit, TrackerData } from "../data/types";
import { lookup, matchTracker } from "./matcher";

export interface ScanResult {
  companies: CompanyHit[];
  /** Tracker requests seen, over all companies. */
  total: number;
}

export interface ScannerOptions {
  data: TrackerData;
  siteHost: string;
  onUpdate: (result: ScanResult) => void;
  /** Injectable for tests (happy-dom has neither). */
  performance?: Pick<Performance, "getEntriesByType">;
  PerformanceObserver?: typeof PerformanceObserver;
}

/** Scan existing and future resource entries until `stop()`. Calls onUpdate when the hits change. */
export function startScanner(opts: ScannerOptions): { stop(): void; snapshot(): ScanResult } {
  const { data, siteHost, onUpdate } = opts;
  const perf = opts.performance ?? performance;
  const Observer = opts.PerformanceObserver ?? (typeof PerformanceObserver === "undefined" ? undefined : PerformanceObserver);

  const hits = new Map<string, { domains: Set<string>; categories: Set<string>; fingerprinting: number; count: number }>();
  const seen = new Set<string>();
  let total = 0;
  let stopped = false;

  const snapshot = (): ScanResult => ({
    total,
    companies: [...hits].map(([company, h]) => ({
      company,
      domains: [...h.domains].sort(),
      count: h.count,
      categories: [...h.categories].sort(),
      fingerprinting: h.fingerprinting,
    })),
  });

  const ingest = (entries: readonly { name: string; startTime: number }[]) => {
    const before = total;
    for (const e of entries) {
      const key = `${e.startTime}|${e.name}`;
      if (seen.has(key)) continue; // a buffered observer re-delivers what getEntriesByType returned
      seen.add(key);
      let host: string;
      try {
        const url = new URL(e.name);
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        host = url.hostname;
      } catch {
        continue;
      }
      const company = matchTracker(host, data, siteHost);
      if (!company) continue;
      const rec = data.domains[lookup(host, data)!]!;
      const h = hits.get(company) ?? { domains: new Set<string>(), categories: new Set<string>(), fingerprinting: 0, count: 0 };
      h.domains.add(host);
      for (const c of rec.categories) h.categories.add(c);
      h.fingerprinting = Math.max(h.fingerprinting, rec.fingerprinting);
      h.count++;
      hits.set(company, h);
      total++;
    }
    if (total !== before) onUpdate(snapshot());
  };

  ingest(perf.getEntriesByType("resource"));
  const observer = Observer
    ? new Observer((list) => {
        if (!stopped) ingest(list.getEntries());
      })
    : undefined;
  observer?.observe({ type: "resource", buffered: true });

  return {
    stop() {
      stopped = true;
      observer?.disconnect();
    },
    snapshot,
  };
}
