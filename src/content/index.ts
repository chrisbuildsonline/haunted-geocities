// Injected on demand by the background via chrome.scripting.executeScript (never declared
// as a static content script). Built as a self-contained IIFE: injected files cannot import.
import type { ContentMessage } from "../data/types";
import { leaveCostume, renderCostume } from "./costume/render";

const LISTENING = "__hauntedGeoCitiesListening";
const g = globalThis as Record<string, unknown>;

renderCostume();

if (!g[LISTENING]) {
  g[LISTENING] = true;
  chrome.runtime.onMessage.addListener((msg: ContentMessage, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (msg?.type === "ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type !== "unhaunt") return false;
    // Answer once the reverse animation is over and the page is restored, so the popup only
    // shows Idle when that is true.
    leaveCostume().then(() => sendResponse({ ok: true }));
    return true;
  });
}
