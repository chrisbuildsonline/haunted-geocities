/** The toolbar badge: how many ghosts, vampires, tombstones and curses a haunted tab holds. */
export const BADGE_BG = "#6633cc";
export const BADGE_FG = "#ffffff";

/** "" at 0, the number up to 99, "99+" above. */
export const badgeText = (n: number) => (n <= 0 ? "" : n > 99 ? "99+" : String(n));

export function createBadge(api: typeof chrome) {
  /** Show `count` on the tab's icon. Never throws: a closed tab or a missing API only skips the badge. */
  async function show(tabId: number, count: number) {
    try {
      const text = badgeText(count);
      await api.action.setBadgeText({ tabId, text });
      // An empty badge is not drawn, so its colours would be wasted calls.
      if (text) {
        await api.action.setBadgeBackgroundColor({ tabId, color: BADGE_BG });
        await api.action.setBadgeTextColor({ tabId, color: BADGE_FG });
      }
    } catch {
      // the tab is gone, or there is no action API here
    }
  }
  const clear = (tabId: number) => show(tabId, 0);
  return { show, clear };
}
