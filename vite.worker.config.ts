import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds src/worker.ts into a single self-contained ES module string.
// Deliberately NOT `?worker&inline` — that's a documented "works in dev,
// breaks in build" trap in library mode (vitejs/vite#13726, #14306).
// scripts/build-engine.mjs reads dist-worker/worker.js and splices it into
// the element bundle as a global constant.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/worker.ts"),
      formats: ["es"],
      fileName: () => "worker.js",
    },
    outDir: "dist-worker",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // The renderer has zero external runtime deps and worker.ts has no
        // dynamic imports, so this is a no-op today — kept as a guardrail
        // so the worker bundle can never split into a second chunk that
        // the splice step wouldn't know to inline.
        inlineDynamicImports: true,
      },
    },
  },
});
