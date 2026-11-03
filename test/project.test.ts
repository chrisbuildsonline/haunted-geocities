import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const lines = (f: string) =>
  read(f)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

describe("package.json scripts", () => {
  const s = () => JSON.parse(read("package.json")).scripts as Record<string, string>;
  test("build is vite build", () => expect(s().build).toBe("vite build"));
  test("test:e2e builds the e2e bundle, then runs playwright without --pass-with-no-tests", () => {
    expect(s()["test:e2e"]).toBe("vite build --mode e2e && playwright test");
  });
  test("docker:test builds the image (the checks are RUN steps)", () => {
    expect(s()["docker:test"]).toStartWith("docker build ");
  });
  test("vite, @types/chrome and happy-dom are dev dependencies", () => {
    const d = JSON.parse(read("package.json")).devDependencies;
    for (const k of ["vite", "@types/chrome", "happy-dom"]) expect(d[k]).toBeString();
  });
  test("tsconfig types include chrome", () => {
    expect(JSON.parse(read("tsconfig.json")).compilerOptions.types).toContain("chrome");
  });
});

describe("ignores", () => {
  test(".gitignore ignores dist-e2e/", () => expect(lines(".gitignore")).toContain("dist-e2e/"));
  for (const e of ["dist-e2e/", "dist/", "prototype/", "node_modules/", ".git/", "design/refs/", ".claude/", ".omc/", "test-results/"]) {
    test(`.dockerignore lists ${e}`, () => expect(lines(".dockerignore")).toContain(e));
  }
});

describe("Dockerfile", () => {
  const df = () => read("Dockerfile");
  test("uses the Playwright image matching @playwright/test", () => {
    const v = JSON.parse(read("node_modules/@playwright/test/package.json")).version;
    expect(df()).toContain(`FROM mcr.microsoft.com/playwright:v${v}-noble`);
  });
  test("installs bun pinned to the local major.minor", () => {
    const [maj, min] = Bun.version.split(".");
    expect(df()).toMatch(new RegExp(`npm install -g bun@${maj}\\.${min}\\.\\d+`));
  });
  test("bakes in typecheck, test and test:e2e as RUN steps", () => {
    for (const s of ["typecheck", "test", "test:e2e"]) {
      expect(df()).toContain(`RUN bun run ${s}\n`);
    }
  });
});

describe("fixtures", () => {
  const dir = join(root, "fixtures");
  const pages = () => readdirSync(dir).filter((f) => f.endsWith(".html"));
  test("index.html exists with headings, paragraphs, links and a form", () => {
    const html = read("fixtures/index.html");
    for (const tag of ["<h1", "<h2", "<p>", "<a ", "<form", "<input", "<button"]) expect(html).toContain(tag);
  });
  test("every page is standalone: no external URLs", () => {
    expect(pages().length).toBeGreaterThanOrEqual(2);
    for (const p of pages()) {
      // trackers.html and vampires.html name tracker (and one made-up) hosts, which e2e/fixtures.ts maps to the local fixture server.
      const html = read(`fixtures/${p}`).replaceAll(/http:\/\/(?:(?:criteo|hotjar|taboola|adentifi)\.com|nightowl-metrics\.test):4321\//g, "/");
      expect({ [p]: html.match(/(?:src|href|action)\s*=\s*["']?(?:https?:)?\/\//)?.[0] ?? null }).toEqual({ [p]: null });
      expect({ [p]: /url\(\s*["']?(?:https?:)?\/\//.test(html) }).toEqual({ [p]: false });
    }
  });
  test("every page sets an inline favicon so the browser does not log a 404", () => {
    for (const p of pages()) expect({ [p]: read(`fixtures/${p}`).includes('rel="icon" href="data:,"') }).toEqual({ [p]: true });
  });
  test("the form target page exists", () => {
    const action = read("fixtures/index.html").match(/<form[^>]*action="([^"]+)"/)?.[1];
    expect(action).toBeString();
    expect(existsSync(join(dir, action!))).toBe(true);
  });
});

describe("fixture server", () => {
  test("serves fixtures on the port from argv and refuses path traversal", async () => {
    const port = 43000 + Math.floor(Math.random() * 1000);
    const proc = Bun.spawn(["bun", "scripts/fixture-server.ts", String(port)], { cwd: root, stdout: "pipe", stderr: "pipe" });
    try {
      const base = `http://127.0.0.1:${port}`;
      let res: Response | undefined;
      for (let i = 0; i < 50 && !res; i++) {
        res = await fetch(`${base}/index.html`).catch(() => undefined);
        if (!res) await Bun.sleep(100);
      }
      expect(res!.status).toBe(200);
      expect(res!.headers.get("content-type")).toContain("text/html");
      expect(await res!.text()).toContain("<form");
      expect((await fetch(`${base}/`)).status).toBe(200);
      expect((await fetch(`${base}/missing.html`)).status).toBe(404);
      expect((await fetch(`${base}/..%2fpackage.json`)).status).toBe(404);
    } finally {
      proc.kill();
      await proc.exited;
    }
  }, 15_000);
});
