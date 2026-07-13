import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/library.ts"),
      formats: ["es"],
      fileName: () => "grappleberry.js",
    },
    outDir: "lib",
    emptyOutDir: true,
    sourcemap: true,
  },
});
