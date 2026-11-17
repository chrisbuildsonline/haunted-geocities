// The popup and permissions.html dressed as Windows 95 windows: the CSS carries the costume.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "src", "popup");
const read = (f: string) => readFileSync(join(SRC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const STYLES = read("styles.css");
const PERMS = read("permissions.css");

/** Custom properties declared in :root. */
const rootVars = (): Record<string, string> =>
  Object.fromEntries([...(STYLES.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
/** A value with every var(--x) replaced by its :root value, lower-cased and single-spaced. */
const resolve = (v: string): string => {
  const vars = rootVars();
  let out = v;
  for (let i = 0; i < 5; i++) out = out.replace(/var\((--[\w-]+)\)/g, (_, n: string) => vars[n] ?? `var(${n})`);
  return out.replace(/\s+/g, " ").trim().toLowerCase();
};
/** Every declaration of every rule whose selector list holds `selector`, later rules winning. */
const decls = (css: string, selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!sel!.split(",").map((s) => s.trim()).includes(selector)) continue;
    for (const [, p, v] of body!.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) out[p!] = resolve(v!);
  }
  return out;
};
const values = (css: string, prop: string) => [...css.matchAll(new RegExp(`(?<![\\w-])${prop}\\s*:\\s*([^;}]+)`, "g"))].map((m) => resolve(m[1]!));
/** Split a box-shadow list at its top-level commas. */
const shadows = (v: string) => v.split(/,(?![^(]*\))/).map((s) => s.trim());
const blurOf = (shadow: string) => {
  const lengths = shadow
    .replace(/\binset\b/, "")
    .replace(/#[0-9a-f]{3,8}|rgba?\([^)]*\)|\b[a-z]+\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return lengths.length >= 3 ? parseFloat(lengths[2]!) : 0;
};

const RAISED = ["inset -1px -1px 0 #000000", "inset 1px 1px 0 #ffffff", "inset -2px -2px 0 #808080", "inset 2px 2px 0 #dfdfdf"];
const SUNKEN = ["inset -1px -1px 0 #ffffff", "inset 1px 1px 0 #808080", "inset -2px -2px 0 #dfdfdf", "inset 2px 2px 0 #000000"];

describe("popup costume CSS", () => {
  test("popup and permissions CSS have no border-radius other than 0", () => {
    for (const [name, css] of [["styles.css", STYLES], ["permissions.css", PERMS]] as const) {
      for (const v of values(css, "border-radius")) expect({ name, v }).toEqual({ name, v: "0" });
    }
    expect(Object.values(rootVars()).join(" ")).not.toMatch(/999px|50%/);
  });

  test("popup and permissions CSS have no blurred box-shadow", () => {
    for (const [name, css] of [["styles.css", STYLES], ["permissions.css", PERMS]] as const) {
      const all = values(css, "box-shadow").flatMap(shadows).filter((s) => s !== "none");
      expect(all.length).toBeGreaterThan(0);
      for (const s of all) expect({ name, s, blur: blurOf(s) }).toEqual({ name, s, blur: 0 });
      expect(css).not.toMatch(/gradient\(|drop-shadow\(/);
    }
  });

  test("title bar is #000080 with bold white 13px text", () => {
    const bar = decls(STYLES, ".titlebar");
    expect(bar.background).toBe("#000080");
    expect(bar.color).toBe("#ffffff");
    expect(bar["font-weight"]).toBe("700");
    expect(bar["font-size"]).toBe("13px");
    expect(bar.height).toBe("24px");
  });

  test("popup uses the MS Sans Serif stack, a 24px bold Times title and Courier counters", () => {
    expect(decls(STYLES, "body")["font-family"]).toBe("'ms sans serif', 'microsoft sans serif', tahoma, geneva, sans-serif");
    expect(decls(STYLES, "body")["font-size"]).toBe("13px");
    const title = decls(STYLES, ".title");
    expect([title["font-family"], title["font-size"], title["font-weight"]]).toEqual(['"times new roman", times, serif', "24px", "700"]);
    const num = decls(STYLES, ".num");
    expect([num["font-family"], num["font-size"], num["font-weight"], num["font-variant-numeric"]]).toEqual(['"courier new", courier, monospace', "24px", "700", "tabular-nums"]);
    expect(STYLES).not.toMatch(/system-ui|-apple-system|Roboto/);
  });

  test("group box has a 2px etched #808080/#ffffff border", () => {
    const g = decls(STYLES, ".group");
    expect(g.border).toBe("1px solid #808080");
    expect(shadows(g["box-shadow"]!)).toEqual(["1px 1px 0 #ffffff", "inset 1px 1px 0 #ffffff"]);
    expect(g.margin).toBe("1px");
    const legend = decls(STYLES, ".group > legend");
    expect([legend.background, legend["font-weight"]]).toEqual(["#c0c0c0", "700"]);
    expect(STYLES).not.toMatch(/\.surface\b/);
  });

  test("primary push button is 40px, full width, framed, and inverts when pressed", () => {
    const p = decls(STYLES, ".primary");
    expect([p.height, p.width, p.background, p.color, p["font-size"], p["font-weight"]]).toEqual(["40px", "100%", "#c0c0c0", "#000000", "13px", "700"]);
    expect(shadows(p["box-shadow"]!)).toEqual(["0 0 0 1px #000000", ...RAISED]);
    expect(shadows(decls(STYLES, ".primary:active")["box-shadow"]!)).toEqual([
      "0 0 0 1px #000000",
      "inset 1px 1px 0 #000000",
      "inset -1px -1px 0 #ffffff",
      "inset 2px 2px 0 #808080",
      "inset -2px -2px 0 #dfdfdf",
    ]);
    expect(STYLES).not.toMatch(/\.pill\b/);
  });

  test("list rows hover #ccccff and keep square 32px tiles", () => {
    expect(decls(STYLES, ".ghost-row:hover").background).toBe("#ccccff");
    const tile = decls(STYLES, ".icon-tile");
    expect([tile.width, tile.height, tile["border-radius"] ?? "0"]).toEqual(["32px", "32px", "0"]);
    const box = decls(STYLES, ".listbox");
    expect(box.background).toBe("#ffffff");
    expect(shadows(box["box-shadow"]!)).toEqual(SUNKEN);
    expect(box["max-height"]).toBe("280px");
    expect(box["overflow-y"]).toBe("auto");
    // Exorcised rows keep full contrast: the tag and the button already say the state.
    for (const [, sel, body] of STYLES.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (sel!.includes("exorcised")) expect({ sel: sel!.trim(), opacity: /opacity/.test(body!) }).toEqual({ sel: sel!.trim(), opacity: false });
    }
  });

  test("Exorcise and Let it back are 24px push buttons", () => {
    const b = decls(STYLES, ".btn");
    expect([b.height, b.background, b.color]).toEqual(["24px", "#c0c0c0", "#000000"]);
    expect(shadows(b["box-shadow"]!)).toEqual(RAISED);
    expect(decls(STYLES, ".btn:active")["box-shadow"]).toBeDefined();
    expect(STYLES).not.toMatch(/\.secondary\b|\.quiet\b/);
  });

  test("tags are square with a 1px black border and the Win95 colour pairs", () => {
    expect(decls(STYLES, ".tag-pill").border).toBe("1px solid #000000");
    const pair = (sel: string) => [decls(STYLES, sel).background, decls(STYLES, sel).color];
    expect(pair(".tag-pill.caught")).toEqual(["#ccccff", "#330099"]);
    expect(pair(".tag-pill.known")).toEqual(["#cccccc", "#000000"]);
    expect(pair(".tag-pill.dead-404")).toEqual(["#ffcccc", "#660000"]);
    expect(pair(".tag-pill.dead-410")).toEqual(["#ffcc99", "#663300"]);
    expect(pair(".ghost-row.exorcised .tag-pill")).toEqual(["#cccccc", "#333333"]);
    expect([decls(STYLES, ".tag-pill")["font-size"], decls(STYLES, ".tag-pill")["font-weight"]]).toEqual(["12px", "700"]);
  });

  test("no text under 12px in the popup or on permissions.html", () => {
    for (const [name, css] of [["styles.css", STYLES], ["permissions.css", PERMS]] as const) {
      const sizes = values(css, "font-size").map((v) => parseFloat(v));
      expect({ name, small: sizes.filter((px) => px < 12) }).toEqual({ name, small: [] });
    }
  });

  test("the haunted lists scroll in the client, which ends above the status bar", () => {
    const client = decls(STYLES, ".client");
    expect([client.flex, client["min-height"], client["overflow-y"]]).toEqual(["1 1 auto", "0", "auto"]);
    expect(decls(STYLES, ".statusbar").flex).toBe("none");
  });

  test("links are blue and purple, and #6633cc appears only in the focus ring", () => {
    expect([decls(STYLES, "a").color, decls(STYLES, "a")["text-decoration"]]).toEqual(["#0000ff", "underline"]);
    expect(decls(STYLES, "a:visited").color).toBe("#800080");
    expect(rootVars()["--accent"]).toBe("#6633cc");
    // The accent is declared once and used once: the focus ring.
    expect(STYLES.match(/#6633cc/gi)).toHaveLength(1);
    const users = [...STYLES.matchAll(/([^{}]+)\{([^{}]*var\(--accent\)[^{}]*)\}/g)].map((m) => m[1]!.trim());
    expect(users).toEqual([":focus-visible"]);
    expect(decls(STYLES, ":focus-visible")).toMatchObject({ outline: "2px solid #6633cc", "outline-offset": "2px" });
    expect(PERMS).not.toMatch(/#6633cc|--accent/i);
  });
});
