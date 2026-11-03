import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../src/manifest";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");

type Manifest = ReturnType<typeof buildManifest>;

const shippingChecks = (get: () => Manifest) => {
  test("is MV3 with name, version 0.1.0 and a description", () => {
    const m = get();
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBe("Haunted GeoCities");
    expect(m.version).toBe("0.1.0");
    expect(m.description).toBeString();
    expect(m.description.length).toBeGreaterThan(0);
  });
  test("permissions are exactly activeTab, scripting, declarativeNetRequest, storage", () => {
    expect([...get().permissions].sort()).toEqual(["activeTab", "declarativeNetRequest", "scripting", "storage"]);
  });
  test("http/https are optional host permissions", () => {
    expect(get().optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });
  test("declares no host_permissions and no optional_permissions", () => {
    expect("host_permissions" in get()).toBe(false);
    expect("optional_permissions" in get()).toBe(false);
  });
  test("has no static content_scripts (injection is on demand only)", () => {
    expect("content_scripts" in get()).toBe(false);
  });
  test("background service worker is background.js", () => {
    expect(get().background).toEqual({ service_worker: "background.js" });
  });
  test("action popup is popup.html", () => {
    expect(get().action.default_popup).toBe("popup.html");
  });
};

describe("source manifest (production)", () => {
  shippingChecks(() => buildManifest("production"));
});

describe("e2e manifest", () => {
  test("adds host_permissions for the local fixture server only", () => {
    expect(buildManifest("e2e").host_permissions).toEqual(["http://127.0.0.1/*", "http://localhost/*"]);
  });
  test("is otherwise identical to the shipping manifest", () => {
    const { host_permissions: _, ...rest } = buildManifest("e2e");
    expect(rest).toEqual(buildManifest("production"));
  });
});

describe("dist/ (after bun run build)", () => {
  beforeAll(() => {
    const r = Bun.spawnSync(["bun", "run", "build"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`build failed:\n${r.stdout}\n${r.stderr}`);
  }, 120_000);

  const distManifest = () => JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8")) as Manifest;
  shippingChecks(distManifest);

  test("contains manifest, background.js, content.js, popup.html and the popup js + css", () => {
    for (const f of ["manifest.json", "background.js", "content.js", "popup.html"]) {
      expect({ [f]: existsSync(join(dist, f)) }).toEqual({ [f]: true });
    }
    const html = readFileSync(join(dist, "popup.html"), "utf8");
    const js = html.match(/<script[^>]+src="\.?\/?([^"]+\.js)"/)?.[1];
    const css = html.match(/<link[^>]+href="\.?\/?([^"]+\.css)"/)?.[1];
    expect(js).toBeString();
    expect(css).toBeString();
    expect(existsSync(join(dist, js!))).toBe(true);
    expect(existsSync(join(dist, css!))).toBe(true);
  });

  test("content.js and background.js are self-contained (no ES imports or exports)", () => {
    for (const f of ["content.js", "background.js"]) {
      const src = readFileSync(join(dist, f), "utf8");
      expect({ [f]: /^\s*(import|export)\b/m.test(src) }).toEqual({ [f]: false });
      expect({ [f]: /\bimport\s*\(/.test(src) }).toEqual({ [f]: false });
    }
  });

  test("no build output asks for anything over the network", () => {
    const files = readdirSync(dist, { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
    for (const d of files) {
      const src = readFileSync(join(d.parentPath, d.name), "utf8");
      const external = src.match(/(?:src|href)\s*=\s*["']?https?:\/\/|@import\s+url\(\s*["']?https?:|url\(\s*["']?https?:/);
      expect({ [d.name]: external?.[0] ?? null }).toEqual({ [d.name]: null });
    }
  });
});
