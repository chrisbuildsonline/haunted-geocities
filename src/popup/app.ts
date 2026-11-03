import type { PopupRequest, TabState } from "../data/types";
import { HAUNT_ERROR, renderScreen, screenFor } from "./screens";
import { createSettings } from "./settings";

const NO_TAB: TabState = { haunted: false, restricted: true, url: null };

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
  const ask = async (type: PopupRequest["type"]): Promise<TabState> => {
    if (tabId === undefined) return NO_TAB;
    const res = (await api.runtime.sendMessage({ type, tabId } satisfies PopupRequest).catch(() => undefined)) as
      | TabState
      | undefined;
    return res ?? NO_TAB;
  };

  const [state, settings] = await Promise.all([ask("GET_STATE"), createSettings(doc, api)]);

  const render = (s: TabState, opts: { focus?: boolean; error?: string } = {}) => {
    root.dataset.screen = screenFor(s);
    root.replaceChildren(...renderScreen(doc, { state: s, settings, onPrimary: () => act(s), error: opts.error }));
    if (opts.focus) root.querySelector<HTMLButtonElement>(".pill")?.focus();
  };

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
