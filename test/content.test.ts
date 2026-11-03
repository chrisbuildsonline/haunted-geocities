import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { HOST_TAG, haunt, unhaunt } from "../src/content/overlay";

const PAGE = `<!doctype html><html lang="en"><head><title>t</title><style>p{color:red}</style></head>
<body><h1>Hello</h1><p>Text</p><form action="/x"><input name="q"><button>Go</button></form></body></html>`;

const page = () => {
  const win = new Window({ url: "https://example.org/" });
  win.document.write(PAGE);
  return win.document as unknown as Document;
};
const hosts = (doc: Document) => doc.documentElement.querySelectorAll(HOST_TAG);

describe("content overlay", () => {
  test("the host tag is hg-crypt", () => expect(HOST_TAG).toBe("hg-crypt"));

  test("haunt appends one <hg-crypt> as the last child of <html> with a closed shadow root", () => {
    const doc = page();
    const root = haunt(doc);
    const host = doc.documentElement.lastElementChild!;
    expect(host.localName).toBe("hg-crypt");
    expect(host.shadowRoot).toBeNull(); // closed: invisible to the page
    expect(root.mode).toBe("closed");
    expect(root.host).toBe(host);
  });

  test("haunt is idempotent and returns the same shadow root", () => {
    const doc = page();
    const a = haunt(doc);
    const b = haunt(doc);
    expect(a).toBe(b);
    expect(hosts(doc)).toHaveLength(1);
  });

  test("host styling lives in a sheet adopted inside the shadow root, not on host attributes", () => {
    const doc = page();
    const root = haunt(doc);
    const host = root.host;
    expect(host.getAttributeNames()).toEqual([]);
    expect(root.adoptedStyleSheets).toHaveLength(1);
    const css = [...root.adoptedStyleSheets[0]!.cssRules].map((r) => r.cssText).join("\n");
    expect(css).toContain(":host");
    for (const decl of ["position: fixed", "pointer-events: none", "z-index: 2147483647"]) {
      expect(css).toContain(decl);
    }
    expect(css).toMatch(/inset: 0(px)?/);
    expect(doc.adoptedStyleSheets).toHaveLength(0);
  });

  test("haunt does not touch any other page node", () => {
    const doc = page();
    const before = doc.body.outerHTML;
    const headBefore = doc.head.outerHTML;
    haunt(doc);
    expect(doc.body.outerHTML).toBe(before);
    expect(doc.head.outerHTML).toBe(headBefore);
  });

  test("unhaunt removes the host and restores documentElement.outerHTML byte for byte", () => {
    const doc = page();
    const before = doc.documentElement.outerHTML;
    haunt(doc);
    expect(doc.documentElement.outerHTML).not.toBe(before);
    unhaunt(doc);
    expect(hosts(doc)).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  test("unhaunt without a haunt is a no-op", () => {
    const doc = page();
    const before = doc.documentElement.outerHTML;
    unhaunt(doc);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  test("haunt after unhaunt creates a fresh overlay", () => {
    const doc = page();
    const a = haunt(doc);
    unhaunt(doc);
    const b = haunt(doc);
    expect(b).not.toBe(a);
    expect(hosts(doc)).toHaveLength(1);
  });

  test("an <hg-crypt> the page made itself is left alone", () => {
    const doc = page();
    const own = doc.createElement("hg-crypt");
    doc.body.appendChild(own);
    haunt(doc);
    unhaunt(doc);
    expect(own.isConnected).toBe(true);
  });
});
