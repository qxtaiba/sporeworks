import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { captureCanvas, launchBrowser, openCapturePage, parseArgs, startStaticServer } from "./browser-utils.mjs";

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const cliArgs = parseArgs(process.argv.slice(2));
const config = cliArgs.config
  ? JSON.parse(await readFile(resolve(process.cwd(), String(cliArgs.config)), "utf8"))
  : {};
const args = { ...config, ...cliArgs };
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const output = resolve(process.cwd(), args.out ?? `grappleberry-${args.preset ?? "haze"}.gif`);
const frames = Math.max(2, Number(args.frames ?? 48));
const fps = Math.max(1, Number(args.fps ?? 16));
const frameDirectory = resolve(projectRoot, ".frames");
await rm(frameDirectory, { recursive: true, force: true });
await mkdir(frameDirectory, { recursive: true });
await mkdir(dirname(output), { recursive: true });

const preview = await startStaticServer(resolve(projectRoot, "dist"));
const browser = await launchBrowser();
try {
  const page = await openCapturePage(browser, preview.origin, { ...args, phase: 0 });
  for (let index = 0; index < frames; index += 1) {
    const phase = index / frames;
    await page.evaluate((nextPhase) => window.grappleberry.setPhase(nextPhase), phase);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 16));
    const framePath = resolve(frameDirectory, `frame-${String(index).padStart(4, "0")}.png`);
    await captureCanvas(page, framePath);
    process.stdout.write(`\rframe ${index + 1}/${frames}`);
  }
  process.stdout.write("\n");
  await page.close();
} finally {
  await browser.close();
  await preview.close();
}

const palette = resolve(frameDirectory, "palette.png");
await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", resolve(frameDirectory, "frame-%04d.png"), "-vf", "palettegen=max_colors=128:stats_mode=diff", palette]);
await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", resolve(frameDirectory, "frame-%04d.png"), "-i", palette, "-lavfi", "paletteuse=dither=bayer:bayer_scale=3", "-loop", "0", output]);
await rm(frameDirectory, { recursive: true, force: true });
console.log(output);
