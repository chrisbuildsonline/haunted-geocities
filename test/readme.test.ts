import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const readme = existsSync(join(root, "README.md")) ? readFileSync(join(root, "README.md"), "utf8") : "";
const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

const DISCLOSURE =
  "A pre-period prototype exists outside the entry and was rebuilt from lessons, not copied; Tracker Radar ingest output is the only reused data.";

/** Relative targets of every markdown image and link, minus anchors. */
const localTargets = () =>
  [...readme.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((m) => m[1]!)
    .filter((t) => !/^([a-z]+:|#)/i.test(t))
    .map((t) => t.split("#")[0]!);

describe("README.md", () => {
  test("exists", () => {
    expect(existsSync(join(root, "README.md"))).toBe(true);
  });

  test("carries the disclosure line verbatim", () => {
    expect(readme).toContain(DISCLOSURE);
  });

  test("lists what it does as bullets", () => {
    const section = readme.split(/^## What it does\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section.match(/^- .+/gm)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  test("names the Tracker Radar licence and points at both licence files", () => {
    expect(readme).toContain("CC BY-NC-SA 4.0");
    expect(readme).toContain("src/data/ATTRIBUTION.md");
    expect(readme).toContain("src/data/LICENSE-tracker-radar.txt");
  });

  test("every `bun run <script>` exists in package.json", () => {
    const used = [...readme.matchAll(/bun run ([\w:-]+)/g)].map((m) => m[1]!);
    expect(used).toEqual(expect.arrayContaining(["build", "typecheck", "test", "test:e2e", "docker:test", "package", "screenshots", "fixtures"]));
    for (const name of used) expect(Object.keys(scripts)).toContain(name);
  });

  test("never documents bun test, and gives no test counts", () => {
    expect(readme).not.toMatch(/bun test\b/);
    expect(readme).not.toMatch(/\b\d+\s+(unit\s+|e2e\s+)?tests?\b/i);
  });

  test("every image and relative link resolves to a file", () => {
    const targets = localTargets();
    expect(targets.length).toBeGreaterThan(3);
    for (const t of targets) expect(existsSync(join(root, t))).toBe(true);
  });

  test("embeds at least three screenshots, each under 500 KB", () => {
    const shots = localTargets().filter((t) => t.startsWith("docs/screenshots/") && t.endsWith(".png"));
    expect(shots.length).toBeGreaterThanOrEqual(3);
    for (const s of shots) expect(statSync(join(root, s)).size).toBeLessThan(500 * 1024);
  });

  test("says Exorcise ends with the page or tab, not the browser session", () => {
    expect(readme).not.toMatch(/until you close the browser/i);
    expect(readme).toContain("until you un-haunt, reload or leave the page, or close the tab");
  });

  test("does not claim dark patterns, neighborhoods or Kiro hooks work", () => {
    const mentions = readme.split("\n").filter((l) => /dark[- ]pattern|curse|neighbou?rhood|hooks?\b/i.test(l));
    expect(mentions.length).toBeLessThanOrEqual(1);
    for (const l of mentions) expect(l).toMatch(/still to come/i);
  });
});
