import { describe, it, expect } from "vitest";
import { P5RendererAdapter } from "./p5.js";

const adapter = new P5RendererAdapter();

describe("P5RendererAdapter", () => {
  describe("metadata", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("p5");
    });

    it("has correct display name", () => {
      expect(adapter.displayName).toBe("p5.js");
    });

    it("has correct algorithm language", () => {
      expect(adapter.algorithmLanguage).toBe("javascript");
    });
  });

  describe("validate", () => {
    it("validates a correct instance-mode sketch", () => {
      const result = adapter.validate(`
        function sketch(p, state) {
          p.setup = () => {
            p.createCanvas(state.canvas.width, state.canvas.height);
          };
          p.draw = () => {};
          return { initializeSystem() {} };
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
      expect(result.errors[0]).toContain("function sketch(p, state)");
    });

    it("rejects algorithm without p.setup", () => {
      const result = adapter.validate(`
        function sketch(p, state) {
          p.draw = () => {};
          return {};
        }
      `);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("p5 algorithms must assign p.setup");
    });

    it("validates arrow function variant", () => {
      const result = adapter.validate(`
        const sketch = (p, state) => {
          p.setup = () => {};
          p.draw = () => {};
        };
      `);
      expect(result.valid).toBe(true);
    });
  });

  describe("compile", () => {
    it("compiles a valid algorithm", async () => {
      const compiled = await adapter.compile(`
        function sketch(p, state) {
          p.setup = () => {
            p.createCanvas(100, 100);
          };
          p.draw = () => {};
          return { initializeSystem() {} };
        }
      `);
      expect(compiled).toBeDefined();
    });

    it("throws for invalid algorithm", async () => {
      await expect(adapter.compile("")).rejects.toThrow(
        "p5 compilation failed",
      );
    });

    it("throws for syntax errors", async () => {
      await expect(
        adapter.compile(`
        function sketch(p, state) {
          p.setup = () => {
          // missing closing braces
        `),
      ).rejects.toThrow("p5 compilation failed");
    });

    it("compiles with component code prepended", async () => {
      const components = [
        {
          name: "prng",
          version: "1.0.0",
          code: "function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }",
          exports: ["mulberry32"],
        },
      ];
      const compiled = await adapter.compile(`
        function sketch(p, state) {
          const rng = mulberry32(state.seed);
          p.setup = () => { p.createCanvas(100, 100); };
          p.draw = () => { p.background(rng() * 255); };
          return { initializeSystem() {} };
        }
      `, components);
      expect(compiled).toBeDefined();
    });

    it("compile still works without components (backward compat)", async () => {
      const compiled = await adapter.compile(`
        function sketch(p, state) {
          p.setup = () => { p.createCanvas(100, 100); };
          p.draw = () => {};
          return { initializeSystem() {} };
        }
      `);
      expect(compiled).toBeDefined();
    });
  });

  describe("getAlgorithmTemplate", () => {
    it("returns a template with sketch(p, state) signature", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("function sketch(p, state)");
      expect(template).toContain("p.setup");
      expect(template).toContain("p.draw");
      expect(template).toContain("p.createCanvas");
    });

    it("template passes validation", () => {
      const template = adapter.getAlgorithmTemplate();
      const result = adapter.validate(template);
      expect(result.valid).toBe(true);
    });
  });

  describe("getRuntimeDependencies", () => {
    it("returns p5.js CDN dependency", () => {
      const deps = adapter.getRuntimeDependencies();
      expect(deps).toHaveLength(1);
      expect(deps[0]!.name).toBe("p5");
      expect(deps[0]!.cdnUrl).toContain("p5.min.js");
      expect(deps[0]!.version).toBeTruthy();
    });
  });

  describe("generateStandaloneHTML", () => {
    it("generates valid HTML with p5 CDN", () => {
      const sketch = {
        genart: "1.1",
        id: "test",
        title: "Test Sketch",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "p5" as const },
        canvas: { width: 800, height: 600 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(p, state) {
          p.setup = () => { p.createCanvas(800, 600); };
          p.draw = () => { p.background(0); };
          return { initializeSystem() {} };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("p5.min.js");
      expect(html).toContain("Test Sketch");
      expect(html).toContain("function sketch(p, state)");
      expect(html).toContain('"seed": 42');
    });

    it("includes component code in standalone HTML", () => {
      const sketch = {
        genart: "1.2",
        id: "test",
        title: "Test Sketch",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "p5" as const },
        canvas: { width: 800, height: 600 },
        parameters: [],
        colors: [],
        components: {
          prng: { version: "1.0.0", code: "function mulberry32(a) { return a; }", exports: ["mulberry32"] },
        },
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(p, state) {
          p.setup = () => { p.createCanvas(800, 600); };
          p.draw = () => { p.background(0); };
          return { initializeSystem() {} };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).toContain("function mulberry32(a)");
      expect(html).toContain("prng v1.0.0");
      expect(html).toContain("function sketch(p, state)");
    });

    it("escapes HTML in title", () => {
      const sketch = {
        genart: "1.1",
        id: "test",
        title: '<script>alert("xss")</script>',
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "p5" as const },
        canvas: { width: 800, height: 600 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(p, state) {
          p.setup = () => {};
          p.draw = () => {};
          return {};
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});
