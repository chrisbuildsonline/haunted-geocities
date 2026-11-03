import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { addTombstones, deadLinks, leaveCostume, onTombstones, renderCostume } from "../../src/content/costume/render";
import { LINK_CHECK_ORIGINS, type DeadLink } from "../../src/data/types";

const PAGE = `<!doctype html><html><head><title>t</title></head><body><main>
<p><a href="/ok">ok</a> <a href="/missing">m</a> <a href="/gone/">g</a> <a href="/missing#again">m2</a> <a href="mailto:a@b.test">mail</a> <a href="#top">top</a> <a href="https://other.test/x">x</a></p>
</main></body></html>`;

const g = globalThis as Record<string, unknown>;
const saved = { chrome: g.chrome, fetch: g.fetch };
afterEach(() => {
  g.chrome = saved.chrome;
  g.fetch = saved.fetch;
});

/** A haunted-able happy-dom page, a chrome stub recording runtime messages, and a fetch answering from `status`. */
function setup(opts: { permissions?: unknown; noChrome?: boolean } = {}) {
  const win = new Window({ url: "https://haunt.example/", width: 1280, height: 800 });
  win.document.write(PAGE);
  (win.Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {} });
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
  const sent: any[] = [];
  const fetched: string[] = [];
  g.chrome = opts.noChrome ? undefined : { runtime: { id: "x", sendMessage: async (m: unknown) => void sent.push(m) }, permissions: opts.permissions };
  g.fetch = async (url: string) => {
    fetched.push(url);
    return { status: url.endsWith("/missing") ? 404 : url.includes("/gone") ? 410 : 200, type: "basic" };
  };
  return { win, doc: win.document as unknown as Document, sent, fetched };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const hudTombs = (root: ShadowRoot) => root.querySelector("#hud .count.tombstones .n")!.textContent;

describe("tombstones in the costume (requirements 6, 23, 44-45)", () => {
  test("req 44, 23: same-origin dead links are counted in the HUD, deduped, and sent as TOMBSTONE_UPDATE", async () => {
    const { win, doc, sent } = setup();
    const root = renderCostume(doc);
    await flush();
    const dead: DeadLink[] = [
      { url: "https://haunt.example/missing", path: "/missing", status: 404 },
      { url: "https://haunt.example/gone/", path: "/gone/", status: 410 },
    ];
    expect(deadLinks(doc)).toEqual(dead);
    expect(hudTombs(root)).toBe("2");
    expect(sent.filter((m) => m.type === "TOMBSTONE_UPDATE")).toEqual([{ type: "TOMBSTONE_UPDATE", dead }]);
    win.happyDOM.abort();
  });
  test("req 45: cross-site results merge in, the count updates, and the hook hears every change", async () => {
    const { win, doc, sent } = setup();
    const root = renderCostume(doc);
    const heard: number[] = [];
    onTombstones((d) => heard.push(d.length), doc);
    await flush();
    const far: DeadLink = { url: "https://other.test/x", path: "/x", status: 404 };
    addTombstones([far, far], doc);
    addTombstones([far], doc);
    expect(hudTombs(root)).toBe("3");
    expect(heard).toEqual([2, 3]);
    expect(sent.filter((m) => m.type === "TOMBSTONE_UPDATE").at(-1).dead).toHaveLength(3);
    win.happyDOM.abort();
  });
  test("req 14-15: cross-site URLs go to the background only when the origins are granted", async () => {
    const granted = setup({ permissions: { contains: async (p: { origins: string[] }) => (expect(p.origins).toEqual(LINK_CHECK_ORIGINS), true) } });
    renderCostume(granted.doc);
    await flush();
    expect(granted.sent.filter((m) => m.type === "CHECK_LINKS")).toEqual([{ type: "CHECK_LINKS", urls: ["https://other.test/x"] }]);
    expect(granted.fetched.every((u) => u.startsWith("https://haunt.example/"))).toBe(true);
    granted.win.happyDOM.abort();

    const denied = setup({ permissions: { contains: async () => false } });
    renderCostume(denied.doc);
    await flush();
    expect(denied.sent.filter((m) => m.type === "CHECK_LINKS")).toEqual([]);
    denied.win.happyDOM.abort();
  });
  test("results after Un-haunt are ignored", async () => {
    const { win, doc, sent } = setup();
    renderCostume(doc);
    await flush();
    const before = sent.length;
    await leaveCostume(doc);
    addTombstones([{ url: "https://other.test/late", path: "/late", status: 404 }], doc);
    expect(deadLinks(doc)).toEqual([]);
    expect(sent.slice(before).some((m) => m.type === "TOMBSTONE_UPDATE")).toBe(false);
    win.happyDOM.abort();
  });
  test("with no chrome global nothing is fetched or sent and the HUD count is 0", async () => {
    const { win, doc, fetched } = setup({ noChrome: true });
    const root = renderCostume(doc);
    await flush();
    expect(fetched).toEqual([]);
    expect(hudTombs(root)).toBe("0");
    win.happyDOM.abort();
  });
});
