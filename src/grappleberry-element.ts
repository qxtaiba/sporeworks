import { optionsForPreset, paletteStrengthForName, type GrappleberryOptions, type TerraMaskData } from "./renderer";
import { PRESETS, type PresetName } from "./presets";
import { capabilityProbe } from "./capability";
import { attributeToCommand, type EngineMessage } from "./engine-messages";

// Injected by scripts/build-engine.mjs at build time (E6): the splice step
// replaces this with the JSON-stringified built worker source, so the
// shipped grappleberry.js stays a single self-contained script. In raw TS
// (dev, typecheck, vitest) it's undefined, so createEngineWorker() falls
// through to the dev/module-worker path below.
declare const __WORKER_SOURCE__: string | undefined;

const observedNumericAttributes: Array<keyof GrappleberryOptions> = [
  "phase",
  "growth",
  "roughness",
  "fusion",
  "halftone",
  "contrast",
  "threshold",
  "glitch",
  "ascii",
  "rotationX",
  "rotationY",
  "rotationZ",
  "camera",
  "lightLon",
];

const numericAttributeName = (key: keyof GrappleberryOptions): string =>
  key === "rotationX" ? "rotation-x"
  : key === "rotationY" ? "rotation-y"
  : key === "rotationZ" ? "rotation-z"
  : key === "lightLon" ? "light-lon"
  : key;

/** Spins up the off-thread engine worker. In production `__WORKER_SOURCE__`
 * is spliced in by scripts/build-engine.mjs as a string constant, so the
 * worker runs from a same-origin Blob URL and grappleberry.js stays a
 * single self-contained script (no separate worker asset to serve). In
 * dev/typecheck (no splice), it falls back to a module worker resolved
 * from this file's own source path — the generator's own vite dev server
 * handles that resolution; production never takes this branch. */
function createEngineWorker(): Worker {
  const src = typeof __WORKER_SOURCE__ === "string" ? __WORKER_SOURCE__ : "";
  if (src.length) {
    return new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  }
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}

export class GrappleberryElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      "preset",
      "seed",
      "phase",
      "animate",
      "transparent",
      "growth",
      "roughness",
      "fusion",
      "halftone",
      "contrast",
      "threshold",
      "glitch",
      "ascii",
      "rotation-x",
      "rotation-y",
      "rotation-z",
      "camera",
      "light-lon",
      "fps",
      "resolution",
      "palette",
    ];
  }

  private worker: Worker | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private visibilityHandler: (() => void) | null = null;
  private attributeAnimate = true;
  private isIntersecting = true;
  private pendingMaskData: TerraMaskData | null = null;

  connectedCallback(): void {
    if (this.worker) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { display: block; min-width: 1px; min-height: 1px; contain: layout paint size; }
        canvas { display: block; width: 100%; height: 100%; }
      </style>
      <canvas part="canvas" aria-label="Generated Grappleberry organism"></canvas>
    `;
    this.canvas = shadow.querySelector("canvas");
    if (!this.canvas) throw new Error("Unable to create Grappleberry canvas.");

    // Real capability probe (not API-presence-only — see capability.ts).
    // On failure the element stays inert: no getContext(), no transfer, no
    // worker. GrappleberryMark's existing PNG still keeps showing. Critical
    // ordering: nothing above this line may call getContext() on
    // this.canvas — that would throw InvalidStateError on the transfer
    // below.
    if (!capabilityProbe()) return;

    const preset = this.readPreset();
    this.attributeAnimate = this.readBoolean("animate", true);
    const options = optionsForPreset(preset, this.getAttribute("seed") || "qxtaiba-grappleberry", {
      phase: this.readNumber("phase") ?? 0.13,
      animate: this.attributeAnimate,
      transparent: this.readBoolean("transparent", false),
      paletteStrength: paletteStrengthForName(this.getAttribute("palette")),
    });
    this.applyNumericAttributes(options);

    // `maskData` may have been set as a plain instance property before this
    // element was upgraded (or before it was connected). There's no
    // worker-side consumer for it (terra is parked, §4/§9), but keep
    // replaying the upgrade so the property accessor itself stays correct.
    this.upgradeProperty("maskData");

    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker = createEngineWorker();
    const r = this.getBoundingClientRect();
    const initMessage: EngineMessage = {
      type: "init",
      canvas: offscreen,
      options,
      fps: this.readNumber("fps"),
      resolution: this.readNumber("resolution"),
      dpr: Math.min(devicePixelRatio || 1, 1.5),
      cssW: r.width || 300,
      cssH: r.height || 300,
    };
    this.worker.postMessage(initMessage, [offscreen]);

    this.resizeObserver = new ResizeObserver(() => this.postResize());
    this.resizeObserver.observe(this);
    this.setupVisibilityGating();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
    // Belt-and-braces: post `destroy` first (the one-way protocol has no
    // ack, so this is best-effort if the worker is mid-microtask), then
    // terminate synchronously — that's the actual, guaranteed loop kill.
    this.worker?.postMessage({ type: "destroy" } satisfies EngineMessage);
    this.worker?.terminate();
    this.worker = null;
    this.canvas = null;
  }

  attributeChangedCallback(name: string, _oldValue: string | null, _newValue: string | null): void {
    if (!this.worker) return;
    if (name === "animate") {
      this.attributeAnimate = this.readBoolean("animate", true);
      this.syncAnimationGate();
      return;
    }
    const command = attributeToCommand(name, this.getAttribute(name), (raw) => this.readNumberFrom(raw));
    if (!command) return;
    this.worker.postMessage({ type: "attr", command } satisfies EngineMessage);
  }

  /** No worker-side renderer to reach in worker mode — terra is parked
   * (design doc §4/§9), so this is a documented no-op rather than wiring a
   * `phase` message for dead traffic. */
  setPhase(_phase: number): void {
    // no-op: terra parked, no phase message in the one-way protocol
  }

  /** No main-thread renderer/canvas to read back in worker mode (the
   * canvas was transferred). No production caller reaches this in `src/`. */
  captureDataUrl(): string | null {
    return null;
  }

  /** No worker-side renderer instance is reachable from the main thread
   * (one-way protocol, no worker→main messages). */
  getRenderer(): null {
    return null;
  }

  /** Terra's landmask: `{ cols, rows, bits }`, row-major '1'=land strings,
   * equirectangular (latTop 85 → latBottom -65). Set as a property, not an
   * attribute — it's structured data, not a scalar. Safe to set before or
   * after the element upgrades/connects. Worker mode has no `mask` message
   * (terra parked, §4/§9): the setter stores the value for the getter but
   * otherwise no-ops. */
  get maskData(): TerraMaskData | null {
    return this.pendingMaskData;
  }

  set maskData(value: TerraMaskData | null) {
    this.pendingMaskData = value;
    // no-op beyond storage: terra parked, no worker-side renderer to reach
  }

  private postResize(): void {
    if (!this.worker) return;
    const r = this.getBoundingClientRect();
    const message: EngineMessage = {
      type: "resize",
      cssW: r.width || 1,
      cssH: r.height || 1,
      dpr: Math.min(devicePixelRatio || 1, 1.5),
    };
    this.worker.postMessage(message);
  }

  private readPreset(): PresetName {
    const value = this.getAttribute("preset") as PresetName | null;
    return value && value in PRESETS ? value : "haze";
  }

  private readBoolean(attribute: string, fallback: boolean): boolean {
    if (!this.hasAttribute(attribute)) return fallback;
    const value = this.getAttribute(attribute);
    return value !== "false" && value !== "0";
  }

  private readNumber(attribute: string): number | null {
    return this.readNumberFrom(this.getAttribute(attribute));
  }

  private readNumberFrom(raw: string | null): number | null {
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  private applyNumericAttributes(options: GrappleberryOptions): void {
    for (const key of observedNumericAttributes) {
      const value = this.readNumber(numericAttributeName(key));
      if (value !== null) (options[key] as number) = value;
    }
  }

  /** Standard "upgrade property" pattern: if `prop` was set as a plain own
   * property before this class's accessor existed on the instance (element
   * created/mutated before upgrade, or before connection), that assignment
   * shadows the prototype accessor. Re-run it through the accessor now. */
  private upgradeProperty(prop: "maskData"): void {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      const value = this[prop];
      delete (this as unknown as Record<string, unknown>)[prop];
      this[prop] = value;
    }
  }

  private setupVisibilityGating(): void {
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          this.isIntersecting = entry ? entry.isIntersecting : true;
          this.syncAnimationGate();
        },
        { threshold: 0 },
      );
      this.intersectionObserver.observe(this);
    }
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => this.syncAnimationGate();
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  /** Combines the `animate` attribute's intent with actual visibility
   * (in-viewport + tab foregrounded) into a single `animate` message posted
   * to the worker, which stops its rAF loop entirely when false. */
  private syncAnimationGate(): void {
    if (!this.worker) return;
    const documentVisible = typeof document === "undefined" || !document.hidden;
    const on = this.attributeAnimate && this.isIntersecting && documentVisible;
    this.worker.postMessage({ type: "animate", on } satisfies EngineMessage);
  }
}

if (!customElements.get("grappleberry-organism")) {
  customElements.define("grappleberry-organism", GrappleberryElement);
}
