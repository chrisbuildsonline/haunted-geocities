import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

  test("the haunt moment GIF is shown in What it does: 560px wide, at most 2 MB, made by the shots script", () => {
    const section = readme.split(/^## What it does\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).toMatch(/!\[[^\]]+\]\(docs\/screenshots\/haunt\.gif\)/);
    const gif = readFileSync(join(root, "docs", "screenshots", "haunt.gif"));
    expect(gif.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(gif.readUInt16LE(6)).toBe(560);
    expect(gif.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(readFileSync(join(root, "e2e", "readme.shots.ts"), "utf8")).toContain("haunt.gif");
  });

  test("README popup screenshot exists and is referenced", () => {
    const shot = join(root, "docs", "screenshots", "popup.png");
    expect(existsSync(shot)).toBe(true);
    expect(readme).toMatch(/!\[[^\]]*Windows 95[^\]]*\]\(docs\/screenshots\/popup\.png\)/);
    // The shot is a 360px popup at device scale 1, retaken with the costume.
    const png = readFileSync(shot);
    expect(png.readUInt32BE(16)).toBe(360);
    expect(readFileSync(join(root, "e2e", "readme.shots.ts"), "utf8")).toContain("docs/screenshots");
  });

  test("says Exorcise ends with the page or tab, not the browser session", () => {
    expect(readme).not.toMatch(/until you close the browser/i);
    expect(readme).toContain("until you un-haunt, reload or leave the page, or close the tab");
  });

  test("names every Kiro hook, each of which exists in .kiro/hooks/, and nothing is still to come", () => {
    const section = readme.split(/^## Kiro hooks\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).toContain(".kiro/hooks/");
    for (const name of ["manifest-lint", "visual-regression", "era-accuracy", "rule-factory", "baseline-refresh"]) {
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

  test("the Checks section installs Playwright's Chromium before the browser tests", () => {
    const section = readme.split(/^## Checks\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const install = section.indexOf("bunx playwright install chromium");
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(section.indexOf("bun run test:e2e"));
  });

  test("How Kiro was used names the hooks folder and the kiro-hooks and rule-factory specs", () => {
    const section = readme.split(/^## How Kiro was used\s*$/m)[1] ?? "";
    expect(section).toContain(".kiro/hooks/");
    expect(section).toContain("`kiro-hooks`");
    expect(section).toContain("`rule-factory`");
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

  test("How Kiro was used counts and names every spec and hook on disk", () => {
    const section = readme.split(/^## How Kiro was used\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const specs = readdirSync(join(root, ".kiro", "specs"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const hooks = readdirSync(join(root, ".kiro", "hooks")).filter((f) => f.endsWith(".kiro.hook")).map((f) => f.replace(/\.kiro\.hook$/, ""));
    expect(section).toContain(`${specs.length} specs`);
    expect(section).toContain(`${hooks.length} hooks`);
    for (const name of [...specs, ...hooks]) expect({ name, found: section.includes(`\`${name}\``) }).toEqual({ name, found: true });
  });

  test("How Kiro was used counts and names every custom agent and says how to start it", () => {
    const section = readme.split(/^## How Kiro was used\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const agents = readdirSync(join(root, ".kiro", "agents")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    expect(agents.length).toBeGreaterThan(0);
    expect(section).toContain(".kiro/agents/");
    expect(section).toContain(`${agents.length} custom agent`);
    for (const name of agents) {
      expect({ name, found: section.includes(`\`${name}\``) }).toEqual({ name, found: true });
      expect({ name, run: section.includes(`kiro-cli chat --agent ${name}`) }).toEqual({ name, run: true });
    }
  });

  test("the Kiro hooks section says a costume save sets off one hook and how the others start", () => {
    const section = readme.split(/^## Kiro hooks\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).not.toMatch(/A costume edit sets off `visual-regression`, `era-accuracy` and `baseline-refresh`/);
    expect(section).toMatch(/costume[^.]*sets off only `visual-regression`/i);
    expect(section).toMatch(/`era-accuracy`[^|]*\|[^|]*agent finishes/i);
    expect(section).toMatch(/`baseline-refresh`[^|]*\|[^|]*by hand/i);
  });

  test("the Kiro hooks section states the hook count in words", () => {
    const section = readme.split(/^## Kiro hooks\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const n = readdirSync(join(root, ".kiro", "hooks")).filter((f) => f.endsWith(".kiro.hook")).length;
    const word = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n];
    expect(section).toContain(`${word} Kiro IDE hooks`);
  });

  test("lists the neighborhoods spec under How Kiro was used", () => {
    const section = readme.split(/^## How Kiro was used\s*$/m)[1] ?? "";
    expect(section).toMatch(/\bneighborhoods\b/);
  });
});
