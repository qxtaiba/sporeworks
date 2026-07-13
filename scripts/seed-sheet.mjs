import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startStaticServer, launchBrowser, openCapturePage, captureCanvas, parseArgs } from './browser-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const seeds = (args.seeds ? String(args.seeds).split(',') : [
  'qxtaiba','grappleberry','qan205','specimen-01','mycelium','substrate',
  'cthdrl','berry-core','grapple-void','culture-07','qxtaiba-home','living-system',
]).map((seed) => seed.trim()).filter(Boolean);
const preset = args.preset ?? 'haze';
const out = resolve(args.out ?? 'examples/seeds');
await mkdir(out, { recursive: true });
const preview = await startStaticServer(resolve('dist-app'));
const browser = await launchBrowser();
try {
  const page = await openCapturePage(browser, preview.origin, {
    preset,
    seed: seeds[0],
    size: args.size ?? 256,
    phase: args.phase ?? 0.13,
  });
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    await page.evaluate((nextSeed) => window.grappleberry.setSeed(nextSeed), seed);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
    await captureCanvas(page, resolve(out, `${String(index).padStart(2, '0')}-${seed}.png`));
    process.stdout.write(`\r${index + 1}/${seeds.length}`);
  }
  process.stdout.write('\n');
  await page.close();
} finally {
  await browser.close();
  await preview.close();
}
