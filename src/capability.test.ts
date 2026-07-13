import { afterEach, describe, expect, it } from "vitest";
import { capabilityProbe, resetCapabilityProbeForTests } from "./capability";

// Runs in the node environment (no OffscreenCanvas/Worker/HTMLCanvasElement
// by default): each test builds exactly the global shape it needs and
// afterEach restores it, keeping tests order-independent. globalThis is
// viewed as a plain record because the real lib.dom.d.ts interfaces would
// reject the minimal fakes the tests install.
const g = globalThis as unknown as Record<"OffscreenCanvas" | "Worker" | "HTMLCanvasElement", unknown>;

const originals: Record<"OffscreenCanvas" | "Worker" | "HTMLCanvasElement", unknown> = {
  OffscreenCanvas: g.OffscreenCanvas,
  Worker: g.Worker,
  HTMLCanvasElement: g.HTMLCanvasElement,
};

afterEach(() => {
  g.OffscreenCanvas = originals.OffscreenCanvas;
  g.Worker = originals.Worker;
  g.HTMLCanvasElement = originals.HTMLCanvasElement;
  // The probe memoizes (one page = one answer); drop it between tests.
  resetCapabilityProbeForTests();
});

// Installs a fully-supported environment with a caller-controlled
// getContext, so each test only knocks out the one piece it asserts on.
// "Missing" is modeled as `undefined`, which is identical for the
// `typeof x === 'undefined'` checks capabilityProbe makes.
const installSupportedGlobals = (getContext: (...args: unknown[]) => unknown) => {
  g.HTMLCanvasElement = { prototype: { transferControlToOffscreen: () => {} } };
  g.Worker = class {};
  g.OffscreenCanvas = class {
    constructor(_width: number, _height: number) {}
    getContext(...args: unknown[]) {
      return getContext(...args);
    }
  };
};

describe("capabilityProbe", () => {
  it("returns false when OffscreenCanvas is missing from the global scope", () => {
    installSupportedGlobals(() => ({}));
    g.OffscreenCanvas = undefined;
    expect(capabilityProbe()).toBe(false);
  });

  it("returns false when Worker is missing from the global scope", () => {
    installSupportedGlobals(() => ({}));
    g.Worker = undefined;
    expect(capabilityProbe()).toBe(false);
  });

  it("returns false when transferControlToOffscreen is missing from HTMLCanvasElement.prototype", () => {
    installSupportedGlobals(() => ({}));
    g.HTMLCanvasElement = { prototype: {} };
    expect(capabilityProbe()).toBe(false);
  });

  it("returns false when getContext('webgl') returns null (e.g. Safari 16.4's worker 2D-only OffscreenCanvas)", () => {
    installSupportedGlobals(() => null);
    expect(capabilityProbe()).toBe(false);
  });

  it("returns false when getContext throws", () => {
    installSupportedGlobals(() => {
      throw new Error("context creation failed");
    });
    expect(capabilityProbe()).toBe(false);
  });

  it("returns true when OffscreenCanvas, Worker, transferControlToOffscreen, and a truthy webgl context are all present", () => {
    installSupportedGlobals(() => ({ fakeGlContext: true }));
    expect(capabilityProbe()).toBe(true);
  });
});
