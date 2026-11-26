// The haunt on real public pages, over the real network: `bun run docs:realsite`.
// It builds the shipping extension, clicks Haunt in its popup and films the parade through to the
// "Trackers found: N" caption at rest. It writes docs/real-site-haunt.gif (the first page), a still of the
// caption on each page (docs/real-site-caption-<slug>.png) and docs/real-site.json (each page, the
// date, its count and its parade's companies).
// A docs tool, not a check: live pages change and networks fail, so it is in no CI or Docker stage,
// and the committed files are the record. There is no fixture server and no host-resolver rule here:
// every tracker in the shot is one the live page really loaded.
import { chromium, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scrollToEnd, shadowOf, tabIdOf } from "../e2e/fixtures";

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
const VIEW = { width: 1280, height: 800 };
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
    const frame = () => page.screenshot({ path: name(n++), caret: "initial" });
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

    // The 3000ms moment and the caption's hold (to 3600), one frame every 1/6s of page time. Each frame notes
    // where the caption is and which named parade ghosts are wholly on screen.
    const captionAt: { k: number; mid: number; ghosts: string[] }[] = [];
    for (let k = 1; k <= 3.5 * FPS; k++) {
      await page.waitForTimeout(Math.max(0, start + (k * 1000) / FPS / SLOW - Date.now()));
      const at = n;
      await frame();
      const seen = await inShadow(function (view: { width: number; height: number }) {
        const inView = (r: DOMRect) => r.left >= 0 && r.right <= view.width && r.top >= 0 && r.bottom <= view.height;
        const r = this.querySelector("#fx .found")?.getBoundingClientRect();
        const ghosts = [...this.querySelectorAll<HTMLElement>("#fx .spirit[data-company]")].filter((s) => inView(s.getBoundingClientRect())).map((s) => s.dataset.company!);
        return r && inView(r) ? { mid: (r.top + r.bottom) / 2, ghosts } : null;
      }, VIEW);
      if (seen) captionAt.push({ k: at, ...seen });
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

    // The still: the caption in the marquee band (off the page's text) with as many named tracker ghosts
    // in the frame as the parade gives it (the latest such frame, where the caption has come furthest).
    expect(captionAt.length).toBeGreaterThan(0);
    const most = Math.max(...captionAt.map((c) => c.ghosts.length));
    const still = captionAt.filter((c) => c.ghosts.length === most).at(-1)!;
    expect(still.mid).toBeLessThan(VIEW.height / 3);
    expect(still.ghosts.length).toBeGreaterThanOrEqual(Math.min(3, parade.companies.length));
    copyFileSync(name(still.k), `docs/real-site-caption-${slug}.png`);
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
    return { trackersFound: found, parade: parade.companies, stillShows: still.ghosts };
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
