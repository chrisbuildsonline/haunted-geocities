// Neighborhoods and popup polish (R9), end to end at 1280 and 375: the neighborhood bar and its
// tagline, the popup address line, the toolbar badge, the link-check permission page, distinct hem
// tints, the known vampire row, the card footnote and how long an Exorcise block lasts.
// Every test also fails on any console error (the consoleErrors fixture).
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, fixture, openPopup, shadowOf, tabIdOf, test, TINT_HOSTS, TRACKER_HOSTS, trackerUrl, type InShadow } from "./fixtures";
import { resolveNeighborhood } from "../src/data/neighborhood";
import { assignTints, hemTint } from "../src/content/costume/ghosts";
import { HEM_TINTS } from "../src/content/costume/tokens";
import { LINK_CHECK_ORIGINS } from "../src/data/types";

const WIDTHS = [1280, 375] as const;
const SHOTS = "test-results/neighborhoods";
const LOCAL = resolveNeighborhood("127.0.0.1");
const TINTS = HEM_TINTS as readonly string[];
const SUB = "rgb(51, 51, 51)"; // the #333333 sub-line colour
const ON = "Link checks are on. You can close this tab.";
const REFUSED = "Chrome didn't allow it. Link checks stay off.";
const LINK_OFF = "Asks Chrome to visit linked sites. Off.";
const FOOT = "Blocked on this tab until you un-haunt or leave the page.";

type Ctx = { context: BrowserContext; sw: Worker; extensionId: string };

/** The badge of `tabId` (or of the active tab), read through the service worker. */
async function badgeOf(sw: Worker, tabId?: number) {
  return sw.evaluate(async (id) => {
    const tab = id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!;
    return {
      text: await chrome.action.getBadgeText({ tabId: tab }),
      bg: await chrome.action.getBadgeBackgroundColor({ tabId: tab }),
      fg: await chrome.action.getBadgeTextColor({ tabId: tab }),
    };
  }, tabId);
}
const badgeText = async (sw: Worker, tabId?: number) => (await badgeOf(sw, tabId)).text;

/** A fixture page at `width`, its tab id, and a popup tab that can send it messages. */
async function opened({ context, sw, extensionId }: Ctx, width: number, path: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 800 });
  await page.goto(fixture(path));
  const tabId = await tabIdOf(sw, page);
  const popup = await openPopup(context, extensionId, tabId);
  const send = (msg: Record<string, unknown>) => popup.evaluate((m) => chrome.runtime.sendMessage(m), { ...msg, tabId });
  return { page, tabId, popup, send };
}

/** Haunt through the router's real HAUNT path, then put the page in front. */
async function hauntedPage(ctx: Ctx, width: number, path: string) {
  const o = await opened(ctx, width, path);
  expect(await o.send({ type: "HAUNT" })).toMatchObject({ haunted: true });
  await expect(o.page.locator("hg-crypt")).toHaveCount(1);
  await o.page.bringToFront();
  return o;
}

/** The sum of the four popup tiles (ghosts, vampires, tombstones, curses). */
const tileSum = async (popup: Page) => (await popup.locator("[data-count] .num").allTextContents()).reduce((n, t) => n + Number(t), 0);

/** The one HEM_TINTS colour drawn in an element's SVG markup. */
const tintOf = (html: string) => {
  const found = TINTS.filter((t) => html.toLowerCase().includes(t));
  expect(found).toHaveLength(1);
  return found[0]!;
};

const barLook = (inShadow: InShadow) =>
  inShadow(function () {
    const bar = this.getElementById("neighborhood")!;
    const tag = bar.querySelector<HTMLElement>(".tagline")!;
    const b = bar.querySelector("b")!;
    const sign = bar.querySelector(".sign")!.getBoundingClientRect();
    const r = bar.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(tag);
    const cs = getComputedStyle(tag);
    return {
      where: bar.querySelector(".where")!.textContent,
      tagline: tag.textContent,
      display: cs.display,
      overflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
      tagWidth: tag.getBoundingClientRect().width,
      tagLines: new Set([...range.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size,
      tagCut: tag.scrollWidth > tag.clientWidth,
      addressCut: b.scrollWidth > b.clientWidth,
      height: r.height,
      top: r.top,
      barOverflow: bar.scrollWidth - bar.clientWidth,
      signInside: sign.left >= r.left && sign.right <= r.right + 0.5 && sign.width === 48,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

/** A picture of the bar once the haunt moment has settled. */
const barShot = async (page: Page, inShadow: InShadow, name: string) => {
  await page.waitForTimeout(3100);
  const top = await inShadow(function () { return this.getElementById("neighborhood")!.getBoundingClientRect().top; });
  const vw = page.viewportSize()!.width;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: 0, y: Math.max(0, top - 4), width: vw, height: 64 } });
};

/** permissions.html with chrome.permissions.request replaced (before the page script runs) by a stub answering `answer`. */
async function permissionsPage({ context, extensionId }: Ctx, width: number, answer: boolean) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript((a) => {
    const w = window as unknown as { __asks: { origins: unknown; gesture: boolean }[] };
    w.__asks = [];
    chrome.permissions.request = ((p: chrome.permissions.Permissions) => {
      w.__asks.push({ origins: p.origins, gesture: navigator.userActivation.isActive });
      return Promise.resolve(a);
    }) as typeof chrome.permissions.request;
  }, answer);
  await page.goto(`chrome-extension://${extensionId}/permissions.html`);
  const allow = page.getByRole("button", { name: "Allow link checks" });
  await expect(allow).toBeEnabled();
  const asks = () => page.evaluate(() => (window as unknown as { __asks: { origins: unknown; gesture: boolean }[] }).__asks);
  return { page, allow, status: page.getByRole("status"), asks };
}

/** popup.html as a tab with chrome.permissions.contains/remove stubbed before the popup script runs. */
async function popupWithGrant({ context, extensionId }: Ctx, tabId: number, granted: boolean) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.addInitScript((g) => {
    const w = window as unknown as { __removed: unknown[]; __requested: number };
    w.__removed = [];
    w.__requested = 0;
    chrome.permissions.contains = (() => Promise.resolve(g)) as typeof chrome.permissions.contains;
    chrome.permissions.remove = ((p: chrome.permissions.Permissions) => (w.__removed.push(p.origins), Promise.resolve(true))) as typeof chrome.permissions.remove;
  }, granted);
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await expect(popup.locator("#app[data-screen]")).toBeAttached();
  return popup;
}

const sessionRules = (sw: Worker, tabId: number) =>
  sw.evaluate(async (id) => (await chrome.declarativeNetRequest.getSessionRules()).filter((r) => r.condition.tabIds?.includes(id)).length, tabId);

/** trackers.html haunted, with Criteo exorcised through the router, and its block rule in place. */
async function exorcised(ctx: Ctx, width: number) {
  const o = await hauntedPage(ctx, width, "trackers.html");
  expect((await o.send({ type: "EXORCISE", company: "Criteo", domains: [TRACKER_HOSTS.Criteo] })).exorcised).toEqual(["Criteo"]);
  expect(await sessionRules(ctx.sw, o.tabId)).toBe(1);
  return o;
}

/** trackers.html plus Chartbeat ×2 and Quantcast ×1: three ghosts (Criteo 3, Chartbeat 2, Quantcast 1) with one base tint. */
async function threeGhosts(ctx: Ctx, width: number) {
  const o = await opened(ctx, width, "trackers.html");
  await o.page.evaluate(
    (urls) => Promise.all(urls.map((u) => fetch(u, { mode: "no-cors" }))),
    [trackerUrl(TINT_HOSTS.Chartbeat, "a"), trackerUrl(TINT_HOSTS.Chartbeat, "b"), trackerUrl(TINT_HOSTS.Quantcast, "a")],
  );
  expect(await o.send({ type: "HAUNT" })).toMatchObject({ haunted: true });
  await expect(o.page.locator("hg-crypt")).toHaveCount(1);
  await expect.poll(() => o.popup.locator('[data-count="ghosts"] .num').textContent()).toBe("3");
  return o;
}
const ORDER = ["Criteo", "Chartbeat", "Quantcast"];
const popupTints = (popup: Page) =>
  popup.locator(".ghost-row:not(.vampire-row)").evaluateAll((rows) => rows.map((r) => [r.querySelector(".row-title")!.textContent, r.querySelector(".icon-tile")!.innerHTML]));

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    // 11.1: the badge helper.
    test("helper reads the badge text of the active tab", async ({ context, sw }) => {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 800 });
      await page.goto(fixture("clean.html"));
      await page.bringToFront();
      const tabId = await tabIdOf(sw, page);
      expect(await badgeText(sw)).toBe("");
      await sw.evaluate((id) => chrome.action.setBadgeText({ tabId: id, text: "7" }), tabId);
      expect(await badgeText(sw)).toBe("7");
      expect(await badgeText(sw, tabId)).toBe("7");
      await sw.evaluate((id) => chrome.action.setBadgeText({ tabId: id, text: "" }), tabId);
    });

    // 11.2: the bar.
    test("a fixture on 127.0.0.1 is Area51/Hangar/1998", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page } = await hauntedPage(ctx, width, "clean.html");
      expect(LOCAL.address).toBe("Area51/Hangar/1998");
      const look = await barLook(await shadowOf(page));
      expect(look.where).toBe("You are in: Area51/Hangar/1998");
      expect(look.tagline).toBe(LOCAL.tagline);
      expect(look.addressCut).toBe(false);
    });

    if (width === 1280) {
      test("the bar shows the address and the tagline at 1280", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page } = await hauntedPage(ctx, width, "clean.html");
        const inShadow = await shadowOf(page);
        const look = await barLook(inShadow);
        expect(look).toMatchObject({ where: `You are in: ${LOCAL.address}`, tagline: LOCAL.tagline, display: "block", overflow: "ellipsis", whiteSpace: "nowrap", tagLines: 1, tagCut: false, addressCut: false, height: 24, barOverflow: 0, signInside: true, pageOverflow: 0 });
        expect(look.tagWidth).toBeGreaterThan(0);
        await barShot(page, inShadow, "bar-1280");
      });

      test("the tagline never wraps at 500", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page } = await hauntedPage(ctx, 500, "clean.html");
        const inShadow = await shadowOf(page);
        const look = await barLook(inShadow);
        // Shown, on one line, cut with an ellipsis rather than wrapped; the bar keeps its height.
        expect(look).toMatchObject({ display: "block", whiteSpace: "nowrap", overflow: "ellipsis", tagLines: 1, addressCut: false, height: 24, barOverflow: 0, signInside: true, pageOverflow: 0 });
        expect(look.tagWidth).toBeGreaterThan(0);
        await barShot(page, inShadow, "bar-500");
      });
    } else {
      test("the tagline is hidden and the bar fits at 375", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page } = await hauntedPage(ctx, width, "clean.html");
        const inShadow = await shadowOf(page);
        const look = await barLook(inShadow);
        expect(look).toMatchObject({ where: `You are in: ${LOCAL.address}`, display: "none", tagWidth: 0, addressCut: false, height: 24, barOverflow: 0, signInside: true, pageOverflow: 0 });
        await barShot(page, inShadow, "bar-375");
      });
    }

    // 11.3: the popup address line.
    test("the popup shows the address under the site title when haunted", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { popup } = await hauntedPage(ctx, width, "clean.html");
      await popup.bringToFront();
      await expect(popup.locator("#app")).toHaveAttribute("data-screen", "haunted");
      const line = popup.locator("h1 + p.address");
      await expect(line).toHaveText(LOCAL.address);
      await expect(popup.locator(".address")).toHaveCount(1);
      expect(await line.evaluate((p) => [getComputedStyle(p).color, getComputedStyle(p).fontSize, p.scrollWidth <= p.clientWidth])).toEqual([SUB, "12px", true]);
    });

    test("the idle popup shows no address", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { popup } = await opened(ctx, width, "clean.html");
      await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle");
      await expect(popup.locator(".address")).toHaveCount(0);
      await expect(popup.getByText(LOCAL.address)).toHaveCount(0);
    });

    // 11.4: the badge.
    test("the badge counts ghosts, vampires, tombstones and curses of the haunted tab", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const t = await hauntedPage(ctx, width, "trackers.html");
      await expect.poll(() => tileSum(t.popup)).toBe(3); // Criteo (ghost), Hotjar and Taboola (known vampires)
      await expect.poll(() => badgeText(ctx.sw, t.tabId)).toBe("3");

      const d = await hauntedPage(ctx, width, "dark-patterns.html");
      await expect(d.popup.locator('[data-count="curses"] .num')).toHaveText("6", { timeout: 10_000 });
      expect(await tileSum(d.popup)).toBeGreaterThanOrEqual(6); // 6 curses plus any tracker or tombstone
      await expect.poll(async () => (await badgeText(ctx.sw, d.tabId)) === String(await tileSum(d.popup)), { timeout: 10_000 }).toBe(true);
      expect(await badgeText(ctx.sw, t.tabId)).toBe("3"); // the first tab keeps its own count
    });

    test("the badge colours are #6633cc and white", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { tabId } = await hauntedPage(ctx, width, "trackers.html");
      await expect.poll(() => badgeText(ctx.sw, tabId)).toBe("3");
      const b = await badgeOf(ctx.sw, tabId);
      expect([b.bg, b.fg]).toEqual([[0x66, 0x33, 0xcc, 255], [255, 255, 255, 255]]);
    });

    test("the badge is empty at 0", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { popup, tabId, page } = await hauntedPage(ctx, width, "clean.html");
      await page.waitForTimeout(1500); // give any finding time to arrive
      expect(await tileSum(popup)).toBe(0);
      expect(await badgeText(ctx.sw, tabId)).toBe("");
    });

    test("un-haunt clears the badge", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { tabId, send } = await hauntedPage(ctx, width, "trackers.html");
      await expect.poll(() => badgeText(ctx.sw, tabId)).toBe("3");
      await send({ type: "UNHAUNT" });
      await expect.poll(() => badgeText(ctx.sw, tabId)).toBe("");
    });

    test("a reload clears the badge", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, tabId } = await hauntedPage(ctx, width, "trackers.html");
      await expect.poll(() => badgeText(ctx.sw, tabId)).toBe("3");
      await page.reload();
      await expect(page.locator("hg-crypt")).toHaveCount(0);
      await expect.poll(() => badgeText(ctx.sw, tabId)).toBe("");
    });

    test("another tab's badge is not affected", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const a = await hauntedPage(ctx, width, "trackers.html");
      const b = await opened(ctx, width, "trackers.html?second");
      await expect.poll(() => badgeText(ctx.sw, a.tabId)).toBe("3");
      expect(await badgeText(ctx.sw, b.tabId)).toBe(""); // not haunted
      await b.send({ type: "HAUNT" });
      await expect.poll(() => badgeText(ctx.sw, b.tabId)).toBe("3");
      await a.send({ type: "UNHAUNT" });
      await expect.poll(() => badgeText(ctx.sw, a.tabId)).toBe("");
      expect(await badgeText(ctx.sw, b.tabId)).toBe("3");
      // Never set globally: the default (no tabId) badge stays empty.
      expect(await ctx.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
    });

    test("closing a haunted tab raises no error", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, tabId } = await hauntedPage(ctx, width, "trackers.html");
      await expect.poll(() => badgeText(ctx.sw, tabId)).toBe("3");
      await ctx.sw.evaluate(() => {
        const g = globalThis as unknown as { __rejections: string[] };
        g.__rejections = [];
        self.addEventListener("unhandledrejection", (e) => g.__rejections.push(String((e as PromiseRejectionEvent).reason)));
        self.addEventListener("error", (e) => g.__rejections.push(String((e as ErrorEvent).message)));
      });
      await page.close();
      // The tab's state is cleared (clearTab ran, badge call included) and nothing was left unhandled.
      await expect.poll(() => ctx.sw.evaluate(async (id) => Object.keys(await chrome.storage.session.get(null)).filter((k) => k.endsWith(`:${id}`)), tabId)).toEqual([]);
      await new Promise((r) => setTimeout(r, 300));
      expect(await ctx.sw.evaluate(() => (globalThis as unknown as { __rejections: string[] }).__rejections)).toEqual([]);
    });

    // 11.5: the permission flow.
    test("switching on opens permissions.html and leaves the switch off", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { popup } = await opened(ctx, width, "index.html");
      await popup.evaluate(() => {
        const w = window as unknown as { __requested: number };
        w.__requested = 0;
        const real = chrome.permissions.request.bind(chrome.permissions);
        chrome.permissions.request = ((...a: Parameters<typeof real>) => (w.__requested++, real(...a))) as typeof chrome.permissions.request;
      });
      const link = popup.getByRole("switch", { name: "Check links to other sites" });
      await expect(link).not.toBeChecked();
      const next = ctx.context.waitForEvent("page");
      await link.click();
      const perm = await next;
      await perm.waitForLoadState();
      expect(perm.url()).toBe(`chrome-extension://${ctx.extensionId}/permissions.html`);
      await expect(perm.getByRole("button", { name: "Allow link checks" })).toBeVisible();
      await expect(link).not.toBeChecked();
      await expect(link).toHaveAccessibleDescription("Finish on the page that just opened.");
      expect(await popup.evaluate(() => (window as unknown as { __requested: number }).__requested)).toBe(0);
      await popup.bringToFront();
      await popup.screenshot({ path: `${SHOTS}/popup-after-switch-${width}.png`, fullPage: true });
    });

    test("the page asks for the link-check origins from the click", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { allow, asks } = await permissionsPage(ctx, width, false);
      expect(await asks()).toEqual([]);
      await allow.click();
      await expect.poll(asks).toEqual([{ origins: LINK_CHECK_ORIGINS, gesture: true }]);
    });

    test("a grant shows the on line and disables the button", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, allow, status, asks } = await permissionsPage(ctx, width, true);
      await allow.click();
      await expect(status).toHaveText(ON);
      await expect(allow).toBeDisabled();
      expect(await asks()).toHaveLength(1);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${SHOTS}/permissions-${width}-granted.png` });
    });

    test("a refusal shows the off line and keeps the button", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, allow, status, asks } = await permissionsPage(ctx, width, false);
      await allow.click();
      await expect(status).toHaveText(REFUSED);
      await expect(allow).toBeEnabled();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${SHOTS}/permissions-${width}-refused.png` });
      await allow.click(); // asks again
      await expect.poll(async () => (await asks()).length).toBe(2);
    });

    test("the popup switch matches permissions.contains when it opens", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { tabId, popup } = await opened(ctx, width, "index.html");
      // The real state, read in the worker, is what the real popup shows.
      const real = await ctx.sw.evaluate((o) => chrome.permissions.contains({ origins: o }), LINK_CHECK_ORIGINS);
      const link = popup.getByRole("switch", { name: "Check links to other sites" });
      await expect(link).toBeChecked({ checked: real });
      await expect(link).toHaveAccessibleDescription(real ? "Checking links on other sites too." : LINK_OFF);
      // A popup opened while contains answers true shows the switch on (Chrome's dialog cannot be clicked here).
      const granted = await popupWithGrant(ctx, tabId, true);
      const on = granted.getByRole("switch", { name: "Check links to other sites" });
      await expect(on).toBeChecked();
      await expect(on).toHaveAccessibleDescription("Checking links on other sites too.");
    });

    test("switching off removes the permission from the popup", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { tabId } = await opened(ctx, width, "index.html");
      const popup = await popupWithGrant(ctx, tabId, true);
      const link = popup.getByRole("switch", { name: "Check links to other sites" });
      await expect(link).toBeChecked();
      await link.click();
      await expect(link).not.toBeChecked();
      await expect(link).toHaveAccessibleDescription(LINK_OFF);
      expect(await popup.evaluate(() => (window as unknown as { __removed: unknown[] }).__removed)).toEqual([LINK_CHECK_ORIGINS]);
      expect(ctx.context.pages().filter((p) => p.url().endsWith("/permissions.html"))).toHaveLength(0);
    });

    test("permissions.html is a Win95 dialog on a teal desktop at 1280 and 375", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, allow } = await permissionsPage(ctx, width, true);
      await page.screenshot({ path: `${SHOTS}/permissions-${width}-before.png` });
      const look = await page.evaluate(() => {
        const cs = (el: Element) => getComputedStyle(el);
        const surface = document.querySelector(".dialog")!;
        return {
          canvas: cs(document.body).backgroundColor,
          surface: [cs(surface).backgroundColor, cs(surface).borderRadius],
          buttons: [...document.querySelectorAll("button")].map((b) => [b.textContent, cs(b).backgroundColor, cs(b).color, b.classList.contains("primary")]),
          heading: document.querySelector("h1")!.textContent,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          animated: document.getAnimations().length,
        };
      });
      expect(look).toEqual({
        canvas: "rgb(0, 128, 128)",
        surface: ["rgb(192, 192, 192)", "0px"],
        buttons: [["Allow link checks", "rgb(192, 192, 192)", "rgb(0, 0, 0)", true]],
        heading: "Check links to other sites",
        scroll: 0,
        animated: 0,
      });
      // Keyboard: Tab reaches the button, which shows the popup focus ring.
      await page.keyboard.press("Tab");
      await expect(allow).toBeFocused();
      expect(await allow.evaluate((b) => [getComputedStyle(b).outlineStyle, getComputedStyle(b).outlineWidth, getComputedStyle(b).outlineColor, getComputedStyle(b).outlineOffset])).toEqual(["solid", "2px", "rgb(102, 51, 204)", "2px"]);
      await page.screenshot({ path: `${SHOTS}/permissions-${width}-focus.png` });
    });

    // 11.6: hem tints.
    if (width === 1280) {
      test("neighbouring lane ghosts have different hem colours", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page } = await threeGhosts(ctx, width);
        expect(new Set(ORDER.map(hemTint)).size).toBe(1); // without assignTints all three would match
        await page.bringToFront();
        await page.waitForTimeout(3100); // the haunt moment settles
        const lane = await (await shadowOf(page))(function () {
          return [...this.querySelectorAll<HTMLElement>("#lanes .ghost")].map((g) => [g.dataset.company!, g.querySelector(".sprite")!.innerHTML]);
        });
        expect(lane.map(([c]) => c)).toEqual(ORDER);
        const tints = lane.map(([, svg]) => tintOf(svg!));
        expect(tints).toEqual(assignTints(ORDER));
        for (let i = 1; i < tints.length; i++) expect(tints[i]).not.toBe(tints[i - 1]);
        await page.screenshot({ path: `${SHOTS}/lanes-1280.png` });
      });

      test("popup ghost rows use the lane colours", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page, popup } = await threeGhosts(ctx, width);
        await page.bringToFront();
        await page.waitForTimeout(3100);
        const lane = await (await shadowOf(page))(function () {
          return [...this.querySelectorAll<HTMLElement>("#lanes .ghost")].map((g) => [g.dataset.company!, g.querySelector(".sprite")!.innerHTML]);
        });
        await popup.bringToFront();
        const rows = await popupTints(popup);
        expect(rows.map(([c, svg]) => [c, tintOf(svg!)])).toEqual(lane.map(([c, svg]) => [c, tintOf(svg!)]));
        await expect(popup.locator("h1 + p.address")).toHaveText(LOCAL.address);
        await popup.screenshot({ path: `${SHOTS}/popup-address-tints.png`, fullPage: true });
      });
    } else {
      test("adjacent popup rows differ at 375", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page, popup } = await threeGhosts(ctx, width);
        await page.bringToFront();
        await page.waitForTimeout(1000);
        expect(await (await shadowOf(page))(function () { return this.querySelectorAll("#lanes .ghost").length; })).toBe(0); // no lane at 375
        await popup.bringToFront();
        const rows = await popupTints(popup);
        expect(rows.map(([c]) => c)).toEqual(ORDER);
        const tints = rows.map(([, svg]) => tintOf(svg!));
        expect(tints).toEqual(assignTints(ORDER));
        for (let i = 1; i < tints.length; i++) expect(tints[i]).not.toBe(tints[i - 1]);
      });
    }

    // 11.7: the vampire row, the footnote and how long a block lasts.
    test("a known vampire row says On the Tracker Radar fingerprint list once", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const t = await hauntedPage(ctx, width, "trackers.html");
      await t.popup.bringToFront();
      const vampireRows = (popup: Page) =>
        popup.locator(".vampire-row").evaluateAll((rs) =>
          rs.map((r) => [r.querySelector(".row-title")!.textContent, r.querySelector(".tag-pill")!.textContent, r.querySelector(".row-sub")!.textContent, (r.textContent!.match(/Known/g) ?? []).length]),
        );
      await expect.poll(() => vampireRows(t.popup)).toEqual([
        ["Hotjar", "Known", "On the Tracker Radar fingerprint list", 1],
        ["Taboola", "Known", "On the Tracker Radar fingerprint list", 1],
      ]);

      // A caught vampire row is unchanged.
      const v = await hauntedPage(ctx, width, "vampires.html");
      await v.page.locator("#email").focus();
      await v.page.waitForFunction(() => (window as unknown as { fpDone: number }).fpDone === 2);
      await v.popup.bringToFront();
      await expect.poll(async () => (await vampireRows(v.popup))[0]).toEqual(["AdTheorent", "Caught", "Canvas readback · AudioContext · font probing", 0]);
    });

    if (width === 1280) {
      // The card opens from a lane ghost; at 375 there is no lane, so the card is checked at 1280.
      test("the ghost card footnote is exact", async ({ context, sw, extensionId }) => {
        const ctx = { context, sw, extensionId };
        const { page } = await hauntedPage(ctx, width, "trackers.html");
        await page.waitForTimeout(3100);
        const inShadow = await shadowOf(page);
        const at = await inShadow(function () {
          const r = this.querySelector('#lanes .ghost[data-company="Criteo"]')!.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.mouse.click(at.x, at.y);
        const foot = () => inShadow(function () { return this.querySelector("#cards .card .foot")?.textContent ?? null; });
        await expect.poll(foot).toBe(FOOT);
      });
    }

    test("the block lasts while the page is haunted", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, tabId } = await exorcised(ctx, width);
      await page.evaluate(() => history.pushState({}, "", "#still-here")); // same document: still haunted
      await page.waitForTimeout(1000);
      expect(await sessionRules(ctx.sw, tabId)).toBe(1);
      await expect(page.locator("hg-crypt")).toHaveCount(1);
    });

    test("the block ends on un-haunt", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { tabId, send } = await exorcised(ctx, width);
      await send({ type: "UNHAUNT" });
      await expect.poll(() => sessionRules(ctx.sw, tabId)).toBe(0);
    });

    test("the block ends on reload", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, tabId } = await exorcised(ctx, width);
      await page.reload();
      await expect.poll(() => sessionRules(ctx.sw, tabId)).toBe(0);
    });

    test("the block ends on navigation", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, tabId } = await exorcised(ctx, width);
      await page.goto(fixture("clean.html"));
      await expect.poll(() => sessionRules(ctx.sw, tabId)).toBe(0);
    });

    test("the block ends when the tab closes", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, tabId } = await exorcised(ctx, width);
      await page.close();
      await expect.poll(() => sessionRules(ctx.sw, tabId)).toBe(0);
    });

    // 11.8: non-destructive.
    test("un-haunt leaves the page byte-identical", async ({ context, sw, extensionId }) => {
      const ctx = { context, sw, extensionId };
      const { page, popup, send } = await opened(ctx, width, "index.html");
      const before = await page.evaluate(() => document.documentElement.outerHTML);
      await send({ type: "HAUNT" });
      await expect(page.locator("hg-crypt")).toHaveCount(1);
      await page.bringToFront();
      expect((await barLook(await shadowOf(page))).where).toBe(`You are in: ${LOCAL.address}`);
      await popup.bringToFront();
      await popup.getByRole("button", { name: "Un-haunt" }).click();
      await expect(popup.locator("#app")).toHaveAttribute("data-screen", "idle");
      await expect(page.locator("hg-crypt")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
    });
  });
}
