// Builds the worker and element/renderer bundles, then prepends the worker
// source as `globalThis.__WORKER_SOURCE__=...;` so the shipped file stays a
// single self-contained script. Not `vite ?worker&inline` — that's a
// documented "works in dev, breaks in build" trap in library mode
// (vitejs/vite#13726, #14306). The element references the bare
// `__WORKER_SOURCE__` identifier (declare const is erased), which resolves
// via scope-chain fallthrough to the prepended global — robust regardless
// of what the minifier does inside the bundle.
//
// Output: dist/grappleberry.js; pass `--out <path>` to write elsewhere.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

function parseOutFlag(argv) {
  const i = argv.indexOf("--out");
  if (i === -1) return resolve(pkgRoot, "dist/grappleberry.js");
  const value = argv[i + 1];
  if (!value) {
    console.error("--out requires a path argument");
    process.exit(1);
  }
  return resolve(process.cwd(), value);
}

const outPath = parseOutFlag(process.argv.slice(2));

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { cwd: pkgRoot, stdio: "inherit" });
}

// 1. Worker: its own self-contained ES module.
run("npx vite build --config vite.worker.config.ts");
const workerPath = resolve(pkgRoot, "dist-worker/worker.js");
const workerSrc = readFileSync(workerPath, "utf8");

// 2. Element/renderer lib bundle (unchanged entry/output — vite.lib.config.ts).
run("npx vite build --config vite.lib.config.ts");
const elementPath = resolve(pkgRoot, "lib/grappleberry.js");
const elementSrc = readFileSync(elementPath, "utf8");

// 3. Splice: prepend the worker source as a global constant.
const spliced = `globalThis.__WORKER_SOURCE__=${JSON.stringify(workerSrc)};\n${elementSrc}`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, spliced);

const kb = (s) => (s.length / 1024).toFixed(1);
console.log(`worker bundle:  ${kb(workerSrc)} KB (${workerPath})`);
console.log(`element bundle: ${kb(elementSrc)} KB (${elementPath})`);
console.log(`wrote ${outPath} (${kb(spliced)} KB)`);
