import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build, defineConfig, type Plugin } from "vite";
import { buildManifest } from "./src/manifest.ts";

// `vite build` → dist/ (shipping). `vite build --mode e2e` → dist-e2e/ (tests only, see src/manifest.ts).
const root = import.meta.dirname;

// background.js and content.js are each built as their own self-contained IIFE: content.js is
// injected with chrome.scripting.executeScript, which cannot load ES modules or shared chunks.
function scripts(outDir: string, mode: string): Plugin {
  return {
    name: "hg-scripts-and-manifest",
    apply: "build",
    async closeBundle() {
      for (const name of ["background", "content"]) {
        await build({
          configFile: false,
          root,
          mode,
          logLevel: "warn",
          build: {
            outDir,
            emptyOutDir: false,
            copyPublicDir: false,
            lib: {
              entry: resolve(root, `src/${name}/index.ts`),
              formats: ["iife"],
              name: `hg_${name}`,
              fileName: () => `${name}.js`,
            },
          },
        });
      }
      writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(buildManifest(mode), null, 2) + "\n");
    },
  };
}

export default defineConfig(({ mode }) => {
  const outDir = resolve(root, mode === "e2e" ? "dist-e2e" : "dist");
  return {
    root: resolve(root, "src/popup"),
    base: "./",
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: { popup: resolve(root, "src/popup/popup.html") },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name][extname]",
        },
      },
    },
    plugins: [scripts(outDir, mode)],
  };
});
