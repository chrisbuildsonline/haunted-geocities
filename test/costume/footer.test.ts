// The crypt footer (design/DESIGN.md "Crypt footer", .kiro/specs/crypt-footer): the graveyard, HUD,
// badges and sign-off in normal flow at the very end of the page; the ghost icon is the one fixed
// thing at the bottom and jumps to the graveyard.
import { describe, expect, test } from "bun:test";
import { HOST_CSS, HOST_TAG } from "../../src/content/overlay";
import { renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { setup } from "./helpers";

const css = costumeCss({ stars: "s", twinkle: "t" });
/** The declarations of the first rule whose selector is exactly `sel`. */
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[#.()]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] ?? "";

function haunted(width = 1280) {
  const t = setup({ width });
  const root = renderCostume(t.doc);
  return { ...t, root, host: t.doc.querySelector(HOST_TAG) as HTMLElement };
}

describe("crypt footer", () => {
  test("the host is in flow after <body>, no longer a fixed overlay", () => {
    const { doc, host } = haunted();
    expect(HOST_CSS).toMatch(/position: static !important/);
    expect(HOST_CSS).not.toMatch(/position: fixed/);
    expect(HOST_CSS).not.toMatch(/inset/);
    expect(host.parentElement).toBe(doc.documentElement);
    expect(host.previousElementSibling).toBe(doc.body);
  });
  test("<footer id=crypt-footer> sits beside #crypt-root, with the graveyard, the HUD, the badges and the sign-off in that order", () => {
    const { root } = haunted();
    const footer = root.getElementById("crypt-footer")!;
    expect(footer.localName).toBe("footer");
    expect(footer.parentNode).toBe(root);
    expect(root.getElementById("crypt-root")!.contains(root.getElementById("hud"))).toBe(false);
    expect([...footer.children].map((c) => c.id || c.className)).toEqual(["graveyard", "hud", "badges", "signoff"]);
    expect([...footer.querySelectorAll(".badges > .badge")].map((b) => b.textContent)).toEqual([
      "Best viewed in Netscape 4.0",
      "Made with Notepad",
      "Under construction",
      "Sign my guestbook",
    ]);
    expect(footer.querySelector(".signoff")!.textContent).toContain("(c) 1998 The Webmaster");
  });
  test("the graveyard is always drawn, with its empty line on a clean page", () => {
    const { root } = haunted();
    const g = root.getElementById("graveyard")!;
    expect(g.hidden).toBe(false);
    expect(g.querySelector(".gy-title")!.textContent).toBe("Graveyard of trackers");
    expect((g.querySelector(".gy-empty") as HTMLElement).textContent).toBe("No graves yet. This page plays it straight.");
  });
  test("nothing of the footer is fixed or floating; its stones wrap instead of scrolling sideways", () => {
    for (const sel of ["#hud", "#graveyard", "#crypt-footer"]) {
      expect({ sel, fixed: /position:\s*(fixed|absolute)/.test(rule(sel)) || /bottom:/.test(rule(sel)) }).toEqual({ sel, fixed: false });
    }
    expect(rule("#crypt-footer")).toMatch(/pointer-events: auto/);
    // the host is static now, so the fixed layer carries the top z-index itself (above page layers and the tint)
    expect(rule("#crypt-root")).toMatch(/position: fixed; inset: 0; z-index: 2147483647/);
    expect(css).not.toMatch(/--hg-hud-h/);
    expect(css).toMatch(/#graveyard \.stones \{[^}]*flex-wrap: wrap/);
    expect(css).not.toMatch(/#graveyard \.stones \{[^}]*overflow-x: auto/);
  });
  test("the page sheet pads the top for the bands only: no bottom padding and no bottom scroll padding", () => {
    const { doc } = haunted();
    const text = [...doc.adoptedStyleSheets].map((s) => [...s.cssRules].map((r) => r.cssText).join("\n")).join("\n");
    expect(text).toMatch(/padding-top/);
    expect(text).not.toMatch(/padding-bottom/);
    expect(text).not.toMatch(/scroll-padding-bottom/);
  });
});

describe("ghost icon (bottom-right)", () => {
  test("always shown while haunted, with the tracker count and a name that says where it goes", () => {
    const { root } = haunted();
    const tab = root.getElementById("show-tab") as HTMLButtonElement;
    expect(tab.hidden).toBe(false);
    expect(tab.querySelector(".count")!.textContent).toBe("0");
    expect(tab.getAttribute("aria-label")).toBe("Jump to the graveyard: 0 trackers");
  });
  test("a click scrolls the graveyard into view and focuses it", () => {
    const { root } = haunted();
    const g = root.getElementById("graveyard") as HTMLElement;
    let scrolled: unknown = null;
    g.scrollIntoView = (o?: unknown) => void (scrolled = o ?? true);
    (root.getElementById("show-tab") as HTMLButtonElement).click();
    expect(scrolled).toEqual({ behavior: "smooth", block: "start" });
    expect(g.getAttribute("tabindex")).toBe("-1");
    expect(root.activeElement).toBe(g);
  });
  test("under reduced motion the jump is instant", () => {
    const t = setup({ reduced: true });
    const root = renderCostume(t.doc);
    const g = root.getElementById("graveyard") as HTMLElement;
    let scrolled: unknown = null;
    g.scrollIntoView = (o?: unknown) => void (scrolled = o);
    (root.getElementById("show-tab") as HTMLButtonElement).click();
    expect(scrolled).toEqual({ behavior: "auto", block: "start" });
  });
  test("with the costume hidden, the icon brings it back and the footer with it", () => {
    const { root } = haunted();
    (root.querySelector("#hud button.hide") as HTMLButtonElement).click();
    const croot = root.getElementById("crypt-root")!;
    const footer = root.getElementById("crypt-footer")!;
    expect(croot.classList.contains("costume-hidden")).toBe(true);
    expect(footer.classList.contains("costume-hidden")).toBe(true);
    (root.getElementById("show-tab") as HTMLButtonElement).click();
    expect(croot.classList.contains("costume-hidden")).toBe(false);
    expect(footer.classList.contains("costume-hidden")).toBe(false);
  });
});
