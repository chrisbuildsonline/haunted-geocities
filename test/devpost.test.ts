// docs/devpost.md, the Devpost write-up. Its numbers are checked against the repo so they can't drift:
// hooks, specs, steering files and visual baselines are counted on disk; the unit and e2e totals come
// from the runners themselves (a bun run filtered to nothing reports how many tests it skipped, and
// `playwright test --list` prints a total), and the doc states them as "more than N" floors that must be
// below the real count and within 10% of it.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const path = join(root, "docs", "devpost.md");
const doc = existsSync(path) ? readFileSync(path, "utf8") : "";
const readme = readFileSync(join(root, "README.md"), "utf8");
const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

const DISCLOSURE =
  "A pre-period prototype exists outside the entry and was rebuilt from lessons, not copied; Tracker Radar ingest output is the only reused data.";

const dirs = (p: string) => readdirSync(join(root, p), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const files = (p: string, ext: string) => readdirSync(join(root, p)).filter((f) => f.endsWith(ext));

/** The number the doc puts in front of a phrase, e.g. stated("unit tests", "more than") → 950. */
function stated(phrase: string, lead = ""): number | undefined {
  const m = doc.match(new RegExp(`${lead ? `${lead} ` : ""}(\\d+) ${phrase}`, "i"));
  return m ? Number(m[1]) : undefined;
}

/** A floor is honest when the real count is above it and it is no more than 10% below. */
const honestFloor = (floor: number | undefined, actual: number) => ({ floor, ok: floor !== undefined && floor < actual && floor >= actual * 0.9, actual });

describe("docs/devpost.md", () => {
  test("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  test("has the Devpost sections", () => {
    for (const heading of ["Inspiration", "What it does", "How we built it", "Challenges", "Accomplishments", "What we learned", "What's next", "Built with", "Try it"]) {
      expect({ heading, found: new RegExp(`^## ${heading}`, "m").test(doc) }).toEqual({ heading, found: true });
    }
  });

  test("quotes the README disclosure line, which the README still carries", () => {
    expect(readme).toContain(DISCLOSURE);
    expect(doc).toContain(DISCLOSURE);
  });

  test("says nothing else about the prototype or the pre-period, and never claims a from-scratch start", () => {
    const rest = doc.replaceAll(DISCLOSURE, "");
    expect(rest).not.toMatch(/prototype|pre-period/i);
    expect(doc).not.toMatch(/from scratch|from zero|no prior (code|work)/i);
  });

  test("the hook count matches .kiro/hooks/ and names each hook", () => {
    const hooks = files(".kiro/hooks", ".kiro.hook").map((f) => f.replace(/\.kiro\.hook$/, ""));
    expect(stated("Kiro hooks")).toBe(hooks.length);
    for (const name of hooks) expect({ name, found: doc.includes(`\`${name}\``) }).toEqual({ name, found: true });
  });

  test("the spec count matches .kiro/specs/ and names each spec", () => {
    const specs = dirs(".kiro/specs");
    expect(stated("specs")).toBe(specs.length);
    for (const name of specs) expect({ name, found: doc.includes(`\`${name}\``) }).toEqual({ name, found: true });
  });

  test("the steering file count matches .kiro/steering/", () => {
    expect(stated("steering files")).toBe(files(".kiro/steering", ".md").length);
  });

  test("the visual shot count matches the committed baselines", () => {
    const baselines = files("e2e-visual/__screenshots__/visual.spec.ts", ".png").length;
    expect(baselines).toBeGreaterThan(0);
    expect(stated("visual screenshot tests")).toBe(baselines);
  });

  test("the unit test floor is honest against the real bun count", () => {
    const r = Bun.spawnSync([process.execPath, "test", "./test/", "-t", "zz-devpost-count-only-zz"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = `${r.stdout}${r.stderr}`;
    const m = out.match(/skipping (\d+) tests/);
    expect({ parsed: !!m, out: m ? "" : out }).toEqual({ parsed: true, out: "" });
    expect(honestFloor(stated("unit tests", "more than"), Number(m![1]))).toMatchObject({ ok: true });
  }, 60_000);

  test("the e2e test floor is honest against playwright test --list", () => {
    const r = Bun.spawnSync([process.execPath, "x", "playwright", "test", "--list", "--reporter=dot"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = `${r.stdout}${r.stderr}`;
    const m = out.match(/Total: (\d+) tests? in/);
    expect({ parsed: !!m, out: m ? "" : out }).toEqual({ parsed: true, out: "" });
    expect(honestFloor(stated("end-to-end tests", "more than"), Number(m![1]))).toMatchObject({ ok: true });
  }, 60_000);

  test("every `bun run <script>` it names exists in package.json", () => {
    const used = [...doc.matchAll(/bun run ([\w:-]+)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect({ name, exists: Object.hasOwn(scripts, name) }).toEqual({ name, exists: true });
  });

  test("Try it points at dist.zip on the GitHub release and at building with bun", () => {
    const section = doc.split(/^## Try it\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(section).toContain("dist.zip");
    expect(section).toMatch(/GitHub release/i);
    expect(section).toContain("Load unpacked");
    expect(section).toContain("bun run build");
  });

  test("Built with names the Web Audio API, which src/audio/sound.ts uses", () => {
    const section = doc.split(/^## Built with\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    expect(readFileSync(join(root, "src", "audio", "sound.ts"), "utf8")).toMatch(/\bAudioContext\b/);
    expect(section).toContain("Web Audio API");
  });

  test("How Kiro was used says no MCP servers, custom agents or powers were used", () => {
    const section = doc.split(/^### How Kiro was used\s*$/m)[1]?.split(/^##+ /m)[0] ?? "";
    expect(section).toMatch(/\bno MCP servers, custom agents or Kiro powers\b/i);
    expect(section).toContain("kiro-cli");
  });

  test("says the code is MIT and the bundled tracker data is CC BY-NC-SA 4.0, as the README does", () => {
    expect(readme).toMatch(/code is MIT/);
    expect(doc).toMatch(/code is MIT/);
    expect(doc).toMatch(/`src\/data\/trackers\.json`[^.]*CC BY-NC-SA 4\.0/);
  });

  test("keeps a plain tone", () => {
    expect(doc).not.toMatch(/\b(revolutionary|seamless(ly)?|cutting-edge|game-?chang\w*|blazing(ly)?|supercharg\w*|unleash\w*|next-level|leverag\w*|delight\w*|magic(al)?)\b/i);
    expect(doc).not.toMatch(/!{2,}/);
  });
});
