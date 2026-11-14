// Watches the page for clocks that tick. A clock-shaped value that has changed three times
// is a timer. Read-only: the observer callback only reads the tree.
import { blockOf, CLOCK, flowOf, inSkipped, locate, snippetOf, type DarkPattern } from "./dark-patterns";

export interface TickOptions {
  /** Changes needed before a clock counts as ticking. */
  changes?: number;
  windowMs?: number;
}

export function createTickTracker(opts: TickOptions = {}) {
  const { changes = 3, windowMs = 10_000 } = opts;
  const seen = new WeakMap<Element, { value: string; times: number[]; reported: boolean }>();
  return {
    /** Note the clock value now showing in `block`; true the first time it has ticked enough. */
    note(block: Element, clock: string, now: number): boolean {
      const s = seen.get(block);
      if (!s) {
        seen.set(block, { value: clock, times: [], reported: false });
        return false;
      }
      if (s.value === clock) return false;
      s.value = clock;
      s.times = [...s.times.filter((t) => now - t <= windowMs), now];
      if (s.times.length >= changes && !s.reported) {
        s.reported = true;
        return true;
      }
      return false;
    },
  };
}

export interface TimerOptions {
  now?: () => number;
  MutationObserver?: typeof MutationObserver;
}

/** Calls `onTimer` once per block whose clock ticks; returns a function that stops watching. */
export function watchTimers(doc: Document, costumeHost: string, onTimer: (p: DarkPattern) => void, opts: TimerOptions = {}): () => void {
  const tracker = createTickTracker();
  const mo = new (opts.MutationObserver ?? doc.defaultView!.MutationObserver)((records) => {
    const blocks = new Set<Element>();
    for (const r of records.slice(0, 200)) {
      const el = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (el?.isConnected && !inSkipped(el, costumeHost)) blocks.add(blockOf(el));
    }
    for (const block of blocks) {
      const hit = locate(flowOf(block, costumeHost), CLOCK);
      if (hit && tracker.note(block, hit.text, (opts.now ?? Date.now)())) {
        onTimer({ kind: "timer", element: hit.element, snippet: snippetOf(hit.element, CLOCK) });
      }
    }
  });
  mo.observe(doc.body, { subtree: true, childList: true, characterData: true });
  return () => mo.disconnect();
}
