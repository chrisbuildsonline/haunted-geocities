// The exorcise moment: an exorcised ghost or vampire spirals out to its faded look (400ms, the stamp
// slams on), the HUD count of companies still haunting ticks, and under reduced motion it is instant.
import { describe, expect, test } from "bun:test";
import { buildGraveyard, updateDocked } from "../../src/content/costume/graveyard";
import { updateGhosts } from "../../src/content/costume/ghosts";
import { buildHud, setCounts } from "../../src/content/costume/hud";
import { applyExorcised, renderCostume } from "../../src/content/costume/render";
import { costumeCss } from "../../src/content/costume/styles";
import { MOTION, PALETTE } from "../../src/content/costume/tokens";
import type { CompanyHit } from "../../src/data/types";
import { designTokens, flush, setup, withTrackers, type Rec } from "./helpers";

const hit = (company: string, count: number, vampire?: CompanyHit["vampire"]): CompanyHit => ({
  company, count, domains: [`${company.toLowerCase()}.com`], categories: ["Advertising"], fingerprinting: 0, ...(vampire ? { vampire } : {}),
});
const caught = { caught: ["canvas"], knownOnly: false } as unknown as CompanyHit["vampire"];
const COMPANIES = [hit("Criteo", 3), hit("Hotjar", 2), hit("AdTheorent", 1, caught)];
const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ side: "left" as const, x: 0, y: 8 + i * 72, w: 64 }));
const opts = (exorcised: string[], rise = true) => ({ exorcised: new Set(exorcised), onOpen() {}, rise });

const spin = (recs: Rec[], el: Element) => recs.filter((r) => r.el === el.querySelector(".sprite") && r.keyframes.some((k) => String(k.transform).includes("rotate")));
const slam = (recs: Rec[], el: Element) => recs.filter((r) => r.el === el.querySelector(".stamp"));

describe("the exorcise moment on a sprite", () => {
  test("a ghost in a lane spirals out over 400ms to its 40% look, and the stamp slams on in the second half", () => {
    const { doc, recs } = setup();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, COMPANIES, slots(4), opts([]));
    const criteo = lanes.querySelector<HTMLElement>('[data-company="Criteo"]')!;
    recs.length = 0;
    updateGhosts(lanes, COMPANIES, slots(4), opts(["Criteo"]));
    const [s] = spin(recs, criteo);
    expect(s).toBeDefined();
    expect(s!.opts.duration).toBe(MOTION.exorcise);
    expect(MOTION.exorcise).toBe(400);
    expect(s!.keyframes[0]).toMatchObject({ transform: "rotate(0deg) scale(1)", opacity: 1 });
    expect(s!.keyframes.at(-1)).toMatchObject({ transform: "rotate(360deg) scale(1)", opacity: 0.4 });
    // the fade only goes down: no flash back to full opacity
    const ops = s!.keyframes.map((k) => Number(k.opacity));
    expect(ops).toEqual([...ops].sort((a, b) => b - a));
    // it shrinks on the way round and comes back to size
    expect(s!.keyframes.some((k) => /scale\(0?\.5\)/.test(String(k.transform)))).toBe(true);
    const [st] = slam(recs, criteo);
    expect(st).toMatchObject({ opts: { delay: MOTION.exorcise / 2, duration: MOTION.exorcise / 2, fill: "backwards" } });
    expect(st!.keyframes[0]).toMatchObject({ opacity: 0 });
    expect(String(st!.keyframes.at(-1)!.transform)).toBe("translateX(-50%) rotate(-12deg) scale(1)");
    // the other ghost and the vampire do not move
    expect(spin(recs, lanes.querySelector('[data-company="Hotjar"]')!)).toEqual([]);
    expect(spin(recs, lanes.querySelector('[data-company="AdTheorent"]')!)).toEqual([]);
  });

  test("a vampire spirals out the same way", () => {
    const { doc, recs } = setup();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, COMPANIES, slots(4), opts([]));
    recs.length = 0;
    updateGhosts(lanes, COMPANIES, slots(4), opts(["AdTheorent"]));
    expect(spin(recs, lanes.querySelector('[data-company="AdTheorent"]')!)).toHaveLength(1);
  });

  test("it plays once: an update that keeps the company exorcised does not spin it again", () => {
    const { doc, recs } = setup();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, COMPANIES, slots(4), opts([]));
    updateGhosts(lanes, COMPANIES, slots(4), opts(["Criteo"]));
    recs.length = 0;
    updateGhosts(lanes, [hit("Criteo", 4), ...COMPANIES.slice(1)], slots(4), opts(["Criteo"]));
    expect(spin(recs, lanes.querySelector('[data-company="Criteo"]')!)).toEqual([]);
  });

  test("a sprite drawn already exorcised (new, or moved to the other container) does not spin", () => {
    const { doc, recs } = setup();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, COMPANIES, slots(4), opts(["Criteo"]));
    expect(spin(recs, lanes.querySelector('[data-company="Criteo"]')!)).toEqual([]);
  });

  test("letting it back plays nothing: the sprite is simply whole again", () => {
    const { doc, recs } = setup();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, COMPANIES, slots(4), opts([]));
    updateGhosts(lanes, COMPANIES, slots(4), opts(["Criteo"]));
    recs.length = 0;
    updateGhosts(lanes, COMPANIES, slots(4), opts([]));
    expect(spin(recs, lanes.querySelector('[data-company="Criteo"]')!)).toEqual([]);
  });

  test("before the haunt moment has settled, or under reduced motion (rise false), nothing plays: the stamp and the 40% look are there at once", () => {
    const { doc, recs } = setup();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, COMPANIES, slots(4), opts([], false));
    recs.length = 0;
    updateGhosts(lanes, COMPANIES, slots(4), opts(["Criteo"], false));
    const criteo = lanes.querySelector<HTMLElement>('[data-company="Criteo"]')!;
    expect(recs).toEqual([]);
    expect(criteo.classList.contains("exorcised")).toBe(true);
    expect(criteo.querySelector(".stamp")!.textContent).toBe("EXORCISED");
  });

  test("a sprite docked in the graveyard strip spirals out too", () => {
    const { doc, recs } = setup({ width: 375 });
    const g = buildGraveyard(doc);
    doc.body.append(g);
    updateDocked(g, COMPANIES, opts([]));
    recs.length = 0;
    updateDocked(g, COMPANIES, opts(["Hotjar"]));
    expect(spin(recs, g.querySelector('[data-company="Hotjar"]')!)).toHaveLength(1);
  });

  test("reduced motion: the sprite's fade is instant (no opacity transition)", () => {
    const css = costumeCss({ stars: "", twinkle: "" });
    expect(css).toMatch(/\.reduced-motion \.sprite \{ transition: none !important; \}/);
    // after the general reduced-motion rule, so it wins
    expect(css.indexOf(".reduced-motion .sprite {")).toBeGreaterThan(css.indexOf(".reduced-motion *, "));
  });

  test("the exorcise token is in the DESIGN.md tokens", () => {
    expect(designTokens().motion.exorcise).toBe(MOTION.exorcise);
  });
});

describe("the HUD count ticks", () => {
  const n = (hud: HTMLElement, kind: string) => hud.querySelector<HTMLElement>(`.count.${kind} .n`)!;
  const ticks = (recs: Rec[], el: Element) => recs.filter((r) => r.el === el);

  test("setCounts with tick: each number that changed drops in (300ms, from ectoplasm to bone); the others stay still", () => {
    const { doc, recs } = setup();
    const hud = buildHud(doc);
    setCounts(hud, { ghosts: 2, vampires: 1, tombstones: 0, curses: 0 });
    expect(recs).toEqual([]);
    setCounts(hud, { ghosts: 1, vampires: 1, tombstones: 0, curses: 0 }, { tick: true });
    expect(n(hud, "ghosts").textContent).toBe("1");
    const [t] = ticks(recs, n(hud, "ghosts"));
    expect(t).toMatchObject({ opts: { duration: MOTION.slow, easing: MOTION.easeOut } });
    expect(t!.keyframes[0]).toMatchObject({ transform: "translateY(-8px)", opacity: 0, color: PALETTE.ectoplasm });
    expect(t!.keyframes.at(-1)).toMatchObject({ transform: "translateY(0px)", opacity: 1, color: PALETTE.bone });
    expect(ticks(recs, n(hud, "vampires"))).toEqual([]);
    recs.length = 0;
    setCounts(hud, { ghosts: 2, vampires: 1, tombstones: 0, curses: 0 });
    expect(recs).toEqual([]);
  });

  test("with found set, the counts stay up even when every one is zero (all exorcised is not 'clean')", () => {
    const { doc } = setup();
    const hud = buildHud(doc);
    setCounts(hud, { ghosts: 0, vampires: 0, tombstones: 0, curses: 0 }, { found: true });
    expect((hud.querySelector(".counts") as HTMLElement).hidden).toBe(false);
    expect((hud.querySelector(".empty") as HTMLElement).hidden).toBe(true);
  });

  test("in the costume the ghost and vampire counts are the companies still haunting, and they tick on Exorcise and Let it back", async () => {
    const { win, doc, recs } = setup();
    withTrackers(win); // ghosts Criteo, comScore; known vampires Hotjar, Taboola
    const hud = renderCostume(doc).getElementById("hud")!;
    await flush();
    await flush();
    expect([n(hud, "ghosts").textContent, n(hud, "vampires").textContent]).toEqual(["2", "2"]);
    recs.length = 0;
    applyExorcised(["Criteo"], doc);
    expect([n(hud, "ghosts").textContent, n(hud, "vampires").textContent]).toEqual(["1", "2"]);
    expect(ticks(recs, n(hud, "ghosts"))).toHaveLength(1);
    expect(ticks(recs, n(hud, "vampires"))).toEqual([]);
    applyExorcised(["Criteo", "Hotjar"], doc);
    expect(n(hud, "vampires").textContent).toBe("1");
    applyExorcised(["Criteo", "comScore", "Hotjar", "Taboola"], doc);
    expect([n(hud, "ghosts").textContent, n(hud, "vampires").textContent]).toEqual(["0", "0"]);
    expect((hud.querySelector(".counts") as HTMLElement).hidden).toBe(false);
    recs.length = 0;
    applyExorcised([], doc);
    expect([n(hud, "ghosts").textContent, n(hud, "vampires").textContent]).toEqual(["2", "2"]);
    expect(ticks(recs, n(hud, "ghosts"))).toHaveLength(1);
  });

  test("under reduced motion the count changes in place, with no tick", async () => {
    const { win, doc, recs } = setup({ reduced: true });
    withTrackers(win);
    const hud = renderCostume(doc).getElementById("hud")!;
    await flush();
    recs.length = 0;
    applyExorcised(["Criteo"], doc);
    expect(n(hud, "ghosts").textContent).toBe("1");
    expect(recs).toEqual([]);
  });
});
