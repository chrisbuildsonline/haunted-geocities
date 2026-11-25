// The same-site rule for a site haunt (.kiro/specs/site-haunt). Pure: no chrome, so the popup
// and the background share it.

/** An IP literal or a dotless host (localhost): the site is that host only, no subdomains. */
const isBare = (site: string) => /^\d+(\.\d+){3}$/.test(site) || site.includes(":") || !site.includes(".");

/** The site of an http(s) URL: its hostname with one leading "www." stripped; null for anything else. */
export function siteOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // "www." comes off only when a dotted name is left: www.com stays www.com.
    return u.hostname.replace(/^www\.(?=[^.]+\.)/, "") || null;
  } catch {
    return null;
  }
}

/** Whether `url` is on `site`: the site itself or one of its subdomains ("evilnps.gov" is not on "nps.gov"). */
export function onSite(url: string | null | undefined, site: string): boolean {
  const host = siteOf(url);
  return !!host && (host === site || (!isBare(site) && host.endsWith(`.${site}`)));
}

/** The origins Chrome is asked for: each inside optional_host_permissions (http://*\/* and https://*\/*). */
export function siteOrigins(site: string): string[] {
  const own = [`http://${site}/*`, `https://${site}/*`];
  return isBare(site) ? own : [...own, `http://*.${site}/*`, `https://*.${site}/*`];
}
