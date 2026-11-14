import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { leaveCostume, renderCostume } from "../../src/content/costume/render";

const PAGE = `<!doctype html><html><head><title>t</title></head><body><main>
<p id="s">Only 2 left in stock</p>
<label id="l"><input type="checkbox" name="news" checked> Send me the newsletter</label>
<p id="clock">Cart reserved for 09:59</p>
</main></body></html>`;

const g = globalThis as Record<string, unknown>;
const saved = { chrome: g.chrome, fetch: g.fetch, now: Date.now };
const proto = new Window() as any; // happy-dom's classes are shared between windows: put back what a test replaces
const savedProto = { animate: proto.Element.prototype.animate, rects: proto.Range.prototype.getClientRects };
const windows: Window[] = [];
afterEach(() => {
  g.chrome = saved.chrome;
  g.fetch = saved.fetch;
  Date.now = saved.now;
  proto.Element.prototype.animate = savedProto.animate;
  proto.Range.prototype.getClientRects = savedProto.rects;
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

type Timer = { id: number; ms: number; fn: () => void };

/** A haunt-able page, a chrome stub recording messages, and a controllable debounce clock. */
function setup(html = PAGE) {
  const win = new Window({ url: "https://shop.test/", width: 1280, height: 800 });
  windows.push(win);
  win.document.write(html);
  const w = win as any;
  w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {} });
  w.matchMedia = (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
  const doc = win.document as unknown as Document;
  const rects = new Map<Node, unknown[]>();
  w.Range.prototype.getClientRects = function (this: Range) {
    return rects.get(this.commonAncestorContainer) ?? [];
  };
  // The rescan debounce is the only setTimeout between 500 ms and 2 s: capture it, pass the rest through.
  const timers: Timer[] = [];
  const cleared: unknown[] = [];
  let now = 0;
  let nextId = 1000;
  const realSet = w.setTimeout.bind(win);
  const realClear = w.clearTimeout.bind(win);
  w.setTimeout = (fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms !== undefined && ms >= 500 && ms <= 2000) {
      timers.push({ id: ++nextId, ms, fn });
      return nextId;
    }
    return realSet(fn, ms, ...rest);
  };
  w.clearTimeout = (id?: number) => {
    cleared.push(id);
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
    else realClear(id);
  };
  Date.now = () => now;
  const sent: any[] = [];
  g.chrome = { runtime: { id: "x", sendMessage: async (m: unknown) => void sent.push(m) } };
  g.fetch = async () => ({ status: 200, type: "basic" });
  return {
    win,
    doc,
    sent,
    timers,
    cleared,
    rects,
    clock: (t: number) => (now = t),
    curseMsgs: () => sent.filter((m) => m.type === "CURSE_UPDATE"),
    hud: (root: ShadowRoot) => root.querySelector("#hud .count.curses .n")!.textContent,
  };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const add = (doc: Document, html: string) => {
  const d = doc.createElement("div");
  d.innerHTML = html;
  doc.querySelector("main")!.append(d);
};

describe("curses in the costume (req 32-35, 53)", () => {
  test("renderCostume detects once and sends CURSE_UPDATE with the curses; the HUD count equals the number of curses", () => {
    const { doc, curseMsgs, hud } = setup();
    const root = renderCostume(doc);
    expect(curseMsgs()).toEqual([
      {
        type: "CURSE_UPDATE",
        curses: [
          { kind: "scarcity", snippet: "Only 2 left in stock" },
          { kind: "prechecked", snippet: "Send me the newsletter" },
        ],
      },
    ]);
    expect(hud(root)).toBe("2");
    expect(root.querySelectorAll(".curse-badge")).toHaveLength(2);
  });
  test("HUD curse count equals the number of curses", () => {
    const { doc, hud } = setup(`<!doctype html><html><body><p>Hello</p></body></html>`);
    expect(hud(renderCostume(doc))).toBe("0");
  });
  test("a re-render of the same patterns sends nothing", async () => {
    const { doc, curseMsgs, timers, clock } = setup();
    renderCostume(doc);
    expect(curseMsgs()).toHaveLength(1);
    add(doc, `<p>plain</p>`);
    await flush();
    clock(5000);
    timers.at(-1)!.fn();
    expect(curseMsgs()).toHaveLength(1);
  });
  test("the count updates when a curse is added, and a new element's curse is added", async () => {
    const { doc, curseMsgs, timers, clock, hud } = setup();
    const root = renderCostume(doc);
    add(doc, `<p id="n">Offer ends in 3 hours</p>`);
    await flush();
    clock(5000);
    timers.at(-1)!.fn();
    expect(hud(root)).toBe("3");
    expect(curseMsgs().at(-1).curses.map((c: any) => c.kind)).toEqual(["scarcity", "prechecked", "countdown"]);
    expect(root.querySelectorAll(".curse-badge")).toHaveLength(3);
  });
  test("a removed element's curse is dropped", async () => {
    const { doc, curseMsgs, timers, clock, hud } = setup();
    const root = renderCostume(doc);
    doc.getElementById("s")!.remove();
    await flush();
    clock(5000);
    timers.at(-1)!.fn();
    expect(curseMsgs().at(-1).curses).toEqual([{ kind: "prechecked", snippet: "Send me the newsletter" }]);
    expect(hud(root)).toBe("1");
  });
  test("ghost updates keep the curse count", async () => {
    const { doc, hud } = setup();
    const root = renderCostume(doc);
    // the scanner reports on its own; a TOMBSTONE and tracker refresh go through renderCounts too
    await flush();
    expect(hud(root)).toBe("2");
    expect(root.querySelector("#hud .count.ghosts .n")!.textContent).toBe("0");
  });
  test("a ticking snippet does not change the curse", async () => {
    const { doc, curseMsgs, timers, clock } = setup();
    renderCostume(doc);
    const text = doc.getElementById("clock")!.firstChild!;
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Cart reserved for ${v}`;
      await flush();
    }
    const timerMsg = curseMsgs().at(-1);
    expect(timerMsg.curses.some((c: any) => c.kind === "timer")).toBe(true);
    const n = curseMsgs().length;
    text.nodeValue = "Cart reserved for 09:54";
    await flush();
    clock(5000);
    timers.at(-1)?.fn();
    expect(curseMsgs()).toHaveLength(n);
  });
});

describe("rescan debounce (req 33, 41, 43)", () => {
  test("a mutation triggers one rescan after 500 ms", async () => {
    const { doc, timers, clock } = setup();
    renderCostume(doc);
    clock(3000);
    add(doc, `<p>one</p>`);
    await flush();
    add(doc, `<p>two</p>`);
    await flush();
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(500);
  });
  test("rescans are at least 2 s apart", async () => {
    const { doc, timers, clock } = setup();
    renderCostume(doc); // the first scan is at t=0
    clock(100);
    add(doc, `<p>one</p>`);
    await flush();
    expect(timers.at(-1)!.ms).toBe(1900);
    clock(2000);
    timers.at(-1)!.fn();
    clock(2100);
    add(doc, `<p>two</p>`);
    await flush();
    expect(timers.at(-1)!.ms).toBe(1900);
  });
  test("relayout re-places the badges", async () => {
    const { win, doc, rects } = setup();
    const root = renderCostume(doc);
    const badge = root.querySelector<HTMLElement>(".curse-badge[data-kind=scarcity]")!;
    rects.set(doc.getElementById("s")!, [{ left: 100, right: 180, top: 100, bottom: 120, width: 80, height: 20 }]);
    win.dispatchEvent(new win.Event("resize"));
    await flush();
    expect(badge.style.left).toBe("184px");
    expect(badge.style.top).toBe("101px");
  });
});

describe("timers and un-haunt (req 21, 25, 47)", () => {
  test("a ticking clock becomes a timer curse", async () => {
    const { doc, curseMsgs } = setup();
    const root = renderCostume(doc);
    const text = doc.getElementById("clock")!.firstChild!;
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Cart reserved for ${v}`;
      await flush();
    }
    const last = curseMsgs().at(-1).curses;
    expect(last.filter((c: any) => c.kind === "timer")).toHaveLength(1);
    expect(root.querySelector(".curse-badge[data-kind=timer]")).not.toBeNull();
  });
  test("un-haunt stops the watcher, removes the badges and cancels the debounce", async () => {
    const { doc, timers, cleared } = setup();
    const root = renderCostume(doc);
    add(doc, `<p>x</p>`);
    await flush();
    const id = timers[0]!.id;
    await leaveCostume(doc);
    expect(cleared).toContain(id);
    expect(root.querySelectorAll(".curse-badge")).toHaveLength(0);
    expect(timers).toHaveLength(0);
  });
  test("no CURSE_UPDATE is sent after un-haunt", async () => {
    const { doc, curseMsgs } = setup();
    renderCostume(doc);
    await leaveCostume(doc);
    const n = curseMsgs().length;
    const text = doc.getElementById("clock")!.firstChild!;
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Cart reserved for ${v}`;
      await flush();
    }
    add(doc, `<p>Only 1 left</p>`);
    await flush();
    expect(curseMsgs()).toHaveLength(n);
  });
});

describe("the page is left alone (req 27, 28, 30, 31)", () => {
  test("outerHTML is identical after haunt and un-haunt", async () => {
    const { doc } = setup();
    const before = doc.documentElement.outerHTML;
    renderCostume(doc);
    await flush();
    await leaveCostume(doc);
    expect(doc.documentElement.outerHTML).toBe(before);
  });
  test("a pre-checked box stays checked through haunt, a badge click and un-haunt", async () => {
    const { doc } = setup();
    const box = doc.querySelector<HTMLInputElement>("input[name=news]")!;
    const root = renderCostume(doc);
    expect(box.checked).toBe(true);
    root.querySelector<HTMLElement>(".curse-badge[data-kind=prechecked]")!.click();
    expect(root.querySelector(".curse-card")).not.toBeNull();
    expect(box.checked).toBe(true);
    expect(box.hasAttribute("checked")).toBe(true);
    await leaveCostume(doc);
    expect(box.checked).toBe(true);
    expect(box.hasAttribute("checked")).toBe(true);
  });
});
