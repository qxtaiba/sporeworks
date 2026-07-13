import { defineConfig } from "vite";

// The interactive editor/demo app. Builds into dist-app/ so it never
// collides with dist/, which is reserved for the publishable engine bundle
// (scripts/build-engine.mjs).
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-app",
  },
});
