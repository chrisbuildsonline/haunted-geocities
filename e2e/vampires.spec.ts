// Runtime vampires, detection side, on fixtures/vampires.html: two scripts (a real tracker domain
// with fingerprinting score 0, and an unlisted host) fingerprint the visitor when the email field
// takes focus. The haunt goes through the router's real HAUNT path (sent from the popup page), so
// the MAIN-world hooks are injected by the background exactly as in production.
import { expect, fixture, openPopup, tabIdOf, test, VAMPIRE_HOSTS } from "./fixtures";
import type { CompanyHit } from "../src/data/types";

const WRAPPED = [
  ["HTMLCanvasElement", "toDataURL"],
  ["HTMLCanvasElement", "toBlob"],
  ["CanvasRenderingContext2D", "getImageData"],
  ["CanvasRenderingContext2D", "measureText"],
  ["OfflineAudioContext", "startRendering"],
] as const;

test("scripts caught fingerprinting become vampires; the page is not changed and is restored byte for byte", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.goto(fixture("vampires.html"));
  const tabId = await tabIdOf(sw, page);

  // Before: a drawn canvas, the five prototype functions, and the markup.
  const before = await page.evaluate((wrapped) => {
    const w = window as unknown as Record<string, any>;
    w.__originals = wrapped.map(([cls, fn]) => w[cls].prototype[fn]);
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 30;
    const ctx = c.getContext("2d")!;
    ctx.font = "16px sans-serif";
    ctx.fillText("Haunted GeoCities", 4, 20);
    w.__drawn = c;
    return { dataUrl: c.toDataURL(), html: document.documentElement.outerHTML, toStrings: w.__originals.map((f: Function) => f.toString()) };
  }, WRAPPED);

  const popup = await openPopup(context, extensionId, tabId);
  const send = (type: "HAUNT" | "UNHAUNT") => popup.evaluate(([t, id]) => chrome.runtime.sendMessage({ type: t, tabId: id }), [type, tabId] as const);
  expect(await send("HAUNT")).toMatchObject({ haunted: true });
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  const nonce = await sw.evaluate(async (id) => (await chrome.storage.session.get(`nonce:${id}`))[`nonce:${id}`], tabId);
  expect(nonce).toMatch(/^[0-9a-f-]{36}$/);

  // Nothing was put on window, and the wrapped functions look like the originals.
  const hooked = await page.evaluate((wrapped) => {
    const w = window as unknown as Record<string, any>;
    return {
      globals: Object.getOwnPropertyNames(window).filter((k) => /^__hg|nonce/i.test(k)),
      replaced: wrapped.map(([cls, fn], i) => w[cls].prototype[fn] !== w.__originals[i]),
      toStrings: wrapped.map(([cls, fn]) => w[cls].prototype[fn].toString()),
      names: wrapped.map(([cls, fn]) => w[cls].prototype[fn].name),
    };
  }, WRAPPED);
  expect(hooked.globals).toEqual([]);
  expect(hooked.replaced).toEqual([true, true, true, true, true]);
  expect(hooked.toStrings).toEqual(before.toStrings);
  expect(hooked.names).toEqual(WRAPPED.map(([, fn]) => fn));

  // Both scripts fingerprint when the email field takes focus.
  await page.locator("#email").focus();
  await page.waitForFunction(() => (window as unknown as { fpDone: number }).fpDone === 2);

  const reported = async () =>
    sw.evaluate(async (id) => ((await chrome.storage.session.get(`ghosts:${id}`))[`ghosts:${id}`] as { companies: CompanyHit[] } | undefined)?.companies ?? [], tabId);
  const caught = async (name: string) => (await reported()).find((c) => c.company === name)?.vampire;
  const all = ["canvas", "audio", "fonts"];
  await expect.poll(async () => (await caught("AdTheorent"))?.caught.slice().sort()).toEqual([...all].sort());
  await expect.poll(async () => (await caught(VAMPIRE_HOSTS.unlisted))?.caught.slice().sort()).toEqual([...all].sort());

  const companies = await reported();
  const tracker = companies.find((c) => c.company === "AdTheorent")!;
  expect(tracker).toMatchObject({ domains: [VAMPIRE_HOSTS.tracker], fingerprinting: 0, vampire: { knownOnly: false } });
  expect(tracker.count).toBeGreaterThan(0);
  expect(companies.find((c) => c.company === VAMPIRE_HOSTS.unlisted)).toEqual({
    company: VAMPIRE_HOSTS.unlisted,
    domains: [VAMPIRE_HOSTS.unlisted],
    count: 0,
    categories: [],
    fingerprinting: 0,
    vampire: { caught: expect.arrayContaining(all), knownOnly: false },
  });
  expect(companies.map((c) => c.company).sort()).toEqual(["AdTheorent", VAMPIRE_HOSTS.unlisted]); // the page itself is first party

  // The wrappers hand back exactly what the originals would.
  expect(await page.evaluate(() => (window as unknown as { __drawn: HTMLCanvasElement }).__drawn.toDataURL())).toBe(before.dataUrl);

  // An unlisted host can never get a block rule, even when it asks.
  await popup.evaluate(
    ([id, host]) => chrome.runtime.sendMessage({ type: "EXORCISE", tabId: id, company: host, domains: [host] }),
    [tabId, VAMPIRE_HOSTS.unlisted] as const,
  );
  expect(await sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBe(0);

  // Un-haunt restores the originals (identity-equal) and the markup.
  expect(await send("UNHAUNT")).toMatchObject({ haunted: false });
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  const after = await page.evaluate((wrapped) => {
    const w = window as unknown as Record<string, any>;
    return { same: wrapped.map(([cls, fn], i) => w[cls].prototype[fn] === w.__originals[i]), html: document.documentElement.outerHTML };
  }, WRAPPED);
  expect(after.same).toEqual([true, true, true, true, true]);
  expect(after.html).toBe(before.html);
  expect(await sw.evaluate(async (id) => `nonce:${id}` in (await chrome.storage.session.get(`nonce:${id}`)), tabId)).toBe(false);

  // Haunting again installs afresh and catches again.
  await send("HAUNT");
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  expect(await page.evaluate(() => HTMLCanvasElement.prototype.toDataURL === (window as unknown as { __originals: unknown[] }).__originals[0])).toBe(false);
  await send("UNHAUNT");
  await expect(page.locator("hg-crypt")).toHaveCount(0);
  expect(await page.evaluate(() => HTMLCanvasElement.prototype.toDataURL === (window as unknown as { __originals: unknown[] }).__originals[0])).toBe(true);
});
