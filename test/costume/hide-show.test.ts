import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { pageCss, setup, stubMain } from "./helpers";
import { withTrackers } from "./helpers";

const rule = (css: string, sel: string) => css.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("Hide fades frame and tint, restyle stays", () => {
  const { win, doc } = setup();
  stubMain(win, () => ({ left: 300, right: 980, top: 60, bottom: 700 }));
  const root = renderCostume(doc);
  expect(rule(pageCss(doc), "html::before")).toContain("opacity: 1");
  (root.querySelector("#hud button.hide") as HTMLButtonElement).click();
  let css = pageCss(doc);
  expect(rule(css, "html::before")).toContain("opacity: 0");
  expect(rule(css, "html::after")).toContain("opacity: 0");
  expect(css).toContain('font-family: "Times New Roman"');
  expect(css).toContain("color: #0000ff !important");
  expect(doc.adoptedStyleSheets).toHaveLength(1);
  (root.getElementById("show-tab") as HTMLButtonElement).click();
  css = pageCss(doc);
  expect(rule(css, "html::before")).toContain("opacity: 1");
  expect(rule(css, "html::after")).toContain("opacity: 1");
});

test("Hide fades the graveyard with the HUD and Show restores it", () => {
  const { win, doc } = setup({ width: 375 });
  stubMain(win, () => ({ left: 0, right: 375, top: 60, bottom: 700 }));
  withTrackers(win);
  const root = renderCostume(doc);
  const croot = root.getElementById("crypt-root")!;
  const strip = root.getElementById("graveyard")!;
  expect(strip.hidden).toBe(false);
  expect(strip.parentElement).toBe(croot); // .costume-hidden > :not(#show-tab) reaches it
  (root.querySelector("#hud button.hide") as HTMLButtonElement).click();
  expect(croot.classList.contains("costume-hidden")).toBe(true);
  expect(strip.hidden).toBe(false); // faded by the class, not removed: haunt state is kept
  (root.getElementById("show-tab") as HTMLButtonElement).click();
  expect(croot.classList.contains("costume-hidden")).toBe(false);
  expect(strip.querySelectorAll(".stones > button").length).toBe(4);
});
