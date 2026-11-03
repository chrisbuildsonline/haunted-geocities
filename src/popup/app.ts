import type { PopupRequest, TabState } from "../data/types";
import { HAUNT_ERROR, renderScreen, screenFor } from "./screens";
import { createSettings } from "./settings";

const NO_TAB: TabState = { haunted: false, restricted: true, url: null, ghosts: [], exorcised: [] };

/** The tab the popup acts on: `?tab=<id>` if given (e2e opens popup.html in a normal tab), else the active tab. */
async function resolveTab(api: typeof chrome, search: string): Promise<number | undefined> {
  const param = new URLSearchParams(search).get("tab");
  if (param !== null && /^\d+$/.test(param)) return Number(param);
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export async function mountPopup(root: HTMLElement, api: typeof chrome, search: string): Promise<void> {
  const doc = root.ownerDocument;
  const tabId = await resolveTab(api, search);
  const ask = async (type: "HAUNT" | "UNHAUNT" | "GET_STATE"): Promise<TabState> => {
    if (tabId === undefined) return NO_TAB;
    const res = (await api.runtime.sendMessage({ type, tabId } satisfies PopupRequest).catch(() => undefined)) as
      | TabState
      | undefined;
    return res ?? NO_TAB;
  };

  const [state, settings] = await Promise.all([ask("GET_STATE"), createSettings(doc, api)]);

  const render = (s: TabState, opts: { focus?: boolean; error?: string } = {}) => {
    // A refresh must not lose a keyboard user's place (the pill or a ghost row's button).
    const was = doc.activeElement as HTMLElement | null;
    const company = was?.dataset?.company;
    root.dataset.screen = screenFor(s);
    root.replaceChildren(...renderScreen(doc, { state: s, settings, onPrimary: () => act(s), onExorcise, error: opts.error }));
    if (opts.focus || was?.classList.contains("pill")) root.querySelector<HTMLButtonElement>(".pill")?.focus();
    else if (company) [...root.querySelectorAll<HTMLElement>("[data-company]")].find((b) => b.dataset.company === company)?.focus();
  };

  const onExorcise = async (company: string, exorcised: boolean) => {
    if (tabId === undefined) return;
    const msg: PopupRequest = exorcised ? { type: "LET_BACK", tabId, company } : { type: "EXORCISE", tabId, company };
    const next = (await api.runtime.sendMessage(msg).catch(() => undefined)) as TabState | undefined;
    if (next) render(next);
  };

  // Trackers that load later, and changes made from the costume, arrive through storage.session.
  api.storage.onChanged.addListener(async (_changes, area) => {
    if (area === "session" && root.isConnected) render(await ask("GET_STATE"));
  });

  const act = async (current: TabState) => {
    const button = root.querySelector<HTMLButtonElement>(".pill");
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    const next = await ask(current.haunted ? "UNHAUNT" : "HAUNT");
    render(next, { focus: true, error: next.error && !current.haunted ? HAUNT_ERROR : undefined });
  };

  render(state);
}
