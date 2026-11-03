import { LINK_CHECK_ORIGINS } from "./data/types.ts";

const base = {
  manifest_version: 3,
  name: "Haunted GeoCities",
  version: "0.1.0",
  description: "Turn any modern web page into a 1998 GeoCities crypt. Un-haunt puts it back exactly as it was.",
  permissions: ["activeTab", "scripting", "declarativeNetRequest", "storage"],
  optional_host_permissions: LINK_CHECK_ORIGINS,
  background: { service_worker: "background.js" },
  action: { default_popup: "popup.html", default_title: "Haunted GeoCities" },
};

/**
 * The manifest written to the build output.
 *
 * Mode "e2e" (dist-e2e/, tests only) adds host_permissions for the local fixture server.
 * activeTab is granted only by a real toolbar click, which Playwright cannot perform, so
 * without this the e2e popup could not inject into fixture pages. The shipping build
 * (any other mode, dist/) never declares host_permissions; test/manifest.test.ts proves it.
 */
export function buildManifest(mode: string): typeof base & { host_permissions?: string[] } {
  if (mode === "e2e") return { ...base, host_permissions: ["http://127.0.0.1/*", "http://localhost/*"] };
  return { ...base };
}
