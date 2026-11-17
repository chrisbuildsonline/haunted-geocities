import { expect, test } from "bun:test";
import { renderCostume } from "../../src/content/costume/render";
import { pageCss, setup, stubMain } from "./helpers";

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
