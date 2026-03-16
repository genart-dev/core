import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compositeDesignLayers } from "./compositor.js";
import type { DesignLayer } from "@genart-dev/format";
import type {
  PluginRegistry,
  RenderResources,
  LayerTypeDefinition,
} from "../types/design-plugin.js";

// Minimal mock for an OffscreenCanvas context
function mockOffCtx() {
  return {
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(800 * 800 * 4) })),
    putImageData: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as string,
  };
}

// Mock OffscreenCanvas for Node environment
class MockOffscreenCanvas {
  width: number;
  height: number;
  private _ctx = mockOffCtx();
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(_type: string) { return this._ctx; }
}

// Minimal mock for CanvasRenderingContext2D
function mockCtx(): CanvasRenderingContext2D {
  return {
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    canvas: { width: 800, height: 800 },
  } as unknown as CanvasRenderingContext2D;
}

function mockCanvas(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

function mockResources(): RenderResources {
  return {
    getFont: () => null,
    getImage: () => null,
    theme: "dark",
    pixelRatio: 1,
  };
}

function makeLayer(overrides: Partial<DesignLayer> = {}): DesignLayer {
  return {
    id: "layer-1",
    type: "test:rect",
    name: "Test Layer",
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: "multiply",
    transform: {
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    properties: {},
    ...overrides,
  };
}

describe("compositeDesignLayers", () => {
  it("draws sketch base layer first", () => {
    const ctx = mockCtx();
    const canvas = mockCanvas();
    const registry: PluginRegistry = {
      resolveLayerType: () => null,
    } as unknown as PluginRegistry;

    compositeDesignLayers(canvas, [], registry, mockResources(), ctx);

    expect(ctx.drawImage).toHaveBeenCalledWith(canvas, 0, 0);
  });

  it("skips invisible layers", () => {
    const renderFn = vi.fn();
    const layerType: LayerTypeDefinition = {
      typeId: "test:rect",
      displayName: "Rect",
      icon: "rect",
      category: "shape",
      properties: [],
      createDefault: () => ({}),
      render: renderFn,
      validate: () => null,
      propertyEditorId: "rect-editor",
    };
    const registry: PluginRegistry = {
      resolveLayerType: () => layerType,
    } as unknown as PluginRegistry;

    const ctx = mockCtx();
    const layer = makeLayer({ visible: false });

    compositeDesignLayers(mockCanvas(), [layer], registry, mockResources(), ctx);

    expect(renderFn).not.toHaveBeenCalled();
  });

  it("renders visible layers with correct blend mode and opacity", () => {
    const renderFn = vi.fn();
    const layerType: LayerTypeDefinition = {
      typeId: "test:rect",
      displayName: "Rect",
      icon: "rect",
      category: "shape",
      properties: [],
      createDefault: () => ({}),
      render: renderFn,
      validate: () => null,
      propertyEditorId: "rect-editor",
    };
    const registry: PluginRegistry = {
      resolveLayerType: () => layerType,
    } as unknown as PluginRegistry;

    const ctx = mockCtx();
    const layer = makeLayer({ opacity: 0.5, blendMode: "screen" });

    compositeDesignLayers(mockCanvas(), [layer], registry, mockResources(), ctx);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(renderFn).toHaveBeenCalledOnce();
  });

  it("skips guide layers by default", () => {
    const renderFn = vi.fn();
    const layerType: LayerTypeDefinition = {
      typeId: "guide:thirds",
      displayName: "Rule of Thirds",
      icon: "grid",
      category: "guide",
      properties: [],
      createDefault: () => ({}),
      render: renderFn,
      validate: () => null,
      propertyEditorId: "guide-editor",
    };
    const registry: PluginRegistry = {
      resolveLayerType: () => layerType,
    } as unknown as PluginRegistry;

    const ctx = mockCtx();
    compositeDesignLayers(
      mockCanvas(),
      [makeLayer({ type: "guide:thirds" })],
      registry,
      mockResources(),
      ctx,
    );

    expect(renderFn).not.toHaveBeenCalled();
  });

  it("includes guide layers when includeGuides is true", () => {
    const renderFn = vi.fn();
    const layerType: LayerTypeDefinition = {
      typeId: "guide:thirds",
      displayName: "Rule of Thirds",
      icon: "grid",
      category: "guide",
      properties: [],
      createDefault: () => ({}),
      render: renderFn,
      validate: () => null,
      propertyEditorId: "guide-editor",
    };
    const registry: PluginRegistry = {
      resolveLayerType: () => layerType,
    } as unknown as PluginRegistry;

    const ctx = mockCtx();
    compositeDesignLayers(
      mockCanvas(),
      [makeLayer({ type: "guide:thirds" })],
      registry,
      mockResources(),
      ctx,
      { includeGuides: true },
    );

    expect(renderFn).toHaveBeenCalledOnce();
  });

  it("renders layers in order (bottom to top)", () => {
    const callOrder: string[] = [];
    const makeLayerType = (typeId: string): LayerTypeDefinition => ({
      typeId,
      displayName: typeId,
      icon: typeId,
      category: "shape",
      properties: [],
      createDefault: () => ({}),
      render: () => { callOrder.push(typeId); },
      validate: () => null,
      propertyEditorId: `${typeId}-editor`,
    });

    const types = new Map<string, LayerTypeDefinition>();
    types.set("a", makeLayerType("a"));
    types.set("b", makeLayerType("b"));
    types.set("c", makeLayerType("c"));

    const registry: PluginRegistry = {
      resolveLayerType: (id: string) => types.get(id) ?? null,
    } as unknown as PluginRegistry;

    const layers = [
      makeLayer({ id: "1", type: "a" }),
      makeLayer({ id: "2", type: "b" }),
      makeLayer({ id: "3", type: "c" }),
    ];

    compositeDesignLayers(mockCanvas(), layers, registry, mockResources(), mockCtx());

    expect(callOrder).toEqual(["a", "b", "c"]);
  });

  it("skips unknown layer types gracefully", () => {
    const registry: PluginRegistry = {
      resolveLayerType: () => null,
    } as unknown as PluginRegistry;

    const ctx = mockCtx();
    // Should not throw
    compositeDesignLayers(
      mockCanvas(),
      [makeLayer({ type: "unknown:type" })],
      registry,
      mockResources(),
      ctx,
    );

    // Only drawImage for the base layer, no render calls
    expect(ctx.drawImage).toHaveBeenCalledOnce();
  });

  describe("layer masking", () => {
    // Install MockOffscreenCanvas before each mask test
    beforeEach(() => {
      vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function makeLayerType(id = "test:shape"): LayerTypeDefinition {
      return {
        typeId: id,
        displayName: id,
        icon: "shape",
        category: "shape",
        properties: [],
        createDefault: () => ({}),
        render: vi.fn(),
        validate: () => null,
        propertyEditorId: `${id}-editor`,
      };
    }

    it("renders mask source layer twice (once normally, once to maskStore)", () => {
      const sourceType = makeLayerType("test:source");
      const maskedType = makeLayerType("test:masked");
      const registry: PluginRegistry = {
        resolveLayerType: (id: string) =>
          id === "test:source" ? sourceType : maskedType,
      } as unknown as PluginRegistry;

      const sourceLayer = makeLayer({ id: "src-1", type: "test:source" });
      const maskedLayer = makeLayer({
        id: "fog-1",
        type: "test:masked",
        maskLayerId: "src-1",
        maskMode: "alpha",
      });

      compositeDesignLayers(mockCanvas(), [sourceLayer, maskedLayer], registry, mockResources(), mockCtx());

      // Source rendered twice (normal + maskStore)
      expect(sourceType.render).toHaveBeenCalledTimes(2);
      // Masked layer rendered once (to offscreen)
      expect(maskedType.render).toHaveBeenCalledOnce();
    });

    it("does not apply mask when maskLayerId is forward reference (source not yet rendered)", () => {
      const sourceType = makeLayerType("test:source");
      const maskedType = makeLayerType("test:masked");
      const registry: PluginRegistry = {
        resolveLayerType: (id: string) =>
          id === "test:source" ? sourceType : maskedType,
      } as unknown as PluginRegistry;

      // Masked layer appears BEFORE source — forward ref, mask cannot be applied
      const maskedLayer = makeLayer({
        id: "fog-1",
        type: "test:masked",
        maskLayerId: "src-1",  // src-1 not yet rendered at time fog-1 is processed
        maskMode: "alpha",
      });
      const sourceLayer = makeLayer({ id: "src-1", type: "test:source" });

      const ctx = mockCtx();
      expect(() =>
        compositeDesignLayers(mockCanvas(), [maskedLayer, sourceLayer], registry, mockResources(), ctx),
      ).not.toThrow();

      // Masked layer falls through to direct path (no mask canvas available yet) — rendered once
      expect(maskedType.render).toHaveBeenCalledOnce();
      // Source layer is a mask source (pre-scan finds it) — rendered twice (normal + maskStore)
      expect(sourceType.render).toHaveBeenCalledTimes(2);
    });

    it("guards against circular mask reference (layer masks itself)", () => {
      const selfType = makeLayerType("test:self");
      const registry: PluginRegistry = {
        resolveLayerType: () => selfType,
      } as unknown as PluginRegistry;

      const selfLayer = makeLayer({
        id: "self-1",
        type: "test:self",
        maskLayerId: "self-1",  // circular — guard: maskLayerId === layer.id
        maskMode: "alpha",
      });

      const ctx = mockCtx();
      // Should not throw; circular guard fires, falls to direct path
      expect(() =>
        compositeDesignLayers(mockCanvas(), [selfLayer], registry, mockResources(), ctx),
      ).not.toThrow();
      // Rendered twice: once to ctx (direct path), once to maskStore (it IS in maskSourceIds)
      expect(selfType.render).toHaveBeenCalledTimes(2);
    });
  });
});
