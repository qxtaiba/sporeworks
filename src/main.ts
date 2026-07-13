import "./style.css";
import { PRESETS, PRESET_ORDER, type PresetName } from "./presets";
import { GrappleberryRenderer, optionsForPreset, type GrappleberryOptions, type TerraMaskData } from "./renderer";

interface GrappleberryWindow extends Window {
  grappleberry?: {
    renderer: GrappleberryRenderer;
    setPhase: (phase: number) => void;
    setPreset: (preset: PresetName) => void;
    setSeed: (seed: string) => void;
    update: (options: Partial<GrappleberryOptions>) => void;
    // string | null: renderer.captureDataUrl() returns null when the
    // backing canvas is an OffscreenCanvas (worker mode). main.ts always
    // constructs the renderer over a real canvas, so this is null in type
    // only here, never in practice — see renderer.ts's captureDataUrl().
    captureDataUrl: () => string | null;
    getOptions: () => GrappleberryOptions;
  };
  __grappleberryReady?: boolean;
  // The CLI capture scripts inject a landmask fixture here (before page
  // scripts run, via Puppeteer's evaluateOnNewDocument) since structured
  // data doesn't fit cleanly into a URL query string.
  __grappleberryMaskData?: TerraMaskData;
}

const pageWindow = window as GrappleberryWindow;
const params = new URLSearchParams(window.location.search);
const requestedPreset = params.get("preset") as PresetName | null;
const presetName: PresetName = requestedPreset && requestedPreset in PRESETS ? requestedPreset : "haze";
const seed = params.get("seed") || "qxtaiba-grappleberry";
const captureMode = params.get("capture") === "1";
const transparent = params.get("transparent") === "1";
const phase = Number(params.get("phase") ?? "0.13");
const animate = !captureMode && params.get("animate") !== "0";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element.");

app.innerHTML = `
  <section class="shell ${captureMode ? "capture-mode" : ""}">
    <header class="masthead">
      <div>
        <span class="eyebrow">GENERATIVE IDENTITY SYSTEM / 02</span>
        <h1>GRAPPLEBERRY</h1>
      </div>
      <div class="coordinates">QXTAIBA.GRAPPLEBERRY.XYZ<br />WEBGL / SEEDED / LIVE</div>
    </header>

    <aside class="preset-rail" aria-label="Organism presets">
      ${PRESET_ORDER.map((name) => {
        const preset = PRESETS[name];
        return `<button class="preset-button ${name === presetName ? "active" : ""}" data-preset="${name}">
          <span>${preset.code}</span>
          <strong>${preset.label}</strong>
        </button>`;
      }).join("")}
    </aside>

    <div class="stage-wrap">
      <canvas id="stage" aria-label="Generated Grappleberry organism"></canvas>
      <div class="reticle top-left"></div>
      <div class="reticle bottom-right"></div>
      <div class="specimen-label">
        <span id="specimen-code">${PRESETS[presetName].code}</span>
        <strong id="specimen-name">${PRESETS[presetName].label}</strong>
        <small id="specimen-description">${PRESETS[presetName].description}</small>
      </div>
      <div class="status"><span class="status-dot"></span><span id="status-copy">LIVE CULTURE</span></div>
    </div>

    <aside class="controls">
      <div class="control-heading">
        <span>SPECIMEN PARAMETERS</span>
        <button id="toggle-motion" type="button">${animate ? "PAUSE" : "PLAY"}</button>
      </div>

      <label class="seed-control">
        <span>SEED</span>
        <div><input id="seed" value="${seed}" spellcheck="false" /><button id="randomize" type="button">↻</button></div>
      </label>

      <div id="sliders"></div>

      <div class="export-row">
        <button id="export-png" type="button">EXPORT PNG</button>
        <button id="copy-config" type="button">COPY CONFIG</button>
      </div>

      <p class="note">The source is the asset. Every specimen is reproducible from its preset, seed, and parameter values.</p>
    </aside>

    <footer class="footer">
      <span>ORGANIC / ALIEN / INFECTIOUS</span>
      <span>MMXXVI</span>
    </footer>
  </section>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("Missing #stage canvas.");

function optionalNumberParam(name: string): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

const initialOptions = optionsForPreset(presetName, seed, {
  phase: Number.isFinite(phase) ? phase : 0.13,
  animate,
  transparent,
  growth: optionalNumberParam("growth"),
  roughness: optionalNumberParam("roughness"),
  fusion: optionalNumberParam("fusion"),
  halftone: optionalNumberParam("halftone"),
  contrast: optionalNumberParam("contrast"),
  threshold: optionalNumberParam("threshold"),
  glitch: optionalNumberParam("glitch"),
  ascii: optionalNumberParam("ascii"),
  rotationX: optionalNumberParam("rotationX"),
  rotationY: optionalNumberParam("rotationY"),
  rotationZ: optionalNumberParam("rotationZ"),
  camera: optionalNumberParam("camera"),
  lightLon: optionalNumberParam("lightLon"),
  paletteStrength: optionalNumberParam("paletteStrength"),
});

const renderer = new GrappleberryRenderer(canvas, initialOptions);

if (pageWindow.__grappleberryMaskData) {
  renderer.setMaskData(pageWindow.__grappleberryMaskData);
}

const sliderDefinitions: Array<{
  key: keyof GrappleberryOptions;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "growth", label: "GROWTH", min: 0.55, max: 1.18, step: 0.01 },
  { key: "fusion", label: "FUSION", min: 0.005, max: 0.12, step: 0.001 },
  { key: "roughness", label: "EROSION", min: 0.0, max: 0.24, step: 0.005 },
  { key: "halftone", label: "SCREEN", min: 0.72, max: 3.2, step: 0.02 },
  { key: "contrast", label: "CONTRAST", min: 0.65, max: 2.25, step: 0.01 },
  { key: "threshold", label: "EXPOSURE", min: 0.3, max: 0.72, step: 0.005 },
  { key: "glitch", label: "TRANSMISSION", min: 0, max: 1.2, step: 0.01 },
  { key: "ascii", label: "TERMINAL DECAY", min: 0, max: 1.2, step: 0.01 },
  { key: "rotationY", label: "ORBIT", min: -1.6, max: 1.6, step: 0.01 },
];

const slidersRoot = document.querySelector<HTMLDivElement>("#sliders");
const sliderInputs = new Map<keyof GrappleberryOptions, HTMLInputElement>();

function numericOption(key: keyof GrappleberryOptions): number {
  const value = renderer.getOptions()[key];
  return typeof value === "number" ? value : 0;
}

function buildSliders(): void {
  if (!slidersRoot) return;
  slidersRoot.innerHTML = sliderDefinitions.map((definition) => `
    <label class="range-control">
      <span>${definition.label}</span>
      <output data-output="${definition.key}">${numericOption(definition.key).toFixed(2)}</output>
      <input
        data-key="${definition.key}"
        type="range"
        min="${definition.min}"
        max="${definition.max}"
        step="${definition.step}"
        value="${numericOption(definition.key)}"
      />
    </label>
  `).join("");
  sliderInputs.clear();
  slidersRoot.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
    const key = input.dataset.key as keyof GrappleberryOptions;
    sliderInputs.set(key, input);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      renderer.update({ [key]: value });
      const output = slidersRoot.querySelector<HTMLOutputElement>(`[data-output='${key}']`);
      if (output) output.value = value.toFixed(2);
    });
  });
}

function syncPresetUI(name: PresetName): void {
  document.querySelectorAll<HTMLButtonElement>(".preset-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });
  const preset = PRESETS[name];
  const code = document.querySelector<HTMLElement>("#specimen-code");
  const specimenName = document.querySelector<HTMLElement>("#specimen-name");
  const description = document.querySelector<HTMLElement>("#specimen-description");
  if (code) code.textContent = preset.code;
  if (specimenName) specimenName.textContent = preset.label;
  if (description) description.textContent = preset.description;
  buildSliders();
}

function applyPreset(name: PresetName): void {
  renderer.setPreset(name);
  syncPresetUI(name);
}

buildSliders();

document.querySelectorAll<HTMLButtonElement>(".preset-button").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset as PresetName));
});

const seedInput = document.querySelector<HTMLInputElement>("#seed");
seedInput?.addEventListener("change", () => renderer.setSeed(seedInput.value.trim() || "qxtaiba-grappleberry"));
seedInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") renderer.setSeed(seedInput.value.trim() || "qxtaiba-grappleberry");
});

document.querySelector<HTMLButtonElement>("#randomize")?.addEventListener("click", () => {
  const nextSeed = `specimen-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
  if (seedInput) seedInput.value = nextSeed;
  renderer.setSeed(nextSeed);
});

const toggleMotion = document.querySelector<HTMLButtonElement>("#toggle-motion");
toggleMotion?.addEventListener("click", () => {
  const next = !renderer.getOptions().animate;
  renderer.setAnimating(next);
  toggleMotion.textContent = next ? "PAUSE" : "PLAY";
  const statusCopy = document.querySelector<HTMLElement>("#status-copy");
  if (statusCopy) statusCopy.textContent = next ? "LIVE CULTURE" : "CULTURE HELD";
});

document.querySelector<HTMLButtonElement>("#export-png")?.addEventListener("click", () => renderer.capturePng());

document.querySelector<HTMLButtonElement>("#copy-config")?.addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  await navigator.clipboard.writeText(JSON.stringify(renderer.getOptions(), null, 2));
  const original = button.textContent;
  button.textContent = "COPIED";
  setTimeout(() => { button.textContent = original; }, 900);
});

const resizeObserver = new ResizeObserver(() => renderer.resize());
resizeObserver.observe(canvas);

pageWindow.grappleberry = {
  renderer,
  setPhase: (nextPhase: number) => renderer.setPhase(nextPhase),
  setPreset: (nextPreset: PresetName) => {
    applyPreset(nextPreset);
  },
  setSeed: (nextSeed: string) => {
    if (seedInput) seedInput.value = nextSeed;
    renderer.setSeed(nextSeed);
  },
  update: (options: Partial<GrappleberryOptions>) => renderer.update(options),
  captureDataUrl: () => renderer.captureDataUrl(),
  getOptions: () => renderer.getOptions(),
};

// Chromium capture scripts wait for this after the shader has compiled and a
// complete frame has actually been drawn.
requestAnimationFrame(() => {
  renderer.resize();
  renderer.render();
  pageWindow.__grappleberryReady = true;
});
