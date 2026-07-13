import { describe, expect, it } from "vitest";
import {
  clampDialValue,
  isQualityName,
  QUALITY_DIALS,
  QUALITY_ORDER,
  QUALITY_SETTINGS,
  qualityAttributes,
  qualityNameForSettings,
} from "./quality";

describe("quality settings", () => {
  it("orders the steps coarse to crisp", () => {
    expect(QUALITY_ORDER).toEqual(["draft", "balanced", "full"]);
  });

  it("is monotonic in every axis across the steps", () => {
    for (let index = 1; index < QUALITY_ORDER.length; index += 1) {
      const previous = QUALITY_SETTINGS[QUALITY_ORDER[index - 1]];
      const current = QUALITY_SETTINGS[QUALITY_ORDER[index]];
      expect(current.resolution).toBeGreaterThan(previous.resolution);
      expect(current.maxDpr).toBeGreaterThan(previous.maxDpr);
      expect(current.fps).toBeGreaterThan(previous.fps);
    }
  });

  it("keeps 'full' identical to the playground's historical load state", () => {
    // resolutionScale 1, PLAYGROUND_MAX_DPR 2, 60fps — the pre-quality-
    // control defaults. The default step must change nothing.
    expect(QUALITY_SETTINGS.full).toEqual({ resolution: 1, maxDpr: 2, fps: 60 });
  });

  it("keeps every resolution inside the renderer's (0, 1] contract", () => {
    for (const name of QUALITY_ORDER) {
      const { resolution } = QUALITY_SETTINGS[name];
      expect(resolution).toBeGreaterThan(0);
      expect(resolution).toBeLessThanOrEqual(1);
    }
  });
});

describe("isQualityName", () => {
  it("accepts exactly the three step names", () => {
    expect(isQualityName("draft")).toBe(true);
    expect(isQualityName("balanced")).toBe(true);
    expect(isQualityName("full")).toBe(true);
  });

  it("rejects anything else, including null and casing variants", () => {
    expect(isQualityName(null)).toBe(false);
    expect(isQualityName(undefined)).toBe(false);
    expect(isQualityName("")).toBe(false);
    expect(isQualityName("FULL")).toBe(false);
    expect(isQualityName("medium")).toBe(false);
  });
});

describe("quality dials", () => {
  it("covers the three axes under their attribute names", () => {
    expect(QUALITY_DIALS.map((dial) => dial.key)).toEqual(["resolution", "maxDpr", "fps"]);
    expect(QUALITY_DIALS.map((dial) => dial.attr)).toEqual(["resolution", "max-dpr", "fps"]);
  });

  it("keeps every preset reachable from the dial grids", () => {
    // Presets are shortcuts over the dial space: each preset value must sit
    // inside a dial's range AND on its step grid, or clicking a preset would
    // put the sliders in a state the dials themselves cannot reproduce.
    for (const name of QUALITY_ORDER) {
      const settings = QUALITY_SETTINGS[name];
      for (const dial of QUALITY_DIALS) {
        const value = settings[dial.key];
        expect(value).toBeGreaterThanOrEqual(dial.min);
        expect(value).toBeLessThanOrEqual(dial.max);
        const steps = (value - dial.min) / dial.step;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      }
    }
  });

  it("keeps the resolution dial inside the renderer's (0, 1] contract", () => {
    const resolution = QUALITY_DIALS.find((dial) => dial.key === "resolution");
    expect(resolution?.min).toBeGreaterThan(0);
    expect(resolution?.max).toBeLessThanOrEqual(1);
  });
});

describe("qualityNameForSettings", () => {
  it("round-trips every preset through its dial values", () => {
    for (const name of QUALITY_ORDER) {
      expect(qualityNameForSettings({ ...QUALITY_SETTINGS[name] })).toBe(name);
    }
  });

  it("returns null when any single axis leaves a preset", () => {
    expect(qualityNameForSettings({ ...QUALITY_SETTINGS.full, resolution: 0.95 })).toBeNull();
    expect(qualityNameForSettings({ ...QUALITY_SETTINGS.draft, maxDpr: 1.25 })).toBeNull();
    expect(qualityNameForSettings({ ...QUALITY_SETTINGS.balanced, fps: 36 })).toBeNull();
  });

  it("returns null for a combination that mixes two presets", () => {
    expect(qualityNameForSettings({ resolution: 0.5, maxDpr: 2, fps: 30 })).toBeNull();
  });
});

describe("clampDialValue", () => {
  const fps = QUALITY_DIALS.find((dial) => dial.key === "fps")!;

  it("clamps out-of-range values to the dial's ends", () => {
    expect(clampDialValue(fps, 240, 60)).toBe(60);
    expect(clampDialValue(fps, 1, 60)).toBe(12);
  });

  it("keeps in-range values and falls back on non-finite input", () => {
    expect(clampDialValue(fps, 42, 60)).toBe(42);
    expect(clampDialValue(fps, Number.NaN, 60)).toBe(60);
  });
});

describe("qualityAttributes", () => {
  it("emits all three attributes for draft (all differ from element defaults)", () => {
    expect(qualityAttributes(QUALITY_SETTINGS.draft)).toEqual([
      'resolution="0.5"',
      'max-dpr="1"',
      'fps="24"',
    ]);
  });

  it("skips max-dpr for balanced (1.5 is the element default)", () => {
    expect(qualityAttributes(QUALITY_SETTINGS.balanced)).toEqual([
      'resolution="0.75"',
      'fps="30"',
    ]);
  });

  it("emits only the retina ceiling for full (element default is 1.5)", () => {
    expect(qualityAttributes(QUALITY_SETTINGS.full)).toEqual(['max-dpr="2"']);
  });

  it("emits every non-default axis for a custom dial combination", () => {
    expect(qualityAttributes({ resolution: 0.6, maxDpr: 2.5, fps: 42 })).toEqual([
      'resolution="0.6"',
      'max-dpr="2.5"',
      'fps="42"',
    ]);
  });

  it("emits nothing when the dials sit exactly on the element defaults", () => {
    expect(qualityAttributes({ resolution: 1, maxDpr: 1.5, fps: 60 })).toEqual([]);
  });
});
