// Runtime vampires, detection side, on fixtures/vampires.html: two scripts (a real tracker domain
// with fingerprinting score 0, and an unlisted host) fingerprint the visitor when the email field
// takes focus. The haunt goes through the router's real HAUNT path (sent from the popup page), so
// the MAIN-world hooks are injected by the background exactly as in production.
import { expect, fixture, openPopup, shadowOf, tabIdOf, test, VAMPIRE_HOSTS } from "./fixtures";
import type { CompanyHit } from "../src/data/types";

const SHOTS = "test-results/vampire";

const WRAPPED = [
  ["HTMLCanvasElement", "toDataURL"],
  ["HTMLCanvasElement", "toBlob"],
  ["CanvasRenderingContext2D", "getImageData"],
  ["CanvasRenderingContext2D", "measureText"],
  ["OfflineAudioContext", "startRendering"],
] as const;

test("scripts caught fingerprinting become vampires; the page is not changed and is restored byte for byte", async ({ context, sw, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
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

  // Page screenshots use caret: "initial": the default caret hiding writes style="" on the focused #email.
  // What a person sees: both vampires in the gutter lanes, inside the closed shadow root, off the text.
  await page.bringToFront();
  const inShadow = await shadowOf(page);
  const lanes = () =>
    inShadow(function () {
      const vs = [...this.querySelectorAll<HTMLElement>("#lanes .vampire")];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const text: DOMRect[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        text.push(...[...r.getClientRects()].filter((x) => x.width > 0));
      }
      return {
        companies: vs.map((v) => v.dataset.company),
        ghosts: this.querySelectorAll("#lanes .ghost").length,
        tags: vs.map((v) => v.querySelector(".tag")!.textContent),
        known: vs.filter((v) => v.classList.contains("known")).length,
        focusable: vs.every((v) => v.localName === "button" && v.tabIndex === 0),
        // rounded: the 3000ms drift transform leaves sub-pixel float noise in the rect
        size: vs.map((v) => { const r = v.querySelector("svg")!.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
        glow: vs.map((v) => getComputedStyle(v.querySelector(".sprite")!).filter),
        overlaps: vs.filter((v) => {
          const b = v.getBoundingClientRect();
          return text.some((t) => t.left < b.right && t.right > b.left && t.top < b.bottom && t.bottom > b.top);
        }).length,
        hudVampires: this.querySelector("#hud .count.vampires .n")?.textContent,
      };
    });
  await expect.poll(async () => (await lanes()).companies).toEqual(["AdTheorent", VAMPIRE_HOSTS.unlisted]);
  await page.waitForTimeout(700); // the arrival fade and glow swell settle
  const look = await lanes();
  expect(look).toMatchObject({ ghosts: 0, tags: ["AdTheorent", VAMPIRE_HOSTS.unlisted], known: 0, focusable: true, size: [[48, 54], [48, 54]], overlaps: 0, hudVampires: "2" });
  for (const g of look.glow) expect(g).toBe("drop-shadow(rgb(255, 0, 51) 0px 0px 6px) drop-shadow(rgb(255, 153, 153) 0px 0px 2px)");
  await page.screenshot({ path: `${SHOTS}/desktop-1280-lanes.png`, caret: "initial" });

  // The card: hot title bar, the host, what was caught, the honest line, Exorcise <company>.
  const center = (sel: string) =>
    inShadow(function (s: string) {
      const r = this.querySelector(s)!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
  const card = () =>
    inShadow(function () {
      const c = this.querySelector<HTMLElement>("#cards .card");
      return c && { title: c.querySelector("h2")!.textContent, bar: getComputedStyle(c.querySelector(".bar")!).backgroundColor, text: c.innerText, act: c.querySelector(".act")?.textContent ?? null, focused: c.contains(this.activeElement), right: c.getBoundingClientRect().right };
    });
  let at = await center('#lanes .vampire[data-company="AdTheorent"]');
  await page.mouse.click(at.x, at.y);
  const adCard = (await card())!;
  expect(adCard).toMatchObject({ title: "Vampire identified", bar: "rgb(102, 0, 0)", act: "Exorcise AdTheorent", focused: true });
  expect(adCard.text).toContain(VAMPIRE_HOSTS.tracker);
  expect(adCard.text).toContain("Caught doing: canvas readback · AudioContext · font probing");
  expect(adCard.text).toContain("Caught since you haunted this page");
  expect(adCard.text).toContain("Fingerprinting reads");
  expect(adCard.right).toBeLessThanOrEqual(1280);
  await expect.poll(() => inShadow(function () {
    return getComputedStyle(this.querySelector("#cards .card")!).opacity;
  })).toBe("1");
  await page.screenshot({ path: `${SHOTS}/desktop-1280-card.png`, caret: "initial" });
  await page.keyboard.press("Escape");
  expect(await card()).toBeNull();
  expect(await inShadow(function () {
    return (this.activeElement as HTMLElement | null)?.dataset.company;
  })).toBe("AdTheorent");

  // An unlisted host: named by its host, no Exorcise.
  at = await center(`#lanes .vampire[data-company="${VAMPIRE_HOSTS.unlisted}"]`);
  await page.mouse.click(at.x, at.y);
  const owl = (await card())!;
  expect(owl).toMatchObject({ title: "Vampire identified", act: null, focused: true });
  expect(owl.text).toContain(VAMPIRE_HOSTS.unlisted);
  expect(owl.text).toContain("Caught since you haunted this page");
  await expect.poll(() => inShadow(function () {
    return getComputedStyle(this.querySelector("#cards .card")!).opacity;
  })).toBe("1");
  await page.screenshot({ path: `${SHOTS}/desktop-1280-card-unlisted.png`, caret: "initial" });
  await page.keyboard.press("Escape");

  // The popup lists them after the (zero) ghosts with Caught pills; Exorcise only for the tracker company.
  await popup.bringToFront();
  const rows = () =>
    popup.locator(".vampire-row").evaluateAll((rs) =>
      rs.map((r) => [r.querySelector(".row-title")!.textContent, r.querySelector(".tag-pill")!.textContent, r.querySelector(".row-sub")!.textContent, r.querySelector("button")?.textContent ?? null]),
    );
  await expect.poll(rows).toEqual([
    ["AdTheorent", "Caught", "Canvas readback · AudioContext · font probing", "Exorcise"],
    [VAMPIRE_HOSTS.unlisted, "Caught", "Canvas readback · AudioContext · font probing", null],
  ]);
  // At 360px a person can read who was caught and what it did: no name or caught line is cut off, and the line stays muted.
  const cut = await popup.locator(".vampire-row").evaluateAll((rs) =>
    rs.flatMap((r) => [...r.querySelectorAll<HTMLElement>(".row-title, .row-sub")].filter((e) => e.scrollWidth > e.clientWidth).map((e) => `${e.className}: ${e.textContent}`)),
  );
  expect(cut).toEqual([]);
  expect(await popup.locator(".vampire-row .row-sub").evaluateAll((ss) => ss.map((s) => getComputedStyle(s).color))).toEqual(["rgb(91, 97, 112)", "rgb(91, 97, 112)"]);
  await expect(popup.locator('[data-count="ghosts"] .num')).toHaveText("0");
  await expect(popup.locator('[data-count="vampires"] .num')).toHaveText("2");
  expect(await popup.locator(".tag-pill.caught").first().evaluate((p) => [getComputedStyle(p).backgroundColor, getComputedStyle(p).color])).toEqual(["rgb(241, 236, 251)", "rgb(102, 51, 204)"]);
  await popup.screenshot({ path: `${SHOTS}/popup-360.png`, fullPage: true });

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
