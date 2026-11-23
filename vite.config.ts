import { defineConfig, type Plugin } from "vite";
import data from "./app/src/catalog.json" with { type: "json" };
import { parseCatalog } from "./app/src/core/catalog";
import { llmsText, publicCatalog } from "./app/src/core/publish";

/** catalog.json and llms.txt at the app's root, made from the catalog on every build and served by the dev server. */
function publishCatalog(): Plugin {
  const catalog = parseCatalog(data);
  const files: Record<string, { type: string; body: string }> = {
    "catalog.json": { type: "application/json", body: `${JSON.stringify(publicCatalog(catalog), null, 2)}\n` },
    "llms.txt": { type: "text/plain; charset=utf-8", body: llmsText(catalog) },
  };
  return {
    name: "fontbend-publish-catalog",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files[((req as { url?: string }).url ?? "").split("?")[0]!.slice(1)];
        if (!file) return next();
        res.setHeader("Content-Type", file.type);
        res.end(file.body);
      });
    },
    generateBundle() {
      for (const [fileName, { body }] of Object.entries(files)) this.emitFile({ type: "asset", fileName, source: body });
    },
  };
}

// The app lives in app/ and builds to dist/; the deploy puts site/ on top of it.
export default defineConfig({
  root: "app",
  plugins: [publishCatalog()],
  // Browsers without modulepreload (Safari before 17) still load the modules, only without
  // the early hint, so the polyfill is left out.
  build: { outDir: "../dist", emptyOutDir: true, modulePreload: { polyfill: false } },
  // The WOFF2 workers get a folder of their own: their encoder builds functions from strings,
  // which _headers allows there and nowhere else.
  worker: {
    rolldownOptions: {
      output: { entryFileNames: (chunk) => (chunk.name.includes("woff2") ? "assets/woff2/[name]-[hash].js" : "assets/[name]-[hash].js") },
    },
  },
});
