import { describe, it, expect, vi } from "vitest";
import { GenArtRendererAdapter } from "./genart.js";

// Mock @genart-dev/genart-script dynamic import
vi.mock("@genart-dev/genart-script", () => ({
  compile: (source: string) => {
    if (source.includes("SYNTAX_ERROR_TRIGGER")) {
      return { ok: false, errors: [{ line: 1, col: 1, message: "unexpected token" }] };
    }
    return {
      ok: true,
      code: [
        `let __params__ = __params__ ?? {};`,
        `let __colors__ = __colors__ ?? {};`,
        `const __exports__ = { isAnimated: false };`,
      ].join("\n"),
      params: [],
      colors: [],
    };
  },
}));

describe("GenArtRendererAdapter", () => {
  const adapter = new GenArtRendererAdapter();

  it("has correct type and displayName", () => {
    expect(adapter.type).toBe("genart");
    expect(adapter.displayName).toBe("GenArt Script");
    expect(adapter.algorithmLanguage).toBe("genart-script");
  });

  it("validate rejects empty source", () => {
    expect(adapter.validate("").valid).toBe(false);
    expect(adapter.validate("   ").valid).toBe(false);
  });

  it("validate accepts any non-empty source", () => {
    expect(adapter.validate("bg black").valid).toBe(true);
  });

  it("compile succeeds with valid source", async () => {
    const compiled = await adapter.compile("bg black");
    expect(compiled).toBeDefined();
  });

  it("compile throws on compile error", async () => {
    await expect(adapter.compile("SYNTAX_ERROR_TRIGGER")).rejects.toThrow("GenArt Script compile error");
  });

  it("extractDefinitions returns empty arrays for no params/colors", async () => {
    const compiled = await adapter.compile("bg black");
    const { params, colors } = adapter.extractDefinitions(compiled);
    expect(params).toHaveLength(0);
    expect(colors).toHaveLength(0);
  });

  it("getAlgorithmTemplate returns non-empty string", () => {
    expect(adapter.getAlgorithmTemplate().length).toBeGreaterThan(0);
  });

  it("getRuntimeDependencies returns genart-script entry", () => {
    const deps = adapter.getRuntimeDependencies();
    expect(deps).toHaveLength(1);
    expect(deps[0]!.name).toBe("@genart-dev/genart-script");
    expect(deps[0]!.cdnUrl).toBeDefined();
  });

  it("generateStandaloneHTML returns valid HTML", async () => {
    const compiled = await adapter.compile("bg black");
    const sketch = {
      genart: "1.0",
      id: "test",
      title: "Test Sketch",
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      renderer: { type: "genart" as const },
      canvas: { width: 800, height: 600 },
      parameters: [],
      colors: [],
      state: { seed: 42, params: {}, colorPalette: [] },
      algorithm: "bg black",
    };
    const html = adapter.generateStandaloneHTML(sketch as any);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Test Sketch");
    expect(html).toContain("__exports__");
  });
});
