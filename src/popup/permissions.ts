import { LINK_CHECK_ORIGINS } from "../data/types";
import { h } from "./dom";
import { sprite, tombTile } from "./sprites";

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
  const allow = h(doc, "button", { type: "button", class: "primary", id: "allow" }, "Allow link checks");
  const result = h(doc, "p", { id: "result", class: "result status-field", role: "status", "aria-live": "polite" });
  const show = (text: string, status: "on" | "off") => {
    result.textContent = text;
    result.dataset.status = status;
  };
  const done = (text: string) => {
    show(text, "on");
    allow.disabled = true;
  };

  // One Win95 dialog: the title bar holds the page's h1, the body is a message box.
  doc.getElementById("app")!.append(
    h(
      doc,
      "div",
      { class: "window dialog" },
      h(doc, "header", { class: "titlebar" }, sprite(doc, "ghost", 16, "mark"), h(doc, "h1", {}, "Check links to other sites")),
      h(
        doc,
        "section",
        { class: "dialog-body", "aria-label": "Link checks" },
        h(doc, "div", { class: "perm-icon", "aria-hidden": "true" }, tombTile(doc, 48)),
        h(doc, "p", { class: "explain" }, EXPLANATION),
        allow,
        result,
      ),
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
