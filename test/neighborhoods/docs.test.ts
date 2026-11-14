import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const design = readFileSync(join(import.meta.dir, "..", "..", "design", "DESIGN.md"), "utf8");

/** The body under a heading line, up to the next heading of the same or a higher level. */
const section = (heading: string) => {
  const lines = design.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) return "";
  const level = heading.match(/^#+/)![0].length;
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}} `).test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
};

describe("design/DESIGN.md for neighborhoods", () => {
  test("DESIGN.md names the neighborhood bar address and tagline", () => {
    const bar = section("### Top bands: neighborhood bar + marquee");
    expect(bar).toContain("You are in: SiliconValley/Heights/2049");
    expect(bar).toContain("Neighborhood/Suburb/NNNN");
    expect(bar).toContain("resolveNeighborhood");
    expect(bar).toMatch(/tagline/);
    expect(bar).toMatch(/ellipsis/);
    expect(bar).toMatch(/Hidden under 480px/);
  });

  test("DESIGN.md names the popup address line", () => {
    const haunted = section("### Screen: haunted");
    expect(haunted).toMatch(/\*\*Address line:\*\*.*neighborhood address/);
    expect(haunted).toContain("`.address`");
    expect(haunted).toMatch(/TimesSquare\/Midway\/7315\s+<- address line/);
  });

  test("DESIGN.md names permissions.html", () => {
    const page = section("### Page: `permissions.html` (link-check permission)");
    expect(page).toContain("Allow link checks");
    expect(page).toContain("chrome.permissions.request");
    expect(section('### Row: "Check links to other sites" (opt-in)')).toContain("opens `permissions.html` in a new tab");
  });

  test("DESIGN.md contains the new footnote and no longer contains the old one", () => {
    const ghosts = section("### Ghosts (one per tracker company)");
    expect(ghosts).toContain("Footnote: `Blocked on this tab until you un-haunt or leave the page.`");
    expect(design).not.toContain("Blocked until you close the browser");
  });

  test("DESIGN.md names the badge colour #6633cc", () => {
    const badge = section("### Toolbar badge");
    expect(badge).toMatch(/Colours: `#6633cc` ground, `#ffffff` text/);
    expect(badge).toContain("`99+`");
  });
});
