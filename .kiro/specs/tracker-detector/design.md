# Design: Tracker Detector (R5)

## Context

This spec adds the tracker detection pipeline to the costume: a build-time ingest script that compiles DuckDuckGo Tracker Radar data into a committed JSON file, a pure matcher that maps request hostnames to tracker companies, a content-script scanner that reads `PerformanceResourceTiming` entries, ghost sprites in the gutter lanes, HUD/popup integration, and the Exorcise action via `declarativeNetRequest` session rules.

It builds on the costume renderer (R4), which established the shadow DOM layers (`#lanes` z-index 2, `#hud` z-index 5, `#cards` z-index 6), the haunt-moment timeline, the body-padding adopted stylesheet, and reduced-motion handling. The R4 `renderCostume()` created `#lanes` and `#cards` as empty divs; this spec populates them.

Steering references: `product.md` (ghost trackers, Exorcise with session DNR rules, scope boundaries), `tech.md` (DuckDuckGo Tracker Radar CC BY-NC-SA 4.0, Shadow DOM, MutationObserver, IntersectionObserver, DNR session rules), `structure.md` (`src/data/` for tracker data, `scripts/` for build scripts, `src/background/` for DNR management, `src/content/` for the scanner and ghost rendering), `non-destructive-dom.md` (observers read-only, no page mutation, byte-identical un-haunt), `accessibility-and-motion.md` (reduced motion, 3 Hz ceiling, keyboard, contrast), `era-accuracy.md` (web-safe colours, Comic Sans MS / Times New Roman, original pixel art). Design reference: `design/DESIGN.md` Ghosts, Ghost Card, and Haunt moment sections.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BUILD TIME                                                                  │
│    scripts/ingest-trackers.ts                                                │
│      reads: data/raw/extension-tds.json  (keys: trackers, entities)          │
│             data/raw/tracker-radar-LICENSE.txt  (CC BY-NC-SA 4.0)             │
│      writes: src/data/trackers.json   (committed)                            │
│             src/data/LICENSE-tracker-radar.txt                               │
│             src/data/ATTRIBUTION.md                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  RUNTIME — content script (isolated world, inside the shadow root)          │
│                                                                               │
│    src/data/trackers.json  ──►  matcher (matchTracker)                        │
│       domains map + entities map      │                                      │
│                                        │                                      │
│    PerformanceObserver (resource) ──►  scanner ──►  companyHits[]           │
│    performance.getEntriesByType             │                                 │
│                                             ▼                                 │
│    ghosts.ts  ──►  #lanes (ghost sprites, labels, +N stack)                   │
│    hud.ts     ──►  #hud (counts, odometer)                                    │
│    card.ts    ──►  #cards (ghost card with Exorcise button)                   │
│                                                                               │
│    Exorcise click ──►  chrome.runtime.sendMessage({ EXORCISE, company, ... }) │
│    Let-back click ──►  chrome.runtime.sendMessage({ LET_BACK, company })     │
│    (no tabId in message — background uses sender.tab.id)                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  RUNTIME — background service worker                                          │
│                                                                               │
│    src/background/exorcise.ts  ──►  Exorcist class                            │
│      chrome.declarativeNetRequest.updateSessionRules                          │
│      getSessionRules / removeSessionRules                                     │
│      validates domains against trackers.json for the named company            │
│      incrementing rule-id counter (no LRU, no cap)                            │
│    tabs.onRemoved ──►  clear that tab's rules                                 │
│                                                                               │
│    sender.tab.id used for content-script messages                             │
│    popup messages include tabId (popup queries active tab)                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  RUNTIME — popup                                                              │
│                                                                               │
│    src/popup/screens.ts  ──►  haunted screen: ghost list (sorted by count)    │
│      rows with Exorcise / Exorcised pill                                      │
│    chrome.runtime.sendMessage({ EXORCISE / LET_BACK, tabId, company, ... })  │
│    (popup includes tabId from chrome.tabs.query)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Format

### `src/data/trackers.json`

```jsonc
{
  "_license": "CC BY-NC-SA 4.0 — see LICENSE-tracker-radar.txt",
  "_source": "DuckDuckGo Tracker Radar (duckduckgo/tracker-blocklists)",
  "domains": {
    "doubleclick.net": {
      "company": "Google",
      "prevalence": 0.7234,
      "categories": ["Advertising"],
      "fingerprinting": 1
    },
    "google-analytics.com": {
      "company": "Google",
      "prevalence": 0.6891,
      "categories": ["Analytics"],
      "fingerprinting": 0
    },
    "some-tracker.com": {
      "company": "SomeCo",
      "prevalence": 0.001,
      "categories": [],
      "fingerprinting": 0
    }
  },
  "entities": {
    "Google": ["doubleclick.net", "google-analytics.com", "google.com", "youtube.com"],
    "SomeCo": ["some-tracker.com"]
  }
}
```

- **domains key:** the registrable domain from the TDS `trackers` object (e.g. `doubleclick.net`, not `ad.doubleclick.net`).
- **company:** `owner.displayName` (or `owner.name` as fallback).
- **prevalence:** the raw float from the dataset (e.g. `0.7234`).
- **categories:** the category labels from the dataset, stored as-is. May be an empty array — trackers with no categories are kept (not skipped).
- **fingerprinting:** the integer fingerprinting score (0–3) from the dataset, or 0 when absent.
- **entities key:** keyed by company display name, each value is the list of domains that entity owns (from the TDS `entities` object). Used by the matcher for the same-company first-party check (requirement 10).
- **Prevalence threshold:** `>= 0.0001`.

### Why keyed by domain (not the prototype's compact index arrays)

The prototype used `{ c: [companyNames], k: [categoryNames], d: { domain: [cIdx, kIdx, fpFlag] } }` to minimise file size. For this project, the Vite bundle inlines the JSON into the content script, so a flat domain-keyed object is simpler to read, type, and test. The file stays compact because prevalence and fingerprinting scores are short numbers.

## Module Layout

```
scripts/
  ingest-trackers.ts     # build-time: raw Tracker Radar → src/data/trackers.json

src/data/
  trackers.json          # committed compact data (generated, not hand-edited)
  types.ts               # (existing) adds TrackerData, CompanyHit, ExorciseRequest, etc.

src/content/
  costume/
    render.ts            # (existing, modified) calls scanner, passes hits to ghosts + HUD
    ghosts.ts            # NEW: builds ghost sprites in #lanes, manages slots, drift, cards
    card.ts              # NEW: ghost card (title, domains, Exorcise button, stamp)
    hud.ts               # (existing, modified) setCounts/setOdometer called with real values
    haunt-moment.ts      # (existing, modified) ghost rise-in phase added to the timeline
    sample.ts            # (existing) IntersectionObserver for slot text-rect checks
  scanner.ts             # NEW: PerformanceObserver + matcher, produces companyHits
  matcher.ts             # NEW: pure matchTracker(hostname, data, pageHost) → CompanyHit | null

src/background/
  router.ts              # (existing, modified) routes EXORCISE / LET_BACK / CLEAR_EXORCISE
  exorcise.ts            # NEW: Exorcist class managing DNR session rules per tab

src/popup/
  screens.ts             # (existing, modified) haunted screen: ghost list with Exorcise rows
```

## Ingest Script (`scripts/ingest-trackers.ts`)

```ts
// Dev-time only: bun scripts/ingest-trackers.ts <rawDir> [outDir]
// Reads data/raw/extension-tds.json + data/raw/tracker-radar-LICENSE.txt.
// Writes src/data/trackers.json + LICENSE + ATTRIBUTION.md. Output is committed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MIN_PREVALENCE = 0.0001;

const ATTRIBUTION = `# Attribution

This product includes Tracker Radar data from DuckDuckGo
(https://github.com/duckduckgo/tracker-blocklists), licensed under
CC BY-NC-SA 4.0. See LICENSE-tracker-radar.txt for the full licence.

Changes made: the raw TDS file was filtered to domains with prevalence
>= ${MIN_PREVALENCE} and reformatted into a compact JSON object. The
entities map was extracted as-is.`;

export function ingest(rawDir: string, outDir: string): { domains: number; companies: number; entities: number } {
  const tdsPath = path.join(rawDir, "extension-tds.json");
  const licensePath = path.join(rawDir, "tracker-radar-LICENSE.txt");
  if (!existsSync(tdsPath)) throw new Error(`extension-tds.json not found in ${rawDir}`);
  if (!existsSync(licensePath)) throw new Error(`tracker-radar-LICENSE.txt not found in ${rawDir}: refusing to bundle data without its licence`);

  const tds = JSON.parse(readFileSync(tdsPath, "utf8"));
  const trackers = tds.trackers as Record<string, {
    owner?: { name?: string; displayName?: string };
    prevalence?: number;
    categories?: string[];
    fingerprinting?: number;
  }>;
  const entities = tds.entities as Record<string, { domains: string[] }>;

  // Build domains map: keyed by domain, with company, prevalence, categories, fingerprinting.
  // Empty categories are kept (not skipped).
  const domains: Record<string, { company: string; prevalence: number; categories: string[]; fingerprinting: number }> = {};
  for (const [domain, t] of Object.entries(trackers)) {
    const company = t.owner?.displayName || t.owner?.name;
    if (!company) continue;
    if (!(t.prevalence >= MIN_PREVALENCE)) continue;
    const cats = Array.isArray(t.categories) ? [...t.categories] : [];
    const fp = typeof t.fingerprinting === "number" ? t.fingerprinting : 0;
    domains[domain] = { company, prevalence: t.prevalence, categories: cats, fingerprinting: fp };
  }

  // Build entities map: keyed by company display name → list of domains owned.
  const entitiesMap: Record<string, string[]> = {};
  for (const [name, e] of Object.entries(entities)) {
    entitiesMap[name] = [...e.domains];
  }

  // Deterministic output: sort domain keys, entity keys, and entity domain lists alphabetically.
  const sortedDomains: Record<string, typeof domains[string]> = {};
  for (const key of Object.keys(domains).sort()) sortedDomains[key] = domains[key]!;

  const sortedEntities: Record<string, string[]> = {};
  for (const key of Object.keys(entitiesMap).sort()) sortedEntities[key] = [...entitiesMap[key]!].sort();

  mkdirSync(outDir, { recursive: true });
  const output = {
    _license: "CC BY-NC-SA 4.0 — see LICENSE-tracker-radar.txt",
    _source: "DuckDuckGo Tracker Radar (duckduckgo/tracker-blocklists)",
    domains: sortedDomains,
    entities: sortedEntities,
  };
  writeFileSync(path.join(outDir, "trackers.json"), JSON.stringify(output, null, 0));
  copyFileSync(licensePath, path.join(outDir, "LICENSE-tracker-radar.txt"));
  writeFileSync(path.join(outDir, "ATTRIBUTION.md"), ATTRIBUTION);
  return {
    domains: Object.keys(sortedDomains).length,
    companies: new Set(Object.values(sortedDomains).map((d) => d.company)).size,
    entities: Object.keys(sortedEntities).length,
  };
}
```

### Key decisions

- **No category mapping or filtering.** The TDS `categories` array is stored as-is. Trackers with an empty `categories` array are kept (requirement 2). There is no `TRACKING_LABELS` map and no category-based skip.
- **Entities map.** The TDS `entities` object is extracted directly: keyed by company display name, each value is the list of domains that entity owns. This map is used by the matcher for the same-company first-party check (requirement 10).
- **Single input file.** The script reads one TDS file (`extension-tds.json`) with `trackers` and `entities` keys — not a directory of per-domain JSON files.

### Determinism

- Domain keys are sorted alphabetically before serialisation.
- Entity keys and entity domain lists are sorted alphabetically.
- `JSON.stringify(output, null, 0)` produces compact, stable output (no indentation, no trailing whitespace).
- The same input file produces byte-identical output across runs.

## Matcher (`src/content/matcher.ts`)

```ts
import type { TrackerData } from "../data/types";

export interface CompanyHit {
  company: string;
  domains: string[];
  requestCount: number;
  categories: string[];
  fingerprinting: number; // max over matched domains
}

/** Try the hostname, then each parent domain, stopping at the first registrable domain in the data. */
export function lookupDomain(hostname: string, data: TrackerData): { domain: string; record: TrackerData["domains"][string] } | null {
  for (let h = hostname.toLowerCase().replace(/\.$/, ""); h.includes("."); h = h.slice(h.indexOf(".") + 1)) {
    const record = data.domains[h];
    if (record) return { domain: h, record };
  }
  return null;
}

/** True if `host` is `domain` or a subdomain of `domain`. */
function isWithin(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

/**
 * Map a request hostname to its tracker company, or null.
 * First-party requests to the page's own site never count.
 * A company's own first-party requests on its own site are not tracking.
 */
export function matchTracker(hostname: string, data: TrackerData, pageHost: string): CompanyHit | null {
  const page = pageHost.toLowerCase().replace(/\.$/, "");
  const found = lookupDomain(hostname, data);
  if (!found) return null;

  // Skip if the request domain is the page's own domain or a subdomain of it.
  if (page && isWithin(page, found.domain)) return null;

  // Skip if the page's own host belongs to the same tracker company.
  // Determine the company that owns the page by looking up the page hostname in data.domains,
  // then checking the entities map for all domains owned by that company.
  if (page) {
    const pageLookup = lookupDomain(page, data);
    if (pageLookup) {
      const entityDomains = data.entities[pageLookup.record.company];
      if (entityDomains) {
        // Any request to a domain in that entity's domain list is first-party.
        if (entityDomains.some((d) => isWithin(found.domain, d))) return null;
      }
    }
  }

  return {
    company: found.record.company,
    domains: [found.domain],
    requestCount: 1,
    categories: found.record.categories,
    fingerprinting: found.record.fingerprinting,
  };
}
```

The matcher is pure: no DOM, no Chrome API, no side effects. The scanner calls it per resource-timing entry and reduces the results into a `Map<company, CompanyHit>` with accumulated domain lists and counts.

### Same-company first-party check (requirement 10)

The matcher looks up the page hostname in `data.domains` to find which tracker company owns the page. If found, it checks `data.entities[company]` for all domains owned by that company. Any request to a domain in that entity's domain list is considered first-party and does not count as tracking. For example, Google Analytics loading on google.com is not tracking because both `google.com` and `google-analytics.com` are in the `entities["Google"]` domain list.

If the page hostname is not in `data.domains` (i.e. the page is not a known tracker domain), the same-company check does not apply — all tracker requests are counted.

## Scanner (`src/content/scanner.ts`)

```ts
import type { TrackerData, CompanyHit, ScanResult } from "../data/types";
import { matchTracker } from "./matcher";

export class TrackerScanner {
  private observer: PerformanceObserver | null = null;
  private byCompany = new Map<string, CompanyHit>();
  private totalRequests = 0;

  constructor(
    private data: TrackerData,
    private pageHost: string,
    private onUpdate: (result: ScanResult) => void,
  ) {}

  start() {
    // Read existing entries.
    for (const entry of performance.getEntriesByType("resource")) {
      this.process(entry.name);
    }
    // Observe future entries.
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) this.process(entry.name);
    });
    this.observer.observe({ type: "resource", buffered: false });
    this.emit();
  }

  private process(name: string) {
    let host: string;
    try {
      const u = new URL(name);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      host = u.hostname.toLowerCase();
    } catch {
      return;
    }
    const hit = matchTracker(host, this.data, this.pageHost);
    if (!hit) return;

    let existing = this.byCompany.get(hit.company);
    if (!existing) {
      existing = { company: hit.company, domains: [], requestCount: 0, categories: hit.categories, fingerprinting: 0 };
      this.byCompany.set(hit.company, existing);
    }
    for (const d of hit.domains) {
      if (!existing.domains.includes(d)) existing.domains.push(d);
    }
    existing.fingerprinting = Math.max(existing.fingerprinting, hit.fingerprinting);
    existing.requestCount++;
    this.totalRequests++;
    this.emit();
  }

  private emit() {
    this.onUpdate({
      companies: [...this.byCompany.values()].sort((a, b) => b.requestCount - a.requestCount || (a.company < b.company ? -1 : 1)),
      totalRequests: this.totalRequests,
    });
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
  }
}
```

### First-party exclusion

The scanner delegates all matching and exclusion logic to `matchTracker`. The matcher handles both the page's-own-host check (requirement 9) and the same-company check via the entities map (requirement 10). The scanner simply calls `matchTracker` per resource-timing entry and accumulates the results.

### Read-only

`PerformanceObserver` is read-only: it observes resource timing entries but does not intercept, modify, or block requests. The page's network behaviour is unchanged. Blocking only happens when the user explicitly Exorcises, via the DNR layer.

## Ghosts (`src/content/costume/ghosts.ts`)

### Slot assignment

```
#lanes
  .lane.left   (width: gutter.left, hidden if < 64px)
    .slot (72px pitch, checked against text rects)
      .ghost (48×48 sprite + label)
      .ghost ...
    .stack (+N overflow token)
  .lane.right  (width: gutter.right, hidden if < 64px)
    ...
```

- The `#lanes` div (z-index 2, created empty in R4) is populated with `.lane.left` and `.lane.right` containers.
- Each lane is `position: absolute; top: 48px (below top bands); bottom: calc(hudHeight + 16px + lift)`; width is the gutter width.
- Slots are placed at 72px pitch, starting from the top of the lane.
- An `IntersectionObserver` checks each slot against page text rects (using the existing `pinnedBoxes` / text-node approach from `starfield.ts`). Slots intersecting text are skipped.
- When slots run out, the last slot becomes a `+N` stack token.

### Ghost sprite

48×48, drawn as an SVG with `shape-rendering: crispEdges`:
- Body `#ffffff` with `#ccffff` shade.
- Eyes `#000033`.
- 2-art-px hem tinted per company: `hash(company) mod 6` over `HEM_TINTS`.
- Glow: `filter: drop-shadow(0 0 6px #6633cc) drop-shadow(0 0 2px #ccffff)`.
- `pointer-events: auto` (clickable); the lane container is `pointer-events: none`.

### Label

Below the sprite, a `<div class="ghost-label">`:
- Comic Sans 11px `#ffffcc` on `#000033`, 1px `#6633cc` border.
- Max 12ch, `text-overflow: ellipsis; white-space: nowrap; overflow: hidden`.
- Shows the company display name.

### Drift

After the haunt moment, each ghost drifts:
- Bob: `transform: translateY(±4px)`, 4000ms, `ease-in-out alternate`.
- Sway: `transform: translateX(±6px)`, 7000ms, `ease-in-out alternate`.
- Phase offset: `slotIndex × 700ms` (so ghosts don't move in lockstep).
- Peak speed ~6px/s; a ghost never leaves its 64px lane slot.
- Implemented via CSS `@keyframes` in the costume stylesheet, parameterised by `--hg-phase: <slotIndex * 700>ms`.

### Exorcised state

After Exorcise:
- Ghost sprite fades to `opacity: 0.4`.
- An `EXORCISED` stamp is drawn over the sprite (Times New Roman bold 11px `#ff9900` on `#000033`, rotated -15°).
- The card button changes to `[Let it back]`.

### Haunt-moment integration

The R4 haunt-moment timeline has a 1400–2000ms phase for "Lanes: tracker ghosts rise". This spec implements it:

| Phase | Elements | Keyframes | Duration | Easing |
|-------|----------|-----------|----------|--------|
| Ghost rise | `.ghost` | `translateY(16px) → translateY(0)`, `opacity: 0 → 1` | 300ms, staggered 60ms per ghost (first 8; rest arrive with the 8th) | `cubic-bezier(.2,.8,.2,1)` |

The `playHaunt()` function in `haunt-moment.ts` is modified to iterate over `.ghost` elements and add the rise-in animation. Under reduced motion, ghosts appear at full opacity at 300ms (with the cross-fade).

## Ghost Card (`src/content/costume/card.ts`)

Following the card style in `design/DESIGN.md`:

- 248px wide, max-height 320px, scroll inside.
- Ground `#000033`, 2px outset bevel `#ccccff`/`#333366`, `4px 4px 0 #000000` hard shadow.
- Title bar: 22px tall, `#330066` ground, Times New Roman bold 14px `#ffffcc`, company name + `[x]` close button.
- Body: 12px padding, Comic Sans 13px `#ffffcc`:
  - Category.
  - `Haunts these domains:` followed by a Times New Roman 13px list of domains.
  - `Seen <N> times on this page`.
  - `[Exorcise]` default Win95 button (extra 1px `#000000` ring).
  - Footnote: `Blocked until you close the browser.`
- Placement: anchored beside the ghost sprite, clamped between the top bands and the HUD.
- Keyboard: focus moves into the card. Esc closes, focus returns to the opener.
- Only one card open at a time.

## HUD Updates (`src/content/costume/hud.ts`)

The existing `setCounts` and `setOdometer` functions from R4 are called with real values:

```ts
// In render.ts, after scanner emits:
const hits = scan.companies;
const total = scan.totalRequests;
setCounts(hud, { ghosts: hits.length, vampires: 0, tombstones: 0, curses: 0 });
setOdometer(hud, total);
```

- When `hits.length === 0` and `total === 0`, the HUD shows the empty state (already handled by `setCounts`).
- The odometer roll animation from R4 still runs during the haunt moment; the value is now the real count.

## Popup Ghost List (`src/popup/screens.ts`)

The haunted screen's list surface is modified:

```
+------------------------------------------+
|  Ghosts                           7      |  20px heading, count in accent
|  [g] AdCo Inc                [Exorcise]  |  32px icon, 15px ink, 13px muted
|      4 domains · Advertising             |
|  [g] PixelTrack             (Exorcised)  |  tinted pill, row at 60% ink
|      2 domains · Analytics               |
+------------------------------------------+
```

- The list is populated from `ScanResult.companies`, received via a `TRACKER_UPDATE` message the content script sends to the background, which stores it in `chrome.storage.session` under a per-tab key (the tab ID comes from `sender.tab.id`).
- The popup reads this on mount and on `chrome.storage.onChanged` for that key. The popup obtains the active tab ID via `chrome.tabs.query({ active: true, currentWindow: true })`.
- Each row: 32px icon tile (ghost sprite at 2x, tinted per company), company name (15px ink), `<N> domains · <category>` (13px muted), `[Exorcise]` secondary button or `(Exorcised)` pill.
- The `[Exorcise]` button calls `chrome.runtime.sendMessage({ type: "EXORCISE", tabId, company, domains })`. The popup includes `tabId` because the popup is not a content script — it has no `sender.tab.id`.
- After Exorcise, the row updates to show the `(Exorcised)` pill; the button text changes to `[Let it back]` which calls `{ type: "LET_BACK", tabId, company }`.
- Empty list: `No ghosts here. Suspiciously clean.` + `Trackers that load later will appear here.`

## Exorcise (`src/background/exorcise.ts`)

The `Exorcist` class manages DNR session rules per tab. Rule IDs are a simple incrementing integer — there is no LRU pool and no maximum rule cap. One session rule per tab+company is sufficient (requirement 48).

```ts
export class Exorcist {
  private nextRuleId = 1;
  private rules = new Map<string, number>(); // "tabId:company" → rule id
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private api = chrome.declarativeNetRequest) {}

  exorcise(tabId: number, company: string, domains: string[]): Promise<boolean> {
    if (!Number.isInteger(tabId) || tabId < 0 || !domains.length) return Promise.resolve(false);
    const key = `${tabId}:${company}`;
    const run = this.queue.then(() => this.add(tabId, key, domains));
    this.queue = run.catch(() => {});
    return run.then(() => true, () => false);
  }

  private async add(tabId: number, key: string, domains: string[]) {
    // Remove existing rule for this tab+company if present (re-exorcise replaces).
    const existingId = this.rules.get(key);
    const removeRuleIds = existingId ? [existingId] : [];
    const id = this.nextRuleId++;
    await this.api.updateSessionRules({
      removeRuleIds,
      addRules: [{ id, priority: 1, action: { type: "block" }, condition: { requestDomains: domains, tabIds: [tabId] } }],
    });
    this.rules.set(key, id);
  }

  async letBack(tabId: number, company: string): Promise<void> {
    const key = `${tabId}:${company}`;
    const id = this.rules.get(key);
    if (id) {
      await this.api.removeSessionRules([id]);
      this.rules.delete(key);
    }
  }

  async clearTab(tabId: number): Promise<void> {
    const toRemove: number[] = [];
    for (const [key, id] of this.rules) {
      if (key.startsWith(`${tabId}:`)) {
        toRemove.push(id);
        this.rules.delete(key);
      }
    }
    if (toRemove.length) await this.api.removeSessionRules(toRemove);
  }
}
```

### Rule structure

Each session rule:
- `id`: a small integer, allocated from a simple incrementing counter (`nextRuleId++`). There is no pool, no LRU eviction, and no maximum cap.
- `priority`: 1.
- `action`: `{ type: "block" }`.
- `condition`: `{ requestDomains: domains, tabIds: [tabId] }`.
- Session-scoped: rules live until the browser closes or are explicitly removed. They are not persisted across browser restarts.
- Keyed by `"tabId:company"` — one rule per tab+company. Re-exorcising the same company on the same tab replaces the existing rule.

### Domain validation (requirement 47a)

When the background receives an `EXORCISE` message, it looks up the named company's domains in `trackers.json` and filters the requested domains to only those present in the tracker data for that company. Any domain not found in the tracker data for that company is silently ignored (not blocked). This prevents a compromised or buggy content script from blocking arbitrary domains.

```ts
// In router.ts:
import trackersData from "../data/trackers.json";

function getCompanyDomains(company: string): string[] {
  return Object.entries(trackersData.domains)
    .filter(([, rec]) => rec.company === company)
    .map(([d]) => d);
}

// On EXORCISE:
const tabId = sender.tab?.id ?? request.tabId;
if (tabId === undefined) return;
const valid = getCompanyDomains(request.company);
const domains = request.domains.filter((d) => valid.includes(d));
if (domains.length) await exorcist.exorcise(tabId, request.company, domains);
```

### Lifecycle

- **Exorcise:** `add()` creates the rule. The rule ID is tracked in the `rules` map keyed by `"tabId:company"`.
- **Let back:** `letBack()` removes the rule and its map entry. Only needs `tabId` and `company` — no domains required.
- **Un-haunt:** the content script sends `CLEAR_EXORCISE` before the un-haunt animation; the background calls `clearTab(tabId)`.
- **Tab close:** `chrome.tabs.onRemoved` listener calls `clearTab(tabId)`.

### Background router integration

The existing `createBackground()` in `router.ts` is extended to handle four message types. The tab ID is resolved differently depending on the sender:

- **Content script messages** (`EXORCISE`, `LET_BACK`, `CLEAR_EXORCISE`, `TRACKER_UPDATE`): the background obtains the tab ID from `sender.tab.id`. The content script does not include a `tabId` field.
- **Popup messages** (`EXORCISE`, `LET_BACK`): the popup includes `tabId` (obtained via `chrome.tabs.query`) because the popup is not a content script and has no `sender.tab.id`.

```ts
type BackgroundRequest =
  | { type: "EXORCISE"; company: string; domains: string[]; tabId?: number }
  | { type: "LET_BACK"; company: string; tabId?: number }
  | { type: "CLEAR_EXORCISE"; tabId?: number }
  | { type: "TRACKER_UPDATE"; companies: CompanyHit[]; total: number; tabId?: number };

// Resolve tab ID: content scripts have sender.tab.id; popup includes tabId in the message.
const tabId = sender.tab?.id ?? request.tabId;
```

The router creates one `Exorcist` instance (module-level singleton in the service worker) and delegates to it.

### Content script integration

The content script sends Exorcise/let-back messages to the background without a `tabId` field — the background resolves it from `sender.tab.id`:

```ts
// From the ghost card's Exorcise button (content script — no tabId):
chrome.runtime.sendMessage({ type: "EXORCISE", company, domains });
// From the Let-it-back button:
chrome.runtime.sendMessage({ type: "LET_BACK", company });
```

On un-haunt, before the animation starts:
```ts
chrome.runtime.sendMessage({ type: "CLEAR_EXORCISE" });
```

## Integration with `render.ts`

```ts
// In renderCostume(), after building the costume layers:
import trackersData from "../../data/trackers.json";
import { TrackerScanner } from "../scanner";

const scanner = new TrackerScanner(trackersData, win.location.hostname, (result) => {
  setCounts(hud, { ghosts: result.companies.length, vampires: 0, tombstones: 0, curses: 0 });
  setOdometer(hud, result.totalRequests);
  updateGhosts(lanes, result.companies, croot);
  // Send to background for the popup (no tabId — background uses sender.tab.id):
  chrome.runtime.sendMessage({ type: "TRACKER_UPDATE", companies: result.companies, total: result.totalRequests });
});
scanner.start();
onUnhaunt(doc, () => {
  scanner.stop();
  chrome.runtime.sendMessage({ type: "CLEAR_EXORCISE" });
});
```

## Types (`src/data/types.ts` additions)

```ts
export interface TrackerData {
  _license: string;
  _source: string;
  domains: Record<string, {
    company: string;
    prevalence: number;
    categories: string[];
    fingerprinting: number;
  }>;
  entities: Record<string, string[]>;
}

export interface CompanyHit {
  company: string;
  domains: string[];
  requestCount: number;
  categories: string[];
  fingerprinting: number;
}

export interface ScanResult {
  companies: CompanyHit[];
  totalRequests: number;
}

export type BackgroundRequest =
  | { type: "EXORCISE"; company: string; domains: string[]; tabId?: number }
  | { type: "LET_BACK"; company: string; tabId?: number }
  | { type: "CLEAR_EXORCISE"; tabId?: number }
  | { type: "TRACKER_UPDATE"; companies: CompanyHit[]; total: number; tabId?: number };
```

The `tabId` field is optional on all message variants: content scripts omit it (the background uses `sender.tab.id`); the popup includes it (obtained via `chrome.tabs.query`).

## Non-Destructive Guarantee

- `TrackerScanner` reads `PerformanceResourceTiming` entries and uses `PerformanceObserver` — both are read-only browser APIs that do not modify the page or intercept network traffic.
- `IntersectionObserver` checks slot positions against text rects — read-only, no page mutation.
- Ghost sprites, labels, and cards are built inside the shadow root (`#lanes`, `#cards`), never in the page DOM.
- The only document-level change remains the body-padding adopted stylesheet from R4.
- Un-haunt removes the shadow host (dropping all ghost content) and the body-padding sheet. `document.documentElement.outerHTML` is byte-identical.
- Page scripts are never edited, blocked, or reordered. The DNR block rules act at the network layer, not at the script level.

## Test Strategy

### Unit tests (`test/tracker/`)

Using `happy-dom` for DOM, same pattern as `test/costume.test.ts`:

- **Ingest:** `test/tracker/ingest.test.ts` → reads a small fixture `extension-tds.json` (with `trackers` and `entities` keys), asserts the output JSON structure (domains map with company, prevalence, categories, fingerprinting; entities map keyed by company name), prevalence threshold, empty categories kept (not skipped), and determinism (same input → byte-identical output).
- **Matcher:** `test/tracker/matcher.test.ts` → exact domain match, parent-domain match, first-party exclusion, same-company exclusion via entities map, unknown hostname → null.
- **Scanner:** `test/tracker/scanner.test.ts` → mock `performance.getEntriesByType` and `PerformanceObserver`, assert grouping by company, request counts, total count, first-party skipping (delegated to matcher).
- **Ghosts:** `test/tracker/ghosts.test.ts` → slot assignment, lane width check (64px), +N stack token, label content and truncation, hem tint per company, glow filter, drift keyframes present, exorcised state (opacity + stamp).
- **Card:** `test/tracker/card.test.ts` → card structure (title, domains, count, Exorcise button, footnote), Esc closes, Exorcise changes state.
- **Exorcise:** `test/tracker/exorcise.test.ts` → mock `chrome.declarativeNetRequest`, assert rule added with correct `tabIds` and `requestDomains`, rule IDs are incrementing integers (no LRU, no cap), `letBack` removes rule by tab+company, `clearTab` removes all rules for a tab, domain validation filters out domains not in `trackers.json` for the named company, `exorcise` returns false on API error.
- **Reduced motion:** `test/tracker/reduced-motion.test.ts` → no drift animations, ghosts at slot centres.

### E2E tests (`e2e/tracker.spec.ts`)

Using existing `e2e/fixtures.ts`:

- **Fixture:** a fixture page (`fixtures/trackers.html`) that loads resources from real tracker domains (e.g. `doubleclick.net`, `google-analytics.com`). The test uses the real shipped `src/data/trackers.json` — no test-only patch. Chromium is launched with `--host-resolver-rules` mapping those real tracker domains to `127.0.0.1` so the requests hit the local fixture server. The fixture server listens on `127.0.0.1` (port 80 for HTTP) and serves a small pixel for any path.
- **Ghosts appear:** Haunt the fixture → assert ghost sprites appear in `#lanes` inside the shadow root.
- **HUD counts:** assert the HUD shows the correct ghost count and odometer value.
- **Popup list:** open popup → assert ghost rows sorted by request count.
- **Exorcise blocks:** click Exorcise → assert the tracker resource request is refused with `net::ERR_BLOCKED_BY_CLIENT`.
- **Let it back:** click "Let it back" → assert the tracker resource loads again.
- **Un-haunt clears:** un-haunt → assert all DNR session rules for that tab are removed.
- **Non-destructive:** un-haunt → `document.documentElement.outerHTML` byte-identical.

### E2E Exorcise test detail

The test launches Chromium with `--host-resolver-rules` so real tracker domains resolve to the local fixture server:

```ts
const browser = await chromium.launch({
  args: [
    "--host-resolver-rules=MAP doubleclick.net 127.0.0.1, MAP google-analytics.com 127.0.0.1",
    "--disable-extensions-except=extension-build",
    "--load-extension=extension-build",
  ],
});
```

The fixture page (`fixtures/trackers.html`) includes resources from real tracker domains:
```html
<img src="http://doubleclick.net/pixel.gif">
<img src="http://google-analytics.com/pixel.gif">
```

After Exorcise, a new request to the blocked domain fails with `net::ERR_BLOCKED_BY_CLIENT`:

```ts
// After exorcise, trigger a new request and listen for the failure:
const [failed] = await Promise.all([
  page.waitForEvent("requestfailed", {
    predicate: (req) => req.url().includes("doubleclick.net"),
    timeout: 5000,
  }),
  page.evaluate(() => fetch("http://doubleclick.net/pixel.gif").catch(() => {})),
]);
expect(failed.failure()?.errorText).toContain("net::ERR_BLOCKED_BY_CLIENT");
```

After "Let it back" (or un-haunt), the request succeeds again:

```ts
await Promise.all([
  page.waitForEvent("requestfinished", {
    predicate: (req) => req.url().includes("doubleclick.net"),
    timeout: 5000,
  }),
  page.evaluate(() => fetch("http://doubleclick.net/pixel.gif").catch(() => {})),
]);
// If this resolves without timeout, the request succeeded.
```
