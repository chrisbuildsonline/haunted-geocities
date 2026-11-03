import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { GHOST, ghostLegend } from "../../src/content/costume/art";
import { closeCard, openCard, setCardExorcised } from "../../src/content/costume/card";
import { hemTint, planSlots, updateGhosts } from "../../src/content/costume/ghosts";
import { renderCostume, leaveCostume } from "../../src/content/costume/render";
import { HEM_TINTS, PALETTE } from "../../src/content/costume/tokens";
import type { CompanyHit } from "../../src/data/types";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
  delete (globalThis as Record<string, unknown>).chrome;
});

function page() {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  win.document.write(`<!doctype html><html><body><main><p>Hello</p></main></body></html>`);
  (win as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  (win.Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), finish() {}, cancel() {} });
  return { win, doc: win.document as unknown as Document };
}

const hit = (company: string, count: number, domains = [`${company.toLowerCase()}.com`]): CompanyHit => ({
  company, count, domains, categories: ["Advertising"], fingerprinting: 0,
});

describe("ghost sprite", () => {
  test("is 16×16 art in at most 4 palette colours, outline and eyes #000033, hem tinted", () => {
    expect(GHOST).toHaveLength(16);
    expect(GHOST.every((r) => r.length === 16)).toBe(true);
    const legend = ghostLegend("#ff99cc");
    const used = new Set(GHOST.join("").replace(/\./g, ""));
    expect(used.size).toBeLessThanOrEqual(4);
    expect([...used].map((c) => legend[c]).sort()).toEqual([PALETTE.crypt, PALETTE.ghostShade, PALETTE.ghostWhite, "#ff99cc"].sort());
    // the hem is two art rows of the tint across the whole body
    expect(GHOST.filter((r) => /^oH{14}o$/.test(r))).toHaveLength(2);
  });

  test("hem tint is hash(company) mod 6 over the hem tints: stable and spread", () => {
    expect(hemTint("Criteo")).toBe(hemTint("Criteo"));
    expect(HEM_TINTS).toContain(hemTint("Hotjar") as (typeof HEM_TINTS)[number]);
    const names = ["Criteo", "Hotjar", "Taboola", "Google", "Meta", "Adobe", "Oracle", "Amazon"];
    expect(new Set(names.map(hemTint)).size).toBeGreaterThan(2);
  });
});

describe("planSlots", () => {
  const text = [{ left: 400, right: 880, top: 0, bottom: 2000 }];
  test("no lane when neither gutter is 64px (narrow page)", () => {
    expect(planSlots(null, 375, 48, 700, [])).toEqual([]);
    expect(planSlots({ left: 40, right: 63 }, 375, 48, 700, [])).toEqual([]);
  });
  test("72px pitch between the bands and the HUD, alternating left and right, centred in the gutter", () => {
    const s = planSlots({ left: 400, right: 400 }, 1280, 48, 48 + 8 + 72 * 3, text);
    expect(s.map((x) => x.side)).toEqual(["left", "right", "left", "right", "left", "right"]);
    expect(s.map((x) => x.y)).toEqual([56, 56, 128, 128, 200, 200]);
    for (const x of s) {
      expect(x.w).toBeGreaterThanOrEqual(64);
      const [lo, hi] = x.side === "left" ? [0, 400] : [880, 1280];
      expect(x.x).toBeGreaterThanOrEqual(lo);
      expect(x.x + x.w).toBeLessThanOrEqual(hi);
    }
  });
  test("one side only when only that gutter reaches 64px", () => {
    expect(new Set(planSlots({ left: 10, right: 120 }, 1000, 0, 400, []).map((s) => s.side))).toEqual(new Set(["right"]));
  });
  test("a slot that crosses a text rect is skipped", () => {
    const s = planSlots({ left: 200, right: 200 }, 1000, 0, 72 * 2 + 8, [{ left: 20, right: 60, top: 10, bottom: 30 }]);
    expect(s.map((x) => `${x.side}@${x.y}`)).toEqual(["right@8", "left@80", "right@80"]);
  });
});

describe("updateGhosts", () => {
  const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ side: "left" as const, x: 0, y: 8 + i * 72, w: 64 }));
  test("one focusable ghost button per company, most requests first, with label and accessible name", () => {
    const { doc } = page();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, [hit("Hotjar", 2), hit("Taboola", 1), hit("Criteo", 3)], slots(5), { exorcised: new Set(), onOpen() {}, rise: false });
    const ghosts = [...lanes.querySelectorAll<HTMLButtonElement>("button.ghost")];
    expect(ghosts.map((g) => g.dataset.company)).toEqual(["Criteo", "Hotjar", "Taboola"]);
    expect(ghosts[0]!.getAttribute("aria-label")).toBe("Criteo, tracker ghost, seen 3 times");
    expect(ghosts[0]!.querySelector(".tag")!.textContent).toBe("Criteo");
    expect(ghosts[0]!.style.top).toBe("8px");
    expect(ghosts[1]!.style.top).toBe("80px");
    expect(ghosts[0]!.querySelector("svg")!.innerHTML).toContain(hemTint("Criteo"));
  });
  test("no slots, no sprites", () => {
    const { doc } = page();
    const lanes = doc.createElement("div");
    updateGhosts(lanes, [hit("Criteo", 3)], [], { exorcised: new Set(), onOpen() {}, rise: false });
    expect(lanes.children).toHaveLength(0);
  });
  test("overflow: the last slot becomes a +N stack token", () => {
    const { doc } = page();
    const lanes = doc.createElement("div");
    const many = ["A", "B", "C", "D", "E"].map((c, i) => hit(c, 10 - i));
    updateGhosts(lanes, many, slots(3), { exorcised: new Set(), onOpen() {}, rise: false });
    expect([...lanes.querySelectorAll<HTMLElement>(".ghost")].map((g) => g.dataset.company)).toEqual(["A", "B"]);
    const stack = lanes.querySelector(".stack")!;
    expect(stack.textContent).toBe("+3");
    expect(stack.getAttribute("aria-label")).toBe("3 more ghosts");
  });
  test("keeps the same element for a company across updates and marks exorcised ghosts", () => {
    const { doc } = page();
    const lanes = doc.createElement("div");
    const opened: string[] = [];
    const opts = { exorcised: new Set<string>(), onOpen: (c: string) => opened.push(c), rise: false };
    updateGhosts(lanes, [hit("Criteo", 1)], slots(3), opts);
    const first = lanes.querySelector(".ghost") as HTMLElement;
    updateGhosts(lanes, [hit("Criteo", 2), hit("Hotjar", 1)], slots(3), { ...opts, exorcised: new Set(["Criteo"]) });
    expect(lanes.querySelector(".ghost")).toBe(first);
    expect(first.classList.contains("exorcised")).toBe(true);
    expect(first.querySelector(".stamp")!.textContent).toBe("EXORCISED");
    first.click();
    expect(opened).toEqual(["Criteo"]);
  });
});

describe("ghost card", () => {
  function cardSetup() {
    const { doc } = page();
    const cards = doc.createElement("div");
    const opener = doc.createElement("button");
    doc.body.append(cards, opener);
    const sent: unknown[] = [];
    return { doc, cards, opener, sent, send: (m: unknown) => sent.push(m) };
  }
  test("title, category, domains, Seen N times, default Exorcise button and the footnote", () => {
    const { cards, opener, send } = cardSetup();
    openCard(cards, hit("Criteo", 3, ["criteo.com", "static.criteo.net"]), opener, { exorcised: false, send, bounds: { top: 48, bottom: 700 } });
    const card = cards.querySelector(".card") as HTMLElement;
    expect(card.getAttribute("role")).toBe("dialog");
    expect(card.querySelector(".bar h2")!.textContent).toBe("Criteo");
    expect(card.querySelector(".bar button.close")!.getAttribute("aria-label")).toBe("Close");
    expect([...card.querySelectorAll(".domains li")].map((l) => l.textContent)).toEqual(["criteo.com", "static.criteo.net"]);
    expect(card.textContent).toContain("Advertising");
    expect(card.textContent).toContain("Haunts these domains:");
    expect(card.textContent).toContain("Seen 3 times on this page");
    expect(card.querySelector("button.act")!.textContent).toBe("Exorcise");
    expect(card.querySelector("button.act")!.classList.contains("default")).toBe(true);
    expect(card.querySelector(".foot")!.textContent).toBe("Blocked until you close the browser.");
  });
  test("Exorcise sends EXORCISE without a tabId; when exorcised it reads Let it back and sends LET_BACK", () => {
    const { cards, opener, send, sent } = cardSetup();
    openCard(cards, hit("Criteo", 3), opener, { exorcised: false, send, bounds: { top: 48, bottom: 700 } });
    (cards.querySelector("button.act") as HTMLElement).click();
    expect(sent).toEqual([{ type: "EXORCISE", company: "Criteo", domains: ["criteo.com"] }]);
    setCardExorcised(cards, new Set(["Criteo"]));
    expect(cards.querySelector("button.act")!.textContent).toBe("Let it back");
    (cards.querySelector("button.act") as HTMLElement).click();
    expect(sent.at(-1)).toEqual({ type: "LET_BACK", company: "Criteo" });
  });
  test("one card at a time; focus moves in; Esc closes and returns focus to the opener", () => {
    const { doc, cards, opener, send } = cardSetup();
    openCard(cards, hit("Criteo", 3), opener, { exorcised: false, send, bounds: { top: 48, bottom: 700 } });
    openCard(cards, hit("Hotjar", 2), opener, { exorcised: false, send, bounds: { top: 48, bottom: 700 } });
    expect(cards.querySelectorAll(".card")).toHaveLength(1);
    const card = cards.querySelector(".card")!;
    expect(card.contains(doc.activeElement)).toBe(true);
    card.dispatchEvent(new (doc.defaultView as unknown as typeof globalThis).KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cards.querySelector(".card")).toBeNull();
    expect(doc.activeElement).toBe(opener);
  });
  test("the [x] closes it too; closeCard is a no-op when none is open", () => {
    const { cards, opener, send } = cardSetup();
    closeCard(cards);
    openCard(cards, hit("Criteo", 3), opener, { exorcised: true, send, bounds: { top: 48, bottom: 700 } });
    expect(cards.querySelector("button.act")!.textContent).toBe("Let it back");
    (cards.querySelector("button.close") as HTMLElement).click();
    expect(cards.querySelector(".card")).toBeNull();
  });
});

describe("render wiring", () => {
  test("the scanner drives the HUD counts and odometer and reports TRACKER_UPDATE; un-haunt sends CLEAR_EXORCISE", async () => {
    const { win, doc } = page();
    const sent: unknown[] = [];
    (globalThis as Record<string, unknown>).chrome = { runtime: { sendMessage: async (m: unknown) => void sent.push(m) } };
    const entries = [
      { name: "https://criteo.com/a.js", startTime: 1 },
      { name: "https://criteo.com/b.gif", startTime: 2 },
      { name: "https://haunt.example/own.css", startTime: 3 },
    ];
    Object.defineProperty(win, "performance", { value: { getEntriesByType: () => entries }, configurable: true });
    const root = renderCostume(doc);
    const hud = root.getElementById("hud")!;
    expect(hud.querySelector(".count.ghosts .n")!.textContent).toBe("1");
    expect((hud.querySelector(".empty") as HTMLElement).hidden).toBe(true);
    expect(hud.querySelector(".hits")!.getAttribute("aria-label")).toBe("Souls counted: 000002");
    expect(sent[0]).toMatchObject({ type: "TRACKER_UPDATE", total: 2, companies: [{ company: "Criteo", count: 2, domains: ["criteo.com"] }] });
    expect(JSON.stringify(sent[0])).not.toContain("tabId");
    await leaveCostume(doc);
    expect(sent.at(-1)).toEqual({ type: "CLEAR_EXORCISE" });
  });

  test("nothing found: the HUD keeps the empty state", () => {
    const { win, doc } = page();
    Object.defineProperty(win, "performance", { value: { getEntriesByType: () => [] }, configurable: true });
    const hud = renderCostume(doc).getElementById("hud")!;
    expect((hud.querySelector(".empty") as HTMLElement).hidden).toBe(false);
    expect(hud.querySelector(".empty")!.textContent).toBe("No ghosts here. Suspiciously clean.");
  });
});
