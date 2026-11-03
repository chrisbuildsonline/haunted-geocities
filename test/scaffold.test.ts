import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const lines = (f: string) =>
  read(f)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
const has = (f: string, entry: string) =>
  lines(f).some((l) => l.replace(/^\//, "") === entry || l.replace(/^\//, "") === entry.replace(/\/$/, ""));

describe("LICENSE", () => {
  test("is MIT, Copyright (c) 2026 Chris", () => {
    const t = read("LICENSE");
    expect(t).toContain("MIT License");
    expect(t).toContain("Copyright (c) 2026 Chris");
    expect(t).toContain("Permission is hereby granted, free of charge");
    expect(t).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });
});

describe(".gitignore", () => {
  for (const e of [
    "prototype/", "node_modules/", "dist/", "test-results/", "playwright-report/",
    "design/refs/", ".claude/", ".omc/", "PLAN.md", "CLAUDE.md",
  ]) {
    test(`ignores ${e}`, () => expect(has(".gitignore", e)).toBe(true));
  }
  test("does not ignore .kiro", () => {
    expect(lines(".gitignore").some((l) => /\.kiro/.test(l))).toBe(false);
  });
});

describe(".dockerignore", () => {
  for (const e of [
    "prototype/", "node_modules/", "dist/", ".git/", "test-results/", ".claude/", ".omc/", "design/refs/",
  ]) {
    test(`lists ${e}`, () => expect(has(".dockerignore", e)).toBe(true));
  }
  for (const e of ["test/", "e2e/", "fixtures/", "docs/", ".kiro"]) {
    test(`does not list ${e}`, () => {
      const bare = e.replace(/\/$/, "");
      expect(lines(".dockerignore").some((l) => l.replace(/^\//, "").replace(/\/$/, "") === bare)).toBe(false);
    });
  }
});

describe("package.json", () => {
  const pkg = () => JSON.parse(read("package.json"));
  test("metadata", () => {
    const p = pkg();
    expect(p.type).toBe("module");
    expect(p.private).toBe(true);
    expect(p.license).toBe("MIT");
  });
  test("scripts", () => {
    const s = pkg().scripts;
    expect(s.typecheck).toBe("tsc --noEmit");
    // "./test/" is a path prefix; bare "test/" is a substring filter that also matches prototype/test/
    expect(s.test).toBe("bun test ./test/");
    expect(s["test:e2e"]).toContain("playwright test");
  });
});

describe("root files", () => {
  test("PLAN.md and CLAUDE.md do not exist", () => {
    expect(existsSync(join(root, "PLAN.md"))).toBe(false);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });
});
