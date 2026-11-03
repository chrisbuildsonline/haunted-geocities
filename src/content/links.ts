// Which links on the page are worth checking. Pure: reads the document, changes nothing.

const SAME_CAP = 60;
const CROSS_CAP = 30;

/** The page's http(s) links, fragment-free and deduped in document order, split by origin. `costumeHost` is the overlay's tag name. */
export function collectLinks(doc: Document, siteOrigin: string, costumeHost: string): { sameOrigin: string[]; crossSite: string[] } {
  const seen = new Set<string>();
  const sameOrigin: string[] = [];
  const crossSite: string[] = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    if (a.hasAttribute("download") || a.closest(costumeHost)) continue;
    const href = a.getAttribute("href")!.trim();
    if (href.startsWith("#")) continue;
    let url: URL;
    try {
      url = new URL(href, doc.baseURI);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const list = url.origin === siteOrigin ? sameOrigin : crossSite;
    if (list.length < (list === sameOrigin ? SAME_CAP : CROSS_CAP)) list.push(url.href);
  }
  return { sameOrigin, crossSite };
}
