// Builds the off-thread engine worker and the element/renderer lib bundle,
// then splices the worker source into the element bundle as a global
// constant so the shipped file stays a single self-contained script. See
// docs/superpowers/specs/2026-07-12-offscreen-engine-design.md §8.
//
// Not wired into `vite ?worker&inline` — that's a documented "works in dev,
// breaks in build" trap in library mode (vitejs/vite#13726, #14306).
// Instead the worker is its own vite lib build (vite.worker.config.ts) and
// this script prepends its output as `globalThis.__WORKER_SOURCE__=...;` to
// the element bundle (vite.lib.config.ts's output). The element's
// createEngineWorker() (grappleberry-element.ts) references the bare
// `__WORKER_SOURCE__` identifier, which has no runtime declaration in the
// compiled output (TypeScript erases `declare const`), so it resolves via
// ordinary JS scope-chain fallthrough to `globalThis.__WORKER_SOURCE__`.
// Prepending a global assignment is robust regardless of what the minifier
// does inside the element bundle — no token search-and-replace needed.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const genRoot = resolve(__dirname, ".."); // tools/grappleberry-generator
const repoRoot = resolve(genRoot, "..", ".."); // repo root

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { cwd: genRoot, stdio: "inherit" });
}

// 1. Worker: its own self-contained ES module.
run("npx vite build --config vite.worker.config.ts");
const workerPath = resolve(genRoot, "dist-worker/worker.js");
const workerSrc = readFileSync(workerPath, "utf8");

// 2. Element/renderer lib bundle (unchanged entry/output — vite.lib.config.ts).
run("npx vite build --config vite.lib.config.ts");
const elementPath = resolve(genRoot, "lib/grappleberry.js");
const elementSrc = readFileSync(elementPath, "utf8");

// 3. Splice: prepend the worker source as a global constant.
const spliced = `globalThis.__WORKER_SOURCE__=${JSON.stringify(workerSrc)};\n${elementSrc}`;

const outPath = resolve(repoRoot, "public/grappleberry.js");
writeFileSync(outPath, spliced);

const kb = (s) => (s.length / 1024).toFixed(1);
console.log(`worker bundle:  ${kb(workerSrc)} KB (${workerPath})`);
console.log(`element bundle: ${kb(elementSrc)} KB (${elementPath})`);
console.log(`wrote ${outPath} (${kb(spliced)} KB)`);
