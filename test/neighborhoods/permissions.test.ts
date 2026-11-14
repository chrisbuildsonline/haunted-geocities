import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createSettings, LINK_SUB } from "../../src/popup/settings";
import { LINK_CHECK_ORIGINS } from "../../src/data/types";
import { asChrome, createChromeMock, type ChromeMock } from "../chrome-mock";

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

function newDoc(url = "chrome-extension://test-extension-id/popup.html") {
  const win = new Window({ url });
  return { win, doc: win.document as unknown as Document };
}

async function popup(m: ChromeMock = createChromeMock()) {
  const { doc } = newDoc();
  const surface = await createSettings(doc, asChrome(m));
  doc.body.append(surface);
  const input = surface.querySelector<HTMLInputElement>("#link-check")!;
  const sub = surface.querySelector("#link-check-sub")!;
  return { m, doc, input, sub };
}
const grantAll = (m: ChromeMock) => LINK_CHECK_ORIGINS.forEach((o) => m.granted.add(o));

describe("popup: switching on", () => {
  test("switching on opens permissions.html in a new tab", async () => {
    const { m, input } = await popup();
    input.click();
    await flush();
    expect(m.calls.createTab).toEqual([{ url: "chrome-extension://test-extension-id/permissions.html" }]);
  });
  test("the popup never calls permissions.request", async () => {
    const { m, input } = await popup(createChromeMock({ grant: true }));
    input.click();
    await flush();
    expect(m.calls.request).toEqual([]);
  });
  test("the switch goes back to off and the sub line asks to finish on the new page", async () => {
    const { input, sub } = await popup();
    input.click();
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Finish on the page that just opened.");
    expect(LINK_SUB.ask).toBe("Finish on the page that just opened.");
    expect("denied" in LINK_SUB).toBe(false);
  });
  test("a failed tabs.create restores the off line", async () => {
    const m = createChromeMock();
    m.createTabFail = true;
    const { input, sub } = await popup(m);
    input.click();
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
});

describe("popup: switching off and following the permission", () => {
  test("switching off removes the permission and shows the off line", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { input, sub } = await popup(m);
    input.click();
    await flush();
    expect(m.calls.remove).toEqual([{ origins: LINK_CHECK_ORIGINS }]);
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("the switch is on when contains answers true", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { input, sub } = await popup(m);
    expect(input.checked).toBe(true);
    expect(sub.textContent).toBe("Checking links on other sites too.");
  });
  test("the switch is off when contains answers false or rejects", async () => {
    const off = await popup();
    expect(off.input.checked).toBe(false);
    const m = createChromeMock();
    m.chrome.permissions.contains = async () => {
      throw new Error("nope");
    };
    const rejected = await popup(m);
    expect(rejected.input.checked).toBe(false);
    expect(rejected.sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("each new popup reads contains again", async () => {
    const m = createChromeMock();
    expect((await popup(m)).input.checked).toBe(false);
    grantAll(m);
    expect((await popup(m)).input.checked).toBe(true);
  });
  test("onAdded for the link-check origins turns the switch on", async () => {
    const { m, input, sub } = await popup();
    grantAll(m);
    for (const l of m.chrome.permissions.onAdded.listeners) l({ origins: LINK_CHECK_ORIGINS });
    await flush();
    expect(input.checked).toBe(true);
    expect(sub.textContent).toBe("Checking links on other sites too.");
  });
  test("onRemoved for the link-check origins turns it off", async () => {
    const m = createChromeMock();
    grantAll(m);
    const { input, sub } = await popup(m);
    m.granted.clear();
    for (const l of m.chrome.permissions.onRemoved.listeners) l({ origins: LINK_CHECK_ORIGINS });
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Asks Chrome to visit linked sites. Off.");
  });
  test("an onAdded for other permissions is ignored", async () => {
    const { m, input, sub } = await popup();
    input.click();
    await flush();
    grantAll(m); // granted behind the popup's back; the event names no origin
    for (const l of m.chrome.permissions.onAdded.listeners) l({ permissions: ["tabs"] });
    await flush();
    expect(input.checked).toBe(false);
    expect(sub.textContent).toBe("Finish on the page that just opened.");
  });
});
