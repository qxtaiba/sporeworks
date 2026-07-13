import { defineConfig } from "vitest/config";

// Pure-logic unit tests only (e.g. renderer.test.ts's backingSize helper) —
// no DOM/WebGL needed, so node env is fine and fast. The browser render
// harness (scripts/test.mjs, `npm run test`) is unrelated and untouched.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
