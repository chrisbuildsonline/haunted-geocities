import { AUDIO_KEY, LINK_CHECK_ORIGINS } from "../data/types";
import { h } from "./dom";

export const LINK_SUB = {
  off: "Asks Chrome to visit linked sites. Off.",
  on: "Checking links on other sites too.",
  ask: "Finish on the page that just opened.",
};
export const SOUND_SUB = { off: "Muted", on: "On · plays only after you click" };

function row(doc: Document, id: string, title: string, sub: string, checked: boolean) {
  const subEl = h(doc, "p", { class: "row-sub", id: `${id}-sub`, "aria-live": "polite" }, sub);
  const input = h(doc, "input", { type: "checkbox", role: "switch", id, class: "switch", "aria-describedby": subEl.id });
  input.checked = checked;
  const el = h(doc, "div", { class: "row" }, h(doc, "div", { class: "row-text" }, h(doc, "label", { for: id, class: "row-title" }, title), subEl), input);
  return { el, input, subEl };
}

/** The settings surface. Built once per popup and kept across screen changes. */
export async function createSettings(doc: Document, api: typeof chrome): Promise<HTMLElement> {
  const origins = { origins: LINK_CHECK_ORIGINS };
  const [linkOn, stored] = await Promise.all([
    api.permissions.contains(origins).catch(() => false),
    api.storage.local.get({ [AUDIO_KEY]: false }),
  ]);
  const audioOn = stored[AUDIO_KEY] === true;

  const link = row(doc, "link-check", "Check links to other sites", linkOn ? LINK_SUB.on : LINK_SUB.off, linkOn);
  link.input.addEventListener("change", () => {
    if (link.input.checked) {
      // Chrome's permission dialog closes the toolbar popup before it answers, so the asking
      // happens on permissions.html in a tab. Not granted yet: the switch goes back to off.
      link.input.checked = false;
      link.subEl.textContent = LINK_SUB.ask;
      api.tabs.create({ url: api.runtime.getURL("permissions.html") }).catch(() => {
        link.subEl.textContent = LINK_SUB.off;
      });
    } else {
      api.permissions.remove(origins).catch(() => false).then(() => {
        link.subEl.textContent = LINK_SUB.off;
      });
    }
  });
  // Follow the grant while this popup stays open. Re-read contains: the event may name other origins.
  const sync = (on: boolean) => {
    link.input.checked = on;
    link.subEl.textContent = on ? LINK_SUB.on : LINK_SUB.off;
  };
  const follow = (p: chrome.permissions.Permissions) => {
    if (p.origins?.length) void api.permissions.contains(origins).catch(() => false).then(sync);
  };
  api.permissions.onAdded.addListener(follow);
  api.permissions.onRemoved.addListener(follow);

  const sound = row(doc, "sound", "Sound effects", audioOn ? SOUND_SUB.on : SOUND_SUB.off, audioOn);
  sound.input.addEventListener("change", () => {
    const on = sound.input.checked;
    sound.subEl.textContent = on ? SOUND_SUB.on : SOUND_SUB.off;
    void api.storage.local.set({ [AUDIO_KEY]: on });
  });

  return h(doc, "section", { class: "surface settings", "aria-label": "Settings" }, link.el, sound.el);
}
