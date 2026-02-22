import { describe, it, expect } from "vitest";
import { GLSLRendererAdapter, hexToVec3 } from "./glsl.js";

const adapter = new GLSLRendererAdapter();

describe("GLSLRendererAdapter", () => {
  describe("metadata", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("glsl");
    });

    it("has correct display name", () => {
      expect(adapter.displayName).toBe("GLSL Shader");
    });

    it("has correct algorithm language", () => {
      expect(adapter.algorithmLanguage).toBe("glsl");
    });
  });

  describe("validate", () => {
    it("validates correct GLSL shader", () => {
      const result = adapter.validate(`
        #version 300 es
        precision highp float;
        out vec4 fragColor;
        void main() {
          fragColor = vec4(1.0, 0.0, 0.0, 1.0);
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

    it("rejects shader without version", () => {
      const result = adapter.validate(`
        precision highp float;
        out vec4 fragColor;
        void main() { fragColor = vec4(1.0); }
      `);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("#version");
    });

    it("rejects shader without main", () => {
      const result = adapter.validate(`
        #version 300 es
        precision highp float;
        out vec4 fragColor;
      `);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("void main()"),
      );
    });

    it("rejects shader without fragColor", () => {
      const result = adapter.validate(`
        #version 300 es
        precision highp float;
        void main() {
          // no output
        }
      `);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("fragColor"),
      );
    });

    it("accepts gl_FragColor for older GLSL", () => {
      const result = adapter.validate(`
        #version 300 es
        precision highp float;
        void main() {
          gl_FragColor = vec4(1.0);
        }
      `);
      expect(result.valid).toBe(true);
    });
  });

  describe("compile", () => {
    it("compiles a valid shader", async () => {
      const compiled = await adapter.compile(`
        #version 300 es
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_seed;
        out vec4 fragColor;
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution;
          fragColor = vec4(uv, 0.5, 1.0);
        }
      `);
      expect(compiled).toBeDefined();
    });

    it("throws for invalid shader", async () => {
      await expect(adapter.compile("")).rejects.toThrow(
        "GLSL compilation failed",
      );
    });

    it("extracts param uniforms", async () => {
      const compiled = (await adapter.compile(`
        #version 300 es
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_seed;
        uniform float u_noiseScale;
        uniform float u_amplitude;
        out vec4 fragColor;
        void main() {
          fragColor = vec4(1.0);
        }
      `)) as { uniformNames: { params: string[]; colors: string[] } };

      expect(compiled.uniformNames.params).toContain("u_noiseScale");
      expect(compiled.uniformNames.params).toContain("u_amplitude");
      // Built-in uniforms should not be in params
      expect(compiled.uniformNames.params).not.toContain("u_resolution");
      expect(compiled.uniformNames.params).not.toContain("u_time");
      expect(compiled.uniformNames.params).not.toContain("u_seed");
    });

    it("extracts color uniforms", async () => {
      const compiled = (await adapter.compile(`
        #version 300 es
        precision highp float;
        uniform vec3 u_color1;
        uniform vec3 u_color2;
        out vec4 fragColor;
        void main() {
          fragColor = vec4(u_color1, 1.0);
        }
      `)) as { uniformNames: { params: string[]; colors: string[] } };

      expect(compiled.uniformNames.colors).toContain("u_color1");
      expect(compiled.uniformNames.colors).toContain("u_color2");
      expect(compiled.uniformNames.params).toHaveLength(0);
    });

    it("returns vertex and fragment sources", async () => {
      const compiled = (await adapter.compile(`
        #version 300 es
        precision highp float;
        out vec4 fragColor;
        void main() { fragColor = vec4(1.0); }
      `)) as { fragmentSource: string; vertexSource: string };

      expect(compiled.fragmentSource).toContain("#version 300 es");
      expect(compiled.fragmentSource).toContain("fragColor");
      expect(compiled.vertexSource).toContain("a_position");
      expect(compiled.vertexSource).toContain("gl_Position");
    });
  });

  describe("getAlgorithmTemplate", () => {
    it("returns a GLSL template with expected uniforms", () => {
      const template = adapter.getAlgorithmTemplate();
      expect(template).toContain("#version 300 es");
      expect(template).toContain("void main()");
      expect(template).toContain("fragColor");
      expect(template).toContain("u_resolution");
      expect(template).toContain("u_time");
      expect(template).toContain("u_seed");
    });

    it("template passes validation", () => {
      const template = adapter.getAlgorithmTemplate();
      const result = adapter.validate(template);
      expect(result.valid).toBe(true);
    });
  });

  describe("getRuntimeDependencies", () => {
    it("returns empty array (WebGL native)", () => {
      const deps = adapter.getRuntimeDependencies();
      expect(deps).toHaveLength(0);
    });
  });

  describe("generateStandaloneHTML", () => {
    it("generates valid HTML with WebGL2 boilerplate", () => {
      const sketch = {
        genart: "1.1",
        id: "test-glsl",
        title: "Test GLSL Sketch",
        created: "2025-01-01T00:00:00Z",
        modified: "2025-01-01T00:00:00Z",
        renderer: { type: "glsl" as const },
        canvas: { width: 800, height: 800 },
        parameters: [
          { key: "noiseScale", label: "Noise Scale", min: 1, max: 20, step: 0.1, default: 5 },
        ],
        colors: [
          { key: "color1", label: "Color 1", default: "#ff0000" },
          { key: "color2", label: "Color 2", default: "#0000ff" },
        ],
        state: { seed: 42, params: { noiseScale: 5 }, colorPalette: ["#ff0000", "#0000ff"] },
        algorithm: `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform float u_noiseScale;
uniform vec3 u_color1;
uniform vec3 u_color2;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(mix(u_color1, u_color2, uv.x), 1.0);
}`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Test GLSL Sketch");
      expect(html).toContain("webgl2");
      expect(html).toContain("u_resolution");
      expect(html).toContain("u_noiseScale");
      expect(html).toContain("u_color1");
      // No external CDN
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
        renderer: { type: "glsl" as const },
        canvas: { width: 800, height: 800 },
        parameters: [],
        colors: [],
        state: { seed: 42, params: {}, colorPalette: [] },
        algorithm: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`,
      };

      const html = adapter.generateStandaloneHTML(sketch);
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});

describe("hexToVec3", () => {
  it("converts #ff0000 to red", () => {
    const [r, g, b] = hexToVec3("#ff0000");
    expect(r).toBeCloseTo(1.0);
    expect(g).toBeCloseTo(0.0);
    expect(b).toBeCloseTo(0.0);
  });

  it("converts #00ff00 to green", () => {
    const [r, g, b] = hexToVec3("#00ff00");
    expect(r).toBeCloseTo(0.0);
    expect(g).toBeCloseTo(1.0);
    expect(b).toBeCloseTo(0.0);
  });

  it("converts without hash prefix", () => {
    const [r, g, b] = hexToVec3("0000ff");
    expect(r).toBeCloseTo(0.0);
    expect(g).toBeCloseTo(0.0);
    expect(b).toBeCloseTo(1.0);
  });

  it("converts mid-range values", () => {
    const [r, g, b] = hexToVec3("#808080");
    expect(r).toBeCloseTo(128 / 255);
    expect(g).toBeCloseTo(128 / 255);
    expect(b).toBeCloseTo(128 / 255);
  });
});
