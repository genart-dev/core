import { describe, it, expect } from "vitest";
import { parseSketchMeta } from "./meta-parser.js";

describe("parseSketchMeta", () => {
  const minimal = {
    title: "Test Sketch",
    renderer: { type: "p5" },
  };

  describe("required fields", () => {
    it("parses minimal meta (title + renderer)", () => {
      const meta = parseSketchMeta(minimal);
      expect(meta.title).toBe("Test Sketch");
      expect(meta.renderer).toEqual({ type: "p5" });
    });

    it("applies default canvas (square-1200)", () => {
      const meta = parseSketchMeta(minimal);
      expect(meta.canvas).toEqual({
        preset: "square-1200",
        width: 1200,
        height: 1200,
      });
    });

    it("defaults parameters to undefined", () => {
      const meta = parseSketchMeta(minimal);
      expect(meta.parameters).toBeUndefined();
    });

    it("defaults colors to undefined", () => {
      const meta = parseSketchMeta(minimal);
      expect(meta.colors).toBeUndefined();
    });

    it("throws when title is missing", () => {
      expect(() => parseSketchMeta({ renderer: { type: "p5" } })).toThrow(
        'required field "title"',
      );
    });

    it("throws when renderer is missing", () => {
      expect(() => parseSketchMeta({ title: "Foo" })).toThrow(
        'required field "renderer"',
      );
    });

    it("throws on invalid renderer type", () => {
      expect(() =>
        parseSketchMeta({ title: "Foo", renderer: { type: "unknown" } }),
      ).toThrow('Unknown renderer type "unknown"');
    });
  });

  describe("canvas", () => {
    it("resolves preset-only canvas", () => {
      const meta = parseSketchMeta({
        ...minimal,
        canvas: { preset: "hd-1920x1080" },
      });
      expect(meta.canvas).toEqual({
        preset: "hd-1920x1080",
        width: 1920,
        height: 1080,
      });
    });

    it("accepts explicit width/height", () => {
      const meta = parseSketchMeta({
        ...minimal,
        canvas: { width: 800, height: 600 },
      });
      expect(meta.canvas).toEqual({ width: 800, height: 600 });
    });

    it("accepts width/height with preset", () => {
      const meta = parseSketchMeta({
        ...minimal,
        canvas: { preset: "square-600", width: 600, height: 600 },
      });
      expect(meta.canvas).toEqual({
        preset: "square-600",
        width: 600,
        height: 600,
      });
    });

    it("throws on unknown preset", () => {
      expect(() =>
        parseSketchMeta({ ...minimal, canvas: { preset: "nope" } }),
      ).toThrow('Unknown canvas preset "nope"');
    });
  });

  describe("parameters", () => {
    it("parses valid parameters", () => {
      const meta = parseSketchMeta({
        ...minimal,
        parameters: [
          {
            key: "freq",
            label: "Frequency",
            min: 1,
            max: 20,
            step: 0.5,
            default: 5,
          },
        ],
      });
      expect(meta.parameters).toHaveLength(1);
      expect(meta.parameters![0].key).toBe("freq");
    });

    it("throws on duplicate parameter keys", () => {
      expect(() =>
        parseSketchMeta({
          ...minimal,
          parameters: [
            { key: "x", label: "X", min: 0, max: 1, step: 0.1, default: 0.5 },
            { key: "x", label: "X2", min: 0, max: 1, step: 0.1, default: 0.5 },
          ],
        }),
      ).toThrow('Duplicate parameter key "x"');
    });

    it("throws when default is out of range", () => {
      expect(() =>
        parseSketchMeta({
          ...minimal,
          parameters: [
            {
              key: "x",
              label: "X",
              min: 0,
              max: 1,
              step: 0.1,
              default: 5,
            },
          ],
        }),
      ).toThrow("outside");
    });
  });

  describe("colors", () => {
    it("parses valid colors", () => {
      const meta = parseSketchMeta({
        ...minimal,
        colors: [{ key: "bg", label: "Background", default: "#1a1a1a" }],
      });
      expect(meta.colors).toHaveLength(1);
      expect(meta.colors![0].key).toBe("bg");
    });
  });

  describe("optional fields", () => {
    it("parses id", () => {
      const meta = parseSketchMeta({ ...minimal, id: "my-sketch" });
      expect(meta.id).toBe("my-sketch");
    });

    it("parses philosophy", () => {
      const meta = parseSketchMeta({ ...minimal, philosophy: "# Notes\nSome text." });
      expect(meta.philosophy).toBe("# Notes\nSome text.");
    });

    it("parses skills", () => {
      const meta = parseSketchMeta({ ...minimal, skills: ["color-theory"] });
      expect(meta.skills).toEqual(["color-theory"]);
    });

    it("parses agent and model", () => {
      const meta = parseSketchMeta({
        ...minimal,
        agent: "claude-code",
        model: "claude-opus-4-6",
      });
      expect(meta.agent).toBe("claude-code");
      expect(meta.model).toBe("claude-opus-4-6");
    });

    it("parses themes", () => {
      const meta = parseSketchMeta({
        ...minimal,
        themes: [{ name: "Warm", colors: ["#ff0000", "#ff9900"] }],
      });
      expect(meta.themes).toHaveLength(1);
      expect(meta.themes![0].name).toBe("Warm");
    });

    it("parses tabs", () => {
      const meta = parseSketchMeta({
        ...minimal,
        tabs: [{ id: "shape", label: "Shape" }],
      });
      expect(meta.tabs).toHaveLength(1);
    });

    it("parses components (string version)", () => {
      const meta = parseSketchMeta({
        ...minimal,
        components: { prng: "^1.0.0" },
      });
      expect(meta.components).toEqual({ prng: "^1.0.0" });
    });

    it("parses components (object form)", () => {
      const meta = parseSketchMeta({
        ...minimal,
        components: {
          custom: { code: "function foo() {}", exports: ["foo"] },
        },
      });
      expect(meta.components!["custom"]).toEqual({
        code: "function foo() {}",
        exports: ["foo"],
      });
    });

    it("parses renderer with version", () => {
      const meta = parseSketchMeta({
        title: "Test",
        renderer: { type: "three", version: "0.160.x" },
      });
      expect(meta.renderer).toEqual({ type: "three", version: "0.160.x" });
    });
  });

  describe("preserved fields", () => {
    it("parses state", () => {
      const meta = parseSketchMeta({
        ...minimal,
        state: { seed: 42, params: { x: 0.5 }, colorPalette: ["#ff0000"] },
      });
      expect(meta.state).toEqual({
        seed: 42,
        params: { x: 0.5 },
        colorPalette: ["#ff0000"],
      });
    });

    it("parses layers (passthrough)", () => {
      const layers = [{ id: "l1", type: "typography:text", properties: {} }];
      const meta = parseSketchMeta({ ...minimal, layers });
      expect(meta.layers).toEqual(layers);
    });
  });

  describe("error cases", () => {
    it("throws on non-object input", () => {
      expect(() => parseSketchMeta("string")).toThrow("must be an object");
    });

    it("throws on null input", () => {
      expect(() => parseSketchMeta(null)).toThrow("must be an object");
    });

    it("throws on array input", () => {
      expect(() => parseSketchMeta([])).toThrow("must be an object");
    });
  });
});
