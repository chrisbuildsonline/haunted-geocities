import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { DarkPattern } from "../../src/content/dark-patterns";
import { createTickTracker, watchTimers } from "../../src/content/timers";

describe("createTickTracker", () => {
  const block = () => new Window().document.createElement("p") as unknown as Element;
  test("first value is not a tick", () => {
    expect(createTickTracker().note(block(), "09:59", 0)).toBe(false);
  });
  test("the same value repeated is not a tick", () => {
    const t = createTickTracker();
    const b = block();
    for (let i = 0; i < 10; i++) expect(t.note(b, "17:30", i * 1000)).toBe(false);
  });
  test("two changes are not enough", () => {
    const t = createTickTracker();
    const b = block();
    t.note(b, "09:59", 0);
    expect(t.note(b, "09:58", 1000)).toBe(false);
    expect(t.note(b, "09:57", 2000)).toBe(false);
  });
  test("the third change reports once", () => {
    const t = createTickTracker();
    const b = block();
    t.note(b, "09:59", 0);
    t.note(b, "09:58", 1000);
    t.note(b, "09:57", 2000);
    expect(t.note(b, "09:56", 3000)).toBe(true);
  });
  test("it does not report twice", () => {
    const t = createTickTracker();
    const b = block();
    t.note(b, "09:59", 0);
    t.note(b, "09:58", 1000);
    t.note(b, "09:57", 2000);
    expect(t.note(b, "09:56", 3000)).toBe(true);
    expect(t.note(b, "09:55", 4000)).toBe(false);
  });
  test("changes older than 10 s do not count", () => {
    const t = createTickTracker();
    const b = block();
    t.note(b, "09:59", 0);
    t.note(b, "09:58", 1000);
    t.note(b, "09:57", 2000);
    expect(t.note(b, "09:56", 20_000)).toBe(false);
  });
  test("blocks are tracked separately", () => {
    const t = createTickTracker();
    const a = block();
    const b = block();
    t.note(a, "1:00", 0);
    t.note(b, "1:00", 0);
    t.note(a, "0:59", 1);
    t.note(a, "0:58", 2);
    expect(t.note(b, "0:59", 3)).toBe(false);
    expect(t.note(a, "0:57", 4)).toBe(true);
  });
});

/** A MutationObserver that captures its callback; tests call it with hand-made records. */
class StubObserver {
  static last: StubObserver;
  observed: { target: Node; options: unknown }[] = [];
  disconnected = false;
  constructor(public cb: (records: { target: Node }[]) => void) {
    StubObserver.last = this;
  }
  observe(target: Node, options: unknown) {
    this.observed.push({ target, options });
  }
  disconnect() {
    this.disconnected = true;
  }
}

const setup = (body: string) => {
  const win = new Window({ url: "https://shop.test/" });
  win.document.body.innerHTML = body;
  const doc = win.document as unknown as Document;
  const found: DarkPattern[] = [];
  let t = 0;
  const stop = watchTimers(doc, "hg-crypt", (p) => found.push(p), { now: () => (t += 10), MutationObserver: StubObserver as unknown as typeof MutationObserver });
  const feed = (...targets: Node[]) => StubObserver.last.cb(targets.map((target) => ({ target })));
  return { doc, found, stop, feed, obs: StubObserver.last };
};

describe("watchTimers", () => {
  test("a ticking clock is reported once with kind timer", () => {
    const { doc, found, feed } = setup(`<p id="c">Cart reserved for 09:59</p>`);
    const text = doc.getElementById("c")!.firstChild!;
    for (const v of ["09:59", "09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Cart reserved for ${v}`;
      feed(text);
    }
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("timer");
    expect(found[0]!.element.id).toBe("c");
    expect(found[0]!.snippet).toBe("Cart reserved for 09:56");
  });
  test("a static clock (17:30 repeated) is never reported", () => {
    const { doc, found, feed } = setup(`<p id="c">Open daily 09:00 to 17:30</p>`);
    const text = doc.getElementById("c")!.firstChild!;
    for (let i = 0; i < 10; i++) feed(text);
    expect(found).toEqual([]);
  });
  test("a split clock reports the element holding both spans", () => {
    const { doc, found, feed } = setup(`<p id="c">Left <span id="m">09</span>:<span id="s">59</span></p>`);
    const s = doc.getElementById("s")!;
    for (const v of ["59", "58", "57", "56"]) {
      s.firstChild!.nodeValue = v;
      feed(s.firstChild!);
    }
    expect(found).toHaveLength(1);
    expect(found[0]!.element.id).toBe("c");
  });
  test("a page that replaces the clock element each tick is still reported", () => {
    const { doc, found, feed } = setup(`<p id="c">Reserved <span>09:59</span></p>`);
    const p = doc.getElementById("c")!;
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      p.querySelector("span")!.remove();
      const span = doc.createElement("span");
      span.textContent = v;
      p.append(span);
      feed(p);
    }
    expect(found).toHaveLength(1);
    expect(found[0]!.element.tagName).toBe("SPAN");
    expect(found[0]!.element.isConnected).toBe(true);
  });
  test("mutations inside the costume host are ignored", () => {
    const { doc, found, feed } = setup(`<hg-crypt><p id="c">Time 09:59</p></hg-crypt>`);
    const text = doc.getElementById("c")!.firstChild!;
    for (const v of ["09:59", "09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Time ${v}`;
      feed(text);
    }
    expect(found).toEqual([]);
  });
  test("at most 200 records are processed per callback", () => {
    const { doc, found, feed } = setup(Array.from({ length: 300 }, () => `<p>t 09:59</p>`).join(""));
    const texts = [...doc.querySelectorAll("p")].map((p) => p.firstChild!);
    for (const v of ["09:59", "09:58", "09:57", "09:56"]) {
      for (const t of texts) t.nodeValue = `t ${v}`;
      feed(...texts);
    }
    expect(found).toHaveLength(200);
  });
  test("observe is called with subtree, childList and characterData only", () => {
    const { doc, obs } = setup(`<p>x</p>`);
    expect(obs.observed).toEqual([{ target: doc.body, options: { subtree: true, childList: true, characterData: true } }]);
  });
  test("stop disconnects", () => {
    const { stop, obs } = setup(`<p>x</p>`);
    expect(obs.disconnected).toBe(false);
    stop();
    expect(obs.disconnected).toBe(true);
  });
  test("a removed target is ignored", () => {
    const { doc, found, feed } = setup(`<p id="c">Time 09:59</p>`);
    const text = doc.getElementById("c")!.firstChild!;
    const p = doc.getElementById("c")!;
    p.remove();
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Time ${v}`;
      feed(text);
    }
    expect(found).toEqual([]);
  });
  test("works with the document's own MutationObserver by default", async () => {
    const win = new Window({ url: "https://shop.test/" });
    win.document.body.innerHTML = `<p id="c">Time 09:59</p>`;
    const found: DarkPattern[] = [];
    let t = 0;
    const stop = watchTimers(win.document as unknown as Document, "hg-crypt", (p) => found.push(p), { now: () => (t += 1000) });
    const text = win.document.getElementById("c")!.firstChild!;
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      text.nodeValue = `Time ${v}`;
      await new Promise((r) => setTimeout(r, 5));
    }
    stop();
    expect(found).toHaveLength(1);
  });
});

describe("read-only", () => {
  test("outerHTML is unchanged by a watcher run", () => {
    const { doc, feed } = setup(`<p id="c">Cart <b>09:59</b></p><label><input type="checkbox" checked> Newsletter</label>`);
    const b = doc.querySelector("b")!;
    for (const v of ["09:58", "09:57", "09:56", "09:55"]) {
      b.firstChild!.nodeValue = v;
      const before = doc.documentElement.outerHTML;
      feed(b.firstChild!);
      expect(doc.documentElement.outerHTML).toBe(before);
    }
  });
});
