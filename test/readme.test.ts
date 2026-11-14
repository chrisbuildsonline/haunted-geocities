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
    expect(used).toEqual(expect.arrayContaining(["build", "typecheck", "test", "test:e2e", "docker:test", "package", "screenshots", "fixtures", "lint:manifest", "test:visual", "test:visual:update", "visual:baselines"]));
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

  test("shows the curses and the neighborhood bar, and every docs/screenshots PNG it names exists", () => {
    const named = [...new Set(readme.match(/docs\/screenshots\/[\w.-]+\.png/g) ?? [])];
    expect(named).toEqual(expect.arrayContaining(["docs/screenshots/curses.png", "docs/screenshots/neighborhood.png"]));
    for (const s of named) expect({ s, exists: existsSync(join(root, s)) }).toEqual({ s, exists: true });
  });

  test("says Exorcise ends with the page or tab, not the browser session", () => {
    expect(readme).not.toMatch(/until you close the browser/i);
    expect(readme).toContain("until you un-haunt, reload or leave the page, or close the tab");
  });

  test("names the three Kiro hooks, each of which exists in .kiro/hooks/, and nothing is still to come", () => {
    const section = readme.split(/^## Kiro hooks\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).toContain(".kiro/hooks/");
    for (const name of ["manifest-lint", "visual-regression", "era-accuracy"]) {
      expect({ name, inReadme: section.includes(`\`${name}\``) }).toEqual({ name, inReadme: true });
      expect({ name, file: existsSync(join(root, ".kiro", "hooks", `${name}.kiro.hook`)) }).toEqual({ name, file: true });
    }
    expect(readme).not.toMatch(/still to come/i);
  });

  test("the Checks section lists lint:manifest and test:visual", () => {
    const section = readme.split(/^## Checks\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).toContain("bun run lint:manifest");
    expect(section).toContain("bun run test:visual");
  });

  test("How Kiro was used names the hooks folder and the kiro-hooks spec", () => {
    const section = readme.split(/^## How Kiro was used\s*$/m)[1] ?? "";
    expect(section).toContain(".kiro/hooks/");
    expect(section).toContain("`kiro-hooks`");
  });

  test("describes neighborhoods, the toolbar badge and dark patterns as working", () => {
    const section = readme.split(/^## What it does\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const bullets = section.match(/^- .+/gm) ?? [];
    expect(bullets.some((b) => /neighbou?rhood address/i.test(b) && /tagline/i.test(b))).toBe(true);
    expect(bullets.some((b) => /toolbar icon/i.test(b))).toBe(true);
    expect(readme).toMatch(/dark[- ]pattern.*CURSED!/i);
  });

  test("the optional link check names permissions.html", () => {
    const line = readme.split("\n").find((l) => l.includes("Check links to other sites")) ?? "";
    expect(line).toContain("permissions.html");
  });

  test("Load it says the test build is dist.zip on the GitHub release", () => {
    const section = readme.split(/^## Load it\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).toMatch(/`dist\.zip`[^\n]*GitHub release|GitHub release[^\n]*`dist\.zip`/);
  });

  test("lists the neighborhoods spec under How Kiro was used", () => {
    const section = readme.split(/^## How Kiro was used\s*$/m)[1] ?? "";
    expect(section).toMatch(/\bneighborhoods\b/);
  });
});
