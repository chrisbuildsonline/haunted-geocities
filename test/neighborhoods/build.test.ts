import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const dist = join(root, "dist");

describe("dist/ permissions page (after bun run build)", () => {
  beforeAll(() => {
    const r = Bun.spawnSync(["bun", "run", "build"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`build failed:\n${r.stdout}\n${r.stderr}`);
  }, 120_000);

  test("dist/permissions.html and permissions.js exist after a build", () => {
    expect(existsSync(join(dist, "permissions.html"))).toBe(true);
    expect(existsSync(join(dist, "permissions.js"))).toBe(true);
    const html = readFileSync(join(dist, "permissions.html"), "utf8");
    expect(html.match(/<script[^>]+src="\.?\/?([^"]+\.js)"/)?.[1]).toBe("permissions.js");
  });
  test("permissions.html links a CSS file that exists in dist/", () => {
    for (const page of ["permissions.html", "popup.html"]) {
      const html = readFileSync(join(dist, page), "utf8");
      const css = [...html.matchAll(/<link[^>]+href="\.?\/?([^"]+\.css)"/g)].map((m) => m[1]!);
      expect({ [page]: css.length > 0 }).toEqual({ [page]: true });
      for (const f of css) expect({ [f]: existsSync(join(dist, f)) }).toEqual({ [f]: true });
    }
  });
  test("dist/manifest.json has no host_permissions and no web_accessible_resources", () => {
    const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
    expect("host_permissions" in manifest).toBe(false);
    expect("web_accessible_resources" in manifest).toBe(false);
  });
});
