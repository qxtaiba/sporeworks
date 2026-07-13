import { describe, expect, it, vi } from "vitest";
import { paletteStrengthForName, type GrappleberryRenderer } from "./renderer";
import { applyMessage, attributeToCommand, type EngineMessage } from "./engine-messages";

// Same parse-or-null contract as grappleberry-element.ts's readNumber.
const readNumber = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

describe("attributeToCommand", () => {
  it("maps preset to setPreset with the raw preset name", () => {
    expect(attributeToCommand("preset", "glitch", readNumber)).toEqual({
      method: "setPreset",
      arg: "glitch",
    });
  });

  it("falls back to haze for an unrecognized preset value", () => {
    expect(attributeToCommand("preset", "not-a-preset", readNumber)).toEqual({
      method: "setPreset",
      arg: "haze",
    });
  });

  it("falls back to haze for a null preset value", () => {
    expect(attributeToCommand("preset", null, readNumber)).toEqual({
      method: "setPreset",
      arg: "haze",
    });
  });

  it("maps seed to setSeed with the raw value", () => {
    expect(attributeToCommand("seed", "my-seed", readNumber)).toEqual({
      method: "setSeed",
      arg: "my-seed",
    });
  });

  it("falls back to the default seed when seed is empty/null", () => {
    expect(attributeToCommand("seed", null, readNumber)).toEqual({
      method: "setSeed",
      arg: "qxtaiba-grappleberry",
    });
    expect(attributeToCommand("seed", "", readNumber)).toEqual({
      method: "setSeed",
      arg: "qxtaiba-grappleberry",
    });
  });

  it("maps transparent to an update patch, default false when absent", () => {
    expect(attributeToCommand("transparent", null, readNumber)).toEqual({
      method: "update",
      patch: { transparent: false },
    });
    expect(attributeToCommand("transparent", "", readNumber)).toEqual({
      method: "update",
      patch: { transparent: true },
    });
    expect(attributeToCommand("transparent", "false", readNumber)).toEqual({
      method: "update",
      patch: { transparent: false },
    });
    expect(attributeToCommand("transparent", "0", readNumber)).toEqual({
      method: "update",
      patch: { transparent: false },
    });
    expect(attributeToCommand("transparent", "true", readNumber)).toEqual({
      method: "update",
      patch: { transparent: true },
    });
  });

  it("maps fps to setTargetFps, defaulting to 60", () => {
    expect(attributeToCommand("fps", "30", readNumber)).toEqual({
      method: "setTargetFps",
      arg: 30,
    });
    expect(attributeToCommand("fps", null, readNumber)).toEqual({
      method: "setTargetFps",
      arg: 60,
    });
  });

  it("maps resolution to setResolutionScale, defaulting to 1", () => {
    expect(attributeToCommand("resolution", "0.5", readNumber)).toEqual({
      method: "setResolutionScale",
      arg: 0.5,
    });
    expect(attributeToCommand("resolution", null, readNumber)).toEqual({
      method: "setResolutionScale",
      arg: 1,
    });
  });

  it("maps palette to an update patch carrying paletteStrength", () => {
    expect(attributeToCommand("palette", "grape-raspberry", readNumber)).toEqual({
      method: "update",
      patch: { paletteStrength: paletteStrengthForName("grape-raspberry") },
    });
    expect(paletteStrengthForName("grape-raspberry")).toBeGreaterThan(0);
  });

  it("maps palette to strength 0 for an unrecognized name", () => {
    expect(attributeToCommand("palette", "not-a-palette", readNumber)).toEqual({
      method: "update",
      patch: { paletteStrength: 0 },
    });
  });

  it.each([
    ["phase", "phase", "0.25"],
    ["growth", "growth", "2"],
    ["roughness", "roughness", "0.5"],
    ["fusion", "fusion", "0.5"],
    ["halftone", "halftone", "0.5"],
    ["contrast", "contrast", "1.2"],
    ["threshold", "threshold", "0.5"],
    ["glitch", "glitch", "0.5"],
    ["ascii", "ascii", "0.5"],
    ["camera", "camera", "1"],
  ] as const)("maps numeric attribute %s to update patch key %s", (attrName, optionKey, raw) => {
    expect(attributeToCommand(attrName, raw, readNumber)).toEqual({
      method: "update",
      patch: { [optionKey]: Number(raw) },
    });
  });

  it("maps rotation-x to update patch key rotationX", () => {
    expect(attributeToCommand("rotation-x", "0.5", readNumber)).toEqual({
      method: "update",
      patch: { rotationX: 0.5 },
    });
  });

  it("maps rotation-y to update patch key rotationY", () => {
    expect(attributeToCommand("rotation-y", "0.75", readNumber)).toEqual({
      method: "update",
      patch: { rotationY: 0.75 },
    });
  });

  it("maps rotation-z to update patch key rotationZ", () => {
    expect(attributeToCommand("rotation-z", "1.5", readNumber)).toEqual({
      method: "update",
      patch: { rotationZ: 1.5 },
    });
  });

  it("maps light-lon to update patch key lightLon", () => {
    expect(attributeToCommand("light-lon", "-90", readNumber)).toEqual({
      method: "update",
      patch: { lightLon: -90 },
    });
  });

  it("returns null for a numeric attribute whose value doesn't parse", () => {
    expect(attributeToCommand("rotation-x", null, readNumber)).toBeNull();
    expect(attributeToCommand("growth", "not-a-number", readNumber)).toBeNull();
  });

  it("returns null for the animate attribute (not routed through attr commands)", () => {
    expect(attributeToCommand("animate", "false", readNumber)).toBeNull();
  });

  it("returns null for the max-dpr attribute (element-level, carried on resize messages)", () => {
    expect(attributeToCommand("max-dpr", "2", readNumber)).toBeNull();
  });

  it("returns null for an unknown attribute", () => {
    expect(attributeToCommand("unknown", "x", readNumber)).toBeNull();
  });
});

describe("applyMessage", () => {
  const makeFakeRenderer = () => ({
    setPreset: vi.fn(),
    setSeed: vi.fn(),
    setTargetFps: vi.fn(),
    setResolutionScale: vi.fn(),
    update: vi.fn(),
    setAnimating: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  });

  it("routes animate messages to setAnimating", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, { type: "animate", on: false });
    expect(fake.setAnimating).toHaveBeenCalledWith(false);
  });

  it("routes resize messages to resize(cssW, cssH, dpr, maxDpr)", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, { type: "resize", cssW: 1, cssH: 2, dpr: 3, maxDpr: 2 });
    expect(fake.resize).toHaveBeenCalledWith(1, 2, 3, 2);
  });

  it("routes attr/setPreset messages to setPreset", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, {
      type: "attr",
      command: { method: "setPreset", arg: "haze" },
    });
    expect(fake.setPreset).toHaveBeenCalledWith("haze");
  });

  it("routes attr/update messages to update with the patch", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, {
      type: "attr",
      command: { method: "update", patch: { contrast: 2 } },
    });
    expect(fake.update).toHaveBeenCalledWith({ contrast: 2 });
  });

  it("routes attr/setSeed messages to setSeed", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, {
      type: "attr",
      command: { method: "setSeed", arg: "my-seed" },
    });
    expect(fake.setSeed).toHaveBeenCalledWith("my-seed");
  });

  it("routes attr/setTargetFps messages to setTargetFps", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, {
      type: "attr",
      command: { method: "setTargetFps", arg: 30 },
    });
    expect(fake.setTargetFps).toHaveBeenCalledWith(30);
  });

  it("routes attr/setResolutionScale messages to setResolutionScale", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, {
      type: "attr",
      command: { method: "setResolutionScale", arg: 0.5 },
    });
    expect(fake.setResolutionScale).toHaveBeenCalledWith(0.5);
  });

  it("routes destroy messages to destroy", () => {
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, { type: "destroy" });
    expect(fake.destroy).toHaveBeenCalled();
  });

  it("type-narrows EngineMessage to exclude init at the call site (compile-time check)", () => {
    const nonInit: Exclude<EngineMessage, { type: "init" }> = { type: "destroy" };
    const fake = makeFakeRenderer();
    applyMessage(fake as unknown as GrappleberryRenderer, nonInit);
    expect(fake.destroy).toHaveBeenCalled();
  });
});
