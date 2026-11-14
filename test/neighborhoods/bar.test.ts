import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import * as bands from "../../src/content/costume/bands";
import { buildBands } from "../../src/content/costume/bands";
import { costumeCss } from "../../src/content/costume/styles";
import { renderCostume } from "../../src/content/costume/render";
import * as resolver from "../../src/data/neighborhood";
import { resolveNeighborhood, type Neighborhood } from "../../src/data/neighborhood";
import { HOST_TAG } from "../../src/content/overlay";

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.happyDOM.abort();
});

const page = (url = "https://shop.example.com/") => {
  const win = new Window({ url, width: 1280, height: 800 });
  win.document.write("<!doctype html><html><head><title>t</title></head><body><p>Hi</p></body></html>");
  (win.Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), cancel() {}, finish() {} });
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
  windows.push(win);
  return win.document as unknown as Document;
};

const css = () => costumeCss({ stars: "data:s", twinkle: "data:t" });
/** The declarations of the first rule whose selector is exactly `sel` (outside any @media). */
const rule = (sel: string, src = css()) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
  return src.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
};

const luminance = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const SV: Neighborhood = { name: "SiliconValley", tagline: "Where the webmasters code all night.", suburb: "Heights", number: 2049, address: "SiliconValley/Heights/2049" };

describe("the neighborhood bar", () => {
  test("the bar reads You are in: <address>", () => {
    const bar = buildBands(page(), SV).querySelector("#neighborhood")!;
    expect(bar.querySelector(".where")!.textContent).toBe("You are in: SiliconValley/Heights/2049");
    expect(bar.querySelector(".where b")!.textContent).toBe("SiliconValley/Heights/2049");
  });

  test("the tagline follows the address", () => {
    const bar = buildBands(page(), SV).querySelector("#neighborhood")!;
    expect(bar.querySelector(".tagline")!.textContent).toBe("Where the webmasters code all night.");
    expect(bar.textContent).toBe("You are in: SiliconValley/Heights/2049Where the webmasters code all night.");
  });

  test("the order is where, tagline, sign", () => {
    const bar = buildBands(page(), SV).querySelector("#neighborhood")!;
    expect([...bar.children].map((c) => c.className)).toEqual(["where", "tagline", "sign"]);
    expect(bar.querySelector(".sign")!.getAttribute("aria-label")).toBe("Under construction");
  });

  test("a hostile tagline or address is text, not markup", () => {
    const evil = "<img src=x onerror=alert(1)><script>x()</script>";
    const bar = buildBands(page(), { ...SV, tagline: evil, address: evil }).querySelector("#neighborhood")!;
    expect(bar.querySelector("img, script")).toBeNull();
    expect(bar.querySelector(".tagline")!.textContent).toBe(evil);
    expect(bar.querySelector("b")!.textContent).toBe(evil);
  });

  test("neighborhoodFor is no longer exported", () => {
    expect("neighborhoodFor" in bands).toBe(false);
  });
});

describe("the neighborhood bar CSS", () => {
  test("CSS: the tagline is nowrap, overflow hidden, text-overflow ellipsis, min-width 0", () => {
    const r = rule("#neighborhood .tagline")!;
    expect(r).not.toBeNull();
    expect(r).toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/overflow:\s*hidden/);
    expect(r).toMatch(/text-overflow:\s*ellipsis/);
    expect(r).toMatch(/min-width:\s*0/);
    expect(r).toMatch(/flex:\s*1 1 0/);
  });

  test("CSS: the address and the sign do not shrink", () => {
    expect(rule("#neighborhood .where")).toMatch(/flex:\s*none/);
    expect(rule("#neighborhood .sign")).toMatch(/flex:\s*none/);
  });

  test("CSS: the tagline is display none under 480px", () => {
    const media = css().match(/@media\s*\(max-width:\s*479px\)\s*\{([\s\S]*?\})\s*\}/);
    expect(media).not.toBeNull();
    expect(media![1]).toMatch(/#neighborhood \.tagline\s*\{\s*display:\s*none;?\s*\}/);
    expect(css()).not.toMatch(/max-width:\s*480px/);
  });

  test("CSS: the bar is still 24px, #330066, #ffffcc, Times New Roman 13px", () => {
    const r = rule("#neighborhood")!;
    expect(r).toMatch(/height:\s*24px/);
    expect(r).toMatch(/background:\s*#330066/);
    expect(r).toMatch(/color:\s*#ffffcc/);
    expect(r).toMatch(/font:\s*13px\s+"Times New Roman"/);
    expect(r).toMatch(/box-shadow:\s*inset 0 -1px 0 #6633cc/);
    expect(r).toMatch(/justify-content:\s*space-between/);
  });

  test("CSS: the tagline adds no new colour or font", () => {
    for (const sel of ["#neighborhood .where", "#neighborhood .tagline", "#neighborhood .sign"]) {
      const r = rule(sel)!;
      expect(r).not.toMatch(/#[0-9a-f]{3,6}|color|font|rgb|hsl/i);
    }
  });

  test("tagline text meets 4.5:1 against the bar", () => {
    expect(contrast("#ffffcc", "#330066")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the bar in the rendered costume", () => {
  test("renderCostume shows the address of the page host", () => {
    const doc = page("https://www.Shop.Example.com/a/b?c");
    const root = renderCostume(doc);
    const n = resolveNeighborhood("shop.example.com");
    expect(n.name).toBe("WallStreet");
    const bar = root.getElementById("neighborhood")!;
    expect(bar.querySelector(".where")!.textContent).toBe(`You are in: ${n.address}`);
    expect(bar.querySelector(".tagline")!.textContent).toBe(n.tagline);
    expect(doc.querySelector(HOST_TAG)).not.toBeNull();
  });

  test("it resolves the host once per render", () => {
    const spy = spyOn(resolver, "resolveNeighborhood");
    try {
      const doc = page("https://news.example.org/");
      renderCostume(doc);
      renderCostume(doc); // idempotent: the same costume, no second resolve
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("news.example.org");
    } finally {
      spy.mockRestore();
    }
  });
});
