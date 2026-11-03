# Attribution

`trackers.json` is derived from the DuckDuckGo Tracker Data Set (the extension-tds.json blocklist published in
https://github.com/duckduckgo/tracker-blocklists, which is built from DuckDuckGo's Tracker Radar,
https://github.com/duckduckgo/tracker-radar), fetched 2026-11-03 from
https://staticcdn.duckduckgo.com/trackerblocking/v6/current/extension-tds.json.

- Copyright 2020 Duck Duck Go, Inc.
- Licence: CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/), text in `LICENSE-tracker-radar.txt`.
- Changes: only trackers with prevalence >= 0.0001 are kept, reduced to domain, company name, prevalence,
  categories and fingerprinting score, plus the domains owned by each kept company. Keys are sorted and the JSON is
  minified. The licence does not apply to DuckDuckGo logos or marks.

Regenerate with `bun run ingest:trackers`. Redistributions must keep this notice and stay non-commercial and share-alike.
