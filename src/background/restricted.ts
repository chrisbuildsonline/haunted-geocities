const STORE_HOSTS = new Set(["chromewebstore.google.com"]);

/**
 * True when Chrome will not let an extension draw on this page.
 *
 * Only http(s) pages, and file:// pages when the user allowed file access, can be haunted.
 * That covers chrome://, chrome-extension://, edge://, about:, view-source:, devtools://,
 * data: and blob:. On top of that the Chrome Web Store blocks injection on its own hosts.
 * An unknown URL (undefined: we have no access to the tab) is treated as restricted.
 */
export function isRestrictedUrl(url: string | undefined, fileAccess: boolean): boolean {
  if (!url) return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (u.protocol === "file:") return !fileAccess;
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  if (STORE_HOSTS.has(u.hostname)) return true;
  return u.hostname === "chrome.google.com" && (u.pathname === "/webstore" || u.pathname.startsWith("/webstore/"));
}
