import { describe, it, expect } from "vitest";
import { ThreeRendererAdapter } from "./three.js";

const adapter = new ThreeRendererAdapter();

describe("ThreeRendererAdapter", () => {
  describe("metadata", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("three");
    });

    it("has correct display name", () => {
      expect(adapter.displayName).toBe("Three.js");
    });

    it("has correct algorithm language", () => {
      expect(adapter.algorithmLanguage).toBe("javascript");
    });
  });

  describe("validate", () => {
    it("validates a correct Three.js sketch", () => {
      const result = adapter.validate(`
        function sketch(THREE, state, container) {
          const scene = new THREE.Scene();
          return { initializeSystem() {}, dispose() {} };
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
      expect(result.errors[0]).toContain(
        "function sketch(THREE, state, container)",
      );
    });

    it("validates arrow function variant", () => {
      const result = adapter.validate(`
        const sketch = (THREE, state, container) => {
          return { initializeSystem() {}, dispose() {} };
        };
      `);
      expect(result.valid).toBe(true);
    });

    it("validates variable assignment variant", () => {
      const result = adapter.validate(`
        const sketch = function(THREE, state, container) {
          return { initializeSystem() {} };
        };
      `);
      expect(result.valid).toBe(true);
    });
  });

  describe("compile", () => {
    it("compiles a valid algorithm", async () => {
      const compiled = await adapter.compile(`
        function sketch(THREE, state, container) {
          return { initializeSystem() {}, dispose() {} };
        }
      `);
      expect(compiled).toBeDefined();
    });

    it("throws for invalid algorithm", async () => {
      await expect(adapter.compile("")).rejects.toThrow(
        "Three.js compilation failed",
      );
    });

    it("throws for syntax errors", async () => {
      await expect(
        adapter.compile(`
        function sketch(THREE, state, container) {
          return { initializeSystem() {
          // missing closing braces
        `),
      ).rejects.toThrow("Three.js compilation failed");
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
        function sketch(THREE, state, container) {
          const rng = mulberry32(state.seed);
          return { initializeSystem() {}, dispose() {} };
        }
      `, components);
      expect(compiled).toBeDefined();
    });

    it("compiled factory is callable", async () => {
      const compiled = await adapter.compile(`
        function sketch(THREE, state, container) {
          return { initializeSystem() {}, dispose() {} };
        }
      `);

      const comp = compiled as {
        source: string;
        factory: (THREE: unknown, state: unknown, container: unknown) => Record<string, unknown>;
      };
      expect(comp.source).toBeDefined();
      expect(typeof comp.factory).toBe("function");

      // Call factory with mock arguments
      const module = comp.factory(
        {},
        { seed: 1, params: {}, colorPalette: [], canvas: { width: 100, height: 100 } },
        {},
      );
      expect(typeof module["initializeSystem"]).toBe("function");
      expect(typeof module["dispose"]).toBe("function");
    });
  });

  describe("getAlgorithmTemplate", () => {
    it("returns a template with correct signature", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("function sketch(THREE, state, container)");
      expect(template).toContain("THREE.Scene");
      expect(template).toContain("THREE.PerspectiveCamera");
      expect(template).toContain("THREE.WebGLRenderer");
    });

    it("template includes preserveDrawingBuffer", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("preserveDrawingBuffer: true");
    });

    it("template includes pause/resume/dispose", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("pause");
      expect(template).toContain("resume");
      expect(template).toContain("dispose");
    });

    it("template passes validation", () => {
      const template = adapter.getAlgorithmTemplate();
      const result = adapter.validate(template);
      expect(result.valid).toBe(true);
    });
  });

  describe("getRuntimeDependencies", () => {
    it("returns Three.js CDN dependency", () => {
      const deps = adapter.getRuntimeDependencies();
      expect(deps).toHaveLength(1);
      expect(deps[0]!.name).toBe("three");
      expect(deps[0]!.cdnUrl).toContain("three");
      expect(deps[0]!.cdnUrl).toContain("0.172.0");
      expect(deps[0]!.version).toBe("0.172.0");
    });

    it("CDN URL uses jsdelivr with correct version", () => {
      const deps = adapter.getRuntimeDependencies();
      expect(deps[0]!.cdnUrl).toContain("cdn.jsdelivr.net");
      expect(deps[0]!.cdnUrl).toContain("three.module.min.js");
    });
  });

  describe("generateStandaloneHTML", () => {
    it("generates valid HTML with Three.js CDN", () => {
      const sketch = {
        genart: "1.1",
        id: "test-three",
        title: "Test Three.js Sketch",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "three" as const },
        canvas: { width: 1920, height: 1080 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(THREE, state, container) {
          const scene = new THREE.Scene();
          return { initializeSystem() {}, dispose() {} };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("cdn.jsdelivr.net");
      expect(html).toContain('type="module"');
      expect(html).toContain("import * as THREE from");
      expect(html).toContain("three.module.min.js");
      expect(html).toContain("three");
      expect(html).toContain("Test Three.js Sketch");
      expect(html).toContain("function sketch(THREE, state, container)");
      expect(html).toContain('"seed": 42');
      expect(html).toContain("canvas-container");
    });

    it("escapes HTML in title", () => {
      const sketch = {
        genart: "1.1",
        id: "test",
        title: '<script>alert("xss")</script>',
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "three" as const },
        canvas: { width: 800, height: 600 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `function sketch(THREE, state, container) {
          return { initializeSystem() {} };
        }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});
