import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { captureCanvas, launchBrowser, openCapturePage, parseArgs, startStaticServer } from "./browser-utils.mjs";

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const output = resolve(process.cwd(), args.out ?? "examples/concept-contact-sheet-v2.png");
const temp = resolve(projectRoot, ".contact-sheet");
const presets = ["haze", "microbe", "glitch", "ascii"];
await mkdir(temp, { recursive: true });
await mkdir(resolve(output, ".."), { recursive: true });

const preview = await startStaticServer(resolve(projectRoot, "dist"));
const browser = await launchBrowser();
try {
  for (const preset of presets) {
    const page = await openCapturePage(browser, preview.origin, {
      preset,
      seed: args.seed ?? "qxtaiba-grappleberry",
      size: args.size ?? 768,
      phase: args.phase ?? 0.13,
    });
    await captureCanvas(page, resolve(temp, `${preset}.png`));
    await page.close();
  }
} finally {
  await browser.close();
  await preview.close();
}

await run("ffmpeg", [
  "-y",
  "-i", resolve(temp, "haze.png"),
  "-i", resolve(temp, "microbe.png"),
  "-i", resolve(temp, "glitch.png"),
  "-i", resolve(temp, "ascii.png"),
  "-filter_complex",
  "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[out]",
  "-map", "[out]",
  output,
]);
console.log(output);
