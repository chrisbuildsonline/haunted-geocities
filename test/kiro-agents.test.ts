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
