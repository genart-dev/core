import { describe, it, expect } from "vitest";
import { generateCompositorCall, generateCompositorScript } from "./iframe-compositor.js";
import type { DesignLayer } from "@genart-dev/format";

describe("generateCompositorCall — diagnostic warnings", () => {
  it("includes warning when __genart_compositeLayers is missing", () => {
    const code = generateCompositorCall();
    expect(code).toContain("__genart_compositeLayers not defined");
    expect(code).toContain("console.warn");
  });
});

describe("generateCompositorScript — diagnostic warnings", () => {
  const minimalLayer: DesignLayer = {
    id: "test-layer",
    name: "Test",
    type: "shape:rectangle",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: {
      x: 0, y: 0, width: 100, height: 100,
      rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5,
    },
    properties: {},
  };

  it("includes warning for missing canvas element", () => {
    const script = generateCompositorScript([minimalLayer]);
    expect(script).toContain("[genart compositor] No canvas element found");
  });

  it("includes warning for unknown layer types", () => {
    const script = generateCompositorScript([minimalLayer]);
    expect(script).toContain('No renderer for layer type "');
  });
});
