// Exorcise refusal proof: after EXORCISE the network layer refuses the company's requests in that tab
// (net::ERR_BLOCKED_BY_CLIENT), other companies still load, and the rules go away on LET_BACK,
// un-haunt and tab close. Uses the shipped src/data/trackers.json; the content script's ghost
// wiring is not involved, the messages are sent from the popup document as the popup would.
import type { Page, Request } from "@playwright/test";
import { expect, fixture, openPopup, tabIdOf, TRACKER_HOSTS, trackerUrl, test } from "./fixtures";

const { Criteo, Hotjar, Taboola } = TRACKER_HOSTS;

async function setup(context: Parameters<typeof openPopup>[0], sw: Parameters<typeof tabIdOf>[0], extensionId: string) {
  const page = await context.newPage();
  const finished: string[] = []; // request hostnames
  const failed: { host: string; error: string | undefined }[] = [];
  page.on("requestfinished", (r: Request) => finished.push(new URL(r.url()).hostname));
  page.on("requestfailed", (r: Request) => failed.push({ host: new URL(r.url()).hostname, error: r.failure()?.errorText }));
  await page.goto(fixture("trackers.html"));
  const tabId = await tabIdOf(sw, page);
  const popup = await openPopup(context, extensionId, tabId);
  const send = (msg: Record<string, unknown>) => popup.evaluate((m) => chrome.runtime.sendMessage(m), { ...msg, tabId });
  await send({ type: "HAUNT" });
  await expect(page.locator("hg-crypt")).toHaveCount(1);
  return { page, popup, tabId, send, finished, failed };
}

/** A new request from the page to `host`; resolves "loaded" or "refused". */
let probes = 0;
const probe = (page: Page, host: string) =>
  page.evaluate((url) => fetch(url, { mode: "no-cors" }).then(() => "loaded", () => "refused"), trackerUrl(host, `probe${++probes}`));

const rulesFor = (sw: Parameters<typeof tabIdOf>[0], tabId: number) =>
  sw.evaluate(async (id) => (await chrome.declarativeNetRequest.getSessionRules()).filter((r) => r.condition.tabIds?.includes(id)), tabId);

test("the fixture loads its tracker resources through the host resolver rules", async ({ context, sw, extensionId }) => {
  const { finished } = await setup(context, sw, extensionId);
  const count = (h: string) => finished.filter((f) => f === h).length;
  expect([count(Criteo), count(Hotjar), count(Taboola)]).toEqual([3, 2, 1]);
});

test("exorcised company: requests refused with ERR_BLOCKED_BY_CLIENT, others load, let back loads again", async ({ context, sw, extensionId }) => {
  const { page, tabId, send, failed, finished } = await setup(context, sw, extensionId);
  expect(await probe(page, Criteo)).toBe("loaded");

  const state = await send({ type: "EXORCISE", company: "Criteo", domains: [Criteo] });
  expect(state.exorcised).toEqual(["Criteo"]);
  const [rule] = await rulesFor(sw, tabId);
  expect(rule).toMatchObject({ priority: 1, action: { type: "block" }, condition: { requestDomains: [Criteo], tabIds: [tabId] } });

  expect(await probe(page, Criteo)).toBe("refused");
  expect(failed.at(-1)).toEqual({ host: Criteo, error: "net::ERR_BLOCKED_BY_CLIENT" });
  // an image request is refused the same way
  await page.evaluate((url) => new Promise((r) => Object.assign(new Image(), { onload: r, onerror: r, src: url })), trackerUrl(Criteo, "img"));
  expect(failed.filter((f) => f.host === Criteo).map((f) => f.error)).toEqual(["net::ERR_BLOCKED_BY_CLIENT", "net::ERR_BLOCKED_BY_CLIENT"]);

  // another company is untouched
  const count = (host: string) => finished.filter((f) => f === host).length;
  const [hotjar, taboola] = [count(Hotjar), count(Taboola)];
  expect(await probe(page, Hotjar)).toBe("loaded");
  expect(await probe(page, Taboola)).toBe("loaded");
  await expect.poll(() => [count(Hotjar), count(Taboola)]).toEqual([hotjar + 1, taboola + 1]);

  // let it back: the same request finishes again
  const back = await send({ type: "LET_BACK", company: "Criteo" });
  expect(back.exorcised).toEqual([]);
  expect(await rulesFor(sw, tabId)).toEqual([]);
  const finishedBefore = finished.filter((f) => f === Criteo).length;
  expect(await probe(page, Criteo)).toBe("loaded");
  await expect.poll(() => finished.filter((f) => f === Criteo).length).toBe(finishedBefore + 1);
});

test("the rule is aimed at one tab only", async ({ context, sw, extensionId }) => {
  const { tabId, send } = await setup(context, sw, extensionId);
  await send({ type: "EXORCISE", company: "Criteo", domains: [Criteo] });
  const other = await context.newPage();
  await other.goto(fixture("trackers.html?second")); // a different URL, so tabIdOf finds this tab
  expect(await probe(other, Criteo)).toBe("loaded");
  expect(await tabIdOf(sw, other)).not.toBe(tabId);
});

test("EXORCISE only blocks domains the tracker data lists for that company", async ({ context, sw, extensionId }) => {
  const { page, tabId, send } = await setup(context, sw, extensionId);
  await send({ type: "EXORCISE", company: "Criteo", domains: ["example.org", Hotjar, "127.0.0.1"] }); // not Criteo's
  expect(await rulesFor(sw, tabId)).toEqual([]);
  expect(await probe(page, Hotjar)).toBe("loaded");

  await send({ type: "EXORCISE", company: "Criteo", domains: ["example.org", Criteo] });
  const rules = await rulesFor(sw, tabId);
  expect(rules.map((r) => r.condition.requestDomains)).toEqual([[Criteo]]);
});

test("un-haunt removes every rule for the tab", async ({ context, sw, extensionId }) => {
  const { page, tabId, send } = await setup(context, sw, extensionId);
  await send({ type: "EXORCISE", company: "Criteo", domains: [Criteo] });
  await send({ type: "EXORCISE", company: "Hotjar", domains: [Hotjar] });
  expect(await rulesFor(sw, tabId)).toHaveLength(2);

  await send({ type: "UNHAUNT" });
  expect(await rulesFor(sw, tabId)).toEqual([]);
  expect(await probe(page, Criteo)).toBe("loaded");
  expect(await probe(page, Hotjar)).toBe("loaded");
});

test("closing the tab removes its rules", async ({ context, sw, extensionId }) => {
  const { page, tabId, send } = await setup(context, sw, extensionId);
  await send({ type: "EXORCISE", company: "Taboola", domains: [Taboola] });
  expect(await rulesFor(sw, tabId)).toHaveLength(1);

  await page.close();
  await expect.poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)).toBe(0);
});
