// docs/demo-script.md, the written demo script the video is recorded from (and the board draft is synced
// from). It must tell the same story as the repo: it opens on the haunt moment with the parade of the
// fixture's real tracker companies, the Exorcise beat ends on the HUD ghost count ticking down (the old
// "toolbar badge drops by one" line is gone), and the Kiro beat shows both custom agents, with
// rule-factory adding a rule test-first inside the limits its JSON gives it.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const path = join(root, "docs", "demo-script.md");
const doc = existsSync(path) ? readFileSync(path, "utf8") : "";

type Step = { time: string; start: number; end: number; shot: string; voiceover: string };

const seconds = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m! * 60 + s!;
};

/** Each step is a `## m:ss-m:ss Title` heading followed by a **Shot:** and a **Voiceover:** paragraph. */
const steps: Step[] = doc
  .split(/^## /m)
  .slice(1)
  .map((block) => {
    const time = block.match(/^(\d:\d{2})-(\d:\d{2})\b/);
    const shot = block.match(/^\*\*Shot:\*\* (.+)$/m)?.[1] ?? "";
    const voiceover = block.match(/^\*\*Voiceover:\*\* (.+)$/m)?.[1] ?? "";
    return { time: time ? `${time[1]}-${time[2]}` : "", start: time ? seconds(time[1]!) : NaN, end: time ? seconds(time[2]!) : NaN, shot, voiceover };
  });

const agentsDir = join(root, ".kiro", "agents");
const agents = readdirSync(agentsDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const ruleFactory = JSON.parse(readFileSync(join(agentsDir, "rule-factory.json"), "utf8")) as {
  toolsSettings: { execute_bash: { allowedCommands: string[] }; fs_write: { allowedPaths: string[] } };
};

/** The tracker companies fixtures/news.html loads, from its own comment: four ghosts and two known vampires. */
const newsCompanies = (() => {
  const html = readFileSync(join(root, "fixtures", "news.html"), "utf8");
  const ghosts = html.match(/four ghosts \(([^)]+)\)/)?.[1] ?? "";
  const vampires = html.match(/two known vampires \(([^)]+)\)/)?.[1] ?? "";
  return `${ghosts}, ${vampires}`.split(",").map((s) => s.trim().replace(/\s+\d+$/, "")).filter(Boolean);
})();

describe("docs/demo-script.md", () => {
  test("exists and has timed steps, each with a shot and a voiceover", () => {
    expect(existsSync(path)).toBe(true);
    expect(steps.length).toBeGreaterThanOrEqual(5);
    for (const s of steps) expect({ time: s.time, shot: !!s.shot, voiceover: !!s.voiceover }).toEqual({ time: s.time, shot: true, voiceover: true });
  });

  test("the steps run back to back from 0:00 and end under three minutes", () => {
    expect(steps[0]?.start).toBe(0);
    for (let i = 1; i < steps.length; i++) expect({ step: steps[i]!.time, start: steps[i]!.start }).toEqual({ step: steps[i]!.time, start: steps[i - 1]!.end });
    expect(steps.at(-1)!.end).toBeLessThan(180);
  });

  test("opens on the haunt moment: the CRT death and the parade of the page's real tracker companies, by name", () => {
    expect(newsCompanies).toHaveLength(6);
    const first = steps[0]!;
    expect(first.end).toBeLessThanOrEqual(20);
    expect(first.shot).toContain("news.html");
    expect(first.shot).toMatch(/\bCRT\b/);
    expect(first.shot).toMatch(/\bparade\b/i);
    for (const company of newsCompanies) expect({ company, named: first.shot.includes(company) && first.voiceover.includes(company) }).toEqual({ company, named: true });
  });

  test("the Exorcise beat ends on the HUD ghost count ticking down, not a toolbar badge", () => {
    expect(doc).not.toMatch(/toolbar badge drops/i);
    const exorcise = steps.find((s) => /Exorcise/.test(s.shot));
    expect(exorcise).toBeDefined();
    expect(exorcise!.shot).toMatch(/EXORCISED stamp/);
    expect(exorcise!.shot).toMatch(/HUD count of ghosts still haunting ticks down/);
  });

  test("the Kiro beat names both custom agents and has rule-factory add a rule test-first, within its limits", () => {
    expect(agents.sort()).toEqual(["costume-reviewer", "rule-factory"]);
    const kiro = steps.find((s) => s.shot.includes("rule-factory"));
    expect(kiro).toBeDefined();
    const text = `${kiro!.shot} ${kiro!.voiceover}`;
    expect(text).toContain("2 custom agents");
    for (const name of agents) expect({ name, found: text.includes(`\`${name}\``) }).toEqual({ name, found: true });
    expect(kiro!.shot).toContain("kiro-cli chat --agent rule-factory");
    // failing test first, then the rule, then green
    const failing = kiro!.shot.search(/fails/);
    const rule = kiro!.shot.search(/adds the regex/);
    const green = kiro!.shot.search(/green/);
    expect(failing).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(failing);
    expect(green).toBeGreaterThan(rule);
    // the scopes are the agent's own: every write path and both commands, quoted as in its JSON
    for (const p of ruleFactory.toolsSettings.fs_write.allowedPaths) {
      const shown = p.replace(/\*\*$/, "");
      expect({ path: shown, found: kiro!.shot.includes(`\`${shown}\``) }).toEqual({ path: shown, found: true });
    }
    for (const c of ruleFactory.toolsSettings.execute_bash.allowedCommands) expect({ c, found: kiro!.shot.includes(`\`${c}\``) }).toEqual({ c, found: true });
  });

  test("the Kiro beat credits rule-factory only with the run recorded in docs/rule-factory-run.md", () => {
    const kiro = steps.find((s) => s.shot.includes("rule-factory"));
    expect(kiro!.shot).toContain('"add a scarcity phrase: Last one in the shop"');
    expect(existsSync(join(root, "docs", "rule-factory-run.md"))).toBe(true);
    expect(kiro!.voiceover).toContain("docs/rule-factory-run.md");
    expect(doc).not.toMatch(/came from it|came to be cursed|stay in the dark|coupons box/);
  });

  test("keeps a plain tone", () => {
    expect(doc).not.toMatch(/\b(revolutionary|seamless(ly)?|cutting-edge|game-?chang\w*|blazing(ly)?|supercharg\w*|unleash\w*|next-level|leverag\w*|delight\w*|magic(al)?)\b/i);
    expect(doc).not.toMatch(/!{2,}/);
  });
});
