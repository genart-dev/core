import type { RendererType } from "@genart-dev/format";
import type { RendererAdapter } from "../types.js";
import { P5RendererAdapter } from "./adapters/p5.js";
import { Canvas2DRendererAdapter } from "./adapters/canvas2d.js";
import { ThreeRendererAdapter } from "./adapters/three.js";
import { GLSLRendererAdapter } from "./adapters/glsl.js";
import { SVGRendererAdapter } from "./adapters/svg.js";

/**
 * Registry for renderer adapters. Manages registration and lookup
 * of RendererAdapter implementations by renderer type.
 */
export class RendererRegistry {
  private readonly adapters = new Map<RendererType, RendererAdapter>();
  private defaultType: RendererType = "p5";

  /**
   * Register a renderer adapter. Replaces any existing adapter for the same type.
   */
  register(adapter: RendererAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /**
   * Resolve a renderer adapter by type.
   * If type is undefined, returns the default adapter (p5 — v1.0 compat).
   *
   * @throws Error if the type is not registered.
   */
  resolve(type?: RendererType): RendererAdapter {
    const resolvedType = type ?? this.defaultType;
    const adapter = this.adapters.get(resolvedType);
    if (!adapter) {
      const available = [...this.adapters.keys()].join(", ");
      throw new Error(
        `Unknown renderer type "${resolvedType}". Registered types: ${available || "(none)"}`,
      );
    }
    return adapter;
  }

  /**
   * List all registered renderer types.
   */
  list(): RendererType[] {
    return [...this.adapters.keys()];
  }

  /**
   * Get the default renderer adapter (p5).
   */
  getDefault(): RendererAdapter {
    return this.resolve(this.defaultType);
  }

  /**
   * Check if a renderer type is registered.
   */
  has(type: RendererType): boolean {
    return this.adapters.has(type);
  }
}

/**
 * Create a RendererRegistry pre-loaded with all 5 renderer adapters.
 * This is the standard way to get a registry instance.
 */
export function createDefaultRegistry(): RendererRegistry {
  const registry = new RendererRegistry();
  registry.register(new P5RendererAdapter());
  registry.register(new Canvas2DRendererAdapter());
  registry.register(new ThreeRendererAdapter());
  registry.register(new GLSLRendererAdapter());
  registry.register(new SVGRendererAdapter());
  return registry;
}
