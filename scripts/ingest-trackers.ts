// Turns the DuckDuckGo Tracker Data Set into src/data/trackers.json.
// Usage: bun scripts/ingest-trackers.ts   (bun run ingest:trackers)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TrackerData } from "../src/data/types";

const SOURCE = "https://staticcdn.duckduckgo.com/trackerblocking/v6/current/extension-tds.json";
const LICENCE = "CC BY-NC-SA 4.0";
const MIN_PREVALENCE = 0.0001;

type Tds = {
  trackers: Record<string, { owner: { displayName: string }; prevalence: number; fingerprinting?: number; categories?: string[] }>;
  entities: Record<string, { displayName: string; domains: string[] }>;
};

const sortObject = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const uniqueSorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

/** Read `rawDir`, write trackers.json, ATTRIBUTION.md and the licence into `outDir`. */
export function ingest(rawDir: string, outDir: string, fetched?: string): void {
  const licence = join(rawDir, "tracker-radar-LICENSE.txt");
  if (!existsSync(licence)) throw new Error(`Missing licence file ${licence}; refusing to ingest without it.`);
  const sources = join(rawDir, "sources.md");
  fetched ??= /^Fetched:\s*(\d{4}-\d{2}-\d{2})/m.exec(existsSync(sources) ? readFileSync(sources, "utf8") : "")?.[1];
  if (!fetched) throw new Error("No fetched date: pass one or add a 'Fetched: YYYY-MM-DD' line to sources.md.");
  const tds = JSON.parse(readFileSync(join(rawDir, "extension-tds.json"), "utf8")) as Tds;

  const domains: TrackerData["domains"] = {};
  const kept = new Set<string>();
  for (const [domain, t] of Object.entries(tds.trackers)) {
    if (!(t.prevalence >= MIN_PREVALENCE)) continue;
    const company = t.owner.displayName;
    kept.add(company);
    domains[domain] = { company, prevalence: t.prevalence, categories: t.categories ?? [], fingerprinting: t.fingerprinting ?? 0 };
  }

  const entities: TrackerData["entities"] = {};
  for (const e of Object.values(tds.entities)) {
    if (kept.has(e.displayName)) entities[e.displayName] = uniqueSorted([...(entities[e.displayName] ?? []), ...e.domains]);
  }

  const data: TrackerData = {
    source: SOURCE,
    licence: LICENCE,
    fetched,
    domains: sortObject(domains),
    entities: sortObject(entities),
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "trackers.json"), JSON.stringify(data) + "\n");
  copyFileSync(licence, join(outDir, "LICENSE-tracker-radar.txt"));
  writeFileSync(
    join(outDir, "ATTRIBUTION.md"),
    `# Attribution

\`trackers.json\` is derived from the DuckDuckGo Tracker Data Set (the extension-tds.json blocklist published in
https://github.com/duckduckgo/tracker-blocklists, which is built from DuckDuckGo's Tracker Radar,
https://github.com/duckduckgo/tracker-radar), fetched ${fetched} from
${SOURCE}.

- Copyright 2020 Duck Duck Go, Inc.
- Licence: ${LICENCE} (https://creativecommons.org/licenses/by-nc-sa/4.0/), text in \`LICENSE-tracker-radar.txt\`.
- Changes: only trackers with prevalence >= ${MIN_PREVALENCE} are kept, reduced to domain, company name, prevalence,
  categories and fingerprinting score, plus the domains owned by each kept company. Keys are sorted and the JSON is
  minified. The licence does not apply to DuckDuckGo logos or marks.

Regenerate with \`bun run ingest:trackers\`. Redistributions must keep this notice and stay non-commercial and share-alike.
`,
  );
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  ingest(join(root, "data/raw"), join(root, "src/data"));
  console.log("wrote src/data/trackers.json");
}
