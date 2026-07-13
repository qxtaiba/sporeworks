import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export async function startStaticServer(rootDirectory) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/") pathname = "/index.html";
      const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      let filePath = join(rootDirectory, safePath);
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
      } catch {
        filePath = join(rootDirectory, "index.html");
      }
      const body = await readFile(filePath);
      response.statusCode = 200;
      response.setHeader("Content-Type", mimeTypes[extname(filePath)] ?? "application/octet-stream");
      response.end(body);
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start preview server.");
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function executableFromPath(names) {
  for (const name of names) {
    const result = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
    if (result.status === 0) {
      const candidate = result.stdout.trim().split(/\r?\n/)[0];
      if (candidate) return candidate;
    }
  }
  return null;
}

function resolveBrowserExecutable() {
  const configured = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`Configured browser does not exist: ${configured}`);
    return configured;
  }

  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      ]
    : process.platform === "win32"
      ? [
          join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
          join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
          join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
        ]
      : [
          "/usr/bin/google-chrome-stable",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/snap/bin/chromium",
        ];

  return firstExisting(candidates)
    || executableFromPath(["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"])
    || (() => {
      throw new Error("No Chrome/Chromium executable found. Set CHROMIUM_PATH to its full path.");
    })();
}

function displaySocketExists(display) {
  const match = /^:(\d+)/.exec(display || "");
  return Boolean(match && existsSync(`/tmp/.X11-unix/X${match[1]}`));
}

async function startVirtualDisplayIfNeeded() {
  if (process.platform !== "linux" || process.env.GRAPPLEBERRY_HEADFUL === "0") return null;
  if (process.env.DISPLAY && displaySocketExists(process.env.DISPLAY)) return null;

  const xvfb = firstExisting(["/usr/bin/Xvfb", "/usr/local/bin/Xvfb"]) || executableFromPath(["Xvfb"]);
  if (!xvfb) return null;

  let number = 90 + Math.floor(Math.random() * 90);
  while (existsSync(`/tmp/.X11-unix/X${number}`)) number += 1;
  const display = `:${number}`;
  const child = spawn(xvfb, [display, "-screen", "0", "1920x1920x24", "-ac", "+extension", "GLX", "+render"], {
    stdio: "ignore",
  });
  process.env.DISPLAY = display;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (displaySocketExists(display)) return child;
    if (child.exitCode !== null) throw new Error(`Xvfb exited with code ${child.exitCode}.`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  child.kill("SIGTERM");
  throw new Error(`Xvfb did not become ready on ${display}.`);
}

export async function launchBrowser() {
  const virtualDisplay = await startVirtualDisplayIfNeeded();
  const shouldRunHeadful = process.env.GRAPPLEBERRY_HEADFUL === "1"
    || Boolean(process.env.DISPLAY)
    || Boolean(virtualDisplay);

  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: !shouldRunHeadful,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--no-proxy-server",
      "--proxy-bypass-list=*",
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
      "--allow-file-access-from-files",
      "--disable-web-security",
    ],
  });

  if (virtualDisplay) {
    const closeBrowser = browser.close.bind(browser);
    browser.close = async () => {
      try {
        await closeBrowser();
      } finally {
        virtualDisplay.kill("SIGTERM");
      }
    };
  }

  return browser;
}

export async function openCapturePage(browser, origin, options) {
  const page = await browser.newPage();
  const size = Number(options.size ?? 1024);
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  // Structured data (a landmask fixture) doesn't fit a URL query string —
  // inject it onto window before any page script runs, so main.ts can pick
  // it up synchronously during module init.
  if (options.mask && typeof options.mask === "object") {
    await page.evaluateOnNewDocument((mask) => {
      window.__grappleberryMaskData = mask;
    }, options.mask);
  }
  const query = new URLSearchParams({
    capture: "1",
    animate: "0",
    preset: options.preset ?? "haze",
    seed: options.seed ?? "qxtaiba-grappleberry",
    phase: String(options.phase ?? 0.13),
    transparent: String(options.transparent === true || options.transparent === "true" ? 1 : 0),
  });
  for (const key of [
    "growth", "roughness", "fusion", "halftone", "contrast", "threshold",
    "glitch", "ascii", "rotationX", "rotationY", "rotationZ", "camera", "lightLon", "paletteStrength",
  ]) {
    if (options[key] !== undefined) query.set(key, String(options[key]));
  }
  page.on("console", (message) => {
    if (message.type() === "error") console.error("[browser]", message.text());
  });
  page.on("pageerror", (error) => console.error("[browser]", error.message));
  await page.goto(`${origin}/?${query}`, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => window.__grappleberryReady === true, { timeout: 120000 });
  return page;
}

export async function captureCanvas(page, outputPath) {
  const dataUrl = await page.evaluate(() => window.grappleberry.captureDataUrl());
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, Buffer.from(base64, "base64")));
}
