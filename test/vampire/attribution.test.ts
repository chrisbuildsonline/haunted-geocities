import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { attribute, createVampireBridge } from "../../src/content/hooks-bridge";
import trackerJson from "../../src/data/trackers.json";
import type { TrackerData } from "../../src/data/types";

const data = trackerJson as TrackerData;
const SITE = "www.shop.example";

describe("attribute", () => {
  test("first-party callers are ignored (own host, subdomain, parent of a www site)", () => {
    expect(attribute("https://www.shop.example/app.js", SITE, data)).toBeNull();
    expect(attribute("https://cdn.www.shop.example/app.js", SITE, data)).toBeNull();
    expect(attribute("https://shop.example/app.js", SITE, data)).toBeNull();
  });
  test("a known tracker host resolves to its company", () => {
    expect(attribute("https://static.criteo.com/x.js", SITE, data)).toBe("Criteo");
  });
  test("a known tracker on its own site is first party", () => {
    expect(attribute("https://static.criteo.com/a.js", "www.criteo.com", data)).toBeNull();
  });
  test("an unlisted third-party host is named by the host", () => {
    expect(attribute("https://sneaky.example/fp.js", SITE, data)).toBe("sneaky.example");
  });
  test("non-http(s) and garbage are ignored", () => {
    expect(attribute("chrome-extension://abc/x.js", SITE, data)).toBeNull();
    expect(attribute("not a url", SITE, data)).toBeNull();
  });
});

function bridge() {
  const win = new Window({ url: `https://${SITE}/` }) as any;
  const got: [string, string][] = [];
  const b = createVampireBridge(data);
  b.start("nonce-1", SITE, (c, api) => got.push([c, api]), win);
  const fire = (detail: unknown, type = "nonce-1") => win.dispatchEvent(new win.CustomEvent(type, { detail }));
  return { b, got, fire, win };
}

describe("bridge", () => {
  test("listens for the nonce event and attributes the report", () => {
    const { got, fire } = bridge();
    fire({ api: "canvas", scriptUrl: "https://static.criteo.com/x.js" });
    fire({ api: "audio", scriptUrl: "https://sneaky.example/fp.js" });
    fire({ api: "canvas", scriptUrl: "https://www.shop.example/own.js" });
    expect(got).toEqual([["Criteo", "canvas"], ["sneaky.example", "audio"]]);
  });
  test("other event types are ignored", () => {
    const { got, fire } = bridge();
    fire({ api: "canvas", scriptUrl: "https://sneaky.example/fp.js" }, "other");
    expect(got).toEqual([]);
  });
  test("invalid payloads are discarded", () => {
    const { got, fire } = bridge();
    for (const bad of [null, "x", 5, {}, { api: "webgl", scriptUrl: "https://a.example/x.js" }, { api: "canvas" }, { api: "canvas", scriptUrl: 3 }, { api: "canvas", scriptUrl: "javascript:alert(1)" }]) {
      fire(bad);
    }
    expect(got).toEqual([]);
  });
  test("duplicate (scriptUrl, api) reports are ignored", () => {
    const { got, fire } = bridge();
    const d = { api: "canvas", scriptUrl: "https://sneaky.example/fp.js" };
    fire(d);
    fire(d);
    fire({ ...d, api: "fonts" });
    expect(got).toEqual([["sneaky.example", "canvas"], ["sneaky.example", "fonts"]]);
  });
  test("stop removes the listener", () => {
    const { b, got, fire } = bridge();
    b.stop();
    fire({ api: "canvas", scriptUrl: "https://sneaky.example/fp.js" });
    expect(got).toEqual([]);
  });
  test("starting again with a new nonce replaces the old listener", () => {
    const { b, got, fire, win } = bridge();
    b.start("nonce-2", SITE, (c, api) => got.push([c, api]), win);
    fire({ api: "canvas", scriptUrl: "https://sneaky.example/fp.js" }, "nonce-1");
    expect(got).toEqual([]);
    fire({ api: "canvas", scriptUrl: "https://sneaky.example/fp.js" }, "nonce-2");
    expect(got).toHaveLength(1);
  });
});
