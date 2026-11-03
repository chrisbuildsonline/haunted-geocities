import { AUDIO_KEY, LINK_CHECK_ORIGINS } from "../data/types";
import { h } from "./dom";

export const LINK_SUB = {
  off: "Asks Chrome to visit linked sites. Off.",
  on: "Checking links on other sites too.",
  denied: "Permission not granted.",
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
      // request() must run inside the click's user gesture, so no await before it.
      api.permissions.request(origins).catch(() => false).then((granted) => {
        link.input.checked = granted;
        link.subEl.textContent = granted ? LINK_SUB.on : LINK_SUB.denied;
      });
    } else {
      api.permissions.remove(origins).catch(() => false).then(() => {
        link.subEl.textContent = LINK_SUB.off;
      });
    }
  });

  const sound = row(doc, "sound", "Sound effects", audioOn ? SOUND_SUB.on : SOUND_SUB.off, audioOn);
  sound.input.addEventListener("change", () => {
    const on = sound.input.checked;
    sound.subEl.textContent = on ? SOUND_SUB.on : SOUND_SUB.off;
    void api.storage.local.set({ [AUDIO_KEY]: on });
  });

  return h(doc, "section", { class: "surface settings", "aria-label": "Settings" }, link.el, sound.el);
}
