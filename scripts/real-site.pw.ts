// The haunt on real public pages, over the real network: `bun run docs:realsite`.
// It builds the shipping extension, clicks Haunt in its popup and films the parade through to the
// "Trackers found: N" caption at rest. It writes docs/real-site-haunt.gif (the first page), a still of the
// caption on each page (docs/real-site-caption-<slug>.png) and docs/real-site.json (each page, the
// date, its count, its parade's companies, and the boxes of the still's ghosts and restyled panels).
// A docs tool, not a check: live pages change and networks fail, so it is in no CI or Docker stage,
// and the committed files are the record. There is no fixture server and no host-resolver rule here:
// every tracker in the shot is one the live page really loaded.
import { chromium, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scrollToEnd, shadowOf, tabIdOf } from "../e2e/fixtures";
import { afternoonZone } from "./afternoon";
import { pickStill, type Box, type Frame } from "./still-frame";

/**
 * US government pages: public-domain works (17 U.S.C. 105) that load their trackers with no consent
 * wall. The first one is the GIF.
 */
const PAGES = [
  { slug: "nps", url: "https://www.nps.gov/index.htm" },
  { slug: "cdc", url: "https://www.cdc.gov/" },
];
const FPS = 6;
const SLOW = 0.2; // the page's animation clock runs at a fifth of real time, so every frame is caught on time
/**
 * The window is taller than the shot. The parade crosses the window bottom to top in a fixed time, so in a
 * taller window it is still low when the caption lands, and there is a frame where every named ghost is in
 * the shot with none over the page's crypt window (in an 800px window the caption lands as the flock covers
 * it). Every frame, GIF and stills alike, is the top SHOT of the window.
 */
const VIEW = { width: 1280, height: 1400 };
const SHOT = { width: 1280, height: 1000 };
const GIF = "docs/real-site-haunt.gif";

/** ffmpeg, `frames` to a 560px GIF at FPS with 128 colours, palette first (as e2e/readme.shots.ts does). */
function makeGif(frames: string, n: number) {
  const ff = (...args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  ff("-i", `${frames}/f%03d.png`, "-vf", "scale=560:-1:flags=lanczos", `${frames}/s%03d.png`);
  const input = ["-framerate", String(FPS), "-i", `${frames}/s%03d.png`];
  const palette = `${frames}/palette.png`;
  ff(...input, "-vf", "palettegen=max_colors=128:stats_mode=diff", palette);
  ff(...input, "-i", palette, "-lavfi", "[0:v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", "-loop", "0", GIF);
  expect(n).toBeGreaterThan(FPS * 3);
  expect(statSync(GIF).size).toBeLessThan(2 * 1024 * 1024);
}

/** Haunt `url` from the popup and film it; returns the caption's count and the parade's companies. */
async function capture(slug: string, url: string, gif: boolean) {
  // The shipping build (dist/), plus one host permission for this page's origin. It stands in for the
  // activeTab grant a real toolbar click gives, which Playwright cannot perform.
  const ext = resolve(`test-results/real-site-ext-${slug}`);
  rmSync(ext, { recursive: true, force: true });
  cpSync("dist", ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(`${ext}/manifest.json`, "utf8"));
  writeFileSync(`${ext}/manifest.json`, JSON.stringify({ ...manifest, host_permissions: [`${new URL(url).origin}/*`] }, null, 2));
  const frames = `test-results/real-site-${slug}`;
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: VIEW,
    // The shipping build reads the local clock (the witching hour): the shots live on an ordinary afternoon.
    timezoneId: afternoonZone(),
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    // Tag managers load their trackers after the load event; trackers loaded after the click are not in the parade.
    await page.waitForTimeout(8000);
    await page.mouse.move(0, 0);

    let n = 0;
    const name = (k: number) => `${frames}/f${String(k).padStart(3, "0")}.png`;
    const frame = () => page.screenshot({ path: name(n++), caret: "initial", clip: { x: 0, y: 0, ...SHOT } });
    // The restyled panels in the shot: the crypt windows (page-sheet rules on a `body > …` path that frame a
    // box and set no colour, unlike the search fields and the raised buttons) that hold a button.
    const panels = () =>
      page.evaluate((shot) => {
        const rules = document.adoptedStyleSheets.flatMap((s) => [...s.cssRules]) as CSSStyleRule[];
        const paths = new Set(rules.filter((r) => /^body > /.test(r.selectorText ?? "") && r.style.boxShadow && !r.style.color).map((r) => r.selectorText));
        const isButton = (a: Element) => {
          const cs = getComputedStyle(a);
          return cs.boxShadow !== "none" || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor);
        };
        const boxes = [...paths]
          .flatMap((p) => [...document.querySelectorAll(p)])
          .filter((w) => [...w.querySelectorAll("a[href], button")].some(isButton))
          .map((w) => w.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.bottom > 0 && r.top < shot.height)
          .map((r) => JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }));
        // A carousel's slides stack in one place: each box once.
        return [...new Set(boxes)].map((b) => JSON.parse(b) as { left: number; top: number; right: number; bottom: number });
      }, SHOT);
    // Half a second of the live page first.
    await frame();
    for (let i = 1; i < FPS / 2; i++) copyFileSync(name(0), name(n++));

    // The popup in a window of its own, so the page's tab stays the visible one while it plays.
    const tabId = await tabIdOf(sw, page);
    // Haunt page asks Chrome for the whole site, a prompt Playwright cannot answer. The run holds one
    // origin only, so the popup hears "no" and haunts this page alone.
    await context.addInitScript(() => {
      if (location.protocol === "chrome-extension:") chrome.permissions.request = (() => Promise.resolve(false)) as typeof chrome.permissions.request;
    });
    const opened = context.waitForEvent("page", (p) => p.url().includes("popup.html"));
    await sw.evaluate((tab) => chrome.windows.create({ url: `popup.html?tab=${tab}`, type: "popup", width: 360, height: 600 }), tabId);
    const popup = await opened;
    await expect(popup.locator("#app[data-screen]")).toBeAttached();

    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: SLOW });
    await popup.getByRole("button", { name: "Haunt page" }).click();
    await page.locator("hg-crypt").waitFor({ state: "attached" });
    const start = Date.now();
    const inShadow = await shadowOf(page);
    const parade = await inShadow(function () {
      return {
        caption: this.querySelector("#fx .found")?.textContent ?? "",
        companies: [...this.querySelectorAll<HTMLElement>("#fx .spirit[data-company]")].map((s) => s.dataset.company!),
      };
    });

    // The 3000ms moment and the caption's hold (to 3600), one frame every 1/6s of page time. Each frame with
    // the caption wholly in the shot notes where it is and every parade ghost's box.
    const captionAt: Omit<Frame, "panels">[] = [];
    for (let k = 1; k <= 3.5 * FPS; k++) {
      const due = start + (k * 1000) / FPS / SLOW;
      await page.waitForTimeout(Math.max(0, due - Date.now()));
      if (Date.now() - due > 100) console.log(`real-site: ${slug} frame ${n} is ${Date.now() - due}ms late`);
      const at = n;
      await frame();
      const seen = await inShadow(function (shot: { width: number; height: number }) {
        const box = (r: DOMRect) => ({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
        const r = this.querySelector("#fx .found")?.getBoundingClientRect();
        const ghosts = [...this.querySelectorAll<HTMLElement>("#fx .spirit")].map((s) => ({ ...(s.dataset.company ? { company: s.dataset.company } : {}), box: box(s.getBoundingClientRect()) }));
        return r && r.left >= 0 && r.right <= shot.width && r.top >= 0 && r.bottom <= shot.height ? { mid: (r.top + r.bottom) / 2, ghosts } : null;
      }, SHOT);
      if (seen) captionAt.push({ k: at, ...seen });
    }
    // The panels are the page's layout, which the parade does not move: measured once, with the costume on.
    const inShot = await panels();
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    console.log(`real-site: ${slug} restyled panels in the shot ${JSON.stringify(inShot)}`);

    // The still: the caption in the marquee band (off the page's text), no parade ghost over a restyled
    // window, and as many named tracker ghosts wholly in the shot as such a frame gives (scripts/still-frame.ts).
    expect(captionAt.length).toBeGreaterThan(0);
    const still = pickStill(captionAt.map((c) => ({ ...c, panels: inShot })), SHOT);
    expect(still, "a frame with no parade ghost over a restyled panel").not.toBeNull();
    console.log(`real-site: ${slug} still is frame ${still!.k}, showing ${still!.shows.join(", ")}`);
    expect(still!.panels.length).toBeGreaterThan(0);
    expect(still!.mid).toBeLessThan(SHOT.height / 3);
    expect(still!.shows.length).toBeGreaterThanOrEqual(Math.min(3, parade.companies.length));
    copyFileSync(name(still!.k), `docs/real-site-caption-${slug}.png`);
    const stillClear: { panels: Box[]; ghosts: Box[] } = { panels: still!.panels, ghosts: still!.ghosts.map((g) => g.box) };
    if (gif) {
      // Let the moment play out (no finite animation left but the marquee), then hold the settled page
      // for a second and a half before the loop starts again.
      const finite = () =>
        inShadow(function () {
          return this.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity && (a as CSSAnimation).animationName !== "hg-marquee").length;
        });
      await expect.poll(finite, { timeout: 15_000 }).toBe(0);
      await frame();
      const last = name(n - 1);
      for (let i = 0; i < FPS * 1.5; i++) copyFileSync(last, name(n++));
      makeGif(frames, n);
    }

    // The page's end stays whole: scrolled to the bottom, its last line of text sits above the crypt
    // footer (which opens with the graveyard and follows the page in flow). A frame of it for the record,
    // not committed: test-results/real-site-<slug>/end.png and end-375.png show the footer.
    // The bottom is the one the page has once its lazy footer content has loaded (scrollToEnd).
    await scrollToEnd(page, 1500);
    const overlayTop = await inShadow(function () {
      const g = this.getElementById("graveyard")!;
      return (g.hidden ? this.getElementById("hud")! : g).getBoundingClientRect().top;
    });
    const lastText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let bottom = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.nodeValue?.trim() || !el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || el.closest("hg-crypt")) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.position === "fixed" || el.closest("[aria-hidden='true'], dialog:not([open])")) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0 && r.bottom > bottom && r.bottom <= window.innerHeight + 1) bottom = r.bottom;
      }
      return bottom;
    });
    await page.screenshot({ path: `${frames}/end.png` });
    console.log(`real-site: ${slug} scrolled to the end: last text line ends at ${Math.round(lastText)}px, the crypt footer starts at ${Math.round(overlayTop)}px`);
    expect(lastText).toBeLessThanOrEqual(overlayTop + 1);
    // The settled costume at 1280 and on a phone (375), top and end, for review (test-results only).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${frames}/settled-1280.png` });
    await page.setViewportSize({ width: 375, height: 740 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${frames}/settled-375.png` });
    await scrollToEnd(page, 1500);
    await page.screenshot({ path: `${frames}/end-375.png` });

    const found = Number(/^Trackers found: (\d+)$/.exec(parade.caption)?.[1]);
    expect(found).toBeGreaterThan(0);
    return { trackersFound: found, parade: parade.companies, stillShows: still!.shows, stillClear };
  } finally {
    await context.close();
  }
}

test("the haunt on real public pages", async () => {
  test.setTimeout(PAGES.length * 120_000);
  const captured = new Date().toISOString().slice(0, 10);
  const pages = [];
  for (const [i, { slug, url }] of PAGES.entries()) {
    const shot = await capture(slug, url, i === 0);
    pages.push({ page: url, still: `docs/real-site-caption-${slug}.png`, ...(i === 0 ? { gif: GIF } : {}), ...shot });
    console.log(`real-site: ${url} trackers found ${shot.trackersFound}: ${shot.parade.join(", ")}`);
  }
  writeFileSync("docs/real-site.json", JSON.stringify({ captured, pages }, null, 2) + "\n");
  console.log(`real-site: ${GIF} ${statSync(GIF).size} bytes`);
});
