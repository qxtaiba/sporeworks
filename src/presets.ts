export type PresetName = "haze" | "microbe" | "glitch" | "ascii" | "terra";

export interface Preset {
  label: string;
  code: string;
  description: string;
  blobCount: number;
  cavityCount: number;
  tendrilCount: number;
  clusterSpread: number;
  fusion: number;
  roughness: number;
  cavityScale: number;
  tendrilLength: [number, number];
  tendrilRadius: [number, number];
  halftone: number;
  contrast: number;
  threshold: number;
  glitch: number;
  ascii: number;
  camera: number;
  rotation: [number, number, number];
  specialStem: boolean;
  /** Seconds for one full 0→1 phase cycle. Organism presets breathe on this
   * cadence; terra spins its longitude on it — same phase, different meaning. */
  cycleSeconds: number;
}

export const PRESETS: Record<PresetName, Preset> = {
  haze: {
    label: "CLASSIC HAZE",
    code: "01",
    description: "dense fused colony / ancient hardware fungus",
    blobCount: 28,
    cavityCount: 7,
    tendrilCount: 22,
    clusterSpread: 0.86,
    fusion: 0.019,
    roughness: 0.12,
    cavityScale: 0.72,
    tendrilLength: [0.3, 0.96],
    tendrilRadius: [0.009, 0.05],
    halftone: 1.35,
    contrast: 1.34,
    threshold: 0.49,
    glitch: 0,
    ascii: 0,
    camera: 7.55,
    rotation: [0.0, 0.0, 0.0],
    specialStem: true,
    // Pre-rendered loops must cover exactly one cycle at this length.
    cycleSeconds: 10,
  },
  microbe: {
    label: "MICROBE CLUSTER",
    code: "02",
    description: "larger cellular bodies / wet clustered morphology",
    blobCount: 24,
    cavityCount: 10,
    tendrilCount: 18,
    clusterSpread: 0.78,
    fusion: 0.034,
    roughness: 0.085,
    cavityScale: 0.74,
    tendrilLength: [0.3, 0.92],
    tendrilRadius: [0.012, 0.06],
    halftone: 1.5,
    contrast: 1.25,
    threshold: 0.485,
    glitch: 0,
    ascii: 0,
    camera: 7.55,
    rotation: [-0.06, -0.22, 0.04],
    specialStem: true,
    cycleSeconds: 7.5,
  },
  glitch: {
    label: "GLITCH CULTURE",
    code: "04",
    description: "biological scan interrupted by horizontal transmission errors",
    blobCount: 27,
    cavityCount: 10,
    tendrilCount: 21,
    clusterSpread: 0.88,
    fusion: 0.026,
    roughness: 0.11,
    cavityScale: 0.86,
    tendrilLength: [0.34, 1.05],
    tendrilRadius: [0.012, 0.066],
    halftone: 1.2,
    contrast: 1.46,
    threshold: 0.49,
    glitch: 0.62,
    ascii: 0,
    camera: 7.55,
    rotation: [-0.06, 0.33, -0.03],
    specialStem: true,
    cycleSeconds: 7.5,
  },
  ascii: {
    label: "ASCII GROWTH",
    code: "07",
    description: "organism dissolving into a terminal-grown scan field",
    blobCount: 25,
    cavityCount: 9,
    tendrilCount: 20,
    clusterSpread: 0.9,
    fusion: 0.025,
    roughness: 0.145,
    cavityScale: 0.82,
    tendrilLength: [0.38, 1.16],
    tendrilRadius: [0.01, 0.06],
    halftone: 1.05,
    contrast: 1.58,
    threshold: 0.5,
    glitch: 0.06,
    ascii: 1.08,
    camera: 7.45,
    rotation: [-0.02, -0.18, 0.03],
    specialStem: false,
    cycleSeconds: 7.5,
  },
  terra: {
    label: "TERRA",
    code: "08",
    description: "the home world, screened in the organism's own material language",
    // Geometry generation is bypassed entirely for terra (see organism.ts) —
    // these fields are unused morphology knobs kept only so the preset still
    // satisfies the shared Preset shape.
    blobCount: 1,
    cavityCount: 0,
    tendrilCount: 0,
    clusterSpread: 0,
    fusion: 0.02,
    roughness: 0.035,
    cavityScale: 0,
    tendrilLength: [0, 0],
    tendrilRadius: [0, 0],
    halftone: 1.32,
    contrast: 1.3,
    threshold: 0.49,
    glitch: 0,
    ascii: 0,
    camera: 3.8,
    // ~23.4° axial tilt around X (rotationX); the longitude spin itself
    // (rotationY) is driven live from phase in the renderer, not here.
    rotation: [0.4102, 0.0, 0.0],
    specialStem: false,
    cycleSeconds: 90,
  },
};

export const PRESET_ORDER: PresetName[] = ["haze", "microbe", "glitch", "ascii", "terra"];
