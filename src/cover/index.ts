// Registered by the background (chrome.scripting.registerContentScripts, runAt document_start) for
// the site a tab haunts, and built as a self-contained IIFE: content scripts cannot import.
import { startCover } from "./cover";

let storage: Storage | undefined;
try {
  storage = sessionStorage;
} catch {
  // a page whose storage is off limits: the background's answer decides alone
}
startCover({ doc: document, storage, runtime: chrome.runtime, global: globalThis as Record<string, unknown> });
