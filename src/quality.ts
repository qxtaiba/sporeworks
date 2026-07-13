/** Playground render quality: three raw dials over the cost-relevant
 * renderer inputs — backing-store scale (`resolution`), device-pixel-ratio
 * ceiling (`max-dpr`), and render cadence (`fps`) — plus named preset steps
 * that are shortcuts setting all three at once. The dials are the single
 * source of truth; a preset reads as active only while the dial state
 * matches it exactly. "full" is exactly what the playground has always
 * loaded at (retina cap 2, native resolution, 60fps), so the default step
 * changes nothing. */

export type QualityName = "draft" | "balanced" | "full";

export const QUALITY_ORDER: readonly QualityName[] = ["draft", "balanced", "full"];

export interface QualitySettings {
  /** Backing-store scale in (0, 1]; CSS size is untouched, so <1 is a
   * cheap upscale the stochastic screening hides well. */
  resolution: number;
  /** Ceiling applied to the real devicePixelRatio before sizing. */
  maxDpr: number;
  /** Render-loop cadence cap; phase is wall-clock-driven, so animation
   * speed is identical at any fps. */
  fps: number;
}

export const QUALITY_SETTINGS: Record<QualityName, QualitySettings> = {
  draft: { resolution: 0.5, maxDpr: 1, fps: 24 },
  balanced: { resolution: 0.75, maxDpr: 1.5, fps: 30 },
  full: { resolution: 1, maxDpr: 2, fps: 60 },
};

export interface QualityDial {
  key: keyof QualitySettings;
  /** Element attribute / URL parameter name for this axis. */
  attr: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Display precision for the dial readout. */
  decimals: number;
}

/** The three raw quality axes as playground dials. Every preset value sits
 * on these grids, so presets are pure shortcuts over the dial space. */
export const QUALITY_DIALS: readonly QualityDial[] = [
  { key: "resolution", attr: "resolution", label: "RESOLUTION", min: 0.25, max: 1, step: 0.05, decimals: 2 },
  { key: "maxDpr", attr: "max-dpr", label: "MAX DPR", min: 1, max: 3, step: 0.25, decimals: 2 },
  { key: "fps", attr: "fps", label: "FPS", min: 12, max: 60, step: 6, decimals: 0 },
];

export function isQualityName(value: string | null | undefined): value is QualityName {
  return value === "draft" || value === "balanced" || value === "full";
}

/** The preset a dial state IS, or null when the combination is custom.
 * Exact match only — presets are shortcuts, the dials are the truth. */
export function qualityNameForSettings(settings: QualitySettings): QualityName | null {
  for (const name of QUALITY_ORDER) {
    const preset = QUALITY_SETTINGS[name];
    if (
      settings.resolution === preset.resolution &&
      settings.maxDpr === preset.maxDpr &&
      settings.fps === preset.fps
    ) {
      return name;
    }
  }
  return null;
}

/** Clamp a raw (URL-supplied) value into a dial's range; non-finite input
 * falls back to the given default. Off-step values are kept — the renderer
 * accepts any value in range, the grid is a UI convenience. */
export function clampDialValue(dial: QualityDial, value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(dial.max, Math.max(dial.min, value));
}

/** The custom element's own defaults for the three quality attributes
 * (element resolution default 1, max-dpr default 1.5, fps default 60). */
const ELEMENT_QUALITY_DEFAULTS: QualitySettings = { resolution: 1, maxDpr: 1.5, fps: 60 };

const formatQualityValue = (value: number): string => String(Number(value.toFixed(4)));

/** Quality attributes for a <grappleberry-organism> snippet — only the ones
 * that differ from the element's defaults, mirroring how the snippet skips
 * parameters that match the preset. Takes raw settings so custom dial
 * combinations flow through the same path as presets. Note "full" still
 * emits max-dpr="2": the element's conservative 1.5 ceiling is below the
 * playground's retina cap, and the copied tag should reproduce what the
 * playground shows. */
export function qualityAttributes(settings: QualitySettings): string[] {
  const attributes: string[] = [];
  if (settings.resolution !== ELEMENT_QUALITY_DEFAULTS.resolution) {
    attributes.push(`resolution="${formatQualityValue(settings.resolution)}"`);
  }
  if (settings.maxDpr !== ELEMENT_QUALITY_DEFAULTS.maxDpr) {
    attributes.push(`max-dpr="${formatQualityValue(settings.maxDpr)}"`);
  }
  if (settings.fps !== ELEMENT_QUALITY_DEFAULTS.fps) {
    attributes.push(`fps="${formatQualityValue(settings.fps)}"`);
  }
  return attributes;
}
