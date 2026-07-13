/** Playground render-quality steps: one named knob over the three
 * cost-relevant renderer inputs — backing-store scale (`resolution`),
 * device-pixel-ratio ceiling (`max-dpr`), and render cadence (`fps`).
 * "full" is exactly what the playground has always loaded at (retina cap 2,
 * native resolution, 60fps), so the default step changes nothing. */

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

export function isQualityName(value: string | null | undefined): value is QualityName {
  return value === "draft" || value === "balanced" || value === "full";
}

/** The custom element's own defaults for the three quality attributes
 * (element resolution default 1, max-dpr default 1.5, fps default 60). */
const ELEMENT_QUALITY_DEFAULTS: QualitySettings = { resolution: 1, maxDpr: 1.5, fps: 60 };

/** Quality attributes for a <grappleberry-organism> snippet — only the ones
 * that differ from the element's defaults, mirroring how the snippet skips
 * parameters that match the preset. Note "full" still emits max-dpr="2":
 * the element's conservative 1.5 ceiling is below the playground's retina
 * cap, and the copied tag should reproduce what the playground shows. */
export function qualityAttributes(name: QualityName): string[] {
  const settings = QUALITY_SETTINGS[name];
  const attributes: string[] = [];
  if (settings.resolution !== ELEMENT_QUALITY_DEFAULTS.resolution) {
    attributes.push(`resolution="${settings.resolution}"`);
  }
  if (settings.maxDpr !== ELEMENT_QUALITY_DEFAULTS.maxDpr) {
    attributes.push(`max-dpr="${settings.maxDpr}"`);
  }
  if (settings.fps !== ELEMENT_QUALITY_DEFAULTS.fps) {
    attributes.push(`fps="${settings.fps}"`);
  }
  return attributes;
}
