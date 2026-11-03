// HEAD-checks URLs for the content script (same-origin) and the service worker (cross-site).
// A URL is dead only on a clear 404 or 410: errors, timeouts and redirects never make a false tombstone.
import type { DeadLink } from "../data/types";

const CONCURRENCY = 4;
const TIMEOUT_MS = 5000;

async function statusOf(url: string, method: "HEAD" | "GET", fetchFn: typeof fetch, timeoutMs: number): Promise<number | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { method, credentials: "omit", redirect: "manual", cache: "no-store", signal: ctl.signal });
    return res.type === "opaqueredirect" ? null : res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function check(url: string, fetchFn: typeof fetch, timeoutMs: number, getRetry: boolean): Promise<DeadLink | null> {
  let status = await statusOf(url, "HEAD", fetchFn, timeoutMs);
  if (getRetry && (status === 405 || status === 501)) status = await statusOf(url, "GET", fetchFn, timeoutMs);
  return status === 404 || status === 410 ? { url, path: new URL(url).pathname, status } : null;
}

/** The dead links among `urls`, in input order. */
export async function checkLinks(urls: string[], fetchFn: typeof fetch = fetch, opts: { timeoutMs?: number; getRetry?: boolean } = {}): Promise<DeadLink[]> {
  const results: (DeadLink | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      results[i] = await check(urls[i]!, fetchFn, opts.timeoutMs ?? TIMEOUT_MS, opts.getRetry ?? true);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results.filter((r): r is DeadLink => r !== null);
}
