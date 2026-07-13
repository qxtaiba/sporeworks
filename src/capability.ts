// Real feature probe for the OffscreenCanvas + Worker engine path (design
// spec §10). API presence alone is not enough to gate the worker upgrade:
// Safari 16.4 exposes OffscreenCanvas, Worker, and transferControlToOffscreen,
// but its in-worker OffscreenCanvas is 2D-only — WebGL-in-worker only
// shipped in Safari 17. An API-presence-only check would transfer the
// canvas to a worker that can never get a WebGL context, leaving the
// element permanently blank. This probe actually creates a throwaway
// OffscreenCanvas and requests a webgl context to find out.
//
// On false, callers must leave the element inert (no transfer, no worker)
// so the PNG still already rendered pre-upgrade keeps showing.
let probed: boolean | null = null;

export function capabilityProbe(): boolean {
  // Memoized: the answer can't change within a page's lifetime, and every
  // probe otherwise burns one of the browser's ~8-16 live WebGL context
  // slots per element connect until GC gets around to it.
  if (probed !== null) return probed;
  probed = runProbe();
  return probed;
}

/** Test-only: the memo assumes an environment that never changes mid-page,
 * which is exactly what capability.test.ts's per-test global stubs do. */
export function resetCapabilityProbeForTests(): void {
  probed = null;
}

function runProbe(): boolean {
  if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") return false;
  if (!("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return false;
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl") as WebGLRenderingContext | null;
    // Release the throwaway context deterministically rather than leaving
    // it to occupy a context slot until collection. Guarded: test fakes
    // (and exotic embedders) may hand back a context without getExtension.
    if (gl && typeof gl.getExtension === "function") {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    return !!gl;
  } catch {
    return false;
  }
}
