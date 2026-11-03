import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { leaveCostume, renderCostume, startVampires } from "../../src/content/costume/render";
import type { ContentRequest } from "../../src/data/types";

const windows: Window[] = [];
const g = globalThis as { chrome?: unknown };
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
  delete g.chrome;
});

function setup() {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  windows.push(win);
  win.document.write("<!doctype html><html><body><main><p>Hello</p></main></body></html>");
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q,
    matches: q.includes("prefers-reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  });
  const sent: ContentRequest[] = [];
  g.chrome = { runtime: { sendMessage: (m: ContentRequest) => (sent.push(m), Promise.resolve()) } };
  const doc = win.document as unknown as Document;
  const root = renderCostume(doc);
  const counts = () => [...root.querySelectorAll("#hud .count .n")].map((n) => n.textContent);
  const fire = (detail: unknown) => win.dispatchEvent(new win.CustomEvent("nonce-9", { detail: detail as object }));
  const lastUpdate = () => sent.filter((m) => m.type === "TRACKER_UPDATE").at(-1) as Extract<ContentRequest, { type: "TRACKER_UPDATE" }>;
  return { doc, counts, fire, sent, lastUpdate };
}

describe("renderCostume and the vampire bridge", () => {
  test("a catch is merged, counted as a vampire not a ghost, and reported to the background", () => {
    const s = setup();
    startVampires("nonce-9", s.doc);
    s.fire({ api: "canvas", scriptUrl: "https://sneaky.example/fp.js" });
    s.fire({ api: "audio", scriptUrl: "https://sneaky.example/fp.js" });
    s.fire({ api: "canvas", scriptUrl: "https://haunt.example/own.js" }); // first party
    expect(s.counts().slice(0, 2)).toEqual(["0", "1"]);
    expect(s.lastUpdate().companies).toEqual([
      {
        company: "sneaky.example",
        domains: ["sneaky.example"],
        count: 0,
        categories: [],
        fingerprinting: 0,
        vampire: { caught: ["canvas", "audio"], knownOnly: false },
      },
    ]);
  });

  test("a catch for a known tracker extends that company", () => {
    const s = setup();
    startVampires("nonce-9", s.doc);
    s.fire({ api: "fonts", scriptUrl: "https://static.criteo.com/x.js" });
    expect(s.lastUpdate().companies.map((c) => [c.company, c.vampire])).toEqual([["Criteo", { caught: ["fonts"], knownOnly: false }]]);
  });

  test("un-haunt stops the bridge", async () => {
    const s = setup();
    startVampires("nonce-9", s.doc);
    await leaveCostume(s.doc);
    const before = s.sent.length;
    s.fire({ api: "canvas", scriptUrl: "https://sneaky.example/fp.js" });
    expect(s.sent.length).toBe(before);
  });
});
