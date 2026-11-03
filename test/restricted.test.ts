import { describe, expect, test } from "bun:test";
import { isRestrictedUrl } from "../src/background/restricted";

describe("isRestrictedUrl", () => {
  for (const url of [
    "chrome://version",
    "chrome://extensions/",
    "chrome-extension://abcdefghijklmnop/popup.html",
    "edge://settings",
    "about:blank",
    "about:newtab",
    "view-source:https://example.org/",
    "https://chromewebstore.google.com/detail/foo/abc",
    "https://chrome.google.com/webstore/category/extensions",
    "devtools://devtools/bundled/inspector.html",
  ]) {
    test(`restricts ${url}`, () => expect(isRestrictedUrl(url, true)).toBe(true));
  }

  for (const url of [
    "https://example.org/",
    "http://127.0.0.1:4321/index.html",
    "https://chrome.google.com/search",
    "https://notchromewebstore.google.com.example.org/",
    "https://example.org/?next=chrome://version",
  ]) {
    test(`allows ${url}`, () => expect(isRestrictedUrl(url, false)).toBe(false));
  }

  test("file:// is restricted without file access", () => {
    expect(isRestrictedUrl("file:///home/me/page.html", false)).toBe(true);
  });
  test("file:// is allowed with file access", () => {
    expect(isRestrictedUrl("file:///home/me/page.html", true)).toBe(false);
  });
  test("an unknown or unreadable URL is restricted (no access to the tab)", () => {
    expect(isRestrictedUrl(undefined, true)).toBe(true);
    expect(isRestrictedUrl("", true)).toBe(true);
    expect(isRestrictedUrl("not a url", true)).toBe(true);
  });
  test("data: and blob: pages are restricted", () => {
    expect(isRestrictedUrl("data:text/html,hi", true)).toBe(true);
    expect(isRestrictedUrl("blob:https://example.org/1234", true)).toBe(true);
  });
});
