import type { DesignLayer, BlendMode } from "@genart-dev/format";
import type {
  PluginRegistry,
  RenderResources,
  LayerBounds,
  LayerProperties,
} from "../types/design-plugin.js";

/** Map BlendMode to the globalCompositeOperation string. */
function toCompositeOp(blendMode: BlendMode): GlobalCompositeOperation {
  // "normal" maps to "source-over"; all others are valid composite operations
  if (blendMode === "normal") return "source-over";
  return blendMode as GlobalCompositeOperation;
}

/**
 * Composite design layers on top of the sketch output.
 *
 * 1. Draw rasterized sketch output to the output canvas (base layer).
 * 2. Iterate layers bottom-to-top.
 * 3. For each visible layer: set blend mode, opacity, apply transform,
 *    resolve layer type from registry, call render().
 * 4. Restore context state between layers.
 *
 * Guide layers (category "guide") are skipped unless `includeGuides` is true.
 */
export function compositeDesignLayers(
  sketchCanvas: HTMLCanvasElement | OffscreenCanvas,
  layers: readonly DesignLayer[],
  registry: PluginRegistry,
  resources: RenderResources,
  output: CanvasRenderingContext2D,
  options?: { includeGuides?: boolean },
): void {
  const includeGuides = options?.includeGuides ?? false;

  // 1. Draw sketch base layer
  output.drawImage(sketchCanvas, 0, 0);

  // 2. Iterate layers bottom-to-top
  for (const layer of layers) {
    compositeLayer(layer, registry, resources, output, includeGuides);
  }
}

function compositeLayer(
  layer: DesignLayer,
  registry: PluginRegistry,
  resources: RenderResources,
  ctx: CanvasRenderingContext2D,
  includeGuides: boolean,
): void {
  // Skip invisible layers
  if (!layer.visible) return;

  // Resolve layer type from registry
  const layerType = registry.resolveLayerType(layer.type);

  // Skip guide layers during export (unless explicitly included)
  if (!includeGuides && layerType?.category === "guide") return;

  // Handle group layers: recurse into children
  if (layer.children && layer.children.length > 0) {
    ctx.save();
    ctx.globalAlpha *= layer.opacity;
    ctx.globalCompositeOperation = toCompositeOp(layer.blendMode);

    for (const child of layer.children) {
      compositeLayer(child, registry, resources, ctx, includeGuides);
    }

    ctx.restore();
    return;
  }

  // Skip unknown layer types (plugin not loaded)
  if (!layerType) return;

  // 3. Apply layer compositing settings
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = toCompositeOp(layer.blendMode);

  // Apply transform (translate to position, rotate around anchor, scale)
  const { x, y, width, height, rotation, scaleX, scaleY, anchorX, anchorY } =
    layer.transform;
  const ax = x + width * anchorX;
  const ay = y + height * anchorY;

  ctx.translate(ax, ay);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (scaleX !== 1 || scaleY !== 1) {
    ctx.scale(scaleX, scaleY);
  }
  ctx.translate(-ax, -ay);

  const bounds: LayerBounds = {
    x,
    y,
    width,
    height,
    rotation,
    scaleX,
    scaleY,
  };

  // Render the layer
  layerType.render(
    layer.properties as unknown as LayerProperties,
    ctx,
    bounds,
    resources,
  );

  // 4. Restore context state
  ctx.restore();
}
