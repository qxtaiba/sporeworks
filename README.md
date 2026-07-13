# Grappleberry Generator

A seeded generative identity engine for `qxtaiba.grappleberry.xyz`.

This rebuild is intentionally **raster/WebGL-first**, not a pile of SVG circles. The mark is raymarched from fused signed-distance geometry, cut with cavities, grown with tapered Bézier tendrils, lit in pseudo-3D, and then converted into a hard monochrome photographic screen. The exact source, seed, and parameters are the canonical asset.

## Included specimens

| Preset | Intent |
| --- | --- |
| `haze` | Dense cellular colony with the looping primary stem |
| `microbe` | Larger, wetter cells and deeper cavities |
| `glitch` | The same biological scan interrupted by horizontal slices |
| `ascii` | The organism dissolving into a terminal/glyph field |
| `terra` | The home world — one sphere, landmask-screened, slow phase-driven spin |

Curated outputs are in [`assets/final`](assets/final):

- `01-classic-haze.png`
- `02-microbe-cluster.png`
- `04-glitch-culture.png`
- `07-ascii-growth.png`
- `haze-transparent.png`
- `haze-motion.gif`
- `specimen-contact-sheet.png`

## Run the editor

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local Vite URL. The editor exposes seed, growth, fusion, erosion, screening, exposure, transmission, terminal decay, and orbit controls. PNG and JSON config can be exported from the UI.

Production build:

```bash
npm run build
npm run preview
```

## Embed it in the website

The library build produces `lib/grappleberry.js`, which registers a native custom element.

```html
<script type="module" src="/grappleberry.js"></script>

<grappleberry-organism
  preset="haze"
  seed="qxtaiba-grappleberry"
  animate
  transparent
  style="display:block; width:min(70vw,720px); aspect-ratio:1;"
></grappleberry-organism>
```

Every visual control is also available as an attribute:

```html
<grappleberry-organism
  preset="haze"
  seed="qxtaiba-grappleberry"
  fusion="0.019"
  roughness="0.12"
  halftone="1.35"
  contrast="1.34"
  threshold="0.49"
  rotation-y="0"
  animate
></grappleberry-organism>
```

`palette="grape-raspberry"` blends the ink (never the void) toward the identity law's duotone register — deep grape violet `#5b2a86` in the shadows, raspberry `#c43a5f` in the lit flesh, picked by pre-screen luminance and blended in at a subtle strength so the mark still reads monochrome bone at a glance. Omit the attribute (or set any other value) to keep the default bone monochrome. Applies to every preset, including terra.

Three attributes are perf knobs rather than art direction, and apply to every preset: `fps` (default 60; the render loop still ticks every animation frame but only issues a draw call at this cadence, so phase — wall-clock-driven — plays back at the same speed regardless), `resolution` (0–1, default 1; scales the canvas backing store, CSS-upscaled back to element size — the halftone screening hides the softer upscale well below 1), and automatic pause: the element stops its render loop entirely (not just the draw calls) when scrolled out of the viewport or when the tab is backgrounded, and resumes on return.

`preset="terra"` renders Earth in the same raymarched/screened material language as the organism presets: one sphere, a subtle surface roughness, and phase-driven longitude spin (phase 0→1 is one full revolution). Its continents come from a landmask set as a JS property, not an attribute, since it's structured data: `organism.maskData = { cols, rows, bits }`, where `bits` is a row-major array of `'0'`/`'1'` strings, equirectangular, row 0 at latitude 85° down to the last row at −65° (matching the site's own `landmask.gen.ts`). It's safe to set before or after the element connects — a pending value is replayed once the renderer exists. Land reads as bright ink probability, ocean as sparse, and coastlines get a small boost from the mask's own gradient. The key light's azimuth is fixed by default but can be pointed with the `light-lon` attribute (degrees), so a caller can later drive it from real solar time.

Or use the renderer directly:

```ts
import {
  GrappleberryRenderer,
  optionsForPreset,
} from "./lib/grappleberry.js";

const canvas = document.querySelector("canvas")!;
const renderer = new GrappleberryRenderer(
  canvas,
  optionsForPreset("haze", "qxtaiba-grappleberry", {
    animate: true,
    transparent: true,
  }),
);
```

## Render committed assets

The command-line renderer uses a locally installed Chrome or Chromium. Set `CHROMIUM_PATH` when it cannot be detected automatically.

```bash
npm run render -- \
  --preset haze \
  --seed qxtaiba-grappleberry \
  --size 640 \
  --transparent true \
  --out public/grappleberry.png
```

Render from a version-controlled config:

```bash
npm run render -- \
  --config configs/haze-primary.json \
  --size 640 \
  --out public/grappleberry.png
```

CLI values override the config file:

```bash
npm run render -- \
  --config configs/haze-primary.json \
  --roughness 0.15 \
  --threshold 0.52 \
  --out public/grappleberry-eroded.png
```

Supported numeric flags:

```text
growth roughness fusion halftone contrast threshold
 glitch ascii rotationX rotationY rotationZ camera phase lightLon paletteStrength
```

For `--preset terra`, pass `--mask path/to/landmask.json` (a `{ cols, rows, bits }` file, same shape as the `maskData` property) to drive the continent screening; without it, terra still renders — just without land/ocean modulation.

## Render animation

FFmpeg must be available on `PATH`.

```bash
npm run gif -- \
  --config configs/haze-primary.json \
  --size 384 \
  --frames 24 \
  --fps 12 \
  --out public/grappleberry.gif
```

The live WebGL version is preferable on the website: it is smoother, smaller, and can respond to pointer position, scroll, or route changes. GIF export is mainly for social posts, previews, and environments where live rendering is unavailable.

## Architecture

- `src/organism.ts` — deterministic packed-cell morphology, cavities, and tendril growth
- `src/shaders.ts` — SDF raymarcher, lighting, erosion, halftone, glitch, and glyph decay
- `src/renderer.ts` — browser renderer and runtime API
- `src/grappleberry-element.ts` — reusable `<grappleberry-organism>` element
- `src/main.ts` — interactive art-direction interface
- `scripts/render.mjs` — deterministic PNG capture
- `scripts/render-gif.mjs` — phased PNG sequence and GIF encoding
- `configs/` — canonical specimen seeds/configuration

## Why the canonical asset is not SVG

The sculptural quality comes from depth, self-shadowing, cavities, surface erosion, and stochastic screening. Flattening those into vector paths would either create an enormous traced file or lose the material that makes the mark work. The canonical version is therefore compact shader source plus deterministic parameters; transparent PNG/GIF outputs are derived artifacts.

## Validation

```bash
npm run build
npm test
```

High-resolution software rendering can be slow because every pixel raymarches the full organism. A real GPU handles larger canvases far better than Chromium's SwiftShader fallback. Start at 512–768 px for CLI captures and increase progressively.

## License

MIT. The identity artwork and supplied curated outputs remain part of the Grappleberry/Qxtaiba project; the generator code may be adapted under the included license.

---

# The design journey — why this works

The first attempt failed because it was "logo design": SVG circles, procedural roots, glitch decoration. The reference imagery was never vector — it reads as **rendered blobs, thresholded photography, scanned bio-matter, degraded print**. The breakthrough was deconstructing the reference into its actual visual ingredients — clustered fused berries, visible cavities, strong self-shadow, ragged edges, surface-grown tendrils, halftone/threshold degradation, black-and-white editorial harshness, occasional digital corruption — and then asking not *"how do I draw this logo?"* but:

> how do I generate a colony-like object with this material language?

That reframe drove every technical decision below: raster-first generative rendering (assets exported *from a system*, never drawn), metaball/SDF geometry so the colony is one organism emerging from overlapping bodies rather than circles side by side, **subtractive** cavities carved from the volume so lighting reacts to the hollows, pseudo-3D lighting pushed into high-contrast screening for the specimen look, tendrils grown from actual surface points along local normals, texture from a post-processing stack (noise/erosion → threshold → halftone breakup → contrast → variant distortion), and each variation built as a **rendering mode of the same species** rather than a separate drawing. The lesson, if you want this in production: don't ask for a logo — build a controllable organism generator with a few canonical presets. One identity, many artifacts, motion, reproducibility.

# Repository walkthrough

Three layers: **morphology** (what the organism is), **rendering** (how it becomes an image), **delivery** (how it embeds/exports).

- **`lib/random.ts`** — deterministic foundation. A seed string (`qxtaiba-grappleberry`) hashes into a seeded PRNG: same seed + preset + params = same organism. Provides uniform/ranged/integer/selection randomness, gaussian variation (uniform randomness looks synthetic; normal distribution gives mostly-moderate cells with occasional outliers), and basic vec3 ops.
- **`lib/presets.ts`** — the art-direction layer; the identity system's design-token file. Defines `haze` / `microbe` / `glitch` / `ascii` via morphology + rendering parameters (`blobCount, cavityCount, tendrilCount, clusterSpread, fusion, roughness, cavityScale, tendrilLength, tendrilRadius, halftone, contrast, threshold, glitch, ascii, camera, rotation, specialStem`). Presets are different *morphologies*, not filters.
- **`lib/organism.ts`** — anatomy generator: `Blob` / `Cavity` / `Tendril`. Blobs are deliberately arranged (one central cell, packed inner ring, packed outer ring, budding satellites — a random cloud read as spider, packed rings read as berry colony), each slightly ellipsoidal. Cavities generate inside larger cells, biased camera-side, later **subtracted** as negative geometry. Tendrils grow from boundary cells: attachment point, Bézier control, endpoint, tapered radii, animation phase — direction from the host cell's radial position with tangential curl. Haze gets one deliberately designed looping primary stem.
- **`lib/shaders.ts`** — the engine. One fragment shader on a full-screen triangle: SDF geometry, smooth-min fusion, ellipsoids, tapered Bézier capsules, subtractive cavities, procedural erosion, raymarching (≤116 steps/pixel), normals, AO, soft shadows, key/fill/rim lighting, stochastic halftoning, glitch displacement, procedural terminal glyphs, transparent compositing.
- **`lib/renderer.ts`** — compiles shaders, uploads anatomy as uniform arrays, handles resize/DPR, advances phase, captures transparent PNGs, cleans up GPU resources. No triangle meshes — the shader reconstructs the organism per pixel.
- **`lib/grappleberry-element.ts`** — `<grappleberry-organism>` custom element (Shadow DOM, attribute-reactive, live param updates, exposes the renderer). Framework-independent: plain HTML, React, anything.
- **`lib/main.ts`** — the editor UI + `window.grappleberry` control object used by the headless capture scripts.
- **`configs/*.json`** — the canonical specimens. **The JSON config, not the exported PNG, is the source asset** — parameter changes are reviewable in git and regenerate deterministically.
- **`scripts/render.mjs` / `render-gif.mjs` / `test.mjs`** — headless capture: serve the built site, drive Chromium via Puppeteer, set config/phase, capture the canvas (GIF = deterministic per-frame phase → FFmpeg palette + dither). The CLI uses the *same renderer* as the website; the test is an integration test (build + shader compile + WebGL render + non-empty capture).

# The rendering pipeline

```
seed → deterministic anatomy → GPU uniforms → signed-distance scene → raymarch
     → surface lighting → monochrome screening → variant corruption → canvas/PNG/GIF
```

1. **Seed:** `new RNG(`${preset}:${seed}`)` — the same seed produces related-but-distinct organisms per preset (shared DNA, different morphology rules).
2. **Anatomy:** CPU emits compact numbers (≤32 cells, ≤16 cavities, ≤24 tendrils) — never pixels.
3. **SDF geometry:** each cell an ellipsoidal distance field; cells joined with `smin(a, b, fusion)` — low fusion = distinct swollen cells, high fusion = one melted mass.
4. **Tendrils:** quadratic Béziers evaluated as chained tapered capsules (`r0 → r1`), tiny end bulb so tips don't terminate like vector lines; control points drift with phase.
5. **Erosion:** layered fractal + pore noise displaces the distance field (`d -= roughness · noise`) — genuinely geometric, so lighting reacts.
6. **Cavities:** `d = max(organism, −cavity)` after roughening — deep readable black mouths, not decals. Without this it's just grapes.
7. **Raymarch:** step each camera ray by the field distance until surface or escape.
8. **Normals:** sampled field differences around the hit point.
9. **Lighting:** key + fill + soft shadow + AO (darkens crowded areas and cavities) + rim (protects the silhouette through screening) + restrained specular.
10. **Photographic screening:** every grayscale pixel vs a deterministic screen value — continuous shading becomes an irregular field of monochrome marks. Controls: `halftone` (granularity), `threshold` (exposure), `contrast` (separation), `roughness` (physical erosion).
11. **Glitch Culture:** horizontal transmission bands, a deterministic subset laterally shifted; scan cuts, displaced echoes, dropout — damaged scientific transmission, not cyberpunk RGB-split.
12. **ASCII Growth:** no font texture — glyph-like forms constructed procedurally from strokes/dots/bracket fragments progressively replacing the surface; near-miss rays become glyph debris. The organism dissolves *into* computation.
13. **Animation:** one normalized `phase 0→1` drives breathing, cell displacement, tendril motion, band selection, grain — phase-based, so loops export perfectly repeatably.

# Using the mark on qxtaiba.com

The binding site-usage law (identity states, seed architecture, motion/layout rules, color, favicon and asset strategy) lives at [`docs/grappleberry-identity.md`](../../docs/grappleberry-identity.md) in the site repo. Short form: one species, four states — `haze` is canonical, `microbe` structural/compact, `glitch` transitional-on-action, `ascii` computational; site code goes through the `identityStates` wrapper, never raw shader params.
