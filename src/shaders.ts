import { MAX_BLOBS, MAX_CAVITIES, MAX_TENDRILS } from "./organism";

export const vertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const fragmentShader = `
precision highp float;
precision highp int;

#define MAX_BLOBS ${MAX_BLOBS}
#define MAX_CAVITIES ${MAX_CAVITIES}
#define MAX_TENDRILS ${MAX_TENDRILS}
#define MAX_STEPS 116
#define FAR_CLIP 12.0

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uPhase;
uniform float uSeed;
uniform float uCamera;
uniform vec3 uRotation;
uniform float uFusion;
uniform float uRoughness;
uniform float uHalftone;
uniform float uContrast;
uniform float uThreshold;
uniform float uGlitch;
uniform float uAscii;
uniform float uGrowth;
uniform float uTransparent;
uniform float uTerra;
uniform float uLightLon;
uniform sampler2D uMask;
uniform vec2 uMaskSize;
uniform float uHasMask;
// 0 = current bone monochrome (the default); >0 blends toward the
// grape-raspberry duotone register, by pre-screen luminance, inside the ink
// itself — never the void.
uniform float uPalette;
uniform vec4 uBlobs[MAX_BLOBS];
uniform vec4 uBlobScales[MAX_BLOBS];
uniform vec4 uCavities[MAX_CAVITIES];
uniform vec4 uTendrilA[MAX_TENDRILS];
uniform vec4 uTendrilB[MAX_TENDRILS];
uniform vec4 uTendrilC[MAX_TENDRILS];
// Live counts (uploadOrganism): the SDF loops below break past these
// instead of evaluating the filler slots. GLSL ES 1.00 requires the for
// bound itself to be a constant expression, but a uniform-conditioned
// break inside is legal — the skipped fillers were exact no-ops (smin
// against +huge / max against -huge), so output is bit-identical.
uniform int uBlobCount;
uniform int uCavityCount;
uniform int uTendrilCount;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash31(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0,0,0));
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat3 m = mat3(
    0.00, 0.80, 0.60,
   -0.80, 0.36,-0.48,
   -0.60,-0.48, 0.64
  );
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise3(p);
    p = m * p * 2.03 + 0.17;
    amplitude *= 0.48;
  }
  return value;
}

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1,0,0, 0,c,s, 0,-s,c);
}
mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c,0,-s, 0,1,0, s,0,c);
}
mat3 rotZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c,s,0, -s,c,0, 0,0,1);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdEllipsoid(vec3 p, vec3 center, float radius, vec3 scale) {
  vec3 q = (p - center) / max(scale, vec3(0.08));
  float k0 = length(q);
  float minScale = min(scale.x, min(scale.y, scale.z));
  return (k0 - radius) * minScale;
}

float sdSphere(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

float sdTaperedCapsule(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float baba = dot(ba, ba);
  float h = clamp(dot(pa, ba) / max(baba, 0.0001), 0.0, 1.0);
  float radius = mix(ra, rb, h);
  return length(pa - ba * h) - radius;
}

vec3 quadraticBezier(vec3 a, vec3 b, vec3 c, float t) {
  vec3 ab = mix(a, b, t);
  vec3 bc = mix(b, c, t);
  return mix(ab, bc, t);
}

float sdTaperedBezier(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1) {
  vec3 q1 = quadraticBezier(a, b, c, 0.3333333);
  vec3 q2 = quadraticBezier(a, b, c, 0.6666667);
  float rA = mix(r0, r1, 0.3333333);
  float rB = mix(r0, r1, 0.6666667);
  float d0 = sdTaperedCapsule(p, a, q1, r0, rA);
  float d1 = sdTaperedCapsule(p, q1, q2, rA, rB);
  float d2 = sdTaperedCapsule(p, q2, c, rB, r1);
  return smin(smin(d0, d1, max(0.006, rA * 0.35)), d2, max(0.005, rB * 0.35));
}

// PHASE-LOCK LAW (loop seam, 2026-07-13): every uPhase-driven sin/cos in
// this shader must complete an INTEGER number of cycles over phase 0→1, so
// phase 1.0 renders pixel-identical to phase 0.0 — that is what makes both
// the live element's continuous phase wrap and the pre-rendered hero loop
// seamless. Organic de-sync comes from the per-blob/tendril random phase
// OFFSETS (and spatial terms), never from irrational frequency ratios.
// (Hash-fed terms like the grain's uPhase*100.0 are exempt: they produce
// frame-decorrelated noise, so the wrap step is statistically identical to
// any other frame step.)
vec3 animatedPoint(vec3 point, float phase, float amount) {
  float wave = sin(uPhase * 6.2831853 + phase + point.y * 1.7);
  float wave2 = cos(uPhase * 6.2831853 + phase * 1.31 + point.x * 2.0);
  return point + vec3(wave, wave2, wave * wave2) * amount;
}

mat3 objectRotation() {
  return rotZ(-uRotation.z) * rotY(-uRotation.y) * rotX(-uRotation.x);
}

float mapScene(vec3 worldP) {
  mat3 rotation = objectRotation();
  vec3 p = rotation * worldP;
  bool terra = uTerra > 0.5;
  if (!terra) p.y += 0.03;

  // Very slow breathing that can be frozen by setting phase. Terra is a
  // rigid planet, not a breathing organism, so it skips the pulse entirely.
  // Amplitude 0.022 (owner, 2026-07-13: "make it breathe a little more" —
  // raised from 0.012; still dignified, not a screensaver pulse).
  float breath = terra ? 1.0 : 1.0 + sin(uPhase * 6.2831853) * 0.022;
  p /= breath;

  float d = 100.0;
  float blend = max(0.014, uFusion * uGrowth);

  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= uBlobCount) break;
    vec4 blob = uBlobs[i];
    vec3 scale = uBlobScales[i].xyz;
    float phase = uBlobScales[i].w;
    vec3 center = blob.xyz * mix(0.55, 1.0, uGrowth);
    if (!terra) {
      // Integer frequencies only (phase-lock law above): the old 0.81/0.67
      // multipliers never completed a whole cycle over phase 0→1 and were
      // THE loop seam. Axis de-sync now rides distinct scalings of the
      // per-blob random offset (phase*1.7 / *2.6) plus a faster ×2 register
      // on z; amounts raised slightly with the breath (0.009/8/6 → 11/10/7).
      center += vec3(
        sin(uPhase * 6.2831853 + phase) * 0.011,
        cos(uPhase * 6.2831853 + phase * 1.7) * 0.010,
        sin(uPhase * 6.2831853 * 2.0 + phase * 2.6) * 0.007
      );
    }
    float sphere = sdEllipsoid(p, center, blob.w * mix(0.72, 1.0, uGrowth), scale);
    d = smin(d, sphere, blend);
  }

  for (int i = 0; i < MAX_TENDRILS; i++) {
    if (i >= uTendrilCount) break;
    vec4 ta = uTendrilA[i];
    vec4 tb = uTendrilB[i];
    vec4 tc = uTendrilC[i];
    vec3 a = ta.xyz * mix(0.65, 1.0, uGrowth);
    vec3 b = animatedPoint(tb.xyz, tb.w, 0.035) * mix(0.65, 1.0, uGrowth);
    vec3 c = animatedPoint(tc.xyz, tb.w + 1.7, 0.065) * mix(0.65, 1.0, uGrowth);
    float r0 = ta.w * mix(0.7, 1.0, uGrowth);
    float tendril = sdTaperedBezier(p, a, b, c, r0, tc.w);
    // Small bulbous tip to avoid vector-line endings.
    tendril = smin(tendril, sdSphere(p, c, max(tc.w * 1.55, 0.011)), max(0.006, tc.w));
    d = smin(d, tendril, max(0.018, r0 * 0.55));
  }

  // Texture drift orbits a small circle instead of drifting linearly
  // (uPhase*0.22 never returned to its start — the other half of the loop
  // seam). Radius 0.035 ≈ 0.22/2π keeps the exact old drift SPEED, and a
  // circle has constant velocity, so nothing reads as a reversal.
  float texture = fbm(p * 3.2 + vec3(
    uSeed * 0.017 + sin(uPhase * 6.2831853) * 0.035,
    uSeed * 0.011 + cos(uPhase * 6.2831853) * 0.035,
    0.0
  ));
  float pores = noise3(p * 11.0 + uSeed * 0.003);
  d -= uRoughness * ((texture - 0.49) * 1.25 + max(0.0, pores - 0.7) * 0.24);

  // Subtractive cavities are intentionally applied after the roughening so
  // they remain legible as deep black mouths instead of soft dimples.
  for (int i = 0; i < MAX_CAVITIES; i++) {
    if (i >= uCavityCount) break;
    vec4 cavity = uCavities[i];
    float cavityNoise = (noise3((p - cavity.xyz) * 7.0 + uSeed) - 0.5) * 0.035;
    float cut = sdSphere(p, cavity.xyz * mix(0.62, 1.0, uGrowth), cavity.w + cavityNoise);
    d = max(d, -cut);
  }

  return d * breath;
}

vec3 getNormal(vec3 p) {
  float e = 0.0024;
  vec2 h = vec2(e, 0.0);
  return normalize(vec3(
    mapScene(p + h.xyy) - mapScene(p - h.xyy),
    mapScene(p + h.yxy) - mapScene(p - h.yxy),
    mapScene(p + h.yyx) - mapScene(p - h.yyx)
  ));
}

float ambientOcclusion(vec3 p, vec3 n) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = 0.035 * float(i);
    float sampleD = mapScene(p + n * dist);
    occ += (dist - sampleD) * weight;
    weight *= 0.68;
  }
  return clamp(1.0 - occ * 2.5, 0.05, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float result = 1.0;
  float t = 0.03;
  for (int i = 0; i < 28; i++) {
    float h = mapScene(ro + rd * t);
    result = min(result, 12.0 * h / t);
    t += clamp(h, 0.02, 0.15);
    if (h < 0.001 || t > 4.0) break;
  }
  return clamp(result, 0.05, 1.0);
}

vec3 raymarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  float nearest = 100.0;
  float hit = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = mapScene(p);
    nearest = min(nearest, abs(d));
    if (d < 0.0017) {
      hit = 1.0;
      break;
    }
    t += max(d * 0.72, 0.004);
    if (t > FAR_CLIP) break;
  }
  return vec3(t, hit, nearest);
}

float glyphMask(vec2 pixel, float density, float seed) {
  float cellSize = mix(6.0, 3.5, density);
  vec2 cell = floor(pixel / cellSize);
  vec2 local = fract(pixel / cellSize);
  float h = hash21(cell + seed);
  float lineX = 1.0 - smoothstep(0.10, 0.23, abs(local.x - 0.5));
  float lineY = 1.0 - smoothstep(0.10, 0.23, abs(local.y - 0.5));
  float diagA = 1.0 - smoothstep(0.08, 0.2, abs(local.x - local.y));
  float diagB = 1.0 - smoothstep(0.08, 0.2, abs((1.0 - local.x) - local.y));
  float dotMask = 1.0 - smoothstep(0.12, 0.28, length(local - 0.5));
  float bracket = max(
    (1.0 - smoothstep(0.05, 0.15, abs(local.x - 0.2))) * step(0.2, local.y) * step(local.y, 0.8),
    (1.0 - smoothstep(0.05, 0.15, abs(local.y - 0.2))) * step(0.2, local.x) * step(local.x, 0.8)
  );
  float shape = h < 0.2 ? lineX : h < 0.4 ? lineY : h < 0.58 ? diagA : h < 0.74 ? diagB : h < 0.9 ? dotMask : bracket;
  return shape;
}

// Fixed-in-world key light direction parameterized by azimuth (degrees).
// Terra's spin is entirely on the object (rotationY driven by phase), so a
// world-space light with a stable azimuth naturally produces a terminator
// that sweeps across the rotating surface, like sunlight on a real planet.
vec3 lightDirFromLon(float lonDeg, float elevationDeg) {
  float lon = radians(lonDeg);
  float elev = radians(elevationDeg);
  float ce = cos(elev);
  return vec3(sin(lon) * ce, sin(elev), -cos(lon) * ce);
}

// Land/ocean ink-probability multiplier sampled from the equirectangular
// landmask at the hit point's object-space lat/lon (latTop 85 → latBottom
// -65, matching the site's own landmask convention). Ocean stays a sparse
// deep field, land reads bright, and the mask's own gradient (neighbor
// taps) gives coastlines a small extra boost so shorelines stay legible
// once the screening breaks the shading apart.
float terraMaskFactor(vec3 dirN) {
  if (uHasMask < 0.5) return 1.0;
  float lat = degrees(asin(clamp(dirN.y, -1.0, 1.0)));
  float lon = degrees(atan(dirN.x, -dirN.z));
  float u = fract(lon / 360.0 + 0.5);
  float v = (85.0 - lat) / 150.0;
  float inRange = step(0.0, v) * step(v, 1.0);
  float vClamped = clamp(v, 0.0, 1.0);
  vec2 texel = 1.0 / max(uMaskSize, vec2(1.0));
  float land = texture2D(uMask, vec2(u, vClamped)).r;
  float lN = texture2D(uMask, vec2(u, clamp(vClamped - texel.y, 0.0, 1.0))).r;
  float lS = texture2D(uMask, vec2(u, clamp(vClamped + texel.y, 0.0, 1.0))).r;
  float lE = texture2D(uMask, vec2(fract(u + texel.x), vClamped)).r;
  float lW = texture2D(uMask, vec2(fract(u - texel.x), vClamped)).r;
  float gradient = clamp(abs(lN - lS) + abs(lE - lW), 0.0, 1.0);
  float oceanFloor = 0.15;
  float factor = mix(oceanFloor, 1.0, land) + gradient * 0.35;
  return clamp(mix(oceanFloor, factor, inRange), 0.0, 1.2);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  // Horizontal displacement is sparse and deterministic: whole bands shift,
  // rather than applying generic RGB/noise glitch decoration.
  if (uGlitch > 0.001) {
    float band = floor((uv.y + 1.0) * 37.0);
    float h = hash11(band + floor(uPhase * 18.0) * 13.0 + uSeed);
    float active = smoothstep(0.78, 0.96, h) * uGlitch;
    float direction = hash11(band + uSeed * 1.7) > 0.5 ? 1.0 : -1.0;
    uv.x += active * direction * mix(0.018, 0.15, hash11(band * 2.3 + uSeed));
  }

  float focal = 1.0 / tan(radians(38.0) * 0.5);
  vec3 ro = vec3(0.0, 0.04, uCamera);
  vec3 rd = normalize(vec3(uv.x, uv.y, -focal));

  vec3 march = raymarch(ro, rd);
  float alpha = 0.0;
  float value = 0.0;
  // Pre-screen luminance the duotone lerps across (dark→grape, bright→
  // raspberry). Miss rays have no lit surface, so they fall back to value
  // itself — the debris halo is rare/dim enough this never reads as odd.
  float shadeLuminance = 0.0;

  if (march.y > 0.5) {
    vec3 p = ro + rd * march.x;
    vec3 n = getNormal(p);
    vec3 keyDir = uTerra > 0.5 ? lightDirFromLon(uLightLon, 40.0) : normalize(vec3(-0.72, 0.88, 0.58));
    vec3 fillDir = normalize(vec3(0.58, -0.12, 0.82));
    float key = max(dot(n, keyDir), 0.0);
    float fill = max(dot(n, fillDir), 0.0) * 0.17;
    float shadow = softShadow(p + n * 0.006, keyDir);
    float aoRaw = ambientOcclusion(p, n);
    float ao = mix(0.46, 1.0, aoRaw);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.1);
    vec3 halfVector = normalize(keyDir - rd);
    float specular = pow(max(dot(n, halfVector), 0.0), 28.0) * 0.28;
    float micro = fbm(p * 8.5 + vec3(uSeed * 0.01));

    float shade = (0.082 + key * shadow * 0.82 + fill + rim * 0.32 + specular) * ao;
    shade *= mix(0.72, 1.13, micro);
    shade = pow(clamp(shade, 0.0, 1.0), 1.0 / max(0.45, uContrast));
    shadeLuminance = shade;

    // Stochastic monochrome screening gives photographic threshold texture,
    // while remaining deterministic at any fixed resolution.
    vec2 screenCell = floor(pixel / max(0.72, uHalftone));
    float screenNoise = hash21(screenCell + vec2(uSeed * 0.31, uSeed * 0.17));
    float density = clamp((shade - uThreshold) * uContrast * 1.7 + 0.55, 0.0, 1.0);
    if (uTerra > 0.5) {
      vec3 dirN = normalize(objectRotation() * p);
      density = clamp(density * terraMaskFactor(dirN), 0.0, 1.0);
    }
    float ink = smoothstep(screenNoise - 0.075, screenNoise + 0.075, density);

    // Hairline rim survives screening, preserving the eroded silhouette.
    float contour = smoothstep(0.38, 0.9, rim) * (0.55 + 0.45 * smoothstep(0.0, 0.55, key + fill));
    value = max(ink, contour * 0.9);

    if (uAscii > 0.001) {
      float glyph = glyphMask(pixel, uAscii, uSeed);
      vec2 terminalCell = floor(pixel / mix(2.2, 3.8, uAscii));
      float cellNoise = hash21(terminalCell + vec2(uSeed * 0.7, uSeed * 0.19));
      float glyphInk = glyph * step(0.14, density);
      float blockInk = value * step(0.2, cellNoise);
      float terminal = max(glyphInk, blockInk * 0.58);
      float terminalMix = clamp(uAscii * 0.76, 0.0, 0.92);
      value = mix(value, terminal, terminalMix);
      // Vertical dropout columns create the dense terminal-scan interior.
      float column = hash11(floor(pixel.x / 2.0) + uSeed);
      value *= mix(1.0, step(0.26, column), uAscii * 0.42);
    }

    alpha = 1.0;
  } else {
    // Near-miss rays become a controlled halo of spores and terminal debris.
    float proximity = exp(-march.z * mix(42.0, 10.0, uAscii));
    float radial = exp(-max(0.0, length(uv) - 0.45) * 3.5);
    float sparse = hash21(floor(pixel / mix(2.0, 4.0, uAscii)) + uSeed);
    float debris = step(mix(0.988, 0.8, uAscii), sparse) * proximity * radial;
    if (uAscii > 0.001) {
      float haloGlyph = glyphMask(pixel, uAscii, uSeed + 11.0);
      float verticalCarrier = step(0.91, hash11(floor(pixel.x / 3.0) + uSeed * 2.0));
      float carrierBreak = step(0.64, hash21(floor(pixel / vec2(3.0, 7.0)) + uSeed));
      debris = max(debris * haloGlyph, verticalCarrier * carrierBreak * proximity * radial * 0.72);
    }
    value = debris * mix(0.35, 0.96, uAscii);
    alpha = value;
    shadeLuminance = value;
  }

  // Fine scan cuts and displaced echoes are only active for glitch culture.
  if (uGlitch > 0.001) {
    float scanProximity = march.y > 0.5 ? 1.0 : exp(-march.z * 24.0);
    float line = step(0.986, hash11(floor(pixel.y) + floor(uPhase * 24.0) + uSeed));
    float segment = step(0.62, hash21(vec2(floor(pixel.x / 23.0), pixel.y + uSeed)));
    value = max(value, line * segment * scanProximity * uGlitch * 0.92);
    float dropout = step(0.991, hash11(floor(pixel.y / 2.0) + uSeed * 4.0));
    value *= 1.0 - dropout * uGlitch * 0.62;
  }

  // The primary ink screen (screenNoise above) is already anchored in pure
  // screen space + a static seed, so it never re-rolls — rotating geometry
  // reads as footage panning under a fixed screen. This secondary grain
  // overlay is the one time-varying register, keyed to phase; terra's spin
  // is slow and continuous, so it evolves the grain 1/8 as fast as the
  // other presets to avoid reading as sparkle instead of a slow pan.
  float grainPhase = uTerra > 0.5 ? uPhase * 12.5 : uPhase * 100.0;
  float paperGrain = (hash21(pixel + vec2(uSeed, grainPhase)) - 0.5) * 0.035;
  value = clamp(value + paperGrain * alpha, 0.0, 1.0);
  vec3 offWhite = vec3(0.91, 0.90, 0.86);

  // Grape-raspberry duotone: #5b2a86 in the shadows/body, #c43a5f in the
  // lit flesh, picked by pre-screen luminance. Applied to the ink only
  // (never the void) and blended in at uPalette strength (0 = the default
  // bone monochrome) so the mark still reads monochrome at a glance even
  // when active.
  vec3 grapeShadow = vec3(0.357, 0.165, 0.525);
  vec3 raspberryLit = vec3(0.769, 0.227, 0.373);
  vec3 duotone = mix(grapeShadow, raspberryLit, clamp(shadeLuminance, 0.0, 1.0));
  vec3 inkColor = mix(offWhite, duotone, clamp(uPalette, 0.0, 1.0));
  vec3 color = inkColor * value;

  if (uTransparent > 0.5) {
    gl_FragColor = vec4(color, max(alpha, value));
  } else {
    gl_FragColor = vec4(color, 1.0);
  }
}
`;
