import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { detectDarkPatterns, type DarkPattern } from "../../src/content/dark-patterns";

const docOf = (body: string, head = "") => {
  const win = new Window({ url: "https://shop.test/" });
  win.document.head.innerHTML = head;
  win.document.body.innerHTML = body;
  return win.document as unknown as Document;
};
const detect = (body: string, head = "") => detectDarkPatterns(docOf(body, head), "hg-crypt");
const kinds = (ps: DarkPattern[]) => ps.map((p) => p.kind);
const snippets = (ps: DarkPattern[]) => ps.map((p) => p.snippet);

describe("module", () => {
  test("module imports with no chrome global", async () => {
    expect((globalThis as any).chrome).toBeUndefined();
    expect(typeof (await import("../../src/content/dark-patterns")).detectDarkPatterns).toBe("function");
  });
  test("returns [] for a page with no patterns", () => {
    expect(detect(`<h1>Hello</h1><p>A quiet page about coffee.</p>`)).toEqual([]);
  });
});

describe("skip rules", () => {
  test("skips the costume host", () => {
    expect(detect(`<hg-crypt><p>Only 2 left</p><button>No thanks, I hate saving money</button></hg-crypt>`)).toEqual([]);
  });
  test("skips script, style, noscript, template and head text", () => {
    const body = `<script>/* Only 1 left */</script><style>/* Only 1 left */</style><noscript>Only 1 left</noscript><template>Only 1 left</template>`;
    expect(detect(body, `<title>Only 2 left</title>`)).toEqual([]);
  });
  test("skips hidden, aria-hidden and display:none subtrees", () => {
    const body = `<p hidden>Only 1 left</p><div aria-hidden="true"><p>Only 1 left</p></div><div style="display: none"><p>Only 1 left</p></div><div style="display:none"><b>Offer ends in 3 hours</b></div>`;
    expect(detect(body)).toEqual([]);
  });
  test("skips text under visibility:hidden but keeps a visible child", () => {
    expect(detect(`<p style="visibility:hidden">Only 1 left</p>`)).toEqual([]);
    const ps = detect(`<div style="visibility:hidden"><p style="visibility:visible">Only 3 left</p></div>`);
    expect(kinds(ps)).toEqual(["scarcity"]);
  });
  test("skips a checked newsletter box inside a skipped node", () => {
    expect(detect(`<div hidden><label><input type="checkbox" checked> Newsletter</label></div>`)).toEqual([]);
    expect(detect(`<div style="display:none"><button>No thanks, I hate saving money</button></div>`)).toEqual([]);
  });
});

describe("flows and locate", () => {
  test("Only <b>2</b> left matches on the <p>", () => {
    const [p] = detect(`<p id="a">Only <b>2</b> left in stock!</p>`);
    expect(p!.kind).toBe("scarcity");
    expect(p!.element.id).toBe("a");
    expect(p!.snippet).toBe("Only 2 left in stock!");
  });
  test("matches when em and strong split the words", () => {
    const ps = detect(`<p id="a"><em>Only</em> <strong>2</strong> <em>left</em></p>`);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.element.id).toBe("a");
  });
  test("reports the b when the whole phrase is inside it", () => {
    const [p] = detect(`<p>Sale <b id="b">Only 2 left</b></p>`);
    expect(p!.element.id).toBe("b");
  });
  test("reports the p for nested spans", () => {
    const [p] = detect(`<p id="a">Only <span><b>2</b></span> left</p>`);
    expect(p!.element.id).toBe("a");
  });
  test("a phrase split across two p elements does not match", () => {
    expect(detect(`<p>Only 2</p><p>left in stock</p>`)).toEqual([]);
    expect(detect(`<div>Only 2<div>left</div></div>`)).toEqual([]);
  });
  test("a br between words counts as a space", () => {
    expect(kinds(detect(`<p>Only<br>2<br>left</p>`))).toEqual(["scarcity"]);
  });
  test("one match per kind per block", () => {
    const ps = detect(`<p>Only 2 left. Only 3 left. Low stock.</p>`);
    expect(ps).toHaveLength(1);
  });
});

describe("scarcity", () => {
  test("scarcity: Only 2 left, just 3 items remaining, 12 people are viewing, Low stock", () => {
    const texts = ["Only 2 left", "just 3 items remaining", "12 people are viewing this blend", "Low stock", "Only 5 rooms available", "Selling fast", "Only 4 in stock"];
    for (const t of texts) expect(kinds(detect(`<p>${t}</p>`))).toEqual(["scarcity"]);
  });
  test("scarcity ignores case and extra whitespace", () => {
    expect(kinds(detect(`<p>ONLY   2\n  LEFT</p>`))).toEqual(["scarcity"]);
    expect(kinds(detect(`<p>only 2 Left</p>`))).toEqual(["scarcity"]);
  });
  test("scarcity: Only the best coffee, Just 2 minutes from the station and Left-handed mugs do not match", () => {
    for (const t of ["Only the best coffee", "Just 2 minutes from the station", "Left-handed mugs ship free."]) expect(detect(`<p>${t}</p>`)).toEqual([]);
  });
});

describe("countdown", () => {
  test("countdown: Offer ends in 3 hours, Ends in 15 min, Limited-time offer, 2 hours left", () => {
    for (const t of ["Offer ends in 3 hours", "Ends in 15 min", "Limited-time offer", "2 hours left", "Sale expires today"]) expect(kinds(detect(`<p>${t}</p>`))).toEqual(["countdown"]);
  });
  test("countdown: Limited time offer with a tab, a space and a newline between words", () => {
    expect(kinds(detect('<p><b>LIMITED\t time \n offer</b> Thanks for visiting.</p>'))).toEqual(["countdown"]);
  });
  test("countdown: Our road ends in a cul-de-sac and Open daily 09:00 to 17:30 do not match", () => {
    for (const t of ["Our road ends in a cul-de-sac", "Open daily 09:00 to 17:30"]) expect(detect(`<p>${t}</p>`)).toEqual([]);
  });
});

describe("confirmshaming", () => {
  const one = (html: string) => kinds(detect(html));
  test("confirmshaming: No thanks, I hate saving money", () => expect(one(`<a href="#">No thanks, I hate saving money</a>`)).toEqual(["confirmshaming"]));
  test("confirmshaming: No, I prefer paying full price", () => expect(one(`<button>No, I prefer paying full price</button>`)).toEqual(["confirmshaming"]));
  test("confirmshaming: Maybe later, I don't like deals", () => expect(one(`<a role="button">Maybe later, I don't like deals</a>`)).toEqual(["confirmshaming"]));
  test("confirmshaming: No thanks, I'll pay full price", () => expect(one(`<button>No thanks, I'll pay full price</button>`)).toEqual(["confirmshaming"]));
  test("confirmshaming on an input[type=submit] value", () => {
    expect(one(`<input type="submit" value="No thanks, I hate saving money">`)).toEqual(["confirmshaming"]);
    expect(one(`<input type="button" value="No thanks, I hate saving money">`)).toEqual(["confirmshaming"]);
  });
  test("plain declines do not match: No thanks, No, thanks, Not now, Maybe later, Skip, Close, No thanks, I'm good", () => {
    for (const t of ["No thanks", "No, thanks", "Not now", "Maybe later", "Skip", "Close", "No thanks, I'm good"]) expect(one(`<button>${t}</button>`)).toEqual([]);
  });
  test("a long paragraph starting with No is not a decline control", () => {
    const long = "No thanks, I hate saving money " + "and this goes on ".repeat(8);
    expect(one(`<a href="#">${long}</a>`)).toEqual([]);
    expect(one(`<p>No thanks, I hate saving money</p>`)).toEqual([]);
  });
});

describe("prechecked", () => {
  test("prechecked: wrapping label with newsletter", () => {
    const ps = detect(`<label id="l"><input type="checkbox" checked> Send me the newsletter</label>`);
    expect(kinds(ps)).toEqual(["prechecked"]);
  });
  test("prechecked: label for= with partners", () => {
    const ps = detect(`<input type="checkbox" id="p" checked><label for="p">Share with our partners</label>`);
    expect(kinds(ps)).toEqual(["prechecked"]);
  });
  test("prechecked: aria-label with subscribe", () => {
    const ps = detect(`<input type="checkbox" checked aria-label="Subscribe to updates">`);
    expect(kinds(ps)).toEqual(["prechecked"]);
    expect(ps[0]!.element.tagName).toBe("INPUT");
  });
  test("prechecked reports the label element", () => {
    const [p] = detect(`<label id="l"><input type="checkbox" checked> Yes, send me the newsletter and partner offers</label>`);
    expect(p!.element.id).toBe("l");
    expect(p!.snippet).toBe("Yes, send me the newsletter and partner offers");
    const [q] = detect(`<input type="checkbox" id="p" checked><label id="lab" for="p">Marketing emails</label>`);
    expect(q!.element.id).toBe("lab");
  });
  test("prechecked reads the attribute, not the property", () => {
    const doc = docOf(`<label><input id="c" type="checkbox" checked> Newsletter</label>`);
    (doc.getElementById("c") as HTMLInputElement).checked = false;
    expect(kinds(detectDarkPatterns(doc, "hg-crypt"))).toEqual(["prechecked"]);
    const doc2 = docOf(`<label><input id="c" type="checkbox"> Newsletter</label>`);
    (doc2.getElementById("c") as HTMLInputElement).checked = true;
    expect(detectDarkPatterns(doc2, "hg-crypt")).toEqual([]);
  });
  test("no match: Remember my cart (checked), Email me when it is back (unchecked), checked box with no label text", () => {
    expect(detect(`<label><input type="checkbox" checked> Remember my cart</label>`)).toEqual([]);
    expect(detect(`<label><input type="checkbox"> Email me when it is back</label>`)).toEqual([]);
    expect(detect(`<input type="checkbox" checked>`)).toEqual([]);
  });
  test("an id with selector characters finds its label", () => {
    const ps = detect(`<input type="checkbox" id="a.b[c]" checked><label for="a.b[c]">Newsletter</label>`);
    expect(kinds(ps)).toEqual(["prechecked"]);
  });
  test("one curse for a label that wraps two checked boxes", () => {
    expect(detect(`<label><input type="checkbox" checked><input type="checkbox" checked> Newsletter</label>`)).toHaveLength(1);
  });
});

describe("snippet, precedence, order and cap", () => {
  test("snippet is the collapsed element text", () => {
    const [p] = detect(`<p>  Only\n  <b>2</b>   left   in stock!  </p>`);
    expect(p!.snippet).toBe("Only 2 left in stock!");
  });
  test("a short snippet keeps the words before the match", () => {
    const [p] = detect(`<p>Hurry! Only 2 left</p>`);
    expect(p!.snippet).toBe("Hurry! Only 2 left");
  });
  test("snippet is at most 60 characters and ends in … when cut", () => {
    const [p] = detect(`<p>Only 2 left ${"very ".repeat(30)}</p>`);
    expect(p!.snippet.length).toBe(60);
    expect(p!.snippet.endsWith("…")).toBe(true);
  });
  test("a cut scarcity snippet starts at the match", () => {
    const [p] = detect(`<p>${"Welcome to our lovely little shop. ".repeat(3)}Only 2 left ${"very ".repeat(30)}</p>`);
    expect(p!.snippet.startsWith("Only 2 left")).toBe(true);
    expect(p!.snippet.length).toBe(60);
  });
  test("a cut confirmshaming snippet starts at the text start", () => {
    const [p] = detect(`<a href="#">No thanks, I hate saving money, deals, discounts, and bargains of all kinds</a>`);
    expect(p!.kind).toBe("confirmshaming");
    expect(p!.snippet.startsWith("No thanks, I hate")).toBe(true);
    expect(p!.snippet.length).toBe(60);
  });
  test("scarcity wins over countdown on the same element", () => {
    const ps = detect(`<p>Only 2 left. Offer ends in 3 hours.</p>`);
    expect(kinds(ps)).toEqual(["scarcity"]);
  });
  test("prechecked wins over scarcity on the same label", () => {
    const ps = detect(`<label id="l"><input type="checkbox" checked> Newsletter. Only 2 left</label>`);
    expect(kinds(ps)).toEqual(["prechecked"]);
  });
  test("returns at most 30 patterns in document order", () => {
    const body = Array.from({ length: 40 }, (_, i) => `<p id="p${i}">Only ${i + 1} left</p>`).join("");
    const ps = detect(body);
    expect(ps).toHaveLength(30);
    expect(ps.map((p) => p.element.id)).toEqual(Array.from({ length: 30 }, (_, i) => `p${i}`));
  });
  test("results mix kinds in document order", () => {
    const ps = detect(`<a href="#">No thanks, I hate saving money</a><p>Only 2 left</p><label><input type="checkbox" checked> Newsletter</label>`);
    expect(kinds(ps)).toEqual(["confirmshaming", "scarcity", "prechecked"]);
    expect(snippets(ps)[1]).toBe("Only 2 left");
  });
});

describe("read-only", () => {
  test("outerHTML is identical before and after detectDarkPatterns", () => {
    const doc = docOf(`<p>Only <b>2</b> left</p><label><input type="checkbox" checked> Newsletter</label><a href="#">No thanks, I hate saving money</a>`);
    const before = doc.documentElement.outerHTML;
    detectDarkPatterns(doc, "hg-crypt");
    expect(doc.documentElement.outerHTML).toBe(before);
  });
  test("calling it twice returns equal results", () => {
    const doc = docOf(`<p>Only <b>2</b> left</p><p>Offer ends in 3 hours</p>`);
    const a = detectDarkPatterns(doc, "hg-crypt");
    const b = detectDarkPatterns(doc, "hg-crypt");
    expect(b.map((p) => [p.kind, p.element, p.snippet])).toEqual(a.map((p) => [p.kind, p.element, p.snippet]));
  });
  test("a checked box is still checked, attribute and property", () => {
    const doc = docOf(`<label><input id="c" type="checkbox" checked> Newsletter</label>`);
    detectDarkPatterns(doc, "hg-crypt");
    const c = doc.getElementById("c") as HTMLInputElement;
    expect(c.checked).toBe(true);
    expect(c.hasAttribute("checked")).toBe(true);
  });
  test("a root element limits the search", () => {
    const doc = docOf(`<p>Only 2 left</p><div id="r"><p>Only 3 left</p></div>`);
    const ps = detectDarkPatterns(doc.getElementById("r")!, "hg-crypt");
    expect(snippets(ps)).toEqual(["Only 3 left"]);
  });
});
