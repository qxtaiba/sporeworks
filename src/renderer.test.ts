import { describe, expect, it } from "vitest";
import { backingSize } from "./renderer";

// backingSize is the pure sizing helper resize() delegates to. Testing it
// directly (rather than constructing a full renderer over a fake WebGL
// context) is the route the E1 task brief prefers — it exercises the exact
// worker-safety behavior (explicit dpr, no window/clientWidth reads) without
// needing a WebGL fake at all.
describe("backingSize", () => {
  it("scales CSS dimensions by the passed dpr when under the cap", () => {
    expect(backingSize(400, 300, 1)).toEqual({ w: 400, h: 300 });
  });

  it("honors the passed dpr, not window.devicePixelRatio", () => {
    const win = globalThis as unknown as { window?: { devicePixelRatio?: number } };
    const hadWindow = "window" in globalThis;
    const previous = win.window;
    // Simulate a worker-hostile global: a sentinel devicePixelRatio that
    // must NOT leak into the result — backingSize takes dpr as a plain
    // argument and never reaches for `window`.
    win.window = { devicePixelRatio: 5 };
    try {
      expect(backingSize(400, 300, 1.25)).toEqual({ w: 500, h: 375 });
    } finally {
      if (hadWindow) win.window = previous;
      else delete win.window;
    }
  });

  it("caps the effective pixel ratio at 1.5 by default", () => {
    expect(backingSize(400, 300, 5)).toEqual({ w: 600, h: 450 });
  });

  it("accepts a custom cap", () => {
    expect(backingSize(400, 300, 5, 2)).toEqual({ w: 800, h: 600 });
  });

  it("floors fractional pixels and never returns zero", () => {
    expect(backingSize(0, 0, 1)).toEqual({ w: 1, h: 1 });
    expect(backingSize(10.7, 10.2, 1)).toEqual({ w: 10, h: 10 });
  });
});
