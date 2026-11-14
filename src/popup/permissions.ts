import { LINK_CHECK_ORIGINS } from "../data/types";
import { h } from "./dom";
import { sprite } from "./sprites";

export const EXPLANATION =
  "Haunted GeoCities will send cookie-free requests to the sites a haunted page links to, to find dead links. Chrome words this as access to all websites.";

export const RESULT = {
  on: "Link checks are on. You can close this tab.",
  already: "Link checks are already on.",
  refused: "Chrome didn't allow it. Link checks stay off.",
};

/**
 * permissions.html: the one page that asks Chrome for the link-check origins. It lives in a tab
 * because Chrome's permission dialog closes the toolbar popup before the answer arrives.
 */
export async function renderPermissions(doc: Document, api: typeof chrome): Promise<void> {
  const allow = h(doc, "button", { type: "button", class: "pill", id: "allow" }, "Allow link checks");
  const result = h(doc, "p", { id: "result", class: "result", role: "status", "aria-live": "polite" });
  const show = (text: string, status: "on" | "off") => {
    result.textContent = text;
    result.dataset.status = status;
  };
  const done = (text: string) => {
    show(text, "on");
    allow.disabled = true;
  };

  doc.getElementById("app")!.append(
    h(doc, "header", { class: "top" }, sprite(doc, "ghost", 24, "mark"), h(doc, "span", { class: "brand" }, "Haunted GeoCities")),
    h(
      doc,
      "section",
      { class: "surface", "aria-label": "Link checks" },
      h(doc, "div", { class: "perm-icon", "aria-hidden": "true" }, sprite(doc, "tombstone", 24, "perm-sprite")),
      h(doc, "h1", { class: "title" }, "Check links to other sites"),
      h(doc, "p", { class: "muted" }, EXPLANATION),
      allow,
      result,
    ),
  );

  const origins = { origins: LINK_CHECK_ORIGINS };
  allow.addEventListener("click", () => {
    // No await before request(): it must run inside the click's user gesture.
    api.permissions
      .request(origins)
      .catch(() => false)
      .then((granted) => (granted ? done(RESULT.on) : show(RESULT.refused, "off")));
  });
  if (await api.permissions.contains(origins).catch(() => false)) done(RESULT.already);
}
