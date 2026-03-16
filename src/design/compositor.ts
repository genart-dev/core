import type { DesignLayer, BlendMode, MaskMode } from "@genart-dev/format";
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

/** Collect all layer IDs that are referenced as mask sources by any layer in the tree. */
function collectMaskSourceIds(layers: readonly DesignLayer[]): Set<string> {
  const ids = new Set<string>();
  for (const layer of layers) {
    if (layer.maskLayerId) ids.add(layer.maskLayerId);
    if (layer.children) {
      for (const id of collectMaskSourceIds(layer.children)) ids.add(id);
    }
  }
  return ids;
}

/** Modulate the alpha of `ctx` pixels by the luminance of `maskCanvas` pixels. */
function applyLuminosityMask(
  ctx: OffscreenCanvasRenderingContext2D,
  maskCanvas: OffscreenCanvas,
  w: number,
  h: number,
): void {
  const layerData = ctx.getImageData(0, 0, w, h);
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskData = maskCtx.getImageData(0, 0, w, h);
  for (let i = 0; i < layerData.data.length; i += 4) {
    const r = maskData.data[i]!;
    const g = maskData.data[i + 1]!;
    const b = maskData.data[i + 2]!;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    layerData.data[i + 3] = Math.round(layerData.data[i + 3]! * lum);
  }
  ctx.putImageData(layerData, 0, 0);
}

/**
 * Composite design layers on top of the sketch output.
 *
 * 1. Draw rasterized sketch output to the output canvas (base layer).
 * 2. Pre-scan layers to find mask source IDs.
 * 3. Iterate layers bottom-to-top.
 * 4. For each visible layer: set blend mode, opacity, apply transform,
 *    resolve layer type from registry, call render().
 * 5. If a layer is a mask source: also render to maskStore offscreen.
 * 6. If a layer has maskLayerId: render to offscreen, apply mask, blit to output.
 * 7. Restore context state between layers.
 *
 * Guide layers (category "guide") are skipped unless `includeGuides` is true.
 *
 * **Limitation**: modifier-path layers (painting:*, adjust:*, filter:*) render
 * directly to the main canvas and cannot be masked. If masking is needed for
 * modifier layers, an `isolate: true` escape hatch would be required to force
 * them through the offscreen path (not yet implemented).
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

  // 2. Pre-scan for mask source IDs
  const maskSourceIds = collectMaskSourceIds(layers);
  const maskStore = new Map<string, OffscreenCanvas>();

  // 3. Iterate layers bottom-to-top
  for (const layer of layers) {
    compositeLayer(layer, registry, resources, output, includeGuides, maskSourceIds, maskStore);
  }
}

function compositeLayer(
  layer: DesignLayer,
  registry: PluginRegistry,
  resources: RenderResources,
  ctx: CanvasRenderingContext2D,
  includeGuides: boolean,
  maskSourceIds: Set<string>,
  maskStore: Map<string, OffscreenCanvas>,
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
      compositeLayer(child, registry, resources, ctx, includeGuides, maskSourceIds, maskStore);
    }

    ctx.restore();
    return;
  }

  // Skip unknown layer types (plugin not loaded)
  if (!layerType) return;

  const { x, y, width, height, rotation, scaleX, scaleY, anchorX, anchorY } =
    layer.transform;

  const bounds: LayerBounds = { x, y, width, height, rotation, scaleX, scaleY };

  // Determine if this layer needs the offscreen path (masking applied or mask source)
  const isMaskSource = maskSourceIds.has(layer.id);
  const maskLayerId = layer.maskLayerId;
  const maskCanvas = maskLayerId && maskLayerId !== layer.id
    ? maskStore.get(maskLayerId)
    : undefined;
  const needsMask = maskLayerId !== undefined && maskCanvas !== undefined;

  // --- Offscreen path: render to offscreen, optionally apply mask, blit to output ---
  if (needsMask) {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const offscreen = new OffscreenCanvas(cw, ch);
    const offCtx = offscreen.getContext("2d")!;

    // Apply transform to offscreen context
    const ax = x + width * anchorX;
    const ay = y + height * anchorY;
    offCtx.translate(ax, ay);
    if (rotation !== 0) offCtx.rotate((rotation * Math.PI) / 180);
    if (scaleX !== 1 || scaleY !== 1) offCtx.scale(scaleX, scaleY);
    offCtx.translate(-ax, -ay);

    layerType.render(layer.properties as unknown as LayerProperties, offCtx as unknown as CanvasRenderingContext2D, bounds, resources);
    offCtx.setTransform(1, 0, 0, 1, 0, 0);

    // Apply mask
    const mode: MaskMode = layer.maskMode ?? "alpha";
    if (mode === "alpha") {
      offCtx.globalCompositeOperation = "destination-in";
      offCtx.drawImage(maskCanvas, 0, 0);
    } else if (mode === "inverted-alpha") {
      offCtx.globalCompositeOperation = "destination-out";
      offCtx.drawImage(maskCanvas, 0, 0);
    } else {
      // luminosity
      applyLuminosityMask(offCtx, maskCanvas, cw, ch);
    }
    offCtx.globalCompositeOperation = "source-over";

    // Blit to output with layer blend/opacity
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = toCompositeOp(layer.blendMode);
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();

    // If this masked layer is also a mask source, store a clean (unmasked) render
    if (isMaskSource) {
      const maskOff = new OffscreenCanvas(cw, ch);
      const maskOffCtx = maskOff.getContext("2d")!;
      // Reapply transform for mask store render
      maskOffCtx.translate(x + width * anchorX, y + height * anchorY);
      if (rotation !== 0) maskOffCtx.rotate((rotation * Math.PI) / 180);
      if (scaleX !== 1 || scaleY !== 1) maskOffCtx.scale(scaleX, scaleY);
      maskOffCtx.translate(-(x + width * anchorX), -(y + height * anchorY));
      layerType.render(layer.properties as unknown as LayerProperties, maskOffCtx as unknown as CanvasRenderingContext2D, bounds, resources);
      maskStore.set(layer.id, maskOff);
    }
    return;
  }

  // --- Direct path (no mask on this layer) ---
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = toCompositeOp(layer.blendMode);

  // Apply transform (translate to position, rotate around anchor, scale)
  const ax = x + width * anchorX;
  const ay = y + height * anchorY;
  ctx.translate(ax, ay);
  if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  ctx.translate(-ax, -ay);

  layerType.render(layer.properties as unknown as LayerProperties, ctx, bounds, resources);

  // If this layer is a mask source, render it again into the mask store
  if (isMaskSource) {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const maskOff = new OffscreenCanvas(cw, ch);
    const maskOffCtx = maskOff.getContext("2d")!;
    // Apply same transform as the main render
    maskOffCtx.translate(ax, ay);
    if (rotation !== 0) maskOffCtx.rotate((rotation * Math.PI) / 180);
    if (scaleX !== 1 || scaleY !== 1) maskOffCtx.scale(scaleX, scaleY);
    maskOffCtx.translate(-ax, -ay);
    layerType.render(layer.properties as unknown as LayerProperties, maskOffCtx as unknown as CanvasRenderingContext2D, bounds, resources);
    maskStore.set(layer.id, maskOff);
  }

  // Restore context state
  ctx.restore();
}
