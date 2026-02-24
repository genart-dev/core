import { describe, it, expect } from "vitest";
import { SVGRendererAdapter } from "./svg.js";

const adapter = new SVGRendererAdapter();

describe("SVGRendererAdapter", () => {
  describe("metadata", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("svg");
    });

    it("has correct display name", () => {
      expect(adapter.displayName).toBe("SVG");
    });

    it("has correct algorithm language", () => {
      expect(adapter.algorithmLanguage).toBe("javascript");
    });
  });

  describe("validate", () => {
    it("validates a correct SVG sketch", () => {
      const result = adapter.validate(`
        function sketch(state) {
          function generate() {
            return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
          }
          return { generate, initializeSystem: generate };
        }
      `);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty algorithm", () => {
      const result = adapter.validate("");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Algorithm source is empty");
    });

    it("rejects algorithm without sketch function", () => {
      const result = adapter.validate("function draw() {}");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("function sketch(state)");
    });

    it("validates arrow function variant", () => {
      const result = adapter.validate(`
        const sketch = (state) => {
          function generate() { return '<svg></svg>'; }
          return { generate };
        };
      `);
      expect(result.valid).toBe(true);
    });

    it("validates variable assignment variant", () => {
      const result = adapter.validate(`
        const sketch = function(state) {
          function generate() { return '<svg></svg>'; }
          return { generate };
        };
      `);
      expect(result.valid).toBe(true);
    });
  });

  describe("compile", () => {
    it("compiles a valid algorithm", async () => {
      const compiled = await adapter.compile(`
        function sketch(state) {
          function generate() {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + state.canvas.width + ' ' + state.canvas.height + '"></svg>';
          }
          return { generate, initializeSystem: generate };
        }
      `);
      expect(compiled).toBeDefined();
    });

    it("throws for invalid algorithm", async () => {
      await expect(adapter.compile("")).rejects.toThrow(
        "SVG compilation failed",
      );
    });

    it("throws for syntax errors", async () => {
      await expect(
        adapter.compile(`
        function sketch(state) {
          function generate() {
          // missing closing braces
        `),
      ).rejects.toThrow("SVG compilation failed");
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
        function sketch(state) {
          const rng = mulberry32(42);
          function generate() { return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'; }
          return { generate, initializeSystem: generate };
        }
      `, components);
      expect(compiled).toBeDefined();
    });

    it("compiled factory produces SVG output", async () => {
      const compiled = await adapter.compile(`
        function sketch(state) {
          function generate() {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + state.canvas.width + ' ' + state.canvas.height + '"><circle cx="50" cy="50" r="25"/></svg>';
          }
          return { generate, initializeSystem: generate };
        }
      `);

      // The compiled algorithm should have a factory that can be called
      const comp = compiled as { source: string; factory: (state: unknown) => Record<string, unknown> };
      expect(comp.source).toBeDefined();
      expect(typeof comp.factory).toBe("function");

      const module = comp.factory({ seed: 1, params: {}, colorPalette: [], canvas: { width: 100, height: 100 } });
      expect(typeof module["generate"]).toBe("function");
      const svg = (module["generate"] as () => string)();
      expect(svg).toContain("<svg");
      expect(svg).toContain("<circle");
    });
  });

  describe("getAlgorithmTemplate", () => {
    it("returns a template with sketch(state) signature", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("function sketch(state)");
      expect(template).toContain("generate");
      expect(template).toContain("<svg");
      expect(template).toContain("state.canvas");
      expect(template).toContain("width");
      expect(template).toContain("height");
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
    it("generates valid HTML without CDN scripts", () => {
      const sketch = {
        genart: "1.1",
        id: "test-svg",
        title: "Test SVG Sketch",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "svg" as const },
        canvas: { width: 800, height: 800 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(state) {
          function generate() {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + state.canvas.width + ' ' + state.canvas.height + '"></svg>';
          }
          return { generate, initializeSystem: generate };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Test SVG Sketch");
      expect(html).toContain("function sketch(state)");
      expect(html).toContain('"seed": 42');
      expect(html).toContain("svg-container");
      // No external CDN scripts
      expect(html).not.toContain("cdnjs.cloudflare.com");
      expect(html).not.toContain("cdn.jsdelivr.net");
    });

    it("escapes HTML in title", () => {
      const sketch = {
        genart: "1.1",
        id: "test",
        title: '<script>alert("xss")</script>',
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "svg" as const },
        canvas: { width: 800, height: 800 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(state) {
          function generate() { return '<svg></svg>'; }
          return { generate };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("renderOffscreen", () => {
    it("produces SVG as Uint8Array without DOM", async () => {
      const compiled = await adapter.compile(`
        function sketch(state) {
          function generate() {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';
          }
          return { generate, initializeSystem: generate };
        }
      `);

      const result = await adapter.renderOffscreen(
        compiled,
        { seed: 1, params: {}, colorPalette: [] },
        { width: 100, height: 100 },
      );

      expect(result).toBeInstanceOf(Uint8Array);
      const text = new TextDecoder().decode(result as Uint8Array);
      expect(text).toContain("<svg");
      expect(text).toContain("<rect");
    });

    it("throws if module has no generate method", async () => {
      const compiled = await adapter.compile(`
        function sketch(state) {
          return { initializeSystem() { return 'not svg'; } };
        }
      `);

      await expect(
        adapter.renderOffscreen(
          compiled,
          { seed: 1, params: {}, colorPalette: [] },
          { width: 100, height: 100 },
        ),
      ).rejects.toThrow("generate()");
    });
  });
});
