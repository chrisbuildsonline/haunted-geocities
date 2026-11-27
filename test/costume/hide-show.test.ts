import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { pageCss, setup, stubMain } from "./helpers";
import { withTrackers } from "./helpers";

const rule = (css: string, sel: string) => css.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("Hide fades the frame and takes the tint and tile backgrounds away, restyle stays", () => {
  const { win, doc } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  expect(pageCss(doc)).toContain("body { background: #ffffcc !important; }");
  (root.querySelector("#hud button.hide") as HTMLButtonElement).click();
  let css = pageCss(doc);
  expect(css).not.toContain("body { background:");
  expect(css).not.toContain("html { background:");
  expect(rule(css, "html::after")).toContain("opacity: 0");
  expect(css).toContain('font-family: "Times New Roman"');
  expect(css).toContain("color: #0000ff !important");
  expect(doc.adoptedStyleSheets).toHaveLength(1);
  (root.getElementById("show-tab") as HTMLButtonElement).click();
  css = pageCss(doc);
  expect(css).toContain("body { background: #ffffcc !important; }");
  expect(rule(css, "html::after")).toContain("opacity: 1");
});

test("Hide fades the footer (graveyard and HUD) and the ghost icon restores it", () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  const croot = root.getElementById("crypt-root")!;
  const strip = root.getElementById("graveyard")!;
  expect(strip.hidden).toBe(false);
  const footer = root.getElementById("crypt-footer")!;
  expect(strip.parentElement === footer).toBe(true); // #crypt-footer.costume-hidden reaches it
  (root.querySelector("#hud button.hide") as HTMLButtonElement).click();
  expect(croot.classList.contains("costume-hidden")).toBe(true);
  expect(footer.classList.contains("costume-hidden")).toBe(true);
  expect(strip.hidden).toBe(false); // faded by the class, not removed: haunt state is kept
  (root.getElementById("show-tab") as HTMLButtonElement).click();
  expect(croot.classList.contains("costume-hidden")).toBe(false);
  expect(footer.classList.contains("costume-hidden")).toBe(false);
  expect(strip.querySelectorAll(".stones > button").length).toBe(4);
});
