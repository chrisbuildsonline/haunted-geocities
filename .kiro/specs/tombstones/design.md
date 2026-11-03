# Design: Tombstones (R7)

## Overview

This spec adds **tombstone links**: dead same-origin links (HTTP 404/410) that become tombstones while a tab is haunted. Each dead link gets a tombstone marker beside it in the `#markers` layer and a stone card that is the tombstone itself — a grey slab with the path as an inscription. The popup lists tombstones after vampires.

Two checking paths exist:

- **Same-origin**: runs in the content script directly. No new permissions needed — `activeTab` covers the page's own origin for the current tab.
- **Cross-site** (opt-in): the content script sends URLs to the background service worker, which fetches them only when the user has granted the optional `http://*/*` + `https://*/*` host permissions. The background refuses requests from non-haunted tabs and strips LAN/loopback addresses from the fetch set.

The link collector (`collectLinks`) and the shared checker (`checkLinks`) are pure modules with no Chrome dependencies, importable from the content script, the background, and unit tests. The background stores tombstones per tab in `chrome.storage.session` under `tombstones:<tabId>`, alongside the existing `haunt:<tabId>`, `ghosts:<tabId>`, and `nonce:<tabId>` keys. The popup reads them from every `getState` response.

The costume overlay remains non-destructive: all markers, the card, and the CSS live inside the shadow root. `fetch` calls use `credentials: 'omit'` and `redirect: 'manual'` so no cookies are sent and no redirects are followed. After Un-haunt the page DOM is byte-identical.

Steering references: `product.md` (tombstone links, cross-site opt-in, scope boundaries), `tech.md` (Shadow DOM, adopted stylesheets, MutationObserver, IntersectionObserver, `declarativeNetRequest` session rules, no `host_permissions` at install), `non-destructive-dom.md` (observers read-only, no page mutation, byte-identical un-haunt), `accessibility-and-motion.md` (reduced motion, 3 Hz, keyboard, contrast), `era-accuracy.md` (web-safe colours, Times New Roman, original pixel art), `structure.md` (`src/content/`, `src/background/`, `src/data/types.ts`, `fixtures/`).

## Architecture and Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTENT SCRIPT (isolated world)                                              │
│                                                                               │
│  renderCostume()                                                              │
│    └── after scanner + vampire bridge setup:                                  │
│        collectLinks(doc, siteOrigin, HOST_TAG)  → { sameOrigin, crossSite }  │
│        checkLinks(sameOrigin)  ── same-origin fetches (HEAD/GET, 4 concurrent)│
│          dead: { url, path, status }[]                                        │
│        ┌── if dead.length: send TOMBSTONE_UPDATE to background                │
│        │                                                                       │
│        ├── if chrome.permissions.contains(LINK_CHECK_ORIGINS):                │
│        │     send CHECK_LINKS { urls: crossSite }  ──────────────────────┐   │
│        │   else: skip cross-site                                        │   │
│        │                                                                  │   │
│        ├── renderTombstoneMarkers(dead, markers, slots, opts)             │   │
│        ├── HUD: setCounts({ ..., tombstones: dead.length })                │   │
│        └── send TOMBSTONE_UPDATE { dead }  (same-origin + cross-site merged)│   │
│                                                                               │
│  background → chrome.tabs.sendMessage(tabId, { type: "tombstones", dead }) │   │
│    └── merge cross-site dead into the marker set, re-render markers + HUD  │   │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                               │
┌─────────────────────────────────────────────────────────────────────────────┐│
│  BACKGROUND SERVICE WORKER                                                     ││
│                                                                               ││
│  router.handle(msg, sender)                                                   ││
│    ├── CHECK_LINKS                                                            ││
│    │     • verify sender.tab.id is haunted (haunt:<tabId> in session)         ││
│    │     • verify chrome.permissions.contains(LINK_CHECK_ORIGINS)             ││
│    │     • strip refused hosts (refusedHost)                                 ││
│    │     • checkLinks(filtered)  → dead: { url, path, status }[]             ││
│    │     • chrome.tabs.sendMessage(tabId, { type: "tombstones", dead })      ││
│    │                                                                         ││
│    ├── TOMBSTONE_UPDATE                                                      ││
│    │     • session.set({ [tombstonesKey(tabId)]: msg.dead })                 ││
│    │                                                                         ││
│    └── tabs.onUpdated "loading" (not answered by content script)             ││
│          • session.remove(tombstonesKey(tabId))  (with hauntKey, ghostsKey) ││
│                                                                               ││
└─────────────────────────────────────────────────────────────────────────────┘│
                                                                                │
                                                                                ▼
                                                          (content script receives
                                                           cross-site dead links)
```

### Sequence

1. **Haunt** → background injects `content.js`, sends `{ type: "vampires", nonce }`, injects MAIN-world hooks (existing flow). The content script calls `renderCostume()`.
2. **Collect** → `renderCostume` calls `collectLinks(doc, siteOrigin, HOST_TAG)`, which returns `{ sameOrigin: string[], crossSite: string[] }`.
3. **Same-origin check** → `checkLinks(sameOrigin)` runs in the content script. Dead links are rendered as markers immediately.
4. **TOMBSTONE_UPDATE** → the content script sends `{ type: "TOMBSTONE_UPDATE", dead }` to the background, which stores them under `tombstonesKey(tabId)`.
5. **Cross-site check (opt-in)** → if `chrome.permissions.contains(LINK_CHECK_ORIGINS)` is true, the content script sends `{ type: "CHECK_LINKS", urls: crossSite }`. The background validates the tab is haunted and the permission is granted, strips refused hosts, runs `checkLinks`, and sends `{ type: "tombstones", dead }` back via `chrome.tabs.sendMessage`.
6. **Merge** → the content script receives `{ type: "tombstones", dead }`, merges the cross-site dead links into the existing set, re-renders markers, updates the HUD count, and sends a merged `TOMBSTONE_UPDATE`.
7. **Popup** → `getState` returns `tombstones` from `chrome.storage.session`. The popup renders tombstone rows after vampires.
8. **Un-haunt / navigation** → `clearTab` removes `tombstonesKey(tabId)` alongside the other keys.

## Modules

### `src/content/links.ts` — `collectLinks`

A pure function with no side effects, no Chrome API, importable from the content script and unit tests.

```ts
export interface CollectedLinks {
  sameOrigin: string[];
  crossSite: string[];
}

/**
 * Collect all checkable http/https links from the document, split into same-origin
 * and cross-site. Pure: no Chrome API, no side effects.
 *
 * @param doc        The document to scan.
 * @param siteOrigin The page's origin (e.g. "http://127.0.0.1:4321").
 * @param costumeHost The costume host element's tag name ("hg-crypt"); links inside
 *                   its shadow root subtree are excluded.
 */
export function collectLinks(
  doc: Document,
  siteOrigin: string,
  costumeHost: string,
): CollectedLinks {
  // 1. Select all a[href] elements.
  const anchors = [...doc.querySelectorAll("a[href]")];

  // 2. Filter: http/https only, drop hash-only, javascript:, mailto:, tel:, download.
  // 3. Drop links inside the costume host's shadow root subtree.
  // 4. Normalise: strip fragment (everything from # onward).
  // 5. Deduplicate: first occurrence in document order wins.
  // 6. Split by origin.
  // 7. Cap: sameOrigin at 60, crossSite at 30.

  const seen = new Set<string>();
  const sameOrigin: string[] = [];
  const crossSite: string[] = [];

  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;

    // Drop non-http(s) schemes.
    if (href.startsWith("#")) continue;
    if (href.startsWith("javascript:")) continue;
    if (href.startsWith("mailto:")) continue;
    if (href.startsWith("tel:")) continue;
    if (a.hasAttribute("download")) continue;

    // Resolve against the document's base URL.
    let url: URL;
    try {
      url = new URL(href, doc.baseURI);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;

    // Drop links inside the costume host subtree.
    if (a.closest(costumeHost)) continue;

    // Normalise: strip the fragment.
    url.hash = "";
    const normalised = url.href;

    // Deduplicate, preserving document order.
    if (seen.has(normalised)) continue;
    seen.add(normalised);

    // Split by origin.
    if (url.origin === siteOrigin) {
      if (sameOrigin.length < 60) sameOrigin.push(normalised);
    } else {
      if (crossSite.length < 30) crossSite.push(normalised);
    }
  }

  return { sameOrigin, crossSite };
}
```

Key implementation details:

- `a.getAttribute("href")` is used (not `a.href`) so we can detect scheme prefixes like `javascript:` and `mailto:` before URL resolution. An `href` attribute of `#section` starts with `#`; `mailto:` and `tel:` are likewise caught early.
- `new URL(href, doc.baseURI)` resolves relative links against the page's base URL. Non-resolvable URLs are silently dropped.
- `a.closest(costumeHost)` excludes any anchor that is a descendant of the `hg-crypt` custom element. Because the overlay is a custom element appended to `<html>`, `closest` catches it. Links inside the shadow root are not reachable via `querySelectorAll("a[href]")` on the light DOM, so the shadow root's own links are naturally excluded — `closest` is a belt-and-braces guard for the host element itself.
- The cap is applied per-list after deduplication, keeping the first N in document order.
- The function is pure: it reads `doc` and returns data. No `fetch`, no Chrome API, no DOM mutation.

### `src/content/link-check.ts` — `checkLinks` (shared)

A pure fetch-orchestration module with no Chrome dependency. The content script calls it for same-origin links; the background calls it for cross-site links (after filtering). It accepts an injectable `fetch` function so unit tests can mock it.

```ts
export interface DeadLink {
  url: string;
  path: string;
  status: number; // 404 or 410
}

export interface CheckOptions {
  /** The fetch implementation to use. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
  /** Max concurrent requests. Defaults to 4. */
  concurrency?: number;
}

/**
 * Check URLs and return only the dead ones (HTTP 404 or 410).
 *
 * Rules:
 * - HEAD request, credentials: 'omit', redirect: 'manual', cache: 'no-store'.
 * - 5-second timeout via AbortController.
 * - At most 4 concurrent requests.
 * - On HTTP 405 or 501, retry once with GET (same options).
 * - Only 404 or 410 → dead. Network errors, timeouts, opaqueredirect, and every
 *   other status → alive (never a false tombstone).
 */
export async function checkLinks(
  urls: readonly string[],
  opts: CheckOptions = {},
): Promise<DeadLink[]> {
  const fetchFn = opts.fetch ?? fetch;
  const timeout = opts.timeoutMs ?? 5000;
  const concurrency = opts.concurrency ?? 4;
  // ... see implementation below ...
}
```

Implementation:

```ts
async function checkOne(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<DeadLink | null> {
  const check = (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetchFn(url, {
      method,
      credentials: "omit",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  };

  let response: Response;
  try {
    response = await check("HEAD");
  } catch {
    // Network error or timeout on HEAD: try GET (covers servers that 405 on HEAD
    // without a proper response). If GET also fails, the link is alive.
    try {
      response = await check("GET");
    } catch {
      return null; // alive
    }
  }

  // 405 / 501: retry with GET.
  if (response.status === 405 || response.status === 501) {
    try {
      response = await check("GET");
    } catch {
      return null; // alive
    }
  }

  // Only 404 or 410 make a tombstone.
  if (response.status === 404 || response.status === 410) {
    const path = new URL(url).pathname;
    return { url, path, status: response.status };
  }

  // opaqueredirect (redirect: 'manual' + cross-origin redirect) → type 'opaqueredirect'.
  // Its status is 0, so it falls through here as alive.
  return null;
}
```

Concurrency is managed with a simple pool:

```ts
const dead: DeadLink[] = [];
let index = 0;
const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
  while (index < urls.length) {
    const i = index++;
    const result = await checkOne(urls[i]!, fetchFn, timeout);
    if (result) dead.push(result);
  }
});
await Promise.all(workers);
return dead;
```

The module exports `checkOne` and `checkLinks`. Both are importable without a Chrome API.

### `src/background/link-guard.ts` — `refusedHost`

The background refuses to fetch URLs whose hostnames are loopback, private, link-local, or internal. This is a hostname-level check only — it does not resolve DNS.

```ts
/**
 * True if a hostname must never be fetched by the cross-site link checker:
 * localhost, *.localhost, *.local, *.internal, or an IP in a loopback, private,
 * link-local, or unique-local range.
 *
 * This is a hostname filter, not a DNS resolver: a public hostname that resolves
 * to a private IP at fetch time is not caught (see DNS-rebinding ceiling in
 * Security Notes).
 */
export function refusedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");

  // Named loopback / internal TLDs.
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  if (h.endsWith(".internal")) return true;

  // IPv4.
  const v4 = matchIPv4(h);
  if (v4) {
    if (isIPv4In(v4, "127.0.0.0", 8)) return true;   // loopback
    if (isIPv4In(v4, "10.0.0.0", 8)) return true;     // private 10/8
    if (isIPv4In(v4, "172.16.0.0", 12)) return true;  // private 172.16/12
    if (isIPv4In(v4, "192.168.0.0", 16)) return true; // private 192.168/16
    if (isIPv4In(v4, "169.254.0.0", 16)) return true; // link-local
    return false;
  }

  // IPv6.
  const v6 = matchIPv6(h);
  if (v6) {
    if (v6 === "::1") return true;                   // loopback
    if (isIPv6In(v6, "fc00::", 7)) return true;       // unique local fc00::/7
    if (isIPv6In(v6, "fe80::", 10)) return true;      // link-local
    return false;
  }

  return false;
}
```

Helpers:

```ts
function matchIPv4(h: string): number[] | null {
  const parts = h.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return octets;
}

function isIPv4In(ip: number[], base: string, prefixBits: number): boolean {
  const baseOctets = base.split(".").map(Number);
  const mask = prefixBits >= 32 ? 0xffffffff : (~0 << (32 - prefixBits)) >>> 0;
  const ipNum = ((ip[0]! << 24) | (ip[1]! << 16) | (ip[2]! << 8) | ip[3]!) >>> 0;
  const baseNum = ((baseOctets[0]! << 24) | (baseOctets[1]! << 16) | (baseOctets[2]! << 8) | baseOctets[3]!) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function matchIPv6(h: string): string | null {
  // Validate and expand an IPv6 address to its full 8-group form.
  // Returns null if not a valid IPv6 address.
  // (Implementation: parse groups, handle :: compression, validate.)
  ...
}

function isIPv6In(ip: string, base: string, prefixBits: number): boolean {
  // Compare the first prefixBits bits of the expanded addresses.
  ...
}
```

The router uses `refusedHost` to filter the URL list before calling `checkLinks`:

```ts
const safe = urls.filter((u) => {
  try { return !refusedHost(new URL(u).hostname); } catch { return false; }
});
const dead = await checkLinks(safe);
```

### Router: `CHECK_LINKS` and `TOMBSTONE_UPDATE`

Two new `ContentRequest` variants are added to `src/data/types.ts`:

```ts
export type ContentRequest =
  | { type: "TRACKER_UPDATE"; companies: CompanyHit[]; total: number }
  | { type: "EXORCISE"; company: string; domains?: string[] }
  | { type: "LET_BACK"; company: string }
  | { type: "CLEAR_EXORCISE" }
  | { type: "CHECK_LINKS"; urls: string[] }        // NEW
  | { type: "TOMBSTONE_UPDATE"; dead: DeadLink[] }; // NEW
```

A new `ContentMessage` variant for the background → content direction:

```ts
export type ContentMessage =
  | { type: "unhaunt" }
  | { type: "ping" }
  | { type: "vampires"; nonce: string }
  | { type: "exorcised"; companies: string[] }
  | { type: "tombstones"; dead: DeadLink[] };  // NEW
```

`DeadLink` is added to `src/data/types.ts`:

```ts
export interface DeadLink {
  url: string;
  path: string;
  status: number; // 404 or 410
}
```

Router handling (in `createBackground`):

```ts
case "CHECK_LINKS": {
  // Accept only from a content script whose tab is haunted.
  const haunted = (await session.get(hauntKey(tabId)))[hauntKey(tabId)] === true;
  if (!haunted) break; // refuse silently

  // Refuse when the optional permission is missing.
  const hasPermission = await api.permissions.contains({ origins: LINK_CHECK_ORIGINS });
  if (!hasPermission) break;

  // Filter refused hosts.
  const safe = (msg.urls ?? []).filter((u) => {
    if (typeof u !== "string") return false;
    try { return !refusedHost(new URL(u).hostname); } catch { return false; }
  });

  const dead = await checkLinks(safe);
  if (dead.length) {
    await api.tabs.sendMessage(tabId, { type: "tombstones", dead } satisfies ContentMessage).catch(() => undefined);
  }
  break;
}

case "TOMBSTONE_UPDATE": {
  if (Array.isArray(msg.dead)) {
    await session.set({ [tombstonesKey(tabId)]: msg.dead });
  }
  break;
}
```

### `tombstonesKey`

Added to `src/data/types.ts` alongside the existing key functions:

```ts
/** chrome.storage.session key holding the tab's dead links as DeadLink[]. */
export const tombstonesKey = (tabId: number) => `tombstones:${tabId}`;
```

### `TabState` changes

`TabState` gains a `tombstones` field:

```ts
export interface TabState {
  haunted: boolean;
  restricted: boolean;
  url: string | null;
  ghosts: CompanyHit[];
  exorcised: string[];
  tombstones: DeadLink[];  // NEW
  error?: string;
}
```

`getState` populates it from `chrome.storage.session`:

```ts
async function getState(tabId: number): Promise<TabState> {
  // ... existing ...
  const tombKey = tombstonesKey(tabId);
  const stored = await session.get(tombKey);
  const tombstones = (stored[tombKey] as DeadLink[] | undefined) ?? [];
  return {
    haunted: stored_haunted,
    restricted,
    url,
    ghosts: await reportedGhosts(tabId),
    exorcised: await exorcist.exorcised(tabId),
    tombstones,
  };
}
```

`clearTab` removes `tombstonesKey` alongside the other keys:

```ts
async function clearTab(tabId: number) {
  await exorcist.clearTab(tabId);
  await session.remove([ghostsKey(tabId), nonceKey(tabId), tombstonesKey(tabId)]);
}
```

## Security Notes

### `credentials: 'omit'`

All link-checking `fetch` calls use `credentials: 'omit'`. No cookies, no auth headers, no client certificates are sent to checked URLs. This means the checker sees the same response a fresh visitor with no session would see — it cannot trigger authenticated endpoints or send session-bearing cookies to third-party domains.

### `redirect: 'manual'`

`redirect: 'manual'` ensures the fetch never follows a redirect. A cross-origin redirect produces an `opaqueredirect` response (type `"opaqueredirect"`, status 0), which counts as alive — never a tombstone. This prevents a dead link from being misidentified if a server redirects a 404 to a live page, and prevents the checker from being redirected to a different host that might respond differently.

### Host refusal list

The background refuses to fetch URLs whose hostnames are `localhost`, `*.localhost`, `*.local`, `*.internal`, or IP addresses in loopback (`127.0.0.0/8`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), or unique-local (`fc00::/7`, `fe80::/10`) ranges. This prevents the extension from being used as a SSRF oracle: a malicious page cannot discover internal services by planting links to `http://192.168.1.1/admin` and watching for tombstones.

### DNS-rebinding ceiling (known limitation)

The hostname refusal list is a **hostname filter**, not a DNS resolver. A public hostname (e.g. `rebind.example.com`) that resolves to a private IP (e.g. `192.168.1.1`) at fetch time is not caught by `refusedHost`. If a public hostname resolves to a private IP at fetch time, the fetch may reach an internal service. This is a known limitation:

- **Mitigations already in place**: `credentials: 'omit'` means no cookies or auth headers reach the internal service. `redirect: 'manual'` means the fetch will not follow a redirect chain that could rebounce. Only 404/410 responses produce a tombstone, so a 200 from an internal service does not leak its existence through the costume.
- **Residual risk**: a DNS-rebinding attack could make the background fetch a URL that resolves to an internal IP, and if that internal service returns 404 or 410, the attacker would see a tombstone marker — confirming the internal service exists. This is accepted as a known ceiling, documented in the requirements (criterion 22).

The alternative — resolving hostnames and checking resolved IPs before each fetch — would require DNS resolution in the service worker (not available in MV3 without a separate DNS-over-HTTPS resolver), add latency, and still be race-prone (the DNS record could change between resolution and fetch). The cost is not justified for a costume overlay.

### No `host_permissions` at install

The extension declares no `host_permissions` at install. Cross-site link checking is opt-in: the content script checks `chrome.permissions.contains({ origins: LINK_CHECK_ORIGINS })` before sending `CHECK_LINKS`, and the background independently verifies the permission. Until the user explicitly grants the optional origins, no cross-site fetches happen.

### Non-haunted tab refusal

The router accepts `CHECK_LINKS` only from a tab whose `haunt:<tabId>` key exists in `chrome.storage.session`. A page that sends `CHECK_LINKS` without being haunted is refused silently.

## Types

All new types live in `src/data/types.ts`:

```ts
/** A dead link found by the link checker. */
export interface DeadLink {
  url: string;
  path: string;
  status: number; // 404 or 410
}
```

`ContentRequest` gains `CHECK_LINKS` and `TOMBSTONE_UPDATE`:

```ts
export type ContentRequest =
  | { type: "TRACKER_UPDATE"; companies: CompanyHit[]; total: number }
  | { type: "EXORCISE"; company: string; domains?: string[] }
  | { type: "LET_BACK"; company: string }
  | { type: "CLEAR_EXORCISE" }
  | { type: "CHECK_LINKS"; urls: string[] }
  | { type: "TOMBSTONE_UPDATE"; dead: DeadLink[] };
```

`ContentMessage` gains `tombstones`:

```ts
export type ContentMessage =
  | { type: "unhaunt" }
  | { type: "ping" }
  | { type: "vampires"; nonce: string }
  | { type: "exorcised"; companies: string[] }
  | { type: "tombstones"; dead: DeadLink[] };
```

`TabState` gains `tombstones`:

```ts
export interface TabState {
  haunted: boolean;
  restricted: boolean;
  url: string | null;
  ghosts: CompanyHit[];
  exorcised: string[];
  tombstones: DeadLink[];
  error?: string;
}
```

Key function:

```ts
export const tombstonesKey = (tabId: number) => `tombstones:${tabId}`;
```

## Marker Placement

Tombstone markers live in the `#markers` layer (z-index 3) of the shadow root. Each marker is a `<button>` (keyboard reachable) with `aria-label="Dead link: <path>, <status>"`.

### TOMB sprite

A new `TOMB` sprite is added to `src/content/costume/art.ts`, following the existing character-map pattern. The tombstone marker is 8×10 art pixels at 2 CSS px per pixel (16×20 CSS px), matching `SPRITES.tombstoneMarker`:

```ts
export const TOMB = [
  "..GGGG..",
  ".GGGGGG.",
  ".GDDDDG.",
  ".GDDDDG.",
  ".GGDDGG.",
  ".GGDDGG.",
  ".GGDDGG.",
  ".GGGGGG.",
  "MMMMMMMM",
  "MMMMMMMM",
];
export const TOMB_LEGEND: Legend = {
  G: P.stone, D: P.stoneShadow, M: P.moss,
};
```

This reuses the palette tokens already defined in `tokens.ts` (`stone: #cccccc`, `stoneShadow: #666666`, `moss: #336633`). All colours are web-safe.

### Positioning logic

For each dead link, the marker is placed using this algorithm:

```ts
function placeMarker(
  link: HTMLAnchorElement,
  markers: HTMLElement,
  slots: Slot[],
  doc: Document,
  onOpen: (url: string, opener: HTMLElement) => void,
): HTMLElement | null {
  const rects = link.getClientRects();
  if (!rects.length) return null; // not rendered

  const lastRect = rects[rects.length - 1]!;
  const markerX = lastRect.right + 4;
  const markerY = lastRect.top + lastRect.height / 2 - 10; // centred, 20px tall

  let el = markers.querySelector<HTMLElement>(`[data-url="${cssEscape(link.href)}"]`);
  const isNew = !el;
  if (isNew) {
    el = doc.createElement("button");
    el.type = "button";
    el.className = "tomb-marker";
    el.dataset.url = link.href;
    el.setAttribute("aria-label", `Dead link: ${pathOf(link.href)}, ${statusFor(link)}`);
    el.innerHTML = tombMarkerSvg(); // 16×20 inline SVG from art.ts
    el.addEventListener("click", () => onOpen(link.href, el!));
  }

  // 1. Try placing 4px after the last rect, vertically centred.
  const viewportWidth = doc.defaultView!.innerWidth;
  if (markerX + 16 <= viewportWidth) {
    el.style.left = `${markerX}px`;
    el.style.top = `${markerY}px`;
  } else {
    // 2. If that leaves the viewport, go to the nearest gutter lane at the same y.
    const lane = nearestLane(slots, markerY);
    if (lane) {
      el.style.left = `${lane.x}px`;
      el.style.top = `${Math.max(lane.y, markerY)}px`;
    } else {
      // 3. No lane either: do not render the marker.
      //    The HUD count and popup list still include this link.
      return null;
    }
  }

  if (isNew) markers.append(el);
  return el;
}
```

`nearestLane(slots, y)` finds the closest lane slot whose y-range contains `y`, or the nearest one above/below:

```ts
function nearestLane(slots: Slot[], y: number): Slot | null {
  // Prefer a slot whose [y, y+slotPitch) contains markerY.
  // Otherwise the closest slot by |slot.y - markerY|.
  let best: Slot | null = null;
  let bestDist = Infinity;
  for (const s of slots) {
    const centre = s.y + 36; // slot pitch / 2
    const dist = Math.abs(centre - y);
    if (dist < bestDist) { bestDist = dist; best = s; }
  }
  return best;
}
```

The `planSlots` function from `ghosts.ts` is reused, called with the same gutter widths and text-rect bounds. The markers layer gets its own set of slots (it does not share the ghost lanes, which are for sprites in `#lanes`).

### Scroll / resize tracking

Markers follow scroll and resize, repositioned with `requestAnimationFrame` throttling (the same `relayout` pattern used by ghosts):

```ts
const reposition = () => {
  if (queued) return;
  queued = true;
  win.requestAnimationFrame(() => {
    queued = false;
    for (const [link, el] of markerEls) {
      placeMarker(link, markers, slots, doc, onOpen);
    }
  });
};
win.addEventListener("scroll", reposition, { passive: true });
win.addEventListener("resize", relayout); // existing relayout calls reposition
```

### IntersectionObserver

Each dead link is registered with an `IntersectionObserver` so its marker is hidden when the link is off screen:

```ts
const io = new win.IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const el = markerEls.get(entry.target as HTMLAnchorElement);
      if (el) el.style.display = entry.isIntersecting ? "" : "none";
    }
  },
  { root: null, threshold: 0 },
);
for (const link of deadLinks) io.observe(link);
```

The observer is read-only: it toggles `display` on the marker (inside the shadow root), never on the page link.

### Haunt-moment integration

Markers fade in 200ms after the haunt moment, at the 2300–2500ms markers phase. The existing `playHaunt` function already animates `#markers` opacity at 2300ms:

```ts
// haunt-moment.ts (existing):
run(layer(croot, "markers"), [{ opacity: 0 }, { opacity: 1 }], { delay: 2300, duration: 200, easing: "linear" });
```

This applies to the whole `#markers` layer, so tombstone markers fade in with it. Under `prefers-reduced-motion: reduce`, the layer appears with the cross-fade at 300ms (the reduced-motion path in `playHaunt`), no fade-in animation.

## Stone Card Markup and CSS

The tombstone card is the stone itself — a 176px-wide `#cccccc` slab with an arched headstone top, rendered inside `#cards` (z-index 6). It follows the existing card frame pattern (`openCard`) but with a tombstone-specific layout.

### Markup

```ts
function openTombstoneCard(
  cards: HTMLElement,
  dead: DeadLink,
  opener: HTMLElement,
  opts: CardOptions,
): HTMLElement {
  cards.querySelector(".card")?.remove();
  const doc = cards.ownerDocument;

  const card = doc.createElement("section");
  card.className = "card tombstone-card";
  card.dataset.url = dead.url;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "stone-title");

  card.innerHTML =
    `<div class="stone">` +
      `<button class="close win95" type="button" aria-label="Close">x</button>` +
      `<div class="inscription">` +
        `<p class="here-lies">HERE LIES</p>` +
        `<p class="path"></p>` +
        `<p class="status"></p>` +
      `</div>` +
      `<div class="moss"></div>` +
    `</div>`;

  // Inscription: HERE LIES (11px), path (13px), status (11px).
  card.querySelector(".here-lies")!.textContent = "HERE LIES";
  card.querySelector(".status")!.textContent =
    dead.status === 404 ? "404 · Not Found" : "410 · Gone";

  // Path text: set with textContent per segment, never innerHTML.
  // Split at '/', insert <wbr> after every '/'.
  const pathEl = card.querySelector(".path")!;
  const segments = dead.path.split("/");
  segments.forEach((seg, i) => {
    if (i > 0) pathEl.appendChild(doc.createElement("wbr"));
    pathEl.appendChild(doc.createTextNode(seg));
  });

  // Close button.
  card.querySelector(".close")!.addEventListener("click", () => closeCard(cards));

  // Esc closes and returns focus to the marker.
  card.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    closeCard(cards);
  });

  openers.set(card, opener);
  cards.append(card);

  // Position beside the marker, clamped to the viewport.
  positionCard(card, opener, opts.bounds, doc.defaultView!);

  // Focus the close button.
  card.querySelector<HTMLElement>(".close")!.focus();
  return card;
}
```

### `<wbr>` after every `/`

The path is split at `/` and each segment is inserted as a text node, with a `<wbr>` element between segments. This means the browser can break the line only at a `/` boundary:

```ts
const segments = dead.path.split("/");
segments.forEach((seg, i) => {
  if (i > 0) pathEl.appendChild(doc.createElement("wbr"));
  pathEl.appendChild(doc.createTextNode(seg));
});
```

For a path like `/blog/2019/the-very-long-haunted-filename-that-must-not-break.html`, this produces:

```
/wbr​blog/wbr​2019/wbr​the-very-long-haunted-filename-that-must-not-break.html
```

The browser can break after any `/`, but never inside a filename segment.

### `word-break: keep-all` and `overflow-wrap: normal`

```css
.tombstone-card .path {
  overflow-wrap: normal;
  word-break: keep-all;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
```

`word-break: keep-all` prevents breaking inside CJK-style or long Latin words — the line only breaks at the `<wbr>` opportunities (the `/` boundaries). `overflow-wrap: normal` prevents the browser from breaking long words at arbitrary characters as a last resort.

### Line clamp 3

The `-webkit-line-clamp: 3` limits the path to 3 lines. Combined with `display: -webkit-box` and `-webkit-box-orient: vertical`, text beyond 3 lines is clipped with an ellipsis.

### Start ellipsis for a long segment

When a single path segment is too long for one line, it should be ellipsised at its **start** so the end of the filename is visible. This is handled by a CSS trick: when a segment exceeds the available width, `direction: rtl` on a wrapper makes the ellipsis appear on the left:

```css
.tombstone-card .path-seg-long {
  direction: rtl;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  unicode-bidi: plaintext;
}
```

In JavaScript, after inserting the segments, each segment that is longer than the available width (measured via a canvas or `offsetWidth` check) is wrapped in a `<span class="path-seg-long">` with `direction: rtl`:

```ts
// After inserting all segments, check if any single segment overflows.
const cardWidth = 176 - 32; // stone width - 16px inset * 2
const pathEl = card.querySelector(".path")!;
for (const child of [...pathEl.childNodes]) {
  if (child.nodeType === Node.TEXT_NODE && child.textContent && child.textContent.length > 0) {
    // Measure: if the segment is wider than cardWidth, wrap it for start-ellipsis.
    const measure = doc.createElement("span");
    measure.style.visibility = "hidden";
    measure.style.whiteSpace = "nowrap";
    measure.style.font = '13px "Times New Roman", Times, serif';
    measure.textContent = child.textContent;
    doc.body.appendChild(measure);
    const tooLong = measure.offsetWidth > cardWidth;
    measure.remove();
    if (tooLong) {
      const span = doc.createElement("span");
      span.className = "path-seg-long";
      span.textContent = child.textContent;
      child.replaceWith(span);
    }
  }
}
```

The measurement is done in the shadow root's context (font is Times New Roman 13px, same as the inscription). The `unicode-bidi: plaintext` ensures the text reads left-to-right even inside an `rtl` container.

### Full CSS

Added to `costumeCss` in `src/content/costume/styles.ts`:

```css
/* Tombstone markers (in #markers layer) */
.tomb-marker {
  position: absolute;
  width: 16px;
  height: 20px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  pointer-events: auto;
  transition: opacity 200ms linear;
}
.tomb-marker svg { display: block; image-rendering: pixelated; }
.tomb-marker:focus-visible { outline: 2px dotted #ffff66; outline-offset: 2px; box-shadow: 0 0 0 5px #000000; }

/* Tombstone card (the stone itself) */
.tombstone-card {
  position: absolute;
  width: 176px;  /* L.tombstoneWidth */
  background: #cccccc;
  border: 2px solid;
  border-color: #ffffff #666666 #666666 #ffffff;  /* bevel */
  border-radius: 88px 88px 0 0;  /* arched headstone top */
  box-shadow: 4px 4px 0 #000000;
  pointer-events: auto;
  box-sizing: border-box;
  padding: 0;
}
.tombstone-card .stone {
  position: relative;
  padding: 16px;  /* inscription inset */
  padding-bottom: 24px;  /* room for moss */
}
.tombstone-card .close {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  padding: 0;
  font: bold 11px/10px "Comic Sans MS", "Comic Sans", cursive;
}
.tombstone-card .inscription {
  position: absolute;
  inset: 16px;
  color: #000000;
  font-family: "Times New Roman", Times, serif;
}
.tombstone-card .here-lies {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.tombstone-card .path {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: normal;
  word-break: keep-all;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  display: -webkit-box;
  overflow: hidden;
}
.tombstone-card .path-seg-long {
  display: inline-block;
  max-width: 100%;
  direction: rtl;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  unicode-bidi: plaintext;
}
.tombstone-card .status {
  margin: 0;
  font-size: 11px;
}
.tombstone-card .moss {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
  background: #336633;
  /* Moss pixel pattern: scattered darker dots */
  background-image: linear-gradient(to right, #336633 50%, #224422 50%);
  background-size: 4px 100%;
}
```

All colours are web-safe (`#cccccc`, `#ffffff`, `#666666`, `#000000`, `#336633`, `#224422`), `#ffff66` for the focus ring.

## Popup Tombstones List

The popup's haunted screen lists tombstones after vampires. The `TILES` array already includes a Tombstones tile (`["tombstones", "Tombstones", "tombstone"]`), and `setCounts` already accepts a `tombstones` count. The popup reads `state.tombstones` from `getState`.

### Tombstone rows

```ts
function tombstoneRow(doc: Document, t: DeadLink): HTMLElement {
  const is404 = t.status === 404;
  const pillClass = is404 ? "tag-pill dead-404" : "tag-pill dead-410";
  const pillText = is404 ? "404" : "410";

  // Cross-site: show the host on line 2 with the status pill.
  let host: string | null = null;
  try {
    const url = new URL(t.url);
    // If the host differs from the page's host, it's cross-site.
    // The popup knows the page URL from state.url.
    host = url.hostname;
  } catch {
    // ignore
  }

  const row = h(
    doc,
    "li",
    { class: "ghost-row tombstone-row" },
    h(doc, "span", { class: "icon-tile" }, tombstoneTile(doc)),
    h(
      doc,
      "span",
      { class: "row-text" },
      h(doc, "span", { class: "row-title tomb-path" }, t.path),
      h(
        doc,
        "span",
        { class: "row-line" },
        h(doc, "span", { class: pillClass }, pillText),
        host ? h(doc, "span", { class: "row-sub" }, host) : null,
      ),
    ),
  );
  return row;
}
```

The path wraps at `/` using the same `<wbr>` technique:

```ts
const pathEl = row.querySelector(".tomb-path")!;
const segments = t.path.split("/");
segments.forEach((seg, i) => {
  if (i > 0) pathEl.appendChild(doc.createElement("wbr"));
  pathEl.appendChild(doc.createTextNode(seg));
});
```

### Status pills

```css
.tag-pill.dead-404 { background: #ffcccc; color: #660000; }
.tag-pill.dead-410 { background: #ffddcc; color: #663300; }
```

Both combinations meet the 4.5:1 contrast ratio (dark text on light web-safe backgrounds).

### Empty state

When no tombstones are found, the list surface shows:

```ts
const tombstoneList = state.tombstones.length
  ? [
      h(doc, "h2", { class: "list-head tombstones-head" },
        "Tombstones ", h(doc, "span", { class: "list-count" }, String(state.tombstones.length))),
      h(doc, "ul", { class: "rows" }, ...state.tombstones.map((t) => tombstoneRow(doc, t))),
    ]
  : [h(doc, "p", { class: "muted no-tombstones" }, "No tombstones. Every link is alive.")];
```

### Popup screen integration

The haunted screen's list section is extended:

```ts
// In renderScreen, haunted branch:
const list = [...ghostList, ...vampireList, ...tombstoneList];
```

The tiles grid already has the Tombstones tile; its count is set:

```ts
tiles.querySelector('[data-count="tombstones"] .num')!.textContent = String(state.tombstones.length);
```

## Fixtures

### `fixtures/links.html`

A standalone HTML page with a mix of live, dead, and ignorable links:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>Links Page</title>
    <style>
      body { margin: 0; padding: 24px; font-family: Georgia, serif; line-height: 1.6; color: #1d1d1b; background: #fbfaf6; }
      main { max-width: 520px; margin: 0 auto; padding: 0 16px 96px; }
      h1 { font-size: 2rem; margin: 0 0 1rem; }
      a { color: #0066cc; }
    </style>
  </head>
  <body>
    <main>
      <h1>Links Page</h1>
      <p>Live same-origin link: <a href="index.html">Home</a></p>
      <p>Dead 404 link: <a href="/missing-page.html">Missing page</a></p>
      <p>Dead 410 link: <a href="/gone/">Gone page</a></p>
      <p>Deep path 404: <a href="/blog/2019/the-very-long-haunted-filename-that-must-not-break.html">Long filename</a></p>
      <p>Mailto (ignored): <a href="mailto:nobody@example.com">Email</a></p>
      <p>Hash-only (ignored): <a href="#section">Skip to section</a></p>
    </main>
  </body>
</html>
```

- `index.html` is an existing fixture (served 200).
- `/missing-page.html` does not exist in `fixtures/` (the fixture server returns 404).
- `/gone/` is answered with HTTP 410 by the fixture server.
- The deep path (`/blog/2019/the-very-long-haunted-filename-that-must-not-break.html`) also 404s, and tests the `<wbr>` wrapping and line-clamp in the card.
- The `mailto:` and `#section` links must be ignored by `collectLinks`.

### 410 route in `scripts/fixture-server.ts`

The fixture server is modified to answer `/gone/` with HTTP 410:

```ts
async fetch(req) {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // 410 Gone route for tombstone fixtures.
  if (path === "/gone/") {
    return new Response("Gone", { status: 410 });
  }

  // ... existing logic (append index.html, serve file or 404) ...
}
```

This is the only change to the fixture server. The 410 response is a short body ("Gone") with no headers beyond the status. The existing 404 path (file not found) already serves the missing-page and deep-path cases.

## Test Plan

### Unit tests (`test/tombstones/`)

#### `links.test.ts` — link collector

Tests `collectLinks` against a `Document` built with `DOMParser` or `new Document()` + `createElement`:

1. **http/https only**: `ftp://example.com` is dropped.
2. **Drop hash-only**: `href="#section"` is dropped.
3. **Drop `javascript:`**: `href="javascript:void(0)"` is dropped.
4. **Drop `mailto:`**: `href="mailto:a@b.com"` is dropped.
5. **Drop `tel:`**: `href="tel:+1234"` is dropped.
6. **Drop `download`**: `<a href="file.txt" download>` is dropped.
7. **Drop costume-host links**: links inside `<hg-crypt>` are dropped.
8. **Normalise fragment**: `http://example.com/page#frag` normalises to `http://example.com/page`.
9. **Deduplicate**: two links to the same URL (after fragment stripping) appear once.
10. **Preserve document order**: first occurrence wins on dedup.
11. **Split same-origin / cross-site**: same-origin links go to `sameOrigin`, others to `crossSite`.
12. **Cap 60/30**: 70 same-origin links → 60 in `sameOrigin`; 40 cross-site → 30 in `crossSite`.
13. **Pure function**: no Chrome API, no side effects (importable without `chrome` global).

#### `link-check.test.ts` — same-origin checker

Tests `checkLinks` with a mock `fetch`:

1. **404 → dead**: mock returns `{ status: 404 }` → result is `{ url, path, status: 404 }`.
2. **410 → dead**: mock returns `{ status: 410 }` → result includes status 410.
3. **405 then GET retry → alive**: HEAD returns 405, GET returns 200 → not in dead list.
4. **501 then GET retry → alive**: HEAD returns 501, GET returns 200 → not in dead list.
5. **Timeout → alive**: mock that never resolves (AbortController aborts at 5s) → not in dead list.
6. **Network error → alive**: mock throws `TypeError("Failed to fetch")` → not in dead list.
7. **Opaque redirect → alive**: mock returns `{ type: "opaqueredirect", status: 0 }` → not in dead list.
8. **200 → alive**: mock returns `{ status: 200 }` → not in dead list.
9. **500 → alive**: mock returns `{ status: 500 }` → not in dead list.
10. **Concurrency**: 8 URLs with 4 concurrency → at most 4 in-flight at once (tracked via mock call timestamps).
11. **Path extraction**: `http://example.com/blog/post.html` → `path: "/blog/post.html"`.

#### `link-guard.test.ts` — background host refusal

Tests `refusedHost`:

1. **`localhost`** → refused.
2. **`foo.localhost`** → refused.
3. **`bar.local`** → refused.
4. **`baz.internal`** → refused.
5. **`127.0.0.1`** → refused (loopback).
6. **`10.0.0.1`** → refused (private 10/8).
7. **`172.16.0.1`** → refused (private 172.16/12).
8. **`192.168.1.1`** → refused (private 192.168/16).
9. **`169.254.1.1`** → refused (link-local).
10. **`::1`** → refused (IPv6 loopback).
11. **`fc00::1`** → refused (unique local fc00::/7).
12. **`fe80::1`** → refused (link-local).
13. **`8.8.8.8`** → not refused.
14. **`example.com`** → not refused.

#### `router.test.ts` — router CHECK_LINKS

Tests the background router with mocked `chrome`:

1. **Accepted from haunted tab**: `haunt:<tabId>` is in session storage and permission is granted → `checkLinks` is called, result sent back via `tabs.sendMessage`.
2. **Refused when not haunted**: `haunt:<tabId>` missing → no fetch, no message back.
3. **Refused when permission missing**: `chrome.permissions.contains` returns false → no fetch.
4. **Refused hosts filtered**: URL with `localhost` hostname is filtered out before `checkLinks`.
5. **TOMBSTONE_UPDATE stored**: `TOMBSTONE_UPDATE` with `dead` array → stored under `tombstonesKey(tabId)`.
6. **getState returns tombstones**: after `TOMBSTONE_UPDATE`, `getState` returns the stored tombstones.

#### `router.test.ts` — TOMBSTONE_UPDATE

1. **Stores dead links**: `{ type: "TOMBSTONE_UPDATE", dead: [...] }` → `session.set` called with `tombstones:<tabId>`.
2. **clearTab removes tombstones**: `clearTab(tabId)` → `session.remove` includes `tombstonesKey(tabId)`.
3. **Navigation clears tombstones**: `tabs.onUpdated` "loading" + no content-script answer → `tombstonesKey` removed.

### E2E test (`e2e/tombstones.spec.ts`)

1. Launch Chromium with the unpacked extension.
2. Start the fixture server (which now returns 410 for `/gone/`).
3. Navigate to `http://127.0.0.1:4321/links.html`.
4. Haunt the tab (popup Haunt button or direct message).
5. Wait for the haunt moment to complete (2500ms).
6. **Markers appear beside dead links**: assert `#markers .tomb-marker` elements exist in the shadow root for the 404 and 410 links.
7. **HUD count is correct**: the HUD's tombstone count equals the number of dead links (2: the 404 and the 410; the deep path also 404s, so 3 total if it's counted separately — the fixture has 3 dead links: missing-page, gone, and the deep path).
8. **Stone card wraps only at `/`**: click a tombstone marker, assert the card opens in `#cards`, the path text contains `<wbr>` elements after each `/`, and no break occurs inside a filename segment.
9. **Esc closes the card**: press Escape, assert the card is removed and focus returns to the marker.
10. **Popup lists tombstones**: open the popup, assert the Tombstones tile shows the count, and tombstone rows appear after vampires, each with a path and a status pill (`404` or `410`).
11. **Page is byte-identical after Un-haunt**: capture `document.documentElement.outerHTML` before haunting; Un-haunt; assert it is byte-identical.
12. **Cross-site (opt-in)**: if testing cross-site, grant the optional permission, navigate to a page with a cross-site dead link, haunt, and assert the cross-site tombstone appears. (This may be a separate test or guarded by the permission grant flow.)

### Test file layout

```
test/tombstones/
  links.test.ts       # collectLinks: filter, normalise, dedup, split, cap, purity
  link-check.test.ts  # checkLinks: 404/410 dead, 405/501 retry, timeout, network error, opaque redirect, 200/500 alive, concurrency
  link-guard.test.ts  # refusedHost: localhost, .local, .internal, IPv4/IPv6 ranges
  router.test.ts      # CHECK_LINKS (haunted, permission, refused), TOMBSTONE_UPDATE, getState, clearTab

e2e/
  tombstones.spec.ts  # markers, card wrapping, HUD count, popup list, byte-identical un-haunt
```
