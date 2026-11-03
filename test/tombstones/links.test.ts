import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { collectLinks } from "../../src/content/links";

const ORIGIN = "https://site.test";
const docOf = (body: string) => {
  const win = new Window({ url: `${ORIGIN}/dir/page.html` });
  win.document.body.innerHTML = body;
  return win.document as unknown as Document;
};
const collect = (body: string) => collectLinks(docOf(body), ORIGIN, "hg-crypt");

describe("collectLinks (requirements 1-8, 63)", () => {
  test("req 2: keeps http and https only", () => {
    const r = collect(`<a href="/a">a</a><a href="http://other.test/b">b</a><a href="ftp://x.test/f">f</a><a href="data:text/plain,hi">d</a>`);
    expect(r).toEqual({ sameOrigin: [`${ORIGIN}/a`], crossSite: ["http://other.test/b"] });
  });
  test("req 2: drops hash-only, javascript:, mailto:, tel: and download links", () => {
    const r = collect(
      `<a href="#top">h</a><a href="javascript:void(0)">j</a><a href="mailto:a@b.test">m</a><a href="tel:123">t</a><a href="/f.zip" download>dl</a><a href="/ok">ok</a>`,
    );
    expect(r).toEqual({ sameOrigin: [`${ORIGIN}/ok`], crossSite: [] });
  });
  test("req 3: drops the fragment", () => {
    expect(collect(`<a href="/a#frag">a</a>`).sameOrigin).toEqual([`${ORIGIN}/a`]);
  });
  test("req 4: dedupes, first occurrence wins, document order kept", () => {
    const r = collect(`<a href="/b">b</a><a href="/a">a</a><a href="/b#x">b2</a><a href="/a">a2</a>`);
    expect(r.sameOrigin).toEqual([`${ORIGIN}/b`, `${ORIGIN}/a`]);
  });
  test("req 5: drops links inside the costume host", () => {
    const r = collect(`<a href="/keep">k</a><hg-crypt><a href="/skip">s</a></hg-crypt>`);
    expect(r.sameOrigin).toEqual([`${ORIGIN}/keep`]);
  });
  test("req 6: splits same-origin from cross-site (other host, port or scheme)", () => {
    const r = collect(`<a href="/a">a</a><a href="https://other.test/b">b</a><a href="http://site.test/c">c</a><a href="https://site.test:8443/d">d</a>`);
    expect(r.sameOrigin).toEqual([`${ORIGIN}/a`]);
    expect(r.crossSite).toEqual(["https://other.test/b", "http://site.test/c", "https://site.test:8443/d"]);
  });
  test("req 7: caps same-origin at 60 and cross-site at 30, keeping the first", () => {
    const same = Array.from({ length: 70 }, (_, i) => `<a href="/s${i}">s</a>`).join("");
    const cross = Array.from({ length: 40 }, (_, i) => `<a href="https://o.test/c${i}">c</a>`).join("");
    const r = collect(same + cross);
    expect(r.sameOrigin).toHaveLength(60);
    expect(r.sameOrigin[0]).toBe(`${ORIGIN}/s0`);
    expect(r.sameOrigin[59]).toBe(`${ORIGIN}/s59`);
    expect(r.crossSite).toHaveLength(30);
    expect(r.crossSite[29]).toBe("https://o.test/c29");
  });
  test("req 8: pure, the document is not changed", () => {
    const doc = docOf(`<a href="/a#x">a</a>`);
    const before = doc.documentElement.outerHTML;
    collectLinks(doc, ORIGIN, "hg-crypt");
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});
