import { defineConfig } from "vite";

// The app lives in app/ and builds to dist/. site/ stays the hand-written public site
// until the app replaces it.
export default defineConfig({
  root: "app",
  // Browsers without modulepreload (Safari before 17) still load the modules, only without
  // the early hint, so the polyfill is left out.
  build: { outDir: "../dist", emptyOutDir: true, modulePreload: { polyfill: false } },
});
