// permissions.html dressed as a Win95 dialog on a teal desktop.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { EXPLANATION, renderPermissions } from "../src/popup/permissions";
import { LINK_CHECK_ORIGINS } from "../src/data/types";
import { asChrome, createChromeMock, type ChromeMock } from "./chrome-mock";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};
const SRC = join(import.meta.dir, "..", "src", "popup");
const read = (f: string) => readFileSync(join(SRC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

async function page(m: ChromeMock = createChromeMock()) {
  const win = new Window({ url: "chrome-extension://test-extension-id/permissions.html" });
  windows.push(win);
  const doc = win.document as unknown as Document;
  const app = doc.createElement("main");
  app.id = "app";
  doc.body.append(app);
  await renderPermissions(doc, asChrome(m));
  await flush();
  return { m, doc, app, allow: doc.querySelector<HTMLButtonElement>("#allow")!, result: doc.querySelector<HTMLElement>("#result")! };
}

describe("permissions.html costume", () => {
  test("permissions page is a teal desktop with one Win95 dialog", async () => {
    const { app } = await page();
    const dialogs = [...app.children];
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0]!;
    expect(dialog.matches(".window.dialog")).toBe(true);
    const bar = dialog.firstElementChild!;
    expect(bar.matches("header.titlebar")).toBe(true);
    expect(text(bar.querySelector("h1"))).toBe("Check links to other sites");
    expect(bar.querySelector("svg")!.getAttribute("width")).toBe("16");
    const tomb = dialog.querySelector(".perm-icon svg")!;
    expect([tomb.getAttribute("width"), tomb.getAttribute("height")]).toEqual(["48", "48"]);
    expect(dialog.querySelectorAll("button")).toHaveLength(1);

    const css = read("permissions.css");
    expect(read("styles.css")).toMatch(/--desktop: #008080;/);
    expect(css).toMatch(/body\.permissions \{[^}]*background: var\(--desktop\);/);
    expect(css).toMatch(/\.dialog \{[^}]*width: 100%;[^}]*max-width: 440px;/);
    expect(css).not.toMatch(/360px/);
    expect(css).toMatch(/body\.permissions \*, body\.permissions \*::before, body\.permissions \*::after \{ transition: none; animation: none; \}/);
    expect(css).not.toMatch(/:hover|@keyframes/);
  });

  test("permissions page keeps the exact explanation sentence", async () => {
    expect(EXPLANATION).toBe(
      "Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites.",
    );
    const { app } = await page();
    expect([...app.querySelectorAll(".dialog p")].map((p) => p.textContent)).toContain(EXPLANATION);
  });

  test("Allow link checks greys out once granted and stays enabled after a refusal", async () => {
    const granted = await page(createChromeMock({ grant: true }));
    expect(granted.allow.className).toBe("primary");
    granted.allow.click();
    await flush();
    expect(granted.allow.disabled).toBe(true);
    expect(granted.result.classList.contains("status-field")).toBe(true);
    expect(granted.result.dataset.status).toBe("on");

    const refused = await page();
    refused.allow.click();
    await flush();
    expect(refused.allow.disabled).toBe(false);
    expect(refused.result.dataset.status).toBe("off");

    const already = createChromeMock();
    LINK_CHECK_ORIGINS.forEach((o) => already.granted.add(o));
    expect((await page(already)).allow.disabled).toBe(true);

    const styles = read("styles.css");
    expect(styles).toMatch(/\.primary:disabled \{[^}]*color: var\(--shadow\);[^}]*text-shadow: 1px 1px 0 var\(--hilite\);/);
    expect(styles).toMatch(/--shadow: #808080;/);
    const css = read("permissions.css");
    expect(css).toMatch(/\.result\[data-status="on"\] \{ background: #ffffff; color: #000000; \}/);
    expect(css).toMatch(/\.result\[data-status="off"\] \{ background: #ffcccc; color: #660000; \}/);
    expect(css).toMatch(/\.result::before \{[^}]*width: 6px;[^}]*height: 6px;/);
  });
});
