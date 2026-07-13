import { PRESETS, type Preset, type PresetName } from "./presets";
import { RNG, add3, normalize3, scale3, type Vec3 } from "./random";

export const MAX_BLOBS = 32;
export const MAX_CAVITIES = 16;
export const MAX_TENDRILS = 24;

export interface Blob {
  center: Vec3;
  radius: number;
  scale: Vec3;
  roughnessPhase: number;
}

export interface Cavity {
  center: Vec3;
  radius: number;
}

export interface Tendril {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  r0: number;
  r1: number;
  phase: number;
}

export interface Organism {
  presetName: PresetName;
  preset: Preset;
  seed: string;
  seedNumber: number;
  blobs: Blob[];
  cavities: Cavity[];
  tendrils: Tendril[];
}

function radialScore(blob: Blob): number {
  const [x, y, z] = blob.center;
  return Math.hypot(x, y, z) + blob.radius * 0.75;
}

function chooseOuterBlob(rng: RNG, blobs: Blob[]): Blob {
  const sorted = [...blobs].sort((a, b) => radialScore(b) - radialScore(a));
  const poolSize = Math.max(4, Math.ceil(sorted.length * 0.45));
  return sorted[rng.int(0, poolSize - 1)]!;
}

function generateBlobs(rng: RNG, preset: Preset): Blob[] {
  const isMicrobe = preset.label === "MICROBE CLUSTER";
  const radiusScale = isMicrobe ? 1.1 : 1.0;
  const targetCount = Math.min(preset.blobCount, MAX_BLOBS);
  const satelliteCount = isMicrobe ? 2 : 3;
  const coreCount = Math.max(12, targetCount - satelliteCount);
  const blobs: Blob[] = [];

  // Deliberately build a face-on, packed colony rather than a random 3D cloud.
  // The visual target reads as a cultured specimen: distinct swollen cells
  // packed into a roughly circular body, with only a few satellites escaping.
  blobs.push({
    center: [rng.normal(0, 0.035), rng.normal(-0.02, 0.035), 0.04],
    radius: rng.range(0.27, 0.34) * radiusScale,
    scale: [rng.range(0.95, 1.08), rng.range(0.94, 1.08), rng.range(0.86, 0.98)],
    roughnessPhase: rng.range(0, 100),
  });

  const firstRing = Math.min(6, coreCount - 1);
  for (let i = 0; i < firstRing; i += 1) {
    const angle = (i / firstRing) * Math.PI * 2 + rng.normal(0, 0.13);
    const radial = preset.clusterSpread * rng.range(0.48, 0.58);
    const radius = rng.range(0.22, 0.305) * radiusScale;
    blobs.push({
      center: [
        Math.cos(angle) * radial + rng.normal(0, 0.035),
        Math.sin(angle) * radial + rng.normal(0, 0.035),
        rng.range(-0.02, 0.16),
      ],
      radius,
      scale: [rng.range(0.88, 1.13), rng.range(0.88, 1.13), rng.range(0.82, 1.02)],
      roughnessPhase: rng.range(0, 100),
    });
  }

  const secondRing = coreCount - blobs.length;
  for (let i = 0; i < secondRing; i += 1) {
    const angle = ((i + rng.range(-0.16, 0.16)) / Math.max(1, secondRing)) * Math.PI * 2
      + rng.range(-0.1, 0.1);
    const radial = preset.clusterSpread * rng.range(0.85, 1.02);
    const radius = rng.range(0.16, 0.27) * radiusScale;
    blobs.push({
      center: [
        Math.cos(angle) * radial + rng.normal(0, 0.045),
        Math.sin(angle) * radial * rng.range(0.92, 1.03) + rng.normal(0, 0.045),
        rng.range(-0.08, 0.19),
      ],
      radius,
      scale: [rng.range(0.84, 1.18), rng.range(0.84, 1.18), rng.range(0.78, 1.02)],
      roughnessPhase: rng.range(0, 100),
    });
  }

  // A handful of budding cells break the otherwise compact silhouette.
  while (blobs.length < targetCount) {
    const parent = chooseOuterBlob(rng, blobs);
    const outward = normalize3([
      parent.center[0] + rng.normal(0, 0.14),
      parent.center[1] + rng.normal(0, 0.14),
      rng.normal(0, 0.05),
    ]);
    const radius = rng.range(0.13, 0.21) * radiusScale;
    const separation = parent.radius * rng.range(0.78, 0.98) + radius * rng.range(0.5, 0.72);
    const center = add3(parent.center, scale3(outward, separation));
    center[2] = rng.range(-0.06, 0.15);
    blobs.push({
      center,
      radius,
      scale: [rng.range(0.84, 1.16), rng.range(0.84, 1.16), rng.range(0.8, 1.02)],
      roughnessPhase: rng.range(0, 100),
    });
  }

  return blobs;
}

function generateCavities(rng: RNG, preset: Preset, blobs: Blob[]): Cavity[] {
  const cavities: Cavity[] = [];
  const usable = blobs.filter((blob) => blob.radius > 0.21);

  for (let i = 0; i < Math.min(preset.cavityCount, MAX_CAVITIES); i += 1) {
    const host = i < 3 ? blobs[i % Math.min(5, blobs.length)]! : rng.pick(usable);
    const outward = normalize3([
      host.center[0] + rng.normal(-0.1, 0.65),
      host.center[1] + rng.normal(0.05, 0.65),
      0.65 + rng.range(0.05, 0.95),
    ]);
    const center = add3(host.center, scale3(outward, host.radius * rng.range(0.5, 0.82)));
    const radius = host.radius * rng.range(0.32, 0.64) * preset.cavityScale;
    cavities.push({ center, radius });
  }

  return cavities;
}

function makeTendril(
  rng: RNG,
  host: Blob,
  direction: Vec3,
  length: number,
  radius: number,
  curl = 0.42,
): Tendril {
  const a = add3(host.center, scale3(direction, host.radius * 0.58));
  const lateral = normalize3([
    -direction[1] + rng.normal(0, 0.45),
    direction[0] + rng.normal(0, 0.45),
    rng.normal(0, 0.5),
  ]);
  const b = add3(
    a,
    add3(scale3(direction, length * rng.range(0.38, 0.55)), scale3(lateral, length * curl * rng.range(-1, 1))),
  );
  const endDirection = normalize3(add3(direction, scale3(lateral, rng.range(-0.9, 0.9))));
  const c = add3(a, add3(scale3(direction, length), scale3(endDirection, length * rng.range(0.05, 0.3))));

  return {
    a,
    b,
    c,
    r0: radius,
    r1: radius * rng.range(0.06, 0.22),
    phase: rng.range(0, Math.PI * 2),
  };
}

function generateTendrils(rng: RNG, preset: Preset, blobs: Blob[]): Tendril[] {
  const tendrils: Tendril[] = [];
  const outer = [...blobs]
    .sort((a, b) => radialScore(b) - radialScore(a))
    .slice(0, Math.min(14, blobs.length))
    .sort((a, b) => Math.atan2(a.center[1], a.center[0]) - Math.atan2(b.center[1], b.center[0]));

  if (preset.specialStem) {
    const topHost = [...blobs].sort((a, b) => (b.center[1] + b.radius) - (a.center[1] + a.radius))[0]!;
    const a: Vec3 = [topHost.center[0], topHost.center[1] + topHost.radius * 0.56, topHost.center[2] + 0.03];
    const b: Vec3 = [a[0] - rng.range(0.48, 0.7), a[1] + rng.range(0.68, 0.86), a[2] + rng.range(-0.05, 0.05)];
    const c: Vec3 = [a[0] + rng.range(0.22, 0.46), a[1] + rng.range(0.95, 1.12), a[2] + rng.range(-0.04, 0.06)];
    tendrils.push({
      a,
      b,
      c,
      r0: rng.range(0.085, 0.115),
      r1: rng.range(0.048, 0.07),
      phase: rng.range(0, Math.PI * 2),
    });

    const rightHost = [...blobs].sort((a, b) => (b.center[0] + b.center[1]) - (a.center[0] + a.center[1]))[0]!;
    const branchDirection = normalize3([0.72, 0.82, rng.range(-0.06, 0.08)]);
    tendrils.push(makeTendril(rng, rightHost, branchDirection, rng.range(0.72, 0.98), rng.range(0.026, 0.044), 0.36));
  }

  let index = 0;
  while (tendrils.length < Math.min(preset.tendrilCount, MAX_TENDRILS)) {
    const host = outer[index % outer.length]!;
    index += 1;
    const radialDirection = normalize3([host.center[0], host.center[1], rng.normal(0, 0.08)]);
    const tangent: Vec3 = [-radialDirection[1], radialDirection[0], rng.normal(0, 0.12)];
    const direction = normalize3(add3(radialDirection, scale3(tangent, rng.range(-0.28, 0.28))));
    const longChance = rng.next();
    const length = longChance < 0.72
      ? rng.range(preset.tendrilLength[0], preset.tendrilLength[0] + (preset.tendrilLength[1] - preset.tendrilLength[0]) * 0.48)
      : rng.range(preset.tendrilLength[0] + (preset.tendrilLength[1] - preset.tendrilLength[0]) * 0.45, preset.tendrilLength[1]);
    const radiusMix = Math.pow(rng.next(), 2.4);
    let radius = preset.tendrilRadius[0] + (preset.tendrilRadius[1] - preset.tendrilRadius[0]) * radiusMix;
    if (longChance > 0.9) radius *= 1.25;
    tendrils.push(makeTendril(rng, host, direction, length, radius, rng.range(0.24, 0.62)));
  }

  return tendrils;
}

// Terra is one rigid sphere, not a grown colony — the packed-ring/cavity/
// tendril machinery above targets a minimum of ~12 cells regardless of
// preset.blobCount, so it can't produce a single body. Bypass it entirely.
export const TERRA_RADIUS = 1.0;

function generateTerraOrganism(rng: RNG, presetName: PresetName, preset: Preset, seed: string, seedNumber: number): Organism {
  return {
    presetName,
    preset,
    seed,
    seedNumber,
    blobs: [
      {
        center: [0, 0, 0],
        radius: TERRA_RADIUS,
        scale: [1, 1, 1],
        roughnessPhase: rng.range(0, 100),
      },
    ],
    cavities: [],
    tendrils: [],
  };
}

export function generateOrganism(presetName: PresetName, seed: string): Organism {
  const preset = PRESETS[presetName];
  const rng = new RNG(`${presetName}:${seed}`);
  const seedNumber = rng.next() * 1000;

  if (presetName === "terra") {
    return generateTerraOrganism(rng, presetName, preset, seed, seedNumber);
  }

  const blobs = generateBlobs(rng, preset);
  const cavities = generateCavities(rng, preset, blobs);
  const tendrils = generateTendrils(rng, preset, blobs);

  return {
    presetName,
    preset,
    seed,
    seedNumber,
    blobs,
    cavities,
    tendrils,
  };
}
