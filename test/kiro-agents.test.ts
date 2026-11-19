// The kiro-cli custom agents in .kiro/agents/: shape, resources that exist, and the costume-reviewer
// agent, which loads the era steering file and can read the repo but never write to it.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const agentsDir = join(root, ".kiro", "agents");
const files = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith(".json")).sort() : [];
const agents = files.map((file) => ({ file, agent: JSON.parse(readFileSync(join(agentsDir, file), "utf8")) as Record<string, any> }));

/** Tools that can change files, run commands or reach out, which a review agent must not have. */
const WRITING_TOOLS = ["fs_write", "execute_bash", "use_aws", "*", "@builtin", "write", "shell"];

test("there is at least one custom agent", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe.each(agents)("$file", ({ file, agent }) => {
  test("has a name equal to the file name, a description and a prompt", () => {
    expect(agent.name).toBe(file.replace(/\.json$/, ""));
    expect(typeof agent.description).toBe("string");
    expect(agent.description.length).toBeGreaterThan(0);
    expect(typeof agent.prompt).toBe("string");
    expect(agent.prompt.length).toBeGreaterThan(0);
  });

  test("lists its tools as strings, and pre-approves only tools it has", () => {
    expect(Array.isArray(agent.tools)).toBe(true);
    for (const t of agent.tools) expect(typeof t).toBe("string");
    for (const t of agent.allowedTools ?? []) expect({ t, listed: agent.tools.includes(t) }).toEqual({ t, listed: true });
  });

  test("every file:// resource points at a file in the repo", () => {
    for (const r of agent.resources ?? []) {
      expect(typeof r).toBe("string");
      expect(r.startsWith("file://")).toBe(true);
      const path = r.slice("file://".length);
      expect({ r, exists: !path.includes("*") && existsSync(join(root, path)) }).toEqual({ r, exists: true });
    }
  });

  test("uses no outside MCP servers", () => {
    expect(Object.keys(agent.mcpServers ?? {})).toEqual([]);
  });
});

describe("costume-reviewer", () => {
  const agent = agents.find((a) => a.agent.name === "costume-reviewer")?.agent;
  const prompt: string = agent?.prompt ?? "";

  test("exists", () => {
    expect(agent).toBeDefined();
  });

  test("loads the era-accuracy and design steering into its context", () => {
    expect(agent?.resources).toContain("file://.kiro/steering/era-accuracy.md");
    expect(agent?.resources).toContain("file://design/DESIGN.md");
  });

  test("can read the repo but has no tool that writes, runs commands or reaches out", () => {
    expect(agent?.tools).toContain("fs_read");
    for (const bad of WRITING_TOOLS) {
      expect({ bad, tools: (agent?.tools ?? []).includes(bad) }).toEqual({ bad, tools: false });
      expect({ bad, allowed: (agent?.allowedTools ?? []).includes(bad) }).toEqual({ bad, allowed: false });
    }
  });

  test("starts with the costume and popup diff in hand, from a read-only git command", () => {
    const spawn: { command: string }[] = agent?.hooks?.agentSpawn ?? [];
    expect(spawn.length).toBeGreaterThan(0);
    for (const { command } of spawn) {
      expect(command).toMatch(/^git (diff|status)\b/);
      expect(command).not.toMatch(/[;&|>]/);
    }
    expect(spawn.some(({ command }) => command.includes("src/content/costume") && command.includes("src/popup"))).toBe(true);
  });

  test("prompt names the rules, asks for file and line, and is read-only", () => {
    for (const word of ["216", "Comic Sans MS", "Times New Roman", "pixel art", "1998", "trademark", "line"]) {
      expect({ word, found: prompt.includes(word) }).toEqual({ word, found: true });
    }
    expect(prompt).toContain("do not edit, create or delete any file");
  });
});

// The rule-factory agent turns a one-line request ("add a confirmshaming phrase ...") into a failing
// test, then the rule, then a green suite. It may write, but only to the rule lists and their tests,
// and it may run only the two package.json scripts the rule-factory spec ends with.
describe("rule-factory", () => {
  const agent = agents.find((a) => a.agent.name === "rule-factory")?.agent;
  const prompt: string = agent?.prompt ?? "";
  const scripts = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts);
  const commands: string[] = agent?.toolsSettings?.execute_bash?.allowedCommands ?? [];
  const writePaths: string[] = agent?.toolsSettings?.fs_write?.allowedPaths ?? [];

  test("exists", () => {
    expect(agent).toBeDefined();
  });

  test("loads the rule-factory spec and the era, structure and tech steering", () => {
    for (const r of [
      "file://.kiro/specs/rule-factory/requirements.md",
      "file://.kiro/specs/rule-factory/design.md",
      "file://.kiro/steering/era-accuracy.md",
      "file://.kiro/steering/structure.md",
      "file://.kiro/steering/tech.md",
    ]) {
      expect({ r, loaded: (agent?.resources ?? []).includes(r) }).toEqual({ r, loaded: true });
    }
  });

  test("can read, write and run commands, and nothing that reaches out", () => {
    for (const t of ["fs_read", "fs_write", "execute_bash"]) expect(agent?.tools).toContain(t);
    for (const bad of ["use_aws", "*", "@builtin", "web_fetch", "web_search"]) {
      expect({ bad, tools: (agent?.tools ?? []).includes(bad) }).toEqual({ bad, tools: false });
    }
  });

  test("pre-approves reading only, so writing and commands need your trust", () => {
    expect(agent?.allowedTools ?? []).toEqual(["fs_read"]);
  });

  test("may run only bun run test and bun run typecheck, both real package.json scripts", () => {
    const names = commands.map((c) => c.replace(/^\^/, "").replace(/\$$/, ""));
    expect([...names].sort()).toEqual(["bun run test", "bun run typecheck"]);
    for (const name of names) {
      const script = name.slice("bun run ".length);
      expect({ script, real: scripts.includes(script) }).toEqual({ script, real: true });
    }
  });

  test("may write only the rule lists, the neighborhood data and their tests", () => {
    expect(writePaths.length).toBeGreaterThan(0);
    for (const p of writePaths) {
      expect({ p, scoped: /^(src\/content\/dark-patterns\.ts|src\/data\/(neighborhoods\.json|types\.ts)|test\/(dark-patterns|neighborhoods)\/)/.test(p) }).toEqual({ p, scoped: true });
      const fixed = p.split("*")[0].replace(/\/$/, "");
      expect({ p, exists: existsSync(join(root, fixed)) }).toEqual({ p, exists: true });
    }
    for (const p of ["src/content/dark-patterns.ts", "src/data/neighborhoods.json"]) {
      expect({ p, writable: writePaths.some((w) => w === p || (w.endsWith("**") && p.startsWith(w.slice(0, -2)))) }).toEqual({ p, writable: true });
    }
  });

  test("starts from a read-only git status, to see that the tree is clean", () => {
    const spawn: { command: string }[] = agent?.hooks?.agentSpawn ?? [];
    expect(spawn.length).toBeGreaterThan(0);
    for (const { command } of spawn) {
      expect(command).toMatch(/^git (diff|status)\b/);
      expect(command).not.toMatch(/[;&|>]/);
    }
  });

  test("prompt puts the failing test before the source change and ends on a green suite", () => {
    expect(prompt).toContain("Write the test first and run bun run test to see it fail before you change any file in src/.");
    const fail = prompt.indexOf("see it fail");
    const green = prompt.lastIndexOf("bun run typecheck");
    expect(fail).toBeGreaterThan(-1);
    expect(green).toBeGreaterThan(fail);
    expect(prompt).not.toContain("bun test test/");
  });

  test("every repo path the prompt names exists and every bun run it names is a real script", () => {
    const paths = prompt.match(/\b(?:src|test|fixtures|e2e)\/[\w./-]*\w/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const p of new Set(paths)) expect({ p, exists: existsSync(join(root, p)) }).toEqual({ p, exists: true });
    // "the two bun run scripts" is prose about scripts, not a command
    for (const [, script] of prompt.matchAll(/\bbun run (?!scripts\b)([\w:-]+)/g)) {
      expect({ script, real: scripts.includes(script) }).toEqual({ script, real: true });
    }
  });

  test("prompt never commits and stops to ask when the request is unclear", () => {
    expect(prompt).toMatch(/never commit/i);
    expect(prompt).toMatch(/ask/i);
  });
});
