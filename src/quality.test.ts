import { describe, expect, it } from "vitest";
import { isQualityName, QUALITY_ORDER, QUALITY_SETTINGS, qualityAttributes } from "./quality";

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

describe("qualityAttributes", () => {
  it("emits all three attributes for draft (all differ from element defaults)", () => {
    expect(qualityAttributes("draft")).toEqual([
      'resolution="0.5"',
      'max-dpr="1"',
      'fps="24"',
    ]);
  });

  it("skips max-dpr for balanced (1.5 is the element default)", () => {
    expect(qualityAttributes("balanced")).toEqual([
      'resolution="0.75"',
      'fps="30"',
    ]);
  });

  it("emits only the retina ceiling for full (element default is 1.5)", () => {
    expect(qualityAttributes("full")).toEqual(['max-dpr="2"']);
  });
});
