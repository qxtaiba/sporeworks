/// <reference lib="webworker" />

import { GrappleberryRenderer } from "./renderer";
import { applyMessage, type EngineMessage } from "./engine-messages";

// Dedicated-worker entry point: owns exactly one GrappleberryRenderer.
// `init` constructs it over the transferred OffscreenCanvas; every later
// message routes through applyMessage (engine-messages.ts).
let renderer: GrappleberryRenderer | null = null;

self.onmessage = (e: MessageEvent<EngineMessage>) => {
  const msg = e.data;
  if (msg.type === "init") {
    renderer = new GrappleberryRenderer(msg.canvas, msg.options);
    if (msg.fps !== null) renderer.setTargetFps(msg.fps);
    if (msg.resolution !== null) renderer.setResolutionScale(msg.resolution);
    renderer.resize(msg.cssW, msg.cssH, msg.dpr);
    return;
  }
  if (renderer) applyMessage(renderer, msg);
};
