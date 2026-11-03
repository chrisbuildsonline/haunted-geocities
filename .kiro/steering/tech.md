---
inclusion: always
---

# Tech: Haunted GeoCities

## Language & Build

- **TypeScript** in strict mode (`"strict": true`).
- **Vite** for building the extension bundle.
- **Bun** for scripts and unit tests (`bun test`).
- **Playwright** for end-to-end tests, loading the unpacked extension.

## Chrome MV3

- Manifest V3 service-worker background.
- Permissions: `activeTab`, `scripting`, `declarativeNetRequest`, `storage`.
- No `host_permissions` at install. `http`/`https` host permissions are optional and requested only when the user opts into cross-site link checking.
- Dynamic `declarativeNetRequest` session rules for Exorcise (blocked tracker domains).

## Overlay & DOM

- **Shadow DOM** for the costume overlay — isolated from page CSS.
- **Adopted stylesheets** for injecting/removing costume styles non-destructively.
- **MutationObserver** to watch for dynamically added trackers, links, and dark patterns.
- **IntersectionObserver** to place ghosts and manage gutter-lane positions without overlapping text.

## Audio

- **Web Audio API** for sound effects.
- Audio is **muted by default** and only unmuted after a user gesture (popup toggle).

## Data

- **DuckDuckGo Tracker Radar** data, licensed CC BY-NC-SA 4.0. Attribution is required in the extension and in any redistribution.

## Test & CI

- Docker image in which both unit tests (`bun test`) and e2e tests (Playwright) pass.
- Local fixture pages in `fixtures/` — our own, no third-party trademarks.
