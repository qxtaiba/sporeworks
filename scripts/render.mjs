import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { captureCanvas, launchBrowser, openCapturePage, parseArgs, startStaticServer } from "./browser-utils.mjs";

const cliArgs = parseArgs(process.argv.slice(2));
const config = cliArgs.config
  ? JSON.parse(await readFile(resolve(process.cwd(), String(cliArgs.config)), "utf8"))
  : {};
const args = { ...config, ...cliArgs };
if (typeof args.mask === "string") {
  args.mask = JSON.parse(await readFile(resolve(process.cwd(), args.mask), "utf8"));
}
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const output = resolve(process.cwd(), args.out ?? `grappleberry-${args.preset ?? "haze"}.png`);
await mkdir(dirname(output), { recursive: true });

const preview = await startStaticServer(resolve(projectRoot, "dist"));
const browser = await launchBrowser();
try {
  const page = await openCapturePage(browser, preview.origin, args);
  await captureCanvas(page, output);
  await page.close();
  console.log(output);
} finally {
  await browser.close();
  await preview.close();
}
