---
inclusion: always
---

# Structure: Haunted GeoCities

```
src/
  background/     # MV3 service worker: popup commands, DNR rule mgmt, message router
  content/        # Content script: Shadow DOM overlay, haunt/un-haunt, observers
  popup/          # Popup UI: Haunt/Un-haunt, Exorcise list, audio toggle, stats
  data/           # Tracker Radar data, attribution, neighborhood assignments
test/             # Bun unit tests
e2e/              # Playwright end-to-end tests (unpacked extension)
fixtures/         # Our own local fixture pages — no third-party trademarks
scripts/          # Build, data-prep, and utility scripts (Bun)
design/DESIGN.md  # Design rationale and visual reference
```

## Conventions

- One responsibility per module; keep files focused.
- Shared types live alongside the module that owns them, or in `src/data/` if cross-cutting.
- Fixture pages are standalone HTML files with no external dependencies.
- The `prototype/` folder is an old reference build and is **not** part of this project — do not read or modify it.
