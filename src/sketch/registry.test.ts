import { describe, it, expect } from "vitest";
import { RendererRegistry, createDefaultRegistry } from "./registry.js";
import { P5RendererAdapter } from "./adapters/p5.js";
import { Canvas2DRendererAdapter } from "./adapters/canvas2d.js";
import { ThreeRendererAdapter } from "./adapters/three.js";
import { GLSLRendererAdapter } from "./adapters/glsl.js";
import { SVGRendererAdapter } from "./adapters/svg.js";
import type { RendererType } from "@genart-dev/format";

describe("RendererRegistry", () => {
  describe("register and resolve", () => {
    it("registers and resolves an adapter", () => {
      const registry = new RendererRegistry();
      const adapter = new P5RendererAdapter();
      registry.register(adapter);
      expect(registry.resolve("p5")).toBe(adapter);
    });

    it("replaces existing adapter for the same type", () => {
      const registry = new RendererRegistry();
      const adapter1 = new P5RendererAdapter();
      const adapter2 = new P5RendererAdapter();
      registry.register(adapter1);
      registry.register(adapter2);
      expect(registry.resolve("p5")).toBe(adapter2);
    });
  });

  describe("resolve", () => {
    it("resolve(undefined) returns p5 adapter (v1.0 compat)", () => {
      const registry = createDefaultRegistry();
      const adapter = registry.resolve(undefined);
      expect(adapter.type).toBe("p5");
    });

    it("throws for unknown renderer type", () => {
      const registry = createDefaultRegistry();
      expect(() => registry.resolve("unknown" as RendererType)).toThrow(
        'Unknown renderer type "unknown"',
      );
    });

    it("throws on empty registry", () => {
      const registry = new RendererRegistry();
      expect(() => registry.resolve("p5")).toThrow("Unknown renderer type");
    });
  });

  describe("list", () => {
    it("lists all registered types", () => {
      const registry = createDefaultRegistry();
      const types = registry.list();
      expect(types).toContain("p5");
      expect(types).toContain("canvas2d");
      expect(types).toContain("three");
      expect(types).toContain("glsl");
      expect(types).toContain("svg");
      expect(types).toHaveLength(5);
    });

    it("returns empty array for empty registry", () => {
      const registry = new RendererRegistry();
      expect(registry.list()).toEqual([]);
    });
  });

  describe("getDefault", () => {
    it("returns p5 adapter", () => {
      const registry = createDefaultRegistry();
      const adapter = registry.getDefault();
      expect(adapter.type).toBe("p5");
      expect(adapter).toBeInstanceOf(P5RendererAdapter);
    });
  });

  describe("has", () => {
    it("returns true for registered types", () => {
      const registry = createDefaultRegistry();
      expect(registry.has("p5")).toBe(true);
      expect(registry.has("canvas2d")).toBe(true);
      expect(registry.has("three")).toBe(true);
      expect(registry.has("glsl")).toBe(true);
      expect(registry.has("svg")).toBe(true);
    });

    it("returns false for unregistered types", () => {
      const registry = new RendererRegistry();
      expect(registry.has("p5")).toBe(false);
    });
  });
});

describe("createDefaultRegistry", () => {
  it("creates registry with all 5 renderer types", () => {
    const registry = createDefaultRegistry();
    expect(registry.list()).toHaveLength(5);
  });

  it("resolves p5 to P5RendererAdapter", () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve("p5")).toBeInstanceOf(P5RendererAdapter);
  });

  it("resolves canvas2d to Canvas2DRendererAdapter", () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve("canvas2d")).toBeInstanceOf(
      Canvas2DRendererAdapter,
    );
  });

  it("resolves three to ThreeRendererAdapter", () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve("three")).toBeInstanceOf(ThreeRendererAdapter);
  });

  it("resolves glsl to GLSLRendererAdapter", () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve("glsl")).toBeInstanceOf(GLSLRendererAdapter);
  });

  it("resolves svg to SVGRendererAdapter", () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve("svg")).toBeInstanceOf(SVGRendererAdapter);
  });
});
