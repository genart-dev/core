import { describe, it, expect } from "vitest";
import { generateInteractivePanel } from "./interactive-panel.js";
import type { SketchDefinition } from "@genart-dev/format";

function makeSketch(overrides: Partial<SketchDefinition> = {}): SketchDefinition {
  return {
    genart: "1.1",
    id: "test-sketch",
    title: "Test Sketch",
    created: "2025-01-01T00:00:00Z",
    modified: "2025-01-01T00:00:00Z",
    renderer: { type: "canvas2d" },
    canvas: { width: 800, height: 600 },
    parameters: [],
    colors: [],
    state: { seed: 42, params: {}, colorPalette: [] },
    algorithm: "function sketch(ctx, state) { return { initializeSystem() {} }; }",
    ...overrides,
  } as SketchDefinition;
}

describe("generateInteractivePanel", () => {
  it("generates css, html, and js sections", () => {
    const result = generateInteractivePanel(makeSketch());
    expect(result.css).toBeDefined();
    expect(result.html).toBeDefined();
    expect(result.js).toBeDefined();
  });

  it("includes seed controls", () => {
    const { html } = generateInteractivePanel(makeSketch());
    expect(html).toContain('id="gp-seed"');
    expect(html).toContain("__gp_seedPrev");
    expect(html).toContain("__gp_seedNext");
    expect(html).toContain("__gp_seedRandom");
  });

  it("sets initial seed value", () => {
    const { html } = generateInteractivePanel(makeSketch({ state: { seed: 1234, params: {}, colorPalette: [] } }));
    expect(html).toContain('value="1234"');
  });

  it("generates parameter sliders from ParamDef[]", () => {
    const sketch = makeSketch({
      parameters: [
        { key: "density", label: "Density", min: 1, max: 100, step: 1, default: 50 },
        { key: "speed", label: "Speed", min: 0.1, max: 5, step: 0.1, default: 1 },
      ],
      state: { seed: 42, params: { density: 50, speed: 1 }, colorPalette: [] },
    });
    const { html } = generateInteractivePanel(sketch);
    expect(html).toContain('id="gp-param-density"');
    expect(html).toContain('id="gp-param-speed"');
    expect(html).toContain("Density");
    expect(html).toContain("Speed");
    expect(html).toContain('min="1"');
    expect(html).toContain('max="100"');
  });

  it("generates color pickers from ColorDef[]", () => {
    const sketch = makeSketch({
      colors: [
        { key: "bg", label: "Background", default: "#1a1a1a" },
        { key: "fg", label: "Foreground", default: "#ffffff" },
      ],
      state: { seed: 42, params: {}, colorPalette: ["#1a1a1a", "#ffffff"] },
    });
    const { html } = generateInteractivePanel(sketch);
    expect(html).toContain('id="gp-color-0"');
    expect(html).toContain('id="gp-color-1"');
    expect(html).toContain("Background");
    expect(html).toContain("Foreground");
    expect(html).toContain('value="#1a1a1a"');
  });

  it("generates theme dropdown when themes exist", () => {
    const sketch = makeSketch({
      colors: [{ key: "bg", label: "BG", default: "#000" }],
      themes: [
        { name: "Dark", colors: ["#000000"] },
        { name: "Light", colors: ["#ffffff"] },
      ],
      state: { seed: 42, params: {}, colorPalette: ["#000000"] },
    });
    const { html } = generateInteractivePanel(sketch);
    expect(html).toContain('id="gp-theme"');
    expect(html).toContain("Dark");
    expect(html).toContain("Light");
  });

  it("omits theme dropdown when no themes", () => {
    const { html } = generateInteractivePanel(makeSketch());
    expect(html).not.toContain('id="gp-theme"');
  });

  it("omits parameter section when no parameters", () => {
    const { html } = generateInteractivePanel(makeSketch({ parameters: [] }));
    expect(html).not.toContain("gp-param-");
  });

  it("omits color section when no colors", () => {
    const { html } = generateInteractivePanel(makeSketch({ colors: [] }));
    expect(html).not.toContain("gp-color-");
  });

  it("includes Re-render and Copy State buttons", () => {
    const { html } = generateInteractivePanel(makeSketch());
    expect(html).toContain("Re-render");
    expect(html).toContain("Copy State");
    expect(html).toContain("__gp_rerender");
    expect(html).toContain("__gp_copyState");
  });

  it("JS includes sketch ID for copy state", () => {
    const { js } = generateInteractivePanel(makeSketch({ id: "my-art-01" }));
    expect(js).toContain("my-art-01");
  });

  it("escapes HTML in title", () => {
    const { html } = generateInteractivePanel(makeSketch({ title: '<script>alert("xss")</script>' }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in parameter labels", () => {
    const sketch = makeSketch({
      parameters: [{ key: "x", label: '<img onerror="alert(1)">', min: 0, max: 1, step: 0.1, default: 0.5 }],
      state: { seed: 1, params: { x: 0.5 }, colorPalette: [] },
    });
    const { html } = generateInteractivePanel(sketch);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
