import type { SoundKind } from "../audio/sound";
import { siteOf, siteOrigins } from "../background/site-haunt";
import type { PopupRequest, TabState } from "../data/types";
import { HAUNT_ERROR, renderScreen, screenFor } from "./screens";
import { createSettings } from "./settings";

const NO_TAB: TabState = { haunted: false, restricted: true, url: null, ghosts: [], exorcised: [], tombstones: [], curses: [] };

/** The tab the popup acts on: `?tab=<id>` if given (e2e opens popup.html in a normal tab), else the active tab. */
async function resolveTab(api: typeof chrome, search: string): Promise<number | undefined> {
  const param = new URLSearchParams(search).get("tab");
  if (param !== null && /^\d+$/.test(param)) return Number(param);
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export interface PopupOptions {
  /** The popup's sound player (muted unless the user turned sound on). */
  play?: (kind: SoundKind) => void;
}

export async function mountPopup(root: HTMLElement, api: typeof chrome, search: string, opts: PopupOptions = {}): Promise<void> {
  const doc = root.ownerDocument;
  const tabId = await resolveTab(api, search);
  const ask = async (type: "HAUNT" | "UNHAUNT" | "GET_STATE" | "FOLLOW_SITE"): Promise<TabState> => {
    if (tabId === undefined) return NO_TAB;
    const res = (await api.runtime.sendMessage({ type, tabId } satisfies PopupRequest).catch(() => undefined)) as
      | TabState
      | undefined;
    return res ?? NO_TAB;
  };

  const [state, settings] = await Promise.all([ask("GET_STATE"), createSettings(doc, api)]);

  const render = (s: TabState, opts: { focus?: boolean; error?: string } = {}) => {
    // A refresh must not lose a keyboard user's place (the primary button or a ghost row's button).
    const was = doc.activeElement as HTMLElement | null;
    const company = was?.dataset?.company;
    root.dataset.screen = screenFor(s);
    root.replaceChildren(...renderScreen(doc, { state: s, settings, onPrimary: () => act(s), onExorcise, error: opts.error }));
    if (opts.focus || was?.classList.contains("primary")) root.querySelector<HTMLButtonElement>(".primary")?.focus();
    else if (company) [...root.querySelectorAll<HTMLElement>("[data-company]")].find((b) => b.dataset.company === company)?.focus();
  };

  const onExorcise = async (company: string, exorcised: boolean) => {
    if (tabId === undefined) return;
    const msg: PopupRequest = exorcised ? { type: "LET_BACK", tabId, company } : { type: "EXORCISE", tabId, company };
    const next = (await api.runtime.sendMessage(msg).catch(() => undefined)) as TabState | undefined;
    if (next) render(next);
  };

  // Trackers that load later, and changes made from the costume, arrive through storage.session.
  // While Haunt or Un-haunt is in flight its own answer wins: a refresh then could show Un-haunt
  // before the haunt is in, or bring back a state from before the click. One refresh follows it.
  let busy = false;
  let missed = false;
  let epoch = 0;
  const refresh = async () => {
    if (busy) return void (missed = true);
    const asked = epoch;
    const s = await ask("GET_STATE");
    if (asked === epoch && !busy && root.isConnected) render(s);
  };
  api.storage.onChanged.addListener((_changes, area) => {
    if (area === "session" && root.isConnected) void refresh();
  });

  /** Haunt page (the whole site, if Chrome allows it) or Un-haunt. */
  const act = async (current: TabState) => {
    const button = root.querySelector<HTMLButtonElement>("button.primary");
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    const hauntNow = !current.haunted && !current.restricted;
    // Asked first, inside the click's user gesture: Chrome's access to this whole site, so the
    // haunt follows links on it. No means this page only. The prompt may close the popup before
    // it answers; then the background picks up the grant from permissions.onAdded.
    const site = hauntNow ? siteOf(current.url) : null;
    let asked: Promise<boolean> = Promise.resolve(false);
    try {
      if (site) asked = api.permissions.request({ origins: siteOrigins(site) }).catch(() => false);
    } catch {
      // a request Chrome refuses outright: this page only
    }
    // In the click's own task, so the popup's AudioContext starts with the gesture. Never awaited.
    if (hauntNow) opts.play?.("whoosh");
    busy = true;
    epoch++;
    let next = await ask(current.haunted ? "UNHAUNT" : "HAUNT");
    if (site && (await asked) === true) {
      if (!next.error) next = await ask("FOLLOW_SITE");
      // The haunt failed: nothing haunts the site, so its access goes straight back.
      else await api.permissions.remove({ origins: siteOrigins(site) }).catch(() => false);
    }
    busy = false;
    epoch++;
    render(next, { focus: true, error: next.error && !current.haunted ? HAUNT_ERROR : undefined });
    // Not after a failed haunt: the refresh would wipe its alert.
    if (missed && !next.error) void refresh();
    missed = false;
  };

  render(state);
}
