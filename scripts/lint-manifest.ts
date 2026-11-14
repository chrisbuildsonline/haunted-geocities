// MV3 manifest lint. `bun run lint:manifest` builds dist/ and checks the shipping manifest
// (the object src/manifest.ts produces and dist/manifest.json) against the permission and
// CSP rules in .kiro/steering/tech.md and product.md. The e2e manifest is never linted:
// it has host_permissions on purpose. The Kiro hook manifest-lint runs this on save.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

export type RuleId =
  | "mv3"
  | "remote-code"
  | "extra-permission"
  | "missing-permission"
  | "host-permissions"
  | "optional-permissions"
  | "optional-hosts"
  | "csp-unsafe-eval"
  | "missing-file"
  | "html-reference";

export type Violation = { rule: RuleId; message: string };

export const PERMISSIONS = ["activeTab", "scripting", "declarativeNetRequest", "storage"];
export const OPTIONAL_HOSTS = ["http://*/*", "https://*/*"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

const isUrl = (s: string) => /^(https?:)?\/\//i.test(s);
/** CSP directives as name → source list, lower-cased. */
const directives = (csp: string) =>
  new Map(
    csp
      .split(";")
      .map((d) => d.trim().split(/\s+/).filter(Boolean))
      .filter((d) => d.length > 0)
      .map(([name, ...sources]) => [name!.toLowerCase(), sources.map((s) => s.toLowerCase())] as const),
  );
const remoteSource = (s: string) => /^https?:/.test(s) || s.startsWith("//");

/** Strip a leading "/" or "./" so manifest paths match paths relative to dist/. */
const clean = (p: string) => p.replace(/^\.?\//, "");

export function lintManifest(manifest: Record<string, unknown>, exists: (path: string) => boolean): Violation[] {
  const out: Violation[] = [];
  const add = (rule: RuleId, message: string) => out.push({ rule, message });

  // mv3
  if (manifest.manifest_version !== 3) add("mv3", `manifest_version is ${JSON.stringify(manifest.manifest_version)}, not 3`);

  // remote-code
  const csp = obj(manifest.content_security_policy);
  if (typeof csp.extension_pages === "string") {
    for (const [name, sources] of directives(csp.extension_pages)) {
      for (const s of sources.filter(remoteSource)) add("remote-code", `content_security_policy.extension_pages ${name} allows remote source ${s}`);
    }
  }
  if (typeof csp.sandbox === "string") {
    const d = directives(csp.sandbox);
    const scriptSources = d.get("script-src") ?? d.get("default-src") ?? [];
    for (const s of scriptSources.filter(remoteSource)) add("remote-code", `content_security_policy.sandbox allows remote script source ${s}`);
  }
  const contentScripts = arr(manifest.content_scripts).map(obj);
  contentScripts.forEach((cs, i) => {
    for (const js of strings(cs.js).filter(isUrl)) add("remote-code", `content_scripts[${i}].js loads ${js} from the network`);
  });
  const background = obj(manifest.background);
  if (typeof background.service_worker === "string" && isUrl(background.service_worker)) {
    add("remote-code", `background.service_worker is a URL: ${background.service_worker}`);
  }

  // permissions
  const permissions = strings(manifest.permissions);
  for (const p of permissions.filter((p) => !PERMISSIONS.includes(p))) add("extra-permission", `permissions has "${p}", which is not allowed`);
  for (const p of PERMISSIONS.filter((p) => !permissions.includes(p))) add("missing-permission", `permissions lacks "${p}"`);
  if ("host_permissions" in manifest) add("host-permissions", `host_permissions is declared (${JSON.stringify(manifest.host_permissions)}); none are allowed at install`);
  if ("optional_permissions" in manifest) add("optional-permissions", `optional_permissions is declared (${JSON.stringify(manifest.optional_permissions)})`);
  const optHosts = manifest.optional_host_permissions;
  if (
    !Array.isArray(optHosts) ||
    optHosts.some((h) => !OPTIONAL_HOSTS.includes(h as string)) ||
    OPTIONAL_HOSTS.some((h) => !optHosts.includes(h))
  ) {
    add("optional-hosts", `optional_host_permissions is ${JSON.stringify(optHosts)}, expected exactly ${JSON.stringify(OPTIONAL_HOSTS)}`);
  }

  // csp-unsafe-eval
  if (typeof csp.extension_pages === "string" && csp.extension_pages.split(/[\s;]+/).some((t) => t.toLowerCase() === "'unsafe-eval'")) {
    add("csp-unsafe-eval", "content_security_policy.extension_pages allows 'unsafe-eval'");
  }

  // missing-file
  const action = obj(manifest.action);
  const refs: [field: string, path: unknown][] = [
    ["background.service_worker", background.service_worker],
    ["action.default_popup", action.default_popup],
    ...Object.entries(obj(manifest.icons)).map(([k, v]) => [`icons.${k}`, v] as [string, unknown]),
    ...(typeof action.default_icon === "string"
      ? [["action.default_icon", action.default_icon] as [string, unknown]]
      : Object.entries(obj(action.default_icon)).map(([k, v]) => [`action.default_icon.${k}`, v] as [string, unknown])),
    ...contentScripts.flatMap((cs, i) => [
      ...strings(cs.js).map((p) => [`content_scripts[${i}].js`, p] as [string, unknown]),
      ...strings(cs.css).map((p) => [`content_scripts[${i}].css`, p] as [string, unknown]),
    ]),
    ["options_page", manifest.options_page],
    ["options_ui.page", obj(manifest.options_ui).page],
    ...arr(manifest.web_accessible_resources)
      .map(obj)
      .flatMap((w, i) => strings(w.resources).filter((p) => !p.includes("*")).map((p) => [`web_accessible_resources[${i}].resources`, p] as [string, unknown])),
  ];
  for (const [field, path] of refs) {
    if (path === undefined) continue;
    if (typeof path !== "string" || path === "") {
      add("missing-file", `${field} is not a file path: ${JSON.stringify(path)}`);
      continue;
    }
    if (isUrl(path)) continue; // remote-code covers it
    if (!exists(clean(path))) add("missing-file", `${field} points to ${clean(path)}, which is not in dist/`);
  }

  return out;
}

/** Relative <script src> and <link href> targets of built HTML files that are missing. Paths are relative to dist/. */
export function lintHtmlReferences(htmlFiles: { path: string; source: string }[], exists: (path: string) => boolean): Violation[] {
  const out: Violation[] = [];
  for (const { path, source } of htmlFiles) {
    const refs = [
      ...[...source.matchAll(/<script\b[^>]*?\ssrc\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]!),
      ...[...source.matchAll(/<link\b[^>]*?\shref\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]!),
    ];
    for (const ref of refs) {
      if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue; // absolute URLs, data:, anchors
      const target = posix.normalize(posix.join(posix.dirname(path), ref.split(/[?#]/)[0]!)).replace(/^\//, "");
      if (!exists(target)) out.push({ rule: "html-reference", message: `${path} references ${ref}, which is not in dist/` });
    }
  }
  return out;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const dist = join(root, "dist");

  const build = Bun.spawnSync(["bun", "run", "build"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (build.exitCode !== 0) {
    process.stdout.write(build.stdout);
    process.stderr.write(build.stderr);
    console.error("lint:manifest: vite build failed");
    process.exit(1);
  }

  const { buildManifest } = await import("../src/manifest.ts");
  const exists = (p: string) => existsSync(join(dist, p));
  const label = (where: string) => (v: Violation) => ({ ...v, message: `${where}: ${v.message}` });

  const html = readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".html"))
    .map((d) => {
      const full = join(d.parentPath, d.name);
      return { path: full.slice(dist.length + 1).split("\\").join("/"), source: readFileSync(full, "utf8") };
    });

  const distManifestPath = join(dist, "manifest.json");
  const violations = [
    ...lintManifest(buildManifest("production") as Record<string, unknown>, exists).map(label("src/manifest.ts")),
    ...(existsSync(distManifestPath)
      ? lintManifest(JSON.parse(readFileSync(distManifestPath, "utf8")), exists).map(label("dist/manifest.json"))
      : [{ rule: "missing-file" as const, message: "dist/manifest.json was not written by the build" }]),
    ...lintHtmlReferences(html, exists),
  ];

  if (violations.length === 0) {
    console.log("lint:manifest: ok");
    process.exit(0);
  }
  for (const v of violations) console.log(`${v.rule}  ${v.message}`);
  console.log(`lint:manifest: ${violations.length} violation${violations.length === 1 ? "" : "s"}`);
  process.exit(1);
}
