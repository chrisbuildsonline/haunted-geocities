---
inclusion: always
---

# Product: Haunted GeoCities

A Chrome Manifest V3 extension for Kiroween 2026 (Costume Contest). When the user clicks **Haunt** in the popup, any modern web page is transformed into a 1998 GeoCities crypt. **Un-haunt** restores the page completely.

## Core Capabilities

- **Ghost trackers.** Hidden trackers float as ghosts — one per company — in gutter lanes, never over page text. Each can be **Exorcised**, which blocks the company with session-scoped `declarativeNetRequest` rules.
- **Vampire scripts.** Scripts caught fingerprinting at runtime (canvas `toDataURL`/`getImageData`, `AudioContext`, font probing) become vampires.
- **Tombstone links.** Dead same-origin links (HTTP 404/410) become tombstones. Cross-site checking happens only after an opt-in optional host permission.
- **Cursed dark patterns.** Fake scarcity, countdowns, confirmshaming, and pre-checked opt-ins get cursed badges beside the text.
- **GeoCities neighborhood.** Every site gets assigned a GeoCities neighborhood.

## Permissions Model

Declared permissions: `activeTab`, `scripting`, `declarativeNetRequest`, `storage`. No `host_permissions` at install. `http`/`https` host permissions are optional and requested only when the user opts into cross-site link checking.

## Scope Boundaries

- This is a costume overlay, not a persistent blocker. Exorcise rules live only for the session unless the user explicitly persists them.
- The extension never modifies page scripts, page markup, or form behaviour.
- All visual assets are original — no third-party trademarks or copyrighted material.
