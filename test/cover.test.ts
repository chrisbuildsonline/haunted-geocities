// The page-change cover (.kiro/specs/site-haunt, design/DESIGN.md "Page-change cover"): put up at
// document_start on the next page of a haunted site, so the original page never shows before the costume.
import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { COVER_FADE_MS, COVER_MAX_MS, COVER_TAG, startCover } from "../src/cover/cover";
import { COVER_DONE, COVER_MARKER } from "../src/data/types";

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/** A manual clock: run(ms) fires the timers due within the next `ms`. */
function clock() {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn: () => void, ms: number) => (due.set(++seq, { at: now + ms, fn }), seq),
    clear: (id: number) => void due.delete(id),
    run(ms: number) {
      now += ms;
      for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) {
          due.delete(id);
          t.fn();
        }
      }
    },
  };
}

type Opts = { marked?: boolean; answer?: boolean | "reject"; reduced?: boolean };

function setup({ marked = true, answer = true, reduced = false }: Opts = {}) {
  const win = new Window({ url: "https://www.nps.gov/subjects/" });
  const doc = win.document as unknown as Document;
  doc.body.innerHTML = "<p>Park page</p><button id='b'>Go</button>";
  if (marked) win.sessionStorage.setItem(COVER_MARKER, "1");
  const listeners: ((msg: unknown) => unknown)[] = [];
  const sent: unknown[] = [];
  let reply!: (v: unknown) => void;
  let fail!: (e: unknown) => void;
  const answered = new Promise((res, rej) => ((reply = res), (fail = rej)));
  const runtime = {
    sendMessage: (m: unknown) => (sent.push(m), answered),
    onMessage: { addListener: (l: (msg: unknown) => unknown) => void listeners.push(l) },
  };
  const global: Record<string, unknown> = {};
  const timers = clock();
  const cover = startCover({ doc, storage: win.sessionStorage as unknown as Storage, runtime, global, timers, reduced: () => reduced });
  const answer_ = async () => {
    if (answer === "reject") fail(new Error("Receiving end does not exist."));
    else reply(answer);
    await flush();
  };
  const hosts = () => doc.documentElement.querySelectorAll(COVER_TAG);
  return { win, doc, cover, sent, listeners, global, timers, answer: answer_, hosts };
}

describe("page-change cover", () => {
  test("with the marker it is up at once, before the background has answered, and asks COVER_CHECK", () => {
    const t = setup();
    expect(t.hosts()).toHaveLength(1);
    expect(t.hosts()[0]!.parentNode).toBe(t.doc.documentElement);
    expect(t.sent).toEqual([{ type: "COVER_CHECK" }]);
  });
  test("marker and a yes: it stays, once", async () => {
    const t = setup();
    await t.answer();
    expect(t.hosts()).toHaveLength(1);
  });
  test("marker and a no (a copied sessionStorage in another tab): it goes at once with the marker", async () => {
    const t = setup({ answer: false });
    await t.answer();
    expect(t.hosts()).toHaveLength(0);
    expect(t.win.sessionStorage.getItem(COVER_MARKER)).toBeNull();
  });
  test("no marker and a yes (a subdomain): it goes up when the answer comes", async () => {
    const t = setup({ marked: false });
    expect(t.hosts()).toHaveLength(0);
    await t.answer();
    expect(t.hosts()).toHaveLength(1);
  });
  test("no marker and a no (an un-haunted tab on the site): never shown", async () => {
    const t = setup({ marked: false, answer: false });
    await t.answer();
    expect(t.hosts()).toHaveLength(0);
  });
  test("a rejected check counts as no", async () => {
    const t = setup({ answer: "reject" });
    await t.answer();
    expect(t.hosts()).toHaveLength(0);
  });
  test("the costume's hook fades it out over 200ms, then removes it", async () => {
    const t = setup();
    await t.answer();
    (t.global[COVER_DONE] as () => void)();
    const host = t.hosts()[0] as HTMLElement;
    expect(host.style.opacity).toBe("0");
    expect(host.style.transition).toContain(`${COVER_FADE_MS}ms`);
    t.timers.run(COVER_FADE_MS);
    expect(t.hosts()).toHaveLength(0);
  });
  test("the hook with true, and reduced motion, remove it at once", async () => {
    const a = setup();
    (a.global[COVER_DONE] as (now?: boolean) => void)(true);
    expect(a.hosts()).toHaveLength(0);
    const b = setup({ reduced: true });
    (b.global[COVER_DONE] as () => void)();
    expect(b.hosts()).toHaveLength(0);
  });
  test(`a page is never stuck covered: gone after ${COVER_MAX_MS}ms`, async () => {
    const t = setup();
    await t.answer();
    t.timers.run(COVER_MAX_MS - 1);
    expect(t.hosts()).toHaveLength(1);
    t.timers.run(1); // the cap: the fade starts
    t.timers.run(COVER_FADE_MS);
    expect(t.hosts()).toHaveLength(0);
  });
  test("an unhaunt message removes it at once and answers nothing", async () => {
    const t = setup();
    await t.answer();
    const results = t.listeners.map((l) => l({ type: "unhaunt" }));
    expect(t.hosts()).toHaveLength(0);
    expect(results.every((r) => r !== true)).toBe(true);
  });
  test("accessible and never in the way of focus: a Loading status, nothing focusable, no inert, focus stays", async () => {
    const t = setup();
    const button = t.doc.getElementById("b") as HTMLButtonElement;
    button.focus();
    await t.answer();
    const root = t.cover.root()!;
    expect(root.querySelector('[role="status"]')?.textContent).toBe("Loading crypt…");
    expect(root.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
    expect(t.doc.querySelectorAll("[inert]")).toHaveLength(0);
    expect(t.doc.activeElement).toBe(button);
  });
  test("the look: crypt background, a 48px ghost, a Win95 progress bar of ten blocks, motion off under reduced motion", async () => {
    const t = setup();
    const root = t.cover.root()!;
    const css = [...root.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toContain("#000033");
    expect(css).toContain("2147483647");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(root.querySelector(".ghost svg")?.getAttribute("width")).toBe("48");
    expect(root.querySelectorAll(".bar .block")).toHaveLength(10);
    expect(root.querySelector(".foot")?.textContent).toBe("Under construction since 1998");
  });
});
