// The docked graveyard: the strip above the HUD that holds the ghosts and vampires on pages with no
// 64px gutter (full-overlay mode), and the sprite builder it shares with the lanes.
import { describe, expect, test } from "bun:test";
import { buildGraveyard, updateDocked } from "../../src/content/costume/graveyard";
import { orderCompanies, tagName, updateGhosts } from "../../src/content/costume/ghosts";
import { costumeCss } from "../../src/content/costume/styles";
import type { CompanyHit } from "../../src/data/types";
import { setup } from "./helpers";

const hit = (company: string, count: number, vampire?: CompanyHit["vampire"]): CompanyHit => ({
  company, count, domains: [`${company.toLowerCase()}.com`], categories: ["Advertising"], fingerprinting: 0, ...(vampire ? { vampire } : {}),
});
const known = { caught: [], knownOnly: true } as unknown as CompanyHit["vampire"];
const caught = { caught: ["canvas"], knownOnly: false } as unknown as CompanyHit["vampire"];

// Two vampires listed first and ghosts out of order, so the sort has work to do.
const MIXED = [hit("Taboola", 1, known), hit("Hotjar", 2, caught), hit("Microsoft", 1), hit("Criteo", 3), hit("comScore", 3), hit("Adobe", 1)];
const LANE_ORDER = ["Criteo", "comScore", "Adobe", "Microsoft", "Hotjar", "Taboola"];

const opts = (over: Partial<Parameters<typeof updateDocked>[2]> = {}) => ({ exorcised: new Set<string>(), onOpen() {}, rise: false, ...over });
const sprites = (strip: HTMLElement) => [...strip.querySelectorAll<HTMLButtonElement>(".stones > button")];

function strip() {
  const { doc } = setup({ width: 375 });
  const g = buildGraveyard(doc);
  doc.body.append(g);
  return { doc, g };
}

describe("orderCompanies", () => {
  test("orderCompanies puts ghosts by count then name, then vampires by name", () => {
    expect(orderCompanies(MIXED).map((c) => c.company)).toEqual(LANE_ORDER);
    expect(orderCompanies([])).toEqual([]);
  });
});

describe("buildGraveyard", () => {
  test("a hidden Graveyard region with a label bar, a stones row and the empty state", () => {
    const { g } = strip();
    expect(g.id).toBe("graveyard");
    expect(g.getAttribute("role")).toBe("region");
    expect(g.getAttribute("aria-label")).toBe("Graveyard of trackers");
    expect(g.hidden).toBe(true);
    expect(g.querySelector(".gy-bar")!.textContent).toBe("Graveyard");
    expect(g.querySelector(".stones")).not.toBeNull();
    expect(g.querySelector(".gy-empty")!.textContent).toBe("No graves yet.");
  });
});

describe("updateDocked", () => {
  test("one 48px button per company in lane order", () => {
    const { doc, g } = strip();
    updateDocked(g, MIXED, opts());
    const s = sprites(g);
    expect(s.map((b) => b.dataset.company)).toEqual(LANE_ORDER);
    expect(s.every((b) => b.localName === "button" && b.getAttribute("type") === "button")).toBe(true);
    expect(s.map((b) => b.className.split(" ")[0])).toEqual(["ghost", "ghost", "ghost", "ghost", "vampire", "vampire"]);
    for (const b of s) expect(b.querySelector(".sprite svg")!.getAttribute("width")).toBe("48");
    // the lanes, given room for all, put them in the same order with the same hem tints
    const lanes = doc.createElement("div");
    const slots = Array.from({ length: 8 }, (_, i) => ({ side: "left" as const, x: 0, y: i * 72, w: 64 }));
    updateGhosts(lanes, MIXED, slots, opts());
    const laneSprites = [...lanes.querySelectorAll<HTMLElement>(".ghost, .vampire")];
    expect(laneSprites.map((b) => b.dataset.company)).toEqual(LANE_ORDER);
    expect(s.map((b) => b.dataset.tint)).toEqual(laneSprites.map((b) => b.dataset.tint));
    // no +N stack: the strip scrolls instead, and sprites are not positioned like lane slots
    expect(g.querySelector(".stack")).toBeNull();
    expect(s.every((b) => b.style.top === "" && b.style.left === "")).toBe(true);
  });

  test("aria-label matches the lane ghost's label", () => {
    const { doc, g } = strip();
    updateDocked(g, MIXED, opts());
    const lanes = doc.createElement("div");
    updateGhosts(lanes, MIXED, Array.from({ length: 8 }, (_, i) => ({ side: "left" as const, x: 0, y: i * 72, w: 64 })), opts());
    const names = (root: Element) => [...root.querySelectorAll(".ghost, .vampire")].map((b) => b.getAttribute("aria-label"));
    expect(names(g)).toEqual(names(lanes));
    expect(names(g)[0]).toBe("Criteo, tracker ghost, seen 3 times");
    expect(names(g)).toContain("Microsoft, tracker ghost, seen 1 time");
    expect(names(g)).toContain("Hotjar, vampire, caught doing canvas readback");
    expect(names(g)).toContain("Taboola, vampire, known to fingerprint");
  });

  test("name tags drop the owner in brackets, so same-prefix companies read differently; the label keeps the full name", () => {
    const { doc, g } = strip();
    const google = [hit("Google Analytics (Google)", 2), hit("Google Ads (Google)", 1, known), hit("Criteo", 1)];
    updateDocked(g, google, opts());
    const tags = (root: Element) => Object.fromEntries([...root.querySelectorAll<HTMLElement>(".ghost, .vampire")].map((b) => [b.dataset.company, b.querySelector(".tag")!.textContent]));
    expect(tags(g)).toEqual({ "Google Analytics (Google)": "Google Analytics", "Google Ads (Google)": "Google Ads", Criteo: "Criteo" });
    expect(sprites(g)[0]!.getAttribute("aria-label")).toBe("Google Analytics (Google), tracker ghost, seen 2 times");
    // the lanes wear the same short tags
    const lanes = doc.createElement("div");
    updateGhosts(lanes, google, Array.from({ length: 4 }, (_, i) => ({ side: "left" as const, x: 0, y: i * 72, w: 64 })), opts());
    expect(tags(lanes)).toEqual(tags(g));
    expect(tagName("(Google)")).toBe("(Google)"); // never an empty tag
  });

  test("a docked tag may take two lines, clamped with an ellipsis; a lane tag stays on one", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    const docked = rule("#graveyard .tag");
    for (const d of ["white-space: normal", "display: -webkit-box", "-webkit-box-orient: vertical", "-webkit-line-clamp: 2", "text-align: center"]) {
      expect({ d, ok: docked.includes(d) }).toEqual({ d, ok: true });
    }
    expect(rule(".tag, .stack")).toContain("white-space: nowrap");
  });

  test("click, Enter and Space call onOpen with the sprite as opener", () => {
    // Enter and Space on a <button type="button"> are the browser's own click (checked in e2e/graveyard.spec.ts).
    const { g } = strip();
    const opened: [string, HTMLElement][] = [];
    updateDocked(g, MIXED, opts({ onOpen: (c, el) => opened.push([c, el]) }));
    const hotjar = sprites(g).find((b) => b.dataset.company === "Hotjar")!;
    hotjar.click();
    expect(opened).toEqual([["Hotjar", hotjar]]);
    expect(hotjar.tabIndex).toBe(0);
  });

  test("exorcised class and stamp on and off", () => {
    const { g } = strip();
    updateDocked(g, MIXED, opts({ exorcised: new Set(["Criteo"]) }));
    const criteo = sprites(g)[0]!;
    expect(criteo.classList.contains("exorcised")).toBe(true);
    expect(criteo.querySelector(".stamp")!.textContent).toBe("EXORCISED");
    expect(criteo.querySelector(".stamp")!.getAttribute("aria-hidden")).toBe("true");
    expect(sprites(g).filter((b) => b.classList.contains("exorcised"))).toHaveLength(1);
    updateDocked(g, MIXED, opts());
    expect(sprites(g)[0]).toBe(criteo);
    expect(criteo.classList.contains("exorcised")).toBe(false);
    expect(criteo.querySelector(".stamp")).toBeNull();
  });

  test("focused sprite keeps focus across updates and reorder", () => {
    const { doc, g } = strip();
    updateDocked(g, MIXED, opts());
    const adobe = sprites(g).find((b) => b.dataset.company === "Adobe")!;
    adobe.focus();
    expect(doc.activeElement).toBe(adobe);
    // Adobe jumps to the front, Taboola goes, a new ghost arrives: the DOM order follows, focus stays.
    const next = [...MIXED.filter((c) => c.company !== "Taboola").map((c) => (c.company === "Adobe" ? hit("Adobe", 9) : c)), hit("Yandex", 2)];
    updateDocked(g, next, opts());
    expect(sprites(g).map((b) => b.dataset.company)).toEqual(["Adobe", "Criteo", "comScore", "Yandex", "Microsoft", "Hotjar"]);
    expect(sprites(g)[0]).toBe(adobe);
    expect(doc.activeElement).toBe(adobe);
    expect(adobe.getAttribute("aria-label")).toBe("Adobe, tracker ghost, seen 9 times");
  });

  test("empty state shows the label bar and 'No graves yet.'", () => {
    const { g } = strip();
    updateDocked(g, [], opts());
    expect((g.querySelector(".gy-empty") as HTMLElement).hidden).toBe(false);
    expect((g.querySelector(".stones") as HTMLElement).hidden).toBe(true);
    expect(g.querySelector(".gy-bar")!.textContent).toBe("Graveyard");
    updateDocked(g, MIXED, opts());
    expect((g.querySelector(".gy-empty") as HTMLElement).hidden).toBe(true);
    expect((g.querySelector(".stones") as HTMLElement).hidden).toBe(false);
    updateDocked(g, [], opts());
    expect(sprites(g)).toHaveLength(0);
    expect((g.querySelector(".gy-empty") as HTMLElement).hidden).toBe(false);
  });

  test("row scrolls horizontally and never wraps", () => {
    const css = costumeCss({ stars: "a", twinkle: "b" });
    const stones = css.match(/#graveyard \.stones\s*\{([^}]*)\}/)?.[1] ?? "";
    for (const d of ["display: flex", "flex-wrap: nowrap", "overflow-x: auto", "overflow-y: hidden", "overscroll-behavior-x: contain", "scroll-behavior: auto"]) {
      expect({ d, ok: stones.includes(d) }).toEqual({ d, ok: true });
    }
    const sprite = css.match(/#graveyard \.ghost, #graveyard \.vampire\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(sprite).toContain("position: relative");
    expect(sprite).toContain("flex: 0 0 auto");
    expect(sprite).toContain("width: 48px");
  });

  test("new sprites rise only when asked (never under reduced motion)", () => {
    const { doc, recs } = setup({ width: 375 });
    const g = buildGraveyard(doc);
    doc.body.append(g);
    // rise is false under reduced motion and during the haunt moment: no animation on arrival
    updateDocked(g, [hit("Criteo", 1)], opts({ rise: false }));
    expect(recs).toHaveLength(0);
    updateDocked(g, [hit("Criteo", 1), hit("Adobe", 1)], opts({ rise: true }));
    expect(recs.map((r) => (r.el as HTMLElement).dataset.company)).toEqual(["Adobe"]);
  });
});
