import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { createSettings, LINK_SUB } from "../../src/popup/settings";
import { renderPermissions } from "../../src/popup/permissions";
import { LINK_CHECK_ORIGINS } from "../../src/data/types";
import { asChrome, createChromeMock, type ChromeMock } from "../chrome-mock";

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

function newDoc(url = "chrome-extension://test-extension-id/popup.html") {
  const win = new Window({ url });
  return { win, doc: win.document as unknown as Document };
}

async function popup(m: ChromeMock = createChromeMock()) {
  const { doc } = newDoc();
  const surface = await createSettings(doc, asChrome(m));
  doc.body.append(surface);
  const input = surface.querySelector<HTMLInputElement>("#link-check")!;
  const sub = surface.querySelector("#link-check-sub")!;
  return { m, doc, input, sub };
}
const grantAll = (m: ChromeMock) => LINK_CHECK_ORIGINS.forEach((o) => m.granted.add(o));

describe("popup: switching on", () => {
  test("switching on opens permissions.html in a new tab", async () => {
    const { m, input } = await popup();
    input.click();
    await flush();
    expect(m.calls.createTab).toEqual([{ url: "chrome-extension://test-extension-id/permissions.html" }]);
  });
  test("the popup never calls permissions.request", async () => {
    const { m, input } = await popup(createChromeMock({ grant: true }));
    input.click();
    await flush();
    expect(m.calls.request).toEqual([]);
  });
  test("the switch goes back to off and the sub line asks to finish on the new page", async () => {
    const { input, sub } = await popup();
    input.click();
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Finish on the page that just opened.");
    expect(LINK_SUB.ask).toBe("Finish on the page that just opened.");
    expect("denied" in LINK_SUB).toBe(false);
  });
  test("a failed tabs.create restores the off line", async () => {
    const m = createChromeMock();
    m.createTabFail = true;
    const { input, sub } = await popup(m);
    input.click();
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
});

describe("popup: switching off and following the permission", () => {
  test("switching off removes the permission and shows the off line", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { input, sub } = await popup(m);
    input.click();
    await flush();
    expect(m.calls.remove).toEqual([{ origins: LINK_CHECK_ORIGINS }]);
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("the switch is on when contains answers true", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { input, sub } = await popup(m);
    expect(input.checked).toBe(true);
    expect(sub.textContent).toBe("Checking links on other sites too.");
  });
  test("the switch is off when contains answers false or rejects", async () => {
    const off = await popup();
    expect(off.input.checked).toBe(false);
    const m = createChromeMock();
    m.chrome.permissions.contains = async () => {
      throw new Error("nope");
    };
    const rejected = await popup(m);
    expect(rejected.input.checked).toBe(false);
    expect(rejected.sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("each new popup reads contains again", async () => {
    const m = createChromeMock();
    expect((await popup(m)).input.checked).toBe(false);
    grantAll(m);
    expect((await popup(m)).input.checked).toBe(true);
  });
  test("onAdded for the link-check origins turns the switch on", async () => {
    const { m, input, sub } = await popup();
    grantAll(m);
    for (const l of m.chrome.permissions.onAdded.listeners) l({ origins: LINK_CHECK_ORIGINS });
    await flush();
    expect(input.checked).toBe(true);
    expect(sub.textContent).toBe("Checking links on other sites too.");
  });
  test("onRemoved for the link-check origins turns it off", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { input, sub } = await popup(m);
    m.granted.clear();
    for (const l of m.chrome.permissions.onRemoved.listeners) l({ origins: LINK_CHECK_ORIGINS });
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("an onAdded for other permissions is ignored", async () => {
    const { m, input, sub } = await popup();
    input.click();
    await flush();
    grantAll(m); // granted behind the popup's back; the event names no origin
    for (const l of m.chrome.permissions.onAdded.listeners) l({ permissions: ["tabs"] });
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Finish on the page that just opened.");
  });
});

const SRC = join(import.meta.dir, "..", "..", "src", "popup");
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const EXPLANATION =
  "Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites.";

async function page(m: ChromeMock = createChromeMock()) {
  const { doc } = newDoc("chrome-extension://test-extension-id/permissions.html");
  const app = doc.createElement("main");
  app.id = "app";
  doc.body.append(app);
  await renderPermissions(doc, asChrome(m));
  await flush();
  const allow = doc.querySelector<HTMLButtonElement>("#allow")!;
  const result = doc.querySelector("#result")!;
  return { m, doc, app, allow, result };
}
/** The declarations of the first rule whose selector list holds `selector` (comments dropped). */
const rule = (css: string, selector: string) => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const hit = clean.split(/(?<=})/).find((r) => r.split("{")[0]!.split(",").map((s) => s.trim()).includes(selector));
  return hit?.slice(hit.indexOf("{")) ?? "";
};

describe("permissions.html: the page", () => {
  test("the page has the heading, the one-sentence explanation and one Allow link checks button", async () => {
    const { doc, app } = await page();
    expect(doc.querySelector("h1")?.textContent).toBe("Check links to other sites");
    expect(app.querySelectorAll(".dialog")).toHaveLength(1);
    expect([...app.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Allow link checks"]);
    expect(app.querySelector(".dialog p.explain")?.textContent).toBe(EXPLANATION);
  });
  test("the explanation text is exact", async () => {
    const { app } = await page();
    expect([...app.querySelectorAll("p")].map((p) => p.textContent)).toContain(EXPLANATION);
  });
  test("the button is the popup's default push button", async () => {
    const { allow } = await page();
    expect(allow.className).toBe("primary");
    expect(allow.type).toBe("button");
    expect(rule(read("styles.css"), ".primary")).toContain("background: var(--face)");
  });
  test("CSS: a #c0c0c0 Win95 window on the #008080 desktop, square corners", () => {
    const css = read("styles.css");
    expect(rule(css, ":root")).toContain("--face: #c0c0c0");
    expect(rule(css, ":root")).toContain("--desktop: #008080");
    expect(rule(css, ".window")).toContain("box-shadow: var(--raised)");
    expect(read("permissions.css")).not.toMatch(/border-radius:\s*[1-9]/);
    expect(read("permissions.css")).not.toMatch(/--(face|desktop|title|shadow)\s*:/); // the page keeps the popup tokens
  });
  test("CSS: the body is not fixed at 360px", () => {
    const body = rule(read("permissions.css"), "body.permissions");
    expect(body).toContain("width: auto");
    expect(body).toContain("max-height: none");
    expect(read("permissions.html")).toContain('<body class="permissions">');
    expect(read("permissions.html")).toContain('content="width=device-width, initial-scale=1"');
  });
  test("CSS: the focus ring is 2px solid #6633cc, offset 2px", () => {
    const ring = rule(read("styles.css"), ":focus-visible");
    expect(ring).toContain("outline: 2px solid var(--accent)");
    expect(ring).toContain("outline-offset: 2px");
    expect(rule(read("styles.css"), ":root")).toContain("--accent: #6633cc");
  });
  test("the page has no animation and no remote resource", () => {
    for (const f of ["permissions.html", "permissions.css", "permissions.ts", "permissions-page.ts"]) {
      expect({ [f]: read(f).match(/(?:src|href)\s*=\s*["']?https?:|url\(\s*["']?https?:|@import/)?.[0] ?? null }).toEqual({ [f]: null });
    }
    expect(read("permissions.css")).not.toMatch(/@keyframes/);
  });
});

describe("permissions.html: asking Chrome", () => {
  test("clicking calls permissions.request with LINK_CHECK_ORIGINS in the same tick", async () => {
    const { m, allow } = await page();
    allow.click();
    expect(m.calls.request).toEqual([{ origins: LINK_CHECK_ORIGINS }]); // nothing awaited between the click and here
  });
  test("granted shows Link checks are on. You can close this tab. and disables the button", async () => {
    const { allow, result } = await page(createChromeMock({ grant: true }));
    allow.click();
    await flush();
    expect(result.textContent).toBe("Link checks are on. You can close this tab.");
    expect(allow.disabled).toBe(true);
    expect(result.getAttribute("data-status")).toBe("on");
  });
  test("refused shows Chrome didn't allow it. Link checks stay off. and keeps the button enabled", async () => {
    const { allow, result } = await page();
    allow.click();
    await flush();
    expect(result.textContent).toBe("Chrome didn't allow it. Link checks stay off.");
    expect(allow.disabled).toBe(false);
    expect(result.getAttribute("data-status")).toBe("off");
  });
  test("a rejected request counts as refused", async () => {
    const m = createChromeMock();
    m.chrome.permissions.request = async () => {
      throw new Error("This function must be called during a user gesture");
    };
    const { allow, result } = await page(m);
    allow.click();
    await flush();
    expect(result.textContent).toBe("Chrome didn't allow it. Link checks stay off.");
    expect(allow.disabled).toBe(false);
  });
  test("a second click after a refusal asks again", async () => {
    const { m, allow, result } = await page();
    allow.click();
    await flush();
    m.grant = true;
    allow.click();
    await flush();
    expect(m.calls.request).toHaveLength(2);
    expect(result.textContent).toBe("Link checks are on. You can close this tab.");
  });
  test("already granted shows Link checks are already on. with the button disabled", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { allow, result } = await page(m);
    expect(result.textContent).toBe("Link checks are already on.");
    expect(allow.disabled).toBe(true);
  });
  test("the result line has role status", async () => {
    const { result } = await page();
    expect(result.getAttribute("role")).toBe("status");
    expect(result.getAttribute("aria-live")).toBe("polite");
    expect(result.textContent).toBe("");
  });
  test("contains rejecting counts as not granted", async () => {
    const m = createChromeMock();
    m.chrome.permissions.contains = async () => {
      throw new Error("nope");
    };
    const { allow, result } = await page(m);
    expect(allow.disabled).toBe(false);
    expect(result.textContent).toBe("");
  });
});

describe("permissions.html: keyboard and motion", () => {
  test("the Allow button is reachable by Tab and has a visible focus ring", async () => {
    const { app, allow } = await page();
    expect([...app.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]).toEqual([allow]);
    expect(allow.hasAttribute("tabindex")).toBe(false);
    expect(allow.disabled).toBe(false);
    expect(rule(read("styles.css"), ":focus-visible")).toContain("outline: 2px solid");
    expect(read("permissions.css")).not.toMatch(/outline:\s*(none|0)/);
  });
  test("the page has no animation or transition", () => {
    const css = read("permissions.css");
    const all = rule(css, "body.permissions *");
    expect(all).toContain("transition: none");
    expect(all).toContain("animation: none");
    expect(css).not.toMatch(/@keyframes|transition:(?!\s*none\b)|animation:(?!\s*none\b)/);
  });
});

describe("permissions.html: build", () => {
  test("vite config has popup and permissions inputs", () => {
    const cfg = readFileSync(join(SRC, "..", "..", "vite.config.ts"), "utf8");
    expect(cfg).toContain('popup: resolve(root, "src/popup/popup.html")');
    expect(cfg).toContain('permissions: resolve(root, "src/popup/permissions.html")');
  });
});
