// Injected on demand by the background via chrome.scripting.executeScript (never declared
// as a static content script). Built as a self-contained IIFE: injected files cannot import.
import type { ContentMessage } from "../data/types";
import { haunt, unhaunt } from "./overlay";

const LISTENING = "__hauntedGeoCitiesListening";
const g = globalThis as Record<string, unknown>;

haunt();

if (!g[LISTENING]) {
  g[LISTENING] = true;
  chrome.runtime.onMessage.addListener((msg: ContentMessage, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || msg?.type !== "unhaunt") return false;
    unhaunt();
    sendResponse({ ok: true });
    return false;
  });
}
