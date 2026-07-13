import { PRESETS, type PresetName } from "./presets";
import { paletteStrengthForName, type GrappleberryOptions, type GrappleberryRenderer } from "./renderer";

/**
 * One-way (main → worker) message protocol for the off-thread engine.
 * See docs/superpowers/specs/2026-07-12-offscreen-engine-design.md §4.
 * No worker → main messages exist and no `phase`/`mask` messages are
 * defined (terra is dead code — see the design doc §4/§9).
 */
export type EngineMessage =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      options: GrappleberryOptions;
      fps: number | null;
      resolution: number | null;
      dpr: number;
      cssW: number;
      cssH: number;
    }
  | { type: "attr"; command: EngineCommand }
  | { type: "animate"; on: boolean }
  | { type: "resize"; cssW: number; cssH: number; dpr: number }
  | { type: "destroy" };

/** The renderer method an `attr` message resolves to, mirroring today's
 * `attributeChangedCallback` fan-out (grappleberry-element.ts). */
export type EngineCommand =
  | { method: "setPreset" | "setSeed" | "setTargetFps" | "setResolutionScale"; arg: string | number }
  | { method: "update"; patch: Partial<GrappleberryOptions> };

// The subset of GrappleberryOptions keys carried by attributeToCommand's
// numeric branch — everything except the string/boolean options, which have
// their own named branches (preset/seed/transparent) below.
type NumericOptionKey = Exclude<keyof GrappleberryOptions, "preset" | "seed" | "animate" | "transparent">;

// Mirrors grappleberry-element.ts's `observedNumericAttributes` exactly —
// the 14 numeric option keys reachable via a plain (non-renamed) attribute
// name (i.e. attribute name === option key).
const NUMERIC_OPTION_KEYS: NumericOptionKey[] = [
  "phase",
  "growth",
  "roughness",
  "fusion",
  "halftone",
  "contrast",
  "threshold",
  "glitch",
  "ascii",
  "rotationX",
  "rotationY",
  "rotationZ",
  "camera",
  "lightLon",
];

// Mirrors grappleberry-element.ts's `attributeNameToOptionKey`: the four
// kebab-case renames, then a straight pass-through lookup for the rest.
function numericAttributeToOptionKey(name: string): NumericOptionKey | null {
  if (name === "rotation-x") return "rotationX";
  if (name === "rotation-y") return "rotationY";
  if (name === "rotation-z") return "rotationZ";
  if (name === "light-lon") return "lightLon";
  return (NUMERIC_OPTION_KEYS as string[]).includes(name) ? (name as NumericOptionKey) : null;
}

// Mirrors grappleberry-element.ts's `readBoolean`: absent attribute (value
// === null, i.e. what getAttribute returns when hasAttribute is false)
// falls back; present attribute is boolean-true unless "false" or "0".
function readBooleanValue(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value !== "false" && value !== "0";
}

/**
 * Mirrors grappleberry-element.ts's current `attributeChangedCallback`
 * fan-out (the 7 named branches + the numeric-option pass-through) as a
 * pure function: given an observed attribute's name and current value, what
 * renderer command should it produce? Returns null for attributes that
 * don't map to a renderer command — including `animate`, which is folded
 * into visibility state and posted as its own `animate` message, not an
 * `attr` command (see the design doc §4).
 */
export function attributeToCommand(
  name: string,
  value: string | null,
  readNumber: (raw: string | null) => number | null,
): EngineCommand | null {
  if (name === "preset") {
    const preset: PresetName = value && value in PRESETS ? (value as PresetName) : "haze";
    return { method: "setPreset", arg: preset };
  }
  if (name === "seed") {
    return { method: "setSeed", arg: value || "qxtaiba-grappleberry" };
  }
  if (name === "transparent") {
    return { method: "update", patch: { transparent: readBooleanValue(value, false) } };
  }
  if (name === "fps") {
    return { method: "setTargetFps", arg: readNumber(value) ?? 60 };
  }
  if (name === "resolution") {
    return { method: "setResolutionScale", arg: readNumber(value) ?? 1 };
  }
  if (name === "palette") {
    return { method: "update", patch: { paletteStrength: paletteStrengthForName(value) } };
  }

  const optionKey = numericAttributeToOptionKey(name);
  if (!optionKey) return null;
  const numericValue = readNumber(value);
  return numericValue !== null ? { method: "update", patch: { [optionKey]: numericValue } } : null;
}

/**
 * Applies a non-init engine message to a live renderer. This is the worker's
 * entire `onmessage` switch, extracted as a pure function so it's
 * unit-testable against a fake renderer without a real Worker/OffscreenCanvas.
 */
export function applyMessage(renderer: GrappleberryRenderer, msg: Exclude<EngineMessage, { type: "init" }>): void {
  switch (msg.type) {
    case "attr": {
      const { command } = msg;
      switch (command.method) {
        case "setPreset":
          renderer.setPreset(command.arg as PresetName);
          return;
        case "setSeed":
          renderer.setSeed(String(command.arg));
          return;
        case "setTargetFps":
          renderer.setTargetFps(Number(command.arg));
          return;
        case "setResolutionScale":
          renderer.setResolutionScale(Number(command.arg));
          return;
        case "update":
          renderer.update(command.patch);
          return;
      }
      return;
    }
    case "animate":
      renderer.setAnimating(msg.on);
      return;
    case "resize":
      renderer.resize(msg.cssW, msg.cssH, msg.dpr);
      return;
    case "destroy":
      renderer.destroy();
      return;
  }
}
