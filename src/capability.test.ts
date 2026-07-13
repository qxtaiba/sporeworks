import { afterEach, describe, expect, it } from "vitest";
import { capabilityProbe, resetCapabilityProbeForTests } from "./capability";

// vitest.config.ts runs this file under the `node` environment (see that
// file's own comment), which has none of OffscreenCanvas/Worker/
// HTMLCanvasElement by default — so every test below builds up exactly the
// global shape it needs and afterEach restores whatever was there before
// this file ran (nothing, in practice), keeping tests order-independent.
//
// `globalThis` is viewed as a plain string-keyed record rather than
// `typeof globalThis`: the real lib.dom.d.ts ambient types for
// OffscreenCanvas/Worker/HTMLCanvasElement are exact browser interfaces, and
// forcing our minimal fakes (and `undefined`, standing in for "absent") to
// satisfy them would defeat the point of the test.
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
  // The probe memoizes (one page = one answer); each test builds a fresh
  // environment, so drop the memo between them.
  resetCapabilityProbeForTests();
});

// Installs a fully-supported environment (OffscreenCanvas, Worker,
// transferControlToOffscreen on HTMLCanvasElement.prototype) with a
// caller-controlled getContext, so each test only has to knock out or
// reshape the one piece it's asserting on. "Missing" is modeled as
// `undefined` rather than deleting the property — identical for
// `typeof x === 'undefined'`, which is all capabilityProbe checks.
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
