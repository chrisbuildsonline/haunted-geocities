import { describe, expect, test } from "bun:test";
import { buildManifest } from "../src/manifest";
import { lintHtmlReferences, lintManifest, type RuleId } from "../scripts/lint-manifest";

type M = Record<string, any>;

/** The shipping manifest as a plain object, deep-copied so a row can mutate it freely. */
const good = (): M => structuredClone(buildManifest("production")) as M;

/** Stands in for dist/: the files the shipping manifest references. */
const present = new Set(["background.js", "popup.html"]);
const exists = (p: string) => present.has(p);

const rules = (m: M, ex: (p: string) => boolean = exists) => lintManifest(m, ex).map((v) => v.rule);

describe("lintManifest", () => {
  test("the shipping manifest with its files present is clean", () => {
    expect(lintManifest(good(), exists)).toEqual([]);
  });

  type Row = [name: string, mutate: (m: M) => void, expected: RuleId[], exists?: (p: string) => boolean];
  const rows: Row[] = [
    ["manifest_version 2", (m) => (m.manifest_version = 2), ["mv3"]],
    [
      "remote script source in the extension_pages CSP",
      (m) => (m.content_security_policy = { extension_pages: "script-src 'self' https://cdn.example.com" }),
      ["remote-code"],
    ],
    [
      "remote script source in the sandbox CSP",
      (m) => (m.content_security_policy = { sandbox: "sandbox allow-scripts; script-src 'self' https://cdn.example.com" }),
      ["remote-code"],
    ],
    [
      "service worker loaded from a URL",
      (m) => (m.background.service_worker = "https://evil.example/sw.js"),
      ["remote-code"],
      () => true,
    ],
    [
      "content script loaded from a URL",
      (m) => (m.content_scripts = [{ matches: ["<all_urls>"], js: ["//evil.example/c.js"] }]),
      ["remote-code"],
      () => true,
    ],
    ["an extra permission", (m) => m.permissions.push("tabs"), ["extra-permission"]],
    ["a missing permission", (m) => (m.permissions = m.permissions.filter((p: string) => p !== "storage")), ["missing-permission"]],
    ["host_permissions", (m) => (m.host_permissions = ["<all_urls>"]), ["host-permissions"]],
    ["optional_permissions", (m) => (m.optional_permissions = ["history"]), ["optional-permissions"]],
    ["wrong optional_host_permissions", (m) => (m.optional_host_permissions = ["<all_urls>"]), ["optional-hosts"]],
    ["missing optional_host_permissions", (m) => delete m.optional_host_permissions, ["optional-hosts"]],
    ["unsafe-eval in the CSP", (m) => (m.content_security_policy = { extension_pages: "script-src 'self' 'unsafe-eval'" }), ["csp-unsafe-eval"]],
    ["wasm-unsafe-eval in the CSP", (m) => (m.content_security_policy = { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }), []],
    ["popup.html missing from dist", () => {}, ["missing-file"], (p) => p !== "popup.html"],
    ["an icon missing from dist", (m) => (m.icons = { "16": "icons/16.png" }), ["missing-file"]],
    ["a content script css missing from dist", (m) => (m.content_scripts = [{ matches: ["<all_urls>"], css: ["/c.css"] }]), ["missing-file"]],
    ["an options page missing from dist", (m) => (m.options_ui = { page: "./options.html" }), ["missing-file"]],
    [
      "a web accessible resource missing from dist (wildcards skipped)",
      (m) => (m.web_accessible_resources = [{ resources: ["img/*.png", "ghost.png"], matches: ["<all_urls>"] }]),
      ["missing-file"],
    ],
  ];

  // Rows are wrapped in an object: bun hands a done callback to a test.each callback with spare parameters.
  test.each(rows.map((row) => ({ name: row[0], row })))("$name", ({ row: [, mutate, expected, ex] }) => {
    const m = good();
    mutate(m);
    expect(rules(m, ex)).toEqual(expected);
  });

  test("violation messages name the offending field or file", () => {
    const m = good();
    m.permissions.push("tabs");
    expect(lintManifest(m, (p) => p !== "popup.html").map((v) => v.message).join("\n")).toMatch(/tabs[\s\S]*popup\.html|popup\.html[\s\S]*tabs/);
    const missing = good();
    missing.permissions = ["activeTab"];
    const msg = lintManifest(missing, exists).map((v) => v.message).join("\n");
    for (const p of ["scripting", "declarativeNetRequest", "storage"]) expect(msg).toContain(p);
  });

  test("a manifest that breaks three rules gets one violation per rule", () => {
    const m = good();
    m.manifest_version = 2;
    m.host_permissions = ["<all_urls>"];
    m.content_security_policy = { extension_pages: "script-src 'self' 'unsafe-eval'" };
    expect(rules(m).sort()).toEqual(["csp-unsafe-eval", "host-permissions", "mv3"]);
  });

  test("an empty manifest does not throw", () => {
    expect(rules({}).sort()).toEqual([
      "missing-permission",
      "missing-permission",
      "missing-permission",
      "missing-permission",
      "mv3",
      "optional-hosts",
    ]);
  });

  test("wrongly typed fields are violations, not crashes", () => {
    const m = good();
    m.permissions = "storage";
    m.content_security_policy = 42;
    m.background = { service_worker: 7 };
    expect(() => lintManifest(m, exists)).not.toThrow();
    expect(rules(m)).toContain("missing-permission");
  });
});

describe("lintHtmlReferences", () => {
  const html = (body: string) => [{ path: "popup.html", source: `<!doctype html><head>${body}</head>` }];
  const has = (p: string) => ["popup.js", "shared.css"].includes(p);

  test("relative script and stylesheet that exist are clean", () => {
    expect(lintHtmlReferences(html(`<script type="module" crossorigin src="./popup.js"></script><link rel="stylesheet" crossorigin href="./shared.css">`), has)).toEqual([]);
  });

  test("a missing relative script is an html-reference violation naming the file", () => {
    const v = lintHtmlReferences(html(`<script type="module" src="./gone.js"></script>`), has);
    expect(v.map((x) => x.rule)).toEqual(["html-reference"]);
    expect(v[0]!.message).toContain("gone.js");
    expect(v[0]!.message).toContain("popup.html");
  });

  test("a missing relative stylesheet is a violation", () => {
    expect(lintHtmlReferences(html(`<link href="missing.css" rel="stylesheet">`), has).map((x) => x.rule)).toEqual(["html-reference"]);
  });

  test("absolute URLs are not checked here", () => {
    expect(lintHtmlReferences(html(`<script src="https://cdn.example.com/x.js"></script><link href="//cdn.example.com/x.css">`), has)).toEqual([]);
  });
});
