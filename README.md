# sporeworks

A seeded SDF raymarcher that grows halftone-screened organisms.

sporeworks is a WebGL engine, deliberately **raster-first, not vector**. An
organism is raymarched from fused signed-distance geometry, cut with cavities,
grown with tapered Bézier tendrils, lit in pseudo-3D, and then converted into
a hard monochrome photographic screen. The canonical asset is never a drawing —
it is compact shader source plus a seed and deterministic parameters. Same
seed, same organism, every time.

The flagship species grown by this engine is the **grappleberry** — hence the
`<grappleberry-organism>` custom element and the `GrappleberryRenderer` class.
The engine is sporeworks; the organism is a grappleberry. See
[the grappleberry](#the-grappleberry) below.

## Quickstart

```bash
npm install sporeworks
```

The package ships one artifact: a single self-contained ES module that
registers a native custom element (worker source inlined — nothing else to
serve).

```html
<script type="module" src="/grappleberry.js"></script>

<grappleberry-organism
  preset="haze"
  seed="my-first-colony"
  animate
  transparent
  style="display:block; width:min(70vw,720px); aspect-ratio:1;"
></grappleberry-organism>
```

Or import it (side-effect import — it defines the element):

```js
import "sporeworks";
```

From a checkout instead of npm:

```bash
npm install
npm run build     # -> dist/grappleberry.js
npm run dev       # interactive editor at the local vite URL
```

## The custom element

`<grappleberry-organism>` renders one organism per element. Every visual
control is an attribute, live-updatable after connect:

| Attribute | Meaning |
| --- | --- |
| `preset` | `haze` \| `microbe` \| `glitch` \| `ascii` \| `terra` (default `haze`) |
| `seed` | Any string; deterministically shapes the anatomy |
| `phase` | Initial animation phase, 0–1 |
| `animate` | Present/`true` = live breathing loop; `false`/`0` = still |
| `transparent` | Composite over the page instead of a solid void |
| `growth` | Overall growth factor |
| `roughness` | Surface erosion depth |
| `fusion` | Smooth-min blending between cells (low = distinct berries, high = one melted mass) |
| `halftone` | Screen granularity |
| `contrast` | Tonal separation before screening |
| `threshold` | Screen exposure |
| `glitch` | Horizontal transmission-error intensity |
| `ascii` | Terminal-glyph decay intensity |
| `rotation-x` / `rotation-y` / `rotation-z` | Orientation (radians) |
| `camera` | Camera distance |
| `light-lon` | terra only: key-light azimuth in degrees |
| `fps` | Draw-call cadence cap (default 60); phase is wall-clock-driven so playback speed is unaffected |
| `resolution` | 0–1 backing-store scale (CSS-upscaled; the screening hides the softness well below 1) |
| `palette` | `grape-raspberry` blends the ink toward a grape/raspberry duotone; omit for bone monochrome |

Plus one JS **property** (structured data, not a scalar):

- `organism.maskData = { cols, rows, bits }` — terra's landmask. `bits` is a
  row-major array of `'0'`/`'1'` strings, equirectangular, row 0 at latitude
  85° down to −65°. Safe to set before or after the element connects.

The element pauses itself entirely (render loop stopped, not just draw calls)
when scrolled out of the viewport or when the tab is backgrounded, and resumes
on return.

## Architecture: worker + OffscreenCanvas

The element is a thin main-thread shell. On connect it:

1. runs a **real capability probe** — not API-presence sniffing. Safari 16.4
   exposes `OffscreenCanvas`, `Worker`, and `transferControlToOffscreen`, but
   its in-worker `OffscreenCanvas` is 2D-only; WebGL-in-worker only shipped in
   Safari 17. The probe actually creates a throwaway `OffscreenCanvas` and
   requests a `webgl` context. On failure the element stays inert — no
   transfer, no worker — so any fallback the host page rendered keeps showing.
2. transfers its canvas off-thread via `transferControlToOffscreen()`,
3. spins up a dedicated worker from an inlined source blob (the build splices
   the worker bundle into the element bundle as
   `globalThis.__WORKER_SOURCE__`, so the shipped file stays a single script
   with no separate worker asset), and
4. drives it over a **one-way message protocol** (`init` / `attr` / `resize` /
   `animate` / `destroy`). All raymarching happens off the main thread.

## Presets

Presets are different *morphologies* of the same species, not filters:

| Preset | Intent |
| --- | --- |
| `haze` | Dense cellular colony with the looping primary stem |
| `microbe` | Larger, wetter cells and deeper cavities |
| `glitch` | The same biological scan interrupted by horizontal slices |
| `ascii` | The organism dissolving into a terminal/glyph field |
| `terra` | A home world — one sphere, landmask-screened, slow phase-driven spin |

Curated outputs live in [`assets/final`](assets/final); canonical specimen
configs in [`configs/`](configs) — **the JSON config, not the exported PNG, is
the source asset**: parameter changes are reviewable in git and regenerate
deterministically.

## Direct renderer API

The bundle also exports the renderer and helpers for callers that want to own
the canvas:

```ts
import { GrappleberryRenderer, optionsForPreset } from "sporeworks";

const canvas = document.querySelector("canvas")!;
const renderer = new GrappleberryRenderer(
  canvas,
  optionsForPreset("haze", "my-first-colony", {
    animate: true,
    transparent: true,
  }),
);
```

Exports: `GrappleberryRenderer`, `optionsForPreset`,
`paletteStrengthForName`, `PRESETS`, `PRESET_ORDER`, `generateOrganism`,
`GrappleberryElement`, and the types `GrappleberryOptions`,
`GrappleberryOverrides`, `TerraMaskData`, `PaletteName`, `Preset`,
`PresetName`, `Organism`, `Blob`, `Cavity`, `Tendril`.

## The rendering pipeline

```
seed → deterministic anatomy → GPU uniforms → signed-distance scene → raymarch
     → surface lighting → monochrome screening → variant corruption → canvas/PNG/GIF
```

1. **Seed:** `new RNG(`${preset}:${seed}`)` — the same seed produces
   related-but-distinct organisms per preset (shared DNA, different
   morphology rules).
2. **Anatomy:** the CPU emits compact numbers (≤32 cells, ≤16 cavities, ≤24
   tendrils) — never pixels. Cells are deliberately arranged: one central
   cell, packed inner ring, packed outer ring, budding satellites. A random
   cloud reads as a spider; packed rings read as a berry colony.
3. **SDF geometry:** each cell is an ellipsoidal distance field; cells join
   with `smin(a, b, fusion)`.
4. **Tendrils:** quadratic Béziers evaluated as chained tapered capsules,
   grown from actual surface points along local normals, with a tiny end bulb
   so tips don't terminate like vector lines.
5. **Erosion:** layered fractal + pore noise displaces the distance field —
   genuinely geometric, so lighting reacts.
6. **Cavities:** `d = max(organism, −cavity)` after roughening — deep,
   readable black mouths, not decals. Without this it's just grapes.
7. **Raymarch:** ≤116 steps per pixel; normals from sampled field
   differences.
8. **Lighting:** key + fill + soft shadow + AO + rim (protects the silhouette
   through screening) + restrained specular.
9. **Photographic screening:** every grayscale pixel against a deterministic
   screen value — continuous shading becomes an irregular field of monochrome
   marks (`halftone`, `threshold`, `contrast`, `roughness`).
10. **Glitch:** horizontal transmission bands, scan cuts, displaced echoes,
    dropout — damaged scientific transmission, not cyberpunk RGB-split.
11. **ASCII:** no font texture — glyph-like forms constructed procedurally
    from strokes/dots/bracket fragments progressively replace the surface;
    near-miss rays become glyph debris.
12. **Animation:** one normalized `phase 0→1` drives breathing, cell
    displacement, tendril motion, band selection, and grain — so loops export
    perfectly repeatably.

## Repository layout

- `src/organism.ts` — deterministic packed-cell morphology, cavities, tendril growth
- `src/shaders.ts` — SDF raymarcher, lighting, erosion, halftone, glitch, glyph decay
- `src/renderer.ts` — `GrappleberryRenderer`: shader compile, uniforms, resize/DPR, phase, capture, GPU cleanup
- `src/grappleberry-element.ts` — the `<grappleberry-organism>` custom element (worker-driving shell)
- `src/worker.ts` + `src/engine-messages.ts` — the off-thread engine and its one-way protocol
- `src/capability.ts` — the WebGL-in-worker capability probe
- `src/presets.ts` — the art-direction layer (morphology + rendering parameters per preset)
- `src/random.ts` — seeded PRNG (uniform/ranged/gaussian; vec3 ops)
- `src/main.ts` — the interactive editor UI
- `scripts/build-engine.mjs` — builds worker + element bundles, splices them into `dist/grappleberry.js`
- `scripts/render.mjs` / `render-gif.mjs` / `contact-sheet.mjs` / `seed-sheet.mjs` — headless Chromium capture
- `configs/` — canonical specimen seeds/configuration

## Headless capture

The CLI renderers use a locally installed Chrome/Chromium (set
`CHROMIUM_PATH` if it isn't auto-detected) and require `npm run build:app`
first. FFmpeg must be on `PATH` for GIF export.

```bash
npm run render -- --preset haze --seed my-first-colony --size 640 \
  --transparent true --out out/organism.png

npm run render -- --config configs/haze-primary.json --size 640 --out out/organism.png

npm run gif -- --config configs/haze-primary.json --size 384 --frames 24 \
  --fps 12 --out out/organism.gif
```

CLI values override config-file values. Supported numeric flags:

```text
growth roughness fusion halftone contrast threshold
glitch ascii rotationX rotationY rotationZ camera phase lightLon paletteStrength
```

For `--preset terra`, pass `--mask path/to/landmask.json` (`{ cols, rows,
bits }`, same shape as the `maskData` property).

High-resolution software rendering can be slow — every pixel raymarches the
full organism, and Chromium's SwiftShader fallback is far slower than a real
GPU. Start at 512–768 px and increase progressively.

## Building and testing

```bash
npm run build        # typecheck + worker bundle + element bundle + splice -> dist/grappleberry.js
npm test             # vitest unit suite (protocol, capability probe, renderer logic)
npm run test:render  # end-to-end: build, render specimens headlessly, worker smoke check
```

`npm run build -- --out ../somewhere/grappleberry.js` writes the spliced
bundle to a custom path (useful for a consuming site's `public/` during a
transition).

Why the worker isn't `?worker&inline`: that's a documented "works in dev,
breaks in build" trap in vite library mode (vitejs/vite#13726, #14306). The
worker is its own vite lib build; `scripts/build-engine.mjs` prepends its
output to the element bundle as `globalThis.__WORKER_SOURCE__`, which the
element resolves via ordinary scope-chain fallthrough.

## The grappleberry

The grappleberry is the flagship species — the seeded organism this engine
was built to grow, and the identity mark of [qxtaiba.com](https://qxtaiba.com).
One species, many states: `haze` is the canonical form, `microbe` the
structural/compact one, `glitch` the transitional-on-action one, `ascii` the
computational one. The species name is load-bearing throughout the API — the
element tag, the renderer class, the artifact filename — and it stays that
way: sporeworks names the engine, grappleberry names the organism.

### Why the canonical asset is not SVG

The sculptural quality comes from depth, self-shadowing, cavities, surface
erosion, and stochastic screening. Flattening those into vector paths would
either create an enormous traced file or lose the material that makes the
mark work. The canonical version is therefore compact shader source plus
deterministic parameters; transparent PNG/GIF outputs are derived artifacts.

The reference imagery was never vector — it reads as rendered blobs,
thresholded photography, scanned bio-matter, degraded print. The engine
deconstructs that into its actual ingredients — clustered fused berries,
visible cavities, strong self-shadow, ragged edges, surface-grown tendrils,
halftone/threshold degradation — and asks not *"how do I draw this logo?"*
but: **how do I generate a colony-like object with this material language?**
One identity, many artifacts, motion, reproducibility.

## License

MIT — see [LICENSE](LICENSE). The curated identity outputs in
`assets/final` remain part of the grappleberry identity; the engine code may
be adapted under the included license.
