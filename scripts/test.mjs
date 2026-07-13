import { stat, unlink, mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { launchBrowser, startStaticServer } from "./browser-utils.mjs";

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const root = resolve(new URL("..", import.meta.url).pathname);

const output = resolve(root, ".test-render.png");
await run(process.execPath, ["scripts/render.mjs", "--preset", "haze", "--seed", "determinism", "--size", "320", "--out", output], root);
const file = await stat(output);
if (file.size < 10_000) throw new Error(`Render is unexpectedly small: ${file.size} bytes`);
await unlink(output);
console.log("Shader compiled and deterministic capture completed.");

// Terra path: single-sphere geometry, mask-driven ink screening, phase-driven
// spin. Uses a tiny synthetic 24x10 landmask fixture — real fidelity isn't
// the point here, just that the mask texture upload + terra shader branch
// compile and produce a non-empty capture.
const terraOutput = resolve(root, ".test-render-terra.png");
const terraMask = resolve(root, "scripts/fixtures/terra-mask-test.json");
await run(process.execPath, ["scripts/render.mjs", "--preset", "terra", "--seed", "determinism-terra", "--size", "320", "--mask", terraMask, "--out", terraOutput], root);
const terraFile = await stat(terraOutput);
if (terraFile.size < 10_000) throw new Error(`Terra render is unexpectedly small: ${terraFile.size} bytes`);
await unlink(terraOutput);
console.log("Terra shader compiled and masked capture completed.");

// Worker smoke check: the renders above exercise the main-thread path, not
// the shipped dist/grappleberry.js, whose __WORKER_SOURCE__ splice has no
// other end-to-end check — a build-only breakage would ship silently. Load
// the real bundle, mount the element, confirm a dedicated worker spins up,
// and assert the canvas is non-blank via a compositor-level screenshot (a
// transferred canvas can't be read back from the main thread).
const builtBundle = resolve(root, "dist", "grappleberry.js");
const smokeDir = await mkdtemp(join(tmpdir(), "grappleberry-worker-smoke-"));
try {
  await copyFile(builtBundle, join(smokeDir, "grappleberry.js"));
  await writeFile(
    join(smokeDir, "index.html"),
    "<!doctype html><html><body style=\"margin:0;background:#202020\">\n" +
      "<grappleberry-organism preset=\"haze\" seed=\"worker-smoke\" " +
      "style=\"display:block;width:240px;height:240px\"></grappleberry-organism>\n" +
      "<script type=\"module\" src=\"/grappleberry.js\"></script>\n" +
      "</body></html>\n",
  );

  const smokeServer = await startStaticServer(smokeDir);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 320, height: 320, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let workerCreated = false;
    page.on("workercreated", () => { workerCreated = true; });

    await page.goto(smokeServer.origin, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction(
      () => Boolean(customElements.get("grappleberry-organism")),
      { timeout: 60_000 },
    );
    // Let the off-thread rAF loop actually paint a few real frames.
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 600));

    if (pageErrors.length > 0) {
      throw new Error(`Worker smoke check: page/console error(s): ${pageErrors.join(" | ")}`);
    }
    if (!workerCreated) {
      throw new Error("Worker smoke check: no dedicated Worker was created — capabilityProbe() failed, __WORKER_SOURCE__ didn't resolve, or the element silently stayed inert.");
    }

    const clip = await page.evaluate(() => {
      const rect = document.querySelector("grappleberry-organism").getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const screenshotBuffer = await page.screenshot({ clip });
    const { data, info } = await sharp(screenshotBuffer).raw().toBuffer({ resolveWithObject: true });

    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[i + channel];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    const range = max - min;
    if (range < 8) {
      throw new Error(`Worker smoke check: canvas looks blank (pixel value range ${range}, min ${min}, max ${max}) — the off-thread engine did not paint.`);
    }
    console.log(`Worker smoke check: dedicated worker created, off-thread canvas painted (pixel range ${range}).`);
  } finally {
    await browser.close();
    await smokeServer.close();
  }
} finally {
  await rm(smokeDir, { recursive: true, force: true });
}
