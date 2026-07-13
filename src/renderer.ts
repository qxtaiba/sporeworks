import { fragmentShader, vertexShader } from "./shaders";
import { generateOrganism, MAX_BLOBS, MAX_CAVITIES, MAX_TENDRILS, type Organism } from "./organism";
import { PRESETS, type PresetName } from "./presets";

export interface GrappleberryOptions {
  preset: PresetName;
  seed: string;
  phase: number;
  animate: boolean;
  transparent: boolean;
  growth: number;
  roughness: number;
  fusion: number;
  halftone: number;
  contrast: number;
  threshold: number;
  glitch: number;
  ascii: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  camera: number;
  /** Terra-only: key light azimuth in degrees. Ignored by every other preset. */
  lightLon: number;
  /** 0 = identity law's default bone monochrome. >0 blends the ink toward
   * the grape-raspberry duotone (docs/grappleberry-identity.md §Color).
   * Applies to every preset, not just terra. */
  paletteStrength: number;
}

export interface GrappleberryOverrides {
  phase?: number;
  animate?: boolean;
  transparent?: boolean;
  growth?: number;
  roughness?: number;
  fusion?: number;
  halftone?: number;
  contrast?: number;
  threshold?: number;
  glitch?: number;
  ascii?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  camera?: number;
  lightLon?: number;
  paletteStrength?: number;
}

/** The one named duotone register the identity law defines today. Callers
 * pass this string via the `palette` attribute; unset/anything else stays
 * the default bone monochrome. */
export type PaletteName = "grape-raspberry";

const PALETTE_STRENGTH: Record<PaletteName, number> = {
  // Tuned against docs/grappleberry-identity.md §Color's "reads monochrome
  // at a glance" bar — 0.5 read as unambiguously pink in review; 0.18 keeps
  // the bone base dominant with only a warm grape/raspberry cast.
  "grape-raspberry": 0.18,
};

export function paletteStrengthForName(name: string | null | undefined): number {
  return name && name in PALETTE_STRENGTH ? PALETTE_STRENGTH[name as PaletteName] : 0;
}

/** Row-major landmask uploaded as a texture by `GrappleberryRenderer.setMaskData`.
 * `bits[row]` is a string of '0'/'1' characters, one per column; row 0 is
 * the mask's top latitude. Equirectangular, matching the site's own
 * landmask.gen.ts convention (latTop 85 → latBottom -65). */
export interface TerraMaskData {
  cols: number;
  rows: number;
  bits: string[];
}

// A fixed, pleasant default key-light azimuth for terra — roughly the same
// "upper-left" register as the organism's own hardcoded key light, so the
// planet reads as the same species of render before any real solar time is
// wired up via the light-lon attribute.
const DEFAULT_LIGHT_LON_DEG = -128;

export function optionsForPreset(
  presetName: PresetName,
  seed = "qxtaiba-grappleberry",
  overrides: GrappleberryOverrides = {},
): GrappleberryOptions {
  const preset = PRESETS[presetName];
  return {
    preset: presetName,
    seed,
    phase: overrides.phase ?? 0.13,
    animate: overrides.animate ?? true,
    transparent: overrides.transparent ?? false,
    growth: overrides.growth ?? 1,
    roughness: overrides.roughness ?? preset.roughness,
    fusion: overrides.fusion ?? preset.fusion,
    halftone: overrides.halftone ?? preset.halftone,
    contrast: overrides.contrast ?? preset.contrast,
    threshold: overrides.threshold ?? preset.threshold,
    glitch: overrides.glitch ?? preset.glitch,
    ascii: overrides.ascii ?? preset.ascii,
    rotationX: overrides.rotationX ?? preset.rotation[0],
    rotationY: overrides.rotationY ?? preset.rotation[1],
    rotationZ: overrides.rotationZ ?? preset.rotation[2],
    camera: overrides.camera ?? preset.camera,
    lightLon: overrides.lightLon ?? DEFAULT_LIGHT_LON_DEG,
    paletteStrength: overrides.paletteStrength ?? 0,
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown WebGL link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

/** Pure CSS-px → backing-store-px sizing helper, capped so a high device
 * pixel ratio doesn't blow up the framebuffer (halftone screening hides the
 * softer upscale — see resize()). Takes dpr as a plain argument rather than
 * reading `window.devicePixelRatio` so it (and resize(), which delegates to
 * it) works identically on the main thread and inside a worker, where
 * `window` doesn't exist. Exported for unit testing. */
export function backingSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  cap = 1.5,
): { w: number; h: number } {
  const pixelRatio = Math.min(dpr, cap);
  return {
    w: Math.max(1, Math.floor(cssWidth * pixelRatio)),
    h: Math.max(1, Math.floor(cssHeight * pixelRatio)),
  };
}

function flattenVec4(
  items: Array<[number, number, number, number]>,
  length: number,
  filler: [number, number, number, number],
): Float32Array {
  const result = new Float32Array(length * 4);
  for (let index = 0; index < length; index += 1) result.set(filler, index * 4);
  items.forEach((item, index) => result.set(item, index * 4));
  return result;
}

export class GrappleberryRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly positionLocation: number;
  private options: GrappleberryOptions;
  private organism: Organism;
  private animationFrame = 0;
  private loopScheduled = false;
  private startTime = performance.now();
  private pausedAt = 0;
  private dirty = true;
  private destroyed = false;
  private uniformCache = new Map<string, WebGLUniformLocation | null>();
  private maskTexture: WebGLTexture | null = null;
  private hasMask = false;
  private maskCols = 1;
  private maskRows = 1;
  private targetFps = 60;
  private lastRenderTime = 0;
  private resolutionScale = 1;
  // Last-known CSS size + dpr, seeded to a sensible pre-layout default (a
  // canvas element's own default backing size, 1x). resize() calls without
  // explicit args (constructor, setResolutionScale) reuse these instead of
  // reading window.devicePixelRatio/canvas.clientWidth, neither of which
  // exist on an OffscreenCanvas running in a worker.
  private lastCssW = 300;
  private lastCssH = 300;
  private lastDpr = 1;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: GrappleberryOptions) {
    this.canvas = canvas;
    // Both HTMLCanvasElement.getContext("webgl", ...) and
    // OffscreenCanvas.getContext("webgl", ...) return WebGLRenderingContext
    // | null, but TS can't resolve overloads across a union receiver type,
    // so it falls back to the generic RenderingContext union — cast back to
    // what both constituents actually return.
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      // false: with preservation on, the compositor must COPY the drawing
      // buffer every frame instead of flipping it — a per-frame cost on the
      // production path that buys nothing there (worker mode has no capture
      // API at all). The two readback paths (capturePng/captureDataUrl)
      // stay correct without it: both call render() and then read back in
      // the same task, and the drawing buffer is only cleared after
      // compositing, i.e. between tasks — same-task readback always sees
      // the frame just drawn.
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL is required to render the Grappleberry organism.");
    this.gl = gl;
    this.program = createProgram(gl);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Could not create a WebGL vertex buffer.");
    this.buffer = buffer;
    this.positionLocation = gl.getAttribLocation(this.program, "aPosition");
    this.options = options;
    this.organism = generateOrganism(options.preset, options.seed);
    this.setupGeometry();
    this.uploadOrganism();
    this.resize();
    this.loop = this.loop.bind(this);
    if (this.options.animate) {
      this.ensureLoopRunning();
    } else {
      this.render();
    }
  }

  getOptions(): GrappleberryOptions {
    return { ...this.options };
  }

  getOrganism(): Organism {
    return this.organism;
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniformCache.has(name)) {
      this.uniformCache.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniformCache.get(name) ?? null;
  }

  private setupGeometry(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private uploadOrganism(): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    const blobs = flattenVec4(
      this.organism.blobs.map((blob) => [blob.center[0], blob.center[1], blob.center[2], blob.radius]),
      MAX_BLOBS,
      [0, 0, 0, -100],
    );
    const blobScales = flattenVec4(
      this.organism.blobs.map((blob) => [blob.scale[0], blob.scale[1], blob.scale[2], blob.roughnessPhase]),
      MAX_BLOBS,
      [1, 1, 1, 0],
    );
    const cavities = flattenVec4(
      this.organism.cavities.map((cavity) => [cavity.center[0], cavity.center[1], cavity.center[2], cavity.radius]),
      MAX_CAVITIES,
      [0, 0, 0, -100],
    );
    const tendrilA = flattenVec4(
      this.organism.tendrils.map((tendril) => [tendril.a[0], tendril.a[1], tendril.a[2], tendril.r0]),
      MAX_TENDRILS,
      [100, 100, 100, 0],
    );
    const tendrilB = flattenVec4(
      this.organism.tendrils.map((tendril) => [tendril.b[0], tendril.b[1], tendril.b[2], tendril.phase]),
      MAX_TENDRILS,
      [100, 100, 100, 0],
    );
    const tendrilC = flattenVec4(
      this.organism.tendrils.map((tendril) => [tendril.c[0], tendril.c[1], tendril.c[2], tendril.r1]),
      MAX_TENDRILS,
      [100, 100, 100, 0],
    );

    gl.uniform4fv(this.uniform("uBlobs[0]"), blobs);
    gl.uniform4fv(this.uniform("uBlobScales[0]"), blobScales);
    gl.uniform4fv(this.uniform("uCavities[0]"), cavities);
    gl.uniform4fv(this.uniform("uTendrilA[0]"), tendrilA);
    gl.uniform4fv(this.uniform("uTendrilB[0]"), tendrilB);
    gl.uniform4fv(this.uniform("uTendrilC[0]"), tendrilC);
    // Live primitive counts: the shader's SDF loops break past them instead
    // of evaluating the filler slots (radius -100 / far-away no-ops, which
    // still cost full distance evaluations per march step). Presets fill
    // 56–88% of the MAX arrays, so this trims 12–44% of the field cost with
    // bit-identical output (each skipped filler is an exact smin/max no-op).
    gl.uniform1i(this.uniform("uBlobCount"), Math.min(this.organism.blobs.length, MAX_BLOBS));
    gl.uniform1i(this.uniform("uCavityCount"), Math.min(this.organism.cavities.length, MAX_CAVITIES));
    gl.uniform1i(this.uniform("uTendrilCount"), Math.min(this.organism.tendrils.length, MAX_TENDRILS));
    gl.uniform1f(this.uniform("uSeed"), this.organism.seedNumber);
    this.dirty = true;
  }

  /** Resizes the backing store to `width×height` CSS px at `dpr`, capped at
   * 1.5x (see backingSize) and further scaled by resolutionScale. All three
   * args are optional only so the constructor and setResolutionScale can
   * re-resize with the last externally-supplied dims; every real caller
   * (ResizeObserver-driven, worker `resize` message) always passes all
   * three explicitly — this never reads `window.devicePixelRatio` or
   * `canvas.clientWidth`, so it works identically on an OffscreenCanvas in
   * a worker, where neither exists. */
  resize(width?: number, height?: number, dpr?: number): void {
    const cssWidth = width ?? this.lastCssW;
    const cssHeight = height ?? this.lastCssH;
    const pixelRatio = dpr ?? this.lastDpr;
    this.lastCssW = cssWidth;
    this.lastCssH = cssHeight;
    this.lastDpr = pixelRatio;
    const capped = backingSize(cssWidth, cssHeight, pixelRatio);
    const nextWidth = Math.max(1, Math.floor(capped.w * this.resolutionScale));
    const nextHeight = Math.max(1, Math.floor(capped.h * this.resolutionScale));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.gl.viewport(0, 0, nextWidth, nextHeight);
      this.requestRender();
    }
  }

  /** Render-loop cadence cap (default 60). Frames are still requested every
   * rAF tick; this just gates how many of them actually issue a draw call,
   * so phase (wall-clock-driven) keeps the same speed at any fps. */
  setTargetFps(fps: number): void {
    this.targetFps = Math.max(1, Number.isFinite(fps) ? fps : 60);
  }

  /** Backing-store scale in (0, 1], multiplied onto the capped device pixel
   * ratio. The canvas's CSS size is untouched, so a lower value is a free
   * CSS upscale — the stochastic screening hides it well below 1. */
  setResolutionScale(scale: number): void {
    this.resolutionScale = Math.min(1, Math.max(0.05, Number.isFinite(scale) ? scale : 1));
    this.resize();
  }

  /** Uploads a landmask as a LUMINANCE texture for the terra preset's ink
   * screening. Longitude wraps are handled in-shader via fract(), so
   * CLAMP_TO_EDGE (safe for any non-power-of-two size) is used for wrap. */
  setMaskData(mask: TerraMaskData | null): void {
    const gl = this.gl;
    if (!mask || mask.cols <= 0 || mask.rows <= 0 || mask.bits.length === 0) {
      this.hasMask = false;
      this.requestRender();
      return;
    }
    const { cols, rows, bits } = mask;
    const data = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row += 1) {
      const line = bits[row] ?? "";
      for (let col = 0; col < cols; col += 1) {
        data[row * cols + col] = line.charCodeAt(col) === 49 /* '1' */ ? 255 : 0;
      }
    }
    if (!this.maskTexture) this.maskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cols, rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.hasMask = true;
    this.maskCols = cols;
    this.maskRows = rows;
    this.requestRender();
  }

  setPreset(preset: PresetName, keepSeed = true): void {
    const seed = keepSeed ? this.options.seed : `${preset}-${Date.now()}`;
    this.options = optionsForPreset(preset, seed, {
      animate: this.options.animate,
      transparent: this.options.transparent,
      phase: this.options.phase,
      lightLon: this.options.lightLon,
      paletteStrength: this.options.paletteStrength,
    });
    this.organism = generateOrganism(preset, seed);
    this.uploadOrganism();
    this.requestRender();
  }

  setSeed(seed: string): void {
    this.options.seed = seed || "qxtaiba-grappleberry";
    this.organism = generateOrganism(this.options.preset, this.options.seed);
    this.uploadOrganism();
    this.requestRender();
  }

  update(partial: Partial<GrappleberryOptions>): void {
    const shouldRegenerate =
      (partial.preset !== undefined && partial.preset !== this.options.preset) ||
      (partial.seed !== undefined && partial.seed !== this.options.seed);
    this.options = { ...this.options, ...partial };
    if (shouldRegenerate) {
      this.organism = generateOrganism(this.options.preset, this.options.seed);
      this.uploadOrganism();
    }
    this.requestRender();
  }

  setPhase(phase: number): void {
    this.options.phase = ((phase % 1) + 1) % 1;
    this.dirty = true;
    this.render();
  }

  setAnimating(animate: boolean): void {
    if (this.options.animate === animate) return;
    this.options.animate = animate;
    if (animate) {
      this.startTime = performance.now() - this.pausedAt;
      this.dirty = true;
      this.ensureLoopRunning();
    } else {
      this.pausedAt = performance.now() - this.startTime;
      // Stop the rAF loop entirely rather than merely skipping the phase
      // update — an off-screen or backgrounded instance should cost zero
      // per-frame callbacks, not just zero draw calls.
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
      this.loopScheduled = false;
    }
  }

  /** Marks the frame dirty and, if the animation loop isn't actively
   * ticking (paused/static/off-screen), renders immediately so one-off
   * mutations (update/setPreset/resize/setMaskData) still paint. */
  private requestRender(): void {
    this.dirty = true;
    if (this.loopScheduled) return;
    this.render();
  }

  private ensureLoopRunning(): void {
    if (this.loopScheduled || this.destroyed) return;
    this.loopScheduled = true;
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  render(): void {
    if (this.destroyed) return;
    const gl = this.gl;
    const o = this.options;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, o.transparent ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const isTerra = o.preset === "terra";
    // Terra's longitude spin is phase-driven (0→1 maps to a full 360°
    // revolution) and added on top of rotationY as a static orientation
    // offset; every other preset keeps rotationY exactly as authored.
    const spinY = isTerra ? o.rotationY + o.phase * Math.PI * 2 : o.rotationY;

    gl.uniform2f(this.uniform("uResolution"), this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniform("uPhase"), o.phase);
    gl.uniform1f(this.uniform("uCamera"), o.camera);
    gl.uniform3f(this.uniform("uRotation"), o.rotationX, spinY, o.rotationZ);
    gl.uniform1f(this.uniform("uFusion"), o.fusion);
    gl.uniform1f(this.uniform("uRoughness"), o.roughness);
    gl.uniform1f(this.uniform("uHalftone"), o.halftone);
    gl.uniform1f(this.uniform("uContrast"), o.contrast);
    gl.uniform1f(this.uniform("uThreshold"), o.threshold);
    gl.uniform1f(this.uniform("uGlitch"), o.glitch);
    gl.uniform1f(this.uniform("uAscii"), o.ascii);
    gl.uniform1f(this.uniform("uGrowth"), o.growth);
    gl.uniform1f(this.uniform("uTransparent"), o.transparent ? 1 : 0);
    gl.uniform1f(this.uniform("uTerra"), isTerra ? 1 : 0);
    gl.uniform1f(this.uniform("uLightLon"), o.lightLon);
    gl.uniform1f(this.uniform("uPalette"), o.paletteStrength);
    gl.uniform1f(this.uniform("uHasMask"), this.hasMask ? 1 : 0);
    gl.uniform2f(this.uniform("uMaskSize"), this.maskCols, this.maskRows);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hasMask ? this.maskTexture : null);
    gl.uniform1i(this.uniform("uMask"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // No gl.finish() here deliberately — this runs up to 60x/sec from the
    // rAF loop (and up to 30x/sec more from external setPhase() drivers
    // like GlobeScene's terra sync) and gl.finish() is a hard CPU-blocking
    // GPU sync. It bought this path nothing: WebGL's command queue already
    // preserves draw order, and the only two callers that actually need a
    // completed frame (capturePng/captureDataUrl, below) force their own
    // sync via toBlob/toDataURL's implicit readback.
    this.dirty = false;
  }

  private loop(timestamp: number): void {
    if (this.destroyed) {
      this.loopScheduled = false;
      return;
    }
    if (this.options.animate) {
      const elapsed = (timestamp - this.startTime) / 1000;
      const cycleSeconds = PRESETS[this.options.preset]?.cycleSeconds ?? 7.5;
      this.options.phase = (elapsed / cycleSeconds) % 1;
      this.dirty = true;
    }
    const frameInterval = 1000 / this.targetFps;
    // The 0.01ms epsilon absorbs floating-point cancellation on exact-ratio
    // targets (fps=30 or fps=60 against a 60Hz display: frameInterval and
    // the accumulated tick spacing are mathematically equal but round to
    // independently-imprecise doubles at large timestamp magnitudes).
    // Without it, `timestamp - lastRenderTime >= frameInterval` can miss
    // its boundary by a few ULPs and silently fall back to the next native
    // tick — verified live: fps="24" and fps="30" rendered at an
    // indistinguishable ~20fps on a 60Hz host before this fix.
    if (this.dirty && timestamp - this.lastRenderTime >= frameInterval - 0.01) {
      this.render();
      this.lastRenderTime = timestamp;
    }
    if (this.options.animate) {
      this.animationFrame = requestAnimationFrame(this.loop);
    } else {
      this.loopScheduled = false;
    }
  }

  capturePng(filename = `grappleberry-${this.options.preset}-${this.options.seed}.png`): void {
    // document/toBlob-with-anchor-download don't exist off the main
    // thread — this is a dev-tool-only path (generator scripts construct
    // the renderer directly over a real canvas), never called from a
    // worker-hosted renderer, so a clear throw beats a silent ReferenceError.
    // `typeof OffscreenCanvas !== "undefined"` guards the ReferenceError in
    // environments without it; the compound `&&` means TS can't narrow the
    // union on the fallthrough branch from that alone, so cast explicitly —
    // reaching here proves (at runtime) this.canvas is an HTMLCanvasElement.
    if (typeof OffscreenCanvas !== "undefined" && this.canvas instanceof OffscreenCanvas) {
      throw new Error("capturePng is not available off the main thread");
    }
    const canvas = this.canvas as HTMLCanvasElement;
    this.render();
    // toBlob reads back the framebuffer asynchronously; force the draw to
    // fully land first so the readback can't race an in-flight GPU command.
    this.gl.finish();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  captureDataUrl(): string | null {
    // OffscreenCanvas has no toDataURL. No production caller reaches this
    // in worker mode (the custom element's captureDataUrl() already
    // returns null there); this guard is for correctness, not a feature.
    if (typeof OffscreenCanvas !== "undefined" && this.canvas instanceof OffscreenCanvas) {
      return null;
    }
    const canvas = this.canvas as HTMLCanvasElement;
    this.render();
    // Same reasoning as capturePng: toDataURL reads pixels back
    // synchronously, but gl.finish() guarantees the draw is complete before
    // that read rather than relying on it as an implicit side effect.
    this.gl.finish();
    return canvas.toDataURL("image/png");
  }

  destroy(): void {
    this.destroyed = true;
    this.loopScheduled = false;
    cancelAnimationFrame(this.animationFrame);
    if (this.maskTexture) this.gl.deleteTexture(this.maskTexture);
    this.gl.deleteProgram(this.program);
    this.gl.deleteBuffer(this.buffer);
    // Browsers cap live WebGL contexts (~8-16 per page) and only reclaim
    // them on GC, evicting the oldest context when the cap is hit. Losing
    // the context here releases the GPU allocation deterministically
    // instead of leaving a zombie until collection.
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
