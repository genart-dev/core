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

  describe("library injection", () => {
    const baseSketch = {
      genart: "1.1",
      id: "test",
      title: "Test",
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      canvas: { width: 800, height: 600 },
      parameters: [],
      colors: [],
      state: { seed: 42, params: {}, colorPalette: [] },
      algorithm: `function sketch(p, state) {
        p.setup = () => { p.createCanvas(800, 600); };
        p.draw = () => {};
        return { initializeSystem() {} };
      }`,
    };

    it("standalone HTML loads p5.js 1.x by default (no renderer.version)", () => {
      const html = adapter.generateStandaloneHTML({
        ...baseSketch,
        renderer: { type: "p5" as const },
      });
      expect(html).toContain("cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/p5.min.js");
      expect(html).not.toContain("p5.js@2");
    });

    it("standalone HTML loads p5.js 2.x when renderer.version is '2.x'", () => {
      const html = adapter.generateStandaloneHTML({
        ...baseSketch,
        renderer: { type: "p5" as const, version: "2.x" },
      });
      expect(html).toContain("cdn.jsdelivr.net/npm/p5@2.0.3/lib/p5.min.js");
      expect(html).not.toContain("cdnjs.cloudflare.com");
    });

    it("standalone HTML injects library script tag after p5 CDN tag", () => {
      const html = adapter.generateStandaloneHTML({
        ...baseSketch,
        renderer: { type: "p5" as const, version: "2.x" },
        libraries: [
          {
            name: "p5.brush",
            version: "2.0.3-beta",
            cdnUrl: "https://cdn.jsdelivr.net/npm/p5.brush@2.0.3-beta/dist/p5.brush.js",
            globalName: "brush",
            renderers: ["p5" as const],
            license: "MIT",
            copyright: "Copyright (c) 2024",
            url: "https://github.com/acamposuribe/p5.brush",
          },
        ],
      });
      expect(html).toContain("p5.brush@2.0.3-beta/dist/p5.brush.js");
      // library tag must appear after p5 CDN tag
      const p5Pos = html.indexOf("p5@2.0.3");
      const brushPos = html.indexOf("p5.brush@2.0.3-beta");
      expect(p5Pos).toBeGreaterThan(-1);
      expect(brushPos).toBeGreaterThan(p5Pos);
    });

    it("interactive HTML also injects library tags and p5.js 2.x", () => {
      const html = adapter.generateInteractiveHTML({
        ...baseSketch,
        renderer: { type: "p5" as const, version: "2.x" },
        libraries: [
          {
            name: "p5.brush",
            version: "2.0.3-beta",
            cdnUrl: "https://cdn.jsdelivr.net/npm/p5.brush@2.0.3-beta/dist/p5.brush.js",
            globalName: "brush",
            renderers: ["p5" as const],
            license: "MIT",
            copyright: "Copyright (c) 2024",
            url: "https://github.com/acamposuribe/p5.brush",
          },
        ],
      });
      expect(html).toContain("cdn.jsdelivr.net/npm/p5@2.0.3/lib/p5.min.js");
      expect(html).toContain("p5.brush@2.0.3-beta/dist/p5.brush.js");
    });

    it("sketch without libraries still loads p5.js 1.x (no regression)", () => {
      const html = adapter.generateStandaloneHTML({
        ...baseSketch,
        renderer: { type: "p5" as const },
      });
      expect(html).toContain("p5.min.js");
      expect(html).not.toContain("p5.brush");
    });

    it("getAlgorithmTemplate returns standard template when no libraries", () => {
      const tmpl = adapter.getAlgorithmTemplate();
      expect(tmpl).toContain("p.createCanvas(WIDTH, HEIGHT)");
      expect(tmpl).not.toContain("WEBGL");
    });

    it("getAlgorithmTemplate returns WEBGL template when p5.brush in libraries", () => {
      const tmpl = adapter.getAlgorithmTemplate([{ name: "p5.brush" }]);
      expect(tmpl).toContain("p.WEBGL");
      expect(tmpl).toContain("p.randomSeed(SEED)");
      expect(tmpl).toContain("const ox = -WIDTH / 2, oy = -HEIGHT / 2");
      expect(tmpl).toContain("p.noLoop()");
      expect(tmpl).not.toContain("brush.load()");
      expect(tmpl).not.toContain("brush.seed(");
      expect(tmpl).not.toContain("p.translate(");
    });
  });

  describe("generateInteractiveHTML", () => {
    it("generates HTML with interactive panel controls", () => {
      const sketch = {
        genart: "1.1",
        id: "test-p5",
        title: "P5 Interactive",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "p5" as const },
        canvas: { width: 800, height: 600 },
        parameters: [
          { key: "scale", label: "Scale", min: 0.1, max: 10, step: 0.1, default: 1 },
        ],
        colors: [
          { key: "primary", label: "Primary", default: "#ff0000" },
        ],
        state: { seed: 42, params: { scale: 1 }, colorPalette: ["#ff0000"] },
        algorithm: `function sketch(p, state) {
          p.setup = () => { p.createCanvas(800, 600); };
          return { initializeSystem() {} };
        }`,
      };

      const html = adapter.generateInteractiveHTML(sketch);
      expect(html).toContain("Preview");
      expect(html).toContain('id="genart-panel"');
      expect(html).toContain('id="gp-seed-val"');
      expect(html).toContain("__gp_rerender");
      expect(html).toContain("p5.min.js");
    });
  });
});
