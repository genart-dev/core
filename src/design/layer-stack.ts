import type { DesignLayer, BlendMode, LayerTransform } from "@genart-dev/format";
import type {
  LayerStackAccessor,
  LayerProperties,
  LayerPropertyValue,
  MutableDesignLayer,
  DesignChangeType,
} from "../types/design-plugin.js";

/** Generate a simple UUID v4. */
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Convert a readonly DesignLayer to a mutable copy, preserving IDs and names. */
function toMutable(layer: DesignLayer): MutableDesignLayer {
  const mutable: MutableDesignLayer = {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: { ...layer.transform },
    properties: { ...layer.properties } as LayerProperties,
  };
  if (layer.children) {
    mutable.children = layer.children.map(toMutable);
  }
  return mutable;
}

/** Deep-clone a layer and all children, assigning new IDs and " copy" suffix. */
function deepCloneLayer(layer: DesignLayer): MutableDesignLayer {
  const clone: MutableDesignLayer = {
    id: uuid(),
    type: layer.type,
    name: `${layer.name} copy`,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: { ...layer.transform },
    properties: { ...layer.properties } as LayerProperties,
  };
  if (layer.children) {
    clone.children = layer.children.map(deepCloneLayer);
  }
  return clone;
}

/**
 * Create a mutable layer stack accessor.
 * Fires onChange callbacks on every mutation for UI reactivity.
 */
export function createLayerStack(
  initialLayers: DesignLayer[],
  onChange: (changeType: DesignChangeType) => void,
): LayerStackAccessor {
  // Internal mutable copy
  const layers: MutableDesignLayer[] = initialLayers.map(toMutable);

  function findIndex(layerId: string): number {
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) {
      throw new Error(`Layer "${layerId}" not found`);
    }
    return idx;
  }

  const accessor: LayerStackAccessor = {
    getAll(): readonly DesignLayer[] {
      return [...layers];
    },

    get(layerId: string): DesignLayer | null {
      return layers.find((l) => l.id === layerId) ?? null;
    },

    add(layer: DesignLayer, index?: number): void {
      const mutable = toMutable(layer);
      if (index !== undefined && index >= 0 && index <= layers.length) {
        layers.splice(index, 0, mutable);
      } else {
        layers.push(mutable);
      }
      onChange("layer-added");
    },

    remove(layerId: string): boolean {
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx === -1) return false;
      layers.splice(idx, 1);
      onChange("layer-removed");
      return true;
    },

    updateProperties(
      layerId: string,
      properties: Partial<LayerProperties>,
    ): void {
      const idx = findIndex(layerId);
      const layer = layers[idx]!;
      // Filter out undefined values from partial update before merging
      const filtered: Record<string, LayerPropertyValue> = {};
      for (const [k, v] of Object.entries(properties)) {
        if (v !== undefined) filtered[k] = v;
      }
      layer.properties = { ...layer.properties, ...filtered } as LayerProperties;
      onChange("layer-updated");
    },

    updateTransform(
      layerId: string,
      transform: Partial<LayerTransform>,
    ): void {
      const idx = findIndex(layerId);
      const layer = layers[idx]!;
      layer.transform = { ...layer.transform, ...transform };
      onChange("layer-updated");
    },

    updateBlend(
      layerId: string,
      blendMode?: BlendMode,
      opacity?: number,
    ): void {
      const idx = findIndex(layerId);
      const layer = layers[idx]!;
      if (blendMode !== undefined) layer.blendMode = blendMode;
      if (opacity !== undefined) layer.opacity = opacity;
      onChange("layer-updated");
    },

    reorder(layerId: string, newIndex: number): void {
      const oldIndex = findIndex(layerId);
      const clamped = Math.max(0, Math.min(newIndex, layers.length - 1));
      if (oldIndex === clamped) return;
      const [layer] = layers.splice(oldIndex, 1);
      layers.splice(clamped, 0, layer!);
      onChange("layer-reordered");
    },

    duplicate(layerId: string): string {
      const idx = findIndex(layerId);
      const original = layers[idx]!;
      const clone = deepCloneLayer(original);
      layers.splice(idx + 1, 0, clone);
      onChange("layer-added");
      return clone.id;
    },

    get count(): number {
      return layers.length;
    },
  };

  return accessor;
}
