import { describe, expect, test } from "bun:test";
import { checkLinks } from "../../src/content/link-check";

type Step = number | "network" | "hang" | "opaque";
/** A fetch that answers per method from a script of steps, recording every call. */
const mock = (plan: Record<string, Step | { HEAD?: Step; GET?: Step }>) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const entry = plan[url];
    const step = typeof entry === "object" ? entry[init.method as "HEAD" | "GET"] : entry;
    if (step === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (step === "hang") return new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    if (step === "opaque") return Promise.resolve({ status: 0, type: "opaqueredirect" } as Response);
    return Promise.resolve({ status: step ?? 200, type: "basic" } as Response);
  }) as unknown as typeof fetch;
  return { fn, calls };
};
const U = (p: string) => `https://site.test${p}`;

describe("checkLinks (requirements 9-13, 64)", () => {
  test("req 64: 404 and 410 are dead, with path and status", async () => {
    const { fn } = mock({ [U("/a")]: 404, [U("/b/c.html")]: 410 });
    expect(await checkLinks([U("/a"), U("/b/c.html")], fn)).toEqual([
      { url: U("/a"), path: "/a", status: 404 },
      { url: U("/b/c.html"), path: "/b/c.html", status: 410 },
    ]);
  });
  test("req 9: HEAD with credentials omit, manual redirect, no-store and an abort signal", async () => {
    const { fn, calls } = mock({});
    await checkLinks([U("/a")], fn);
    expect(calls[0]!.init).toMatchObject({ method: "HEAD", credentials: "omit", redirect: "manual", cache: "no-store" });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
  test("req 11: 405 then GET retry; GET 404 is dead, GET 200 is alive", async () => {
    const { fn, calls } = mock({ [U("/dead")]: { HEAD: 405, GET: 404 }, [U("/live")]: { HEAD: 501, GET: 200 } });
    expect(await checkLinks([U("/dead"), U("/live")], fn)).toEqual([{ url: U("/dead"), path: "/dead", status: 404 }]);
    expect(calls.map((c) => c.init.method)).toEqual(["HEAD", "HEAD", "GET", "GET"]);
    expect(calls.filter((c) => c.init.method === "GET").every((c) => c.init.credentials === "omit")).toBe(true);
  });
  test("req 11: no retry for other statuses", async () => {
    const { fn, calls } = mock({ [U("/a")]: 500, [U("/b")]: 403 });
    await checkLinks([U("/a"), U("/b")], fn);
    expect(calls).toHaveLength(2);
  });
  test("req 12: 200, 500, 403, network error, opaque redirect and timeout are alive", async () => {
    const { fn } = mock({ [U("/ok")]: 200, [U("/err")]: 500, [U("/no")]: 403, [U("/net")]: "network", [U("/opq")]: "opaque", [U("/slow")]: "hang" });
    const urls = ["/ok", "/err", "/no", "/net", "/opq", "/slow"].map(U);
    expect(await checkLinks(urls, fn, { timeoutMs: 20 })).toEqual([]);
  });
  test("req 9: a hung request is aborted by the timeout", async () => {
    const { fn, calls } = mock({ [U("/slow")]: "hang" });
    await checkLinks([U("/slow")], fn, { timeoutMs: 20 });
    expect(calls[0]!.init.signal!.aborted).toBe(true);
  });
  test("req 10: at most 4 in flight", async () => {
    let live = 0;
    let peak = 0;
    const fn = (async () => {
      peak = Math.max(peak, ++live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { status: 200, type: "basic" } as Response;
    }) as unknown as typeof fetch;
    await checkLinks(Array.from({ length: 12 }, (_, i) => U(`/${i}`)), fn);
    expect(peak).toBe(4);
  });
  test("req 13: dead links come back in input order", async () => {
    const fn = (async (url: string) => {
      await new Promise((r) => setTimeout(r, url.endsWith("/a") ? 20 : 1));
      return { status: 404, type: "basic" } as Response;
    }) as unknown as typeof fetch;
    expect((await checkLinks([U("/a"), U("/b"), U("/c")], fn)).map((d) => d.path)).toEqual(["/a", "/b", "/c"]);
  });
});
