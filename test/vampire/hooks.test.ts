import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { installHooks } from "../../src/content/hooks";

const NONCE = "n0nce-1234";

/** A happy-dom window with fake canvas / 2d / audio classes (happy-dom has none) to wrap. */
function setup() {
  const win = new Window({ url: "https://site.example/" }) as any;
  class Canvas {
    toDataURL(...a: unknown[]) {
      return `data:${a.join()}`;
    }
    toBlob(cb: (b: string) => void) {
      cb("blob");
    }
  }
  class Ctx {
    _f = "10px a";
    get font() {
      return this._f;
    }
    set font(v: string) {
      this._f = v;
    }
    fillText() {}
    strokeText() {}
    getImageData() {
      return { data: [1] };
    }
    measureText(t: string) {
      return { width: t.length };
    }
  }
  class Audio {
    startRendering() {
      return Promise.resolve("buf");
    }
  }
  Object.assign(win, { HTMLCanvasElement: Canvas, CanvasRenderingContext2D: Ctx, OfflineAudioContext: Audio });
  const originals = {
    toDataURL: Canvas.prototype.toDataURL,
    toBlob: Canvas.prototype.toBlob,
    getImageData: Ctx.prototype.getImageData,
    measureText: Ctx.prototype.measureText,
    startRendering: Audio.prototype.startRendering,
  };
  const events: { api: string; scriptUrl: string }[] = [];
  win.addEventListener(NONCE, (e: CustomEvent) => events.push(e.detail));
  const install = () => installHooks(NONCE, win);
  /** Run `body` as if it were a script served from `url`: the url shows up in the stack. */
  const asScript = (url: string, body: string) =>
    new Function("canvas", "ctx", "audio", `${body}\n//# sourceURL=${url}`) as (c: Canvas, x: Ctx, a: Audio) => unknown;
  return { win, Canvas, Ctx, Audio, originals, events, install, asScript, canvas: new Canvas(), ctx: new Ctx(), audio: new Audio() };
}

const URL1 = "https://cdn.tracker.example/fp.js";
const restore = (s: ReturnType<typeof setup>) => s.win.dispatchEvent(new s.win.CustomEvent(`${NONCE}:restore`));

describe("installHooks", () => {
  test("wraps the five functions and keeps the property attributes", () => {
    const s = setup();
    const before = Object.getOwnPropertyDescriptor(s.Canvas.prototype, "toDataURL")!;
    s.install();
    const after = Object.getOwnPropertyDescriptor(s.Canvas.prototype, "toDataURL")!;
    expect(after.value).not.toBe(s.originals.toDataURL);
    expect([after.writable, after.enumerable, after.configurable]).toEqual([before.writable, before.enumerable, before.configurable]);
    expect(s.Canvas.prototype.toBlob).not.toBe(s.originals.toBlob);
    expect(s.Ctx.prototype.getImageData).not.toBe(s.originals.getImageData);
    expect(s.Ctx.prototype.measureText).not.toBe(s.originals.measureText);
    expect(s.Audio.prototype.startRendering).not.toBe(s.originals.startRendering);
  });

  test("wrapper: same this, args, result", () => {
    const s = setup();
    let seen: unknown[] = [];
    s.Canvas.prototype.toDataURL = function (this: unknown, ...a: unknown[]) {
      seen = [this, ...a];
      return { r: 1 } as any;
    };
    s.install();
    const r = s.canvas.toDataURL("image/png", 0.5);
    expect(r).toEqual({ r: 1 } as any);
    expect(seen).toEqual([s.canvas, "image/png", 0.5]);
  });

  test("wrapper: rethrows the same exception", () => {
    const s = setup();
    const boom = new Error("boom");
    s.Canvas.prototype.toDataURL = () => {
      throw boom;
    };
    s.install();
    expect(() => s.canvas.toDataURL()).toThrow(boom);
  });

  test("wrapper keeps name and length and toString returns the original's", () => {
    const s = setup();
    const o = s.originals as Record<string, Function>;
    s.install();
    const wrapped: [string, Function][] = [
      ["toDataURL", s.canvas.toDataURL],
      ["toBlob", s.canvas.toBlob],
      ["getImageData", s.ctx.getImageData],
      ["measureText", s.ctx.measureText],
      ["startRendering", s.audio.startRendering],
    ];
    for (const [k, w] of wrapped) {
      expect(w.name).toBe(o[k]!.name);
      expect(w.length).toBe(o[k]!.length);
      expect(w.toString()).toBe(Function.prototype.toString.call(o[k]));
    }
  });

  test("never throws on its own, even when reporting fails", () => {
    const s = setup();
    s.install();
    s.win.CustomEvent = function () {
      throw new Error("reporting is broken");
    };
    expect(s.asScript(URL1, "return canvas.toDataURL('x')")(s.canvas, s.ctx, s.audio)).toBe("data:x");
  });

  test("toDataURL and toBlob report canvas with the calling script's url", () => {
    const s = setup();
    s.install();
    s.asScript(URL1, "canvas.toDataURL(); canvas.toBlob(() => {});")(s.canvas, s.ctx, s.audio);
    expect(s.events).toEqual([{ api: "canvas", scriptUrl: URL1 }]); // same api + url: one event
  });

  test("startRendering reports audio", async () => {
    const s = setup();
    s.install();
    expect(await (s.asScript(URL1, "return audio.startRendering()")(s.canvas, s.ctx, s.audio) as Promise<string>)).toBe("buf");
    expect(s.events).toEqual([{ api: "audio", scriptUrl: URL1 }]);
  });

  test("getImageData reports canvas only after fillText/strokeText on that context", () => {
    const s = setup();
    s.install();
    const run = s.asScript(URL1, "ctx.getImageData()");
    run(s.canvas, s.ctx, s.audio);
    expect(s.events).toEqual([]);
    s.ctx.fillText();
    run(s.canvas, new s.Ctx(), s.audio); // another context: still nothing
    expect(s.events).toEqual([]);
    run(s.canvas, s.ctx, s.audio);
    expect(s.events).toEqual([{ api: "canvas", scriptUrl: URL1 }]);
  });

  test("measureText reports fonts once one context has set 20 distinct families", () => {
    const s = setup();
    s.install();
    const probe = s.asScript(URL1, "ctx.measureText('mmm')");
    for (let i = 0; i < 19; i++) {
      s.ctx.font = `16px family${i}`;
      probe(s.canvas, s.ctx, s.audio);
    }
    s.ctx.font = "20px family3"; // same family, different size: not a new family
    probe(s.canvas, s.ctx, s.audio);
    expect(s.events).toEqual([]);
    s.ctx.font = "16px family19";
    probe(s.canvas, s.ctx, s.audio);
    expect(s.events).toEqual([{ api: "fonts", scriptUrl: URL1 }]);
    expect(s.ctx.font).toBe("16px family19"); // the setter still works
  });

  test("families spread over several contexts do not add up", () => {
    const s = setup();
    s.install();
    const probe = s.asScript(URL1, "ctx.measureText('mmm')");
    for (let i = 0; i < 30; i++) {
      const c = new s.Ctx();
      c.font = `16px family${i}`;
      probe(s.canvas, c, s.audio);
    }
    expect(s.events).toEqual([]);
  });

  test("the closure dedupes api|url, but another url is reported", () => {
    const s = setup();
    s.install();
    for (let i = 0; i < 5; i++) s.asScript(URL1, "canvas.toDataURL()")(s.canvas, s.ctx, s.audio);
    s.asScript("https://other.example/x.js", "canvas.toDataURL()")(s.canvas, s.ctx, s.audio);
    expect(s.events.map((e) => e.scriptUrl)).toEqual([URL1, "https://other.example/x.js"]);
  });

  test("nothing is stored on the window", () => {
    const s = setup();
    const keys = Object.getOwnPropertyNames(s.win);
    s.install();
    expect(Object.getOwnPropertyNames(s.win)).toEqual(keys);
  });

  test("idempotent: a second install is a no-op (ping answered by the first closure)", () => {
    const s = setup();
    s.install();
    const wrapped = s.Canvas.prototype.toDataURL;
    s.install();
    expect(s.Canvas.prototype.toDataURL).toBe(wrapped);
    s.asScript(URL1, "canvas.toDataURL()")(s.canvas, s.ctx, s.audio);
    expect(s.events).toHaveLength(1);
  });

  test("restore puts back the exact original functions and the font setter, and removes the listeners", () => {
    const s = setup();
    const font = Object.getOwnPropertyDescriptor(s.Ctx.prototype, "font")!;
    s.install();
    restore(s);
    expect(s.Canvas.prototype.toDataURL).toBe(s.originals.toDataURL);
    expect(s.Canvas.prototype.toBlob).toBe(s.originals.toBlob);
    expect(s.Ctx.prototype.getImageData).toBe(s.originals.getImageData);
    expect(s.Ctx.prototype.measureText).toBe(s.originals.measureText);
    expect(s.Audio.prototype.startRendering).toBe(s.originals.startRendering);
    const after = Object.getOwnPropertyDescriptor(s.Ctx.prototype, "font")!;
    expect([after.get, after.set]).toEqual([font.get, font.set]);
    // a fresh install works again, which also proves the ping listener is gone
    s.install();
    expect(s.Canvas.prototype.toDataURL).not.toBe(s.originals.toDataURL);
  });

  test("a wrapper someone kept after restore just calls through", () => {
    const s = setup();
    s.install();
    const kept = s.Canvas.prototype.toDataURL;
    restore(s);
    expect(s.asScript(URL1, "return canvas.toDataURL('a')")(s.canvas, s.ctx, s.audio)).toBe("data:a"); // original again
    expect(kept.call(s.canvas, "a")).toBe("data:a");
    expect(s.events).toEqual([]);
  });
});
