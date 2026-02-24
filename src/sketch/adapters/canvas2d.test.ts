import { describe, it, expect } from "vitest";
import { Canvas2DRendererAdapter } from "./canvas2d.js";

const adapter = new Canvas2DRendererAdapter();

describe("Canvas2DRendererAdapter", () => {
  describe("metadata", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("canvas2d");
    });

    it("has correct display name", () => {
      expect(adapter.displayName).toBe("Canvas 2D");
    });

    it("has correct algorithm language", () => {
      expect(adapter.algorithmLanguage).toBe("javascript");
    });
  });

  describe("validate", () => {
    it("validates a correct canvas2d sketch", () => {
      const result = adapter.validate(`
        function sketch(ctx, state) {
          const { width, height } = state.canvas;
          function initializeSystem() {
            ctx.clearRect(0, 0, width, height);
          }
          return { initializeSystem };
        }
      `);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty algorithm", () => {
      const result = adapter.validate("");
      expect(result.valid).toBe(false);
    });

    it("rejects algorithm without sketch(ctx, state) signature", () => {
      const result = adapter.validate("function draw(ctx) {}");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("sketch(ctx, state)");
    });

    it("validates arrow function variant", () => {
      const result = adapter.validate(`
        const sketch = (ctx, state) => {
          return { initializeSystem() {} };
        };
      `);
      expect(result.valid).toBe(true);
    });
  });

  describe("compile", () => {
    it("compiles a valid algorithm", async () => {
      const compiled = await adapter.compile(`
        function sketch(ctx, state) {
          function initializeSystem() {
            ctx.clearRect(0, 0, 100, 100);
          }
          return { initializeSystem };
        }
      `);
      expect(compiled).toBeDefined();
    });

    it("throws for invalid algorithm", async () => {
      await expect(adapter.compile("")).rejects.toThrow(
        "Canvas 2D compilation failed",
      );
    });

    it("compiles with component code prepended", async () => {
      const components = [
        {
          name: "prng",
          version: "1.0.0",
          code: "function mulberry32(a) { return function() { return 0.5; }; }",
          exports: ["mulberry32"],
        },
      ];
      const compiled = await adapter.compile(`
        function sketch(ctx, state) {
          const rng = mulberry32(state.seed);
          function initializeSystem() { ctx.clearRect(0, 0, 100, 100); }
          return { initializeSystem };
        }
      `, components);
      expect(compiled).toBeDefined();
    });
  });

  describe("getAlgorithmTemplate", () => {
    it("returns a template with sketch(ctx, state) signature", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("function sketch(ctx, state)");
      expect(template).toContain("ctx.clearRect");
      expect(template).toContain("initializeSystem");
    });

    it("template passes validation", () => {
      const template = adapter.getAlgorithmTemplate();
      const result = adapter.validate(template);
      expect(result.valid).toBe(true);
    });
  });

  describe("getRuntimeDependencies", () => {
    it("returns empty array (no CDN needed)", () => {
      const deps = adapter.getRuntimeDependencies();
      expect(deps).toHaveLength(0);
    });
  });

  describe("generateStandaloneHTML", () => {
    it("generates valid HTML without CDN dependencies", () => {
      const sketch = {
        genart: "1.1",
        id: "test-canvas2d",
        title: "Canvas 2D Test",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "canvas2d" as const },
        canvas: { width: 800, height: 600 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: ["#000000"] },
        algorithm: `function sketch(ctx, state) {
          function initializeSystem() {
            ctx.fillStyle = state.colorPalette[0];
            ctx.fillRect(0, 0, 800, 600);
          }
          return { initializeSystem };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Canvas 2D Test");
      expect(html).toContain("function sketch(ctx, state)");
      expect(html).toContain('width="800"');
      expect(html).toContain('height="600"');
      // Should NOT include any CDN scripts
      expect(html).not.toContain("cdnjs");
    });
  });
});
