import type { DesignLayer, BlendMode, LayerTransform } from "@genart-dev/format";

/** JSON Schema (subset used for MCP tool input schemas). */
export type JsonSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 1. Top-Level Plugin Interface
// ---------------------------------------------------------------------------

/**
 * A Design Mode plugin that extends the editor with new layer types,
 * interactive tools, export formats, and MCP tool definitions.
 */
export interface DesignPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly tier?: "free" | "pro";
  readonly description?: string;
  readonly dependencies?: readonly string[];
  readonly layerTypes: LayerTypeDefinition[];
  readonly tools: DesignToolDefinition[];
  readonly exportHandlers: ExportHandlerDefinition[];
  readonly mcpTools: McpToolDefinition[];
  initialize(context: PluginContext): Promise<void>;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 2. Layer Types
// ---------------------------------------------------------------------------

export interface LayerTypeDefinition {
  readonly typeId: string;
  readonly displayName: string;
  readonly icon: string;
  readonly category: LayerCategory;
  readonly properties: LayerPropertySchema[];
  createDefault(): LayerProperties;
  render(
    properties: LayerProperties,
    ctx: CanvasRenderingContext2D,
    bounds: LayerBounds,
    resources: RenderResources,
  ): void;
  renderSVG?(
    properties: LayerProperties,
    bounds: LayerBounds,
    resources: RenderResources,
  ): string;
  validate(properties: LayerProperties): ValidationError[] | null;
  renderThumbnail?(
    properties: LayerProperties,
    ctx: CanvasRenderingContext2D,
    size: number,
  ): void;
  readonly propertyEditorId: string;
}

export type LayerCategory =
  | "text"
  | "shape"
  | "image"
  | "filter"
  | "adjustment"
  | "guide"
  | "draw"
  | "group";

export interface LayerPropertySchema {
  readonly key: string;
  readonly label: string;
  readonly type: LayerPropertyType;
  readonly default: LayerPropertyValue;
  readonly group?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: SelectOption[];
  readonly animatable?: boolean;
}

export type LayerPropertyType =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "point"
  | "size"
  | "font"
  | "select"
  | "path"
  | "image"
  | "gradient";

export type LayerPropertyValue =
  | string
  | number
  | boolean
  | PointValue
  | SizeValue
  | FontValue
  | PathValue
  | GradientValue
  | null;

export interface PointValue {
  readonly x: number;
  readonly y: number;
}

export interface SizeValue {
  readonly width: number;
  readonly height: number;
}

export interface FontValue {
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
}

export interface PathValue {
  readonly points: PathPoint[];
  readonly closed: boolean;
}

export interface PathPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface GradientValue {
  readonly type: "linear" | "radial";
  readonly angle?: number;
  readonly center?: PointValue;
  readonly radius?: number;
  readonly stops: GradientStop[];
}

export interface GradientStop {
  readonly offset: number;
  readonly color: string;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export type LayerProperties = Record<string, LayerPropertyValue>;

export interface LayerBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface ValidationError {
  readonly property: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// 3. Interactive Canvas Tools
// ---------------------------------------------------------------------------

export interface DesignToolDefinition {
  readonly toolId: string;
  readonly displayName: string;
  readonly icon: string;
  readonly shortcut?: string;
  readonly section: ToolSection;
  readonly cursor: string;
  onActivate(context: ToolContext): void;
  onDeactivate(context: ToolContext): void;
  onPointerDown?(event: DesignPointerEvent, context: ToolContext): void;
  onPointerMove?(event: DesignPointerEvent, context: ToolContext): void;
  onPointerUp?(event: DesignPointerEvent, context: ToolContext): void;
  onFrame?(context: ToolContext): void;
  renderOverlay?(ctx: CanvasRenderingContext2D, context: ToolContext): void;
}

export type ToolSection =
  | "select"
  | "draw"
  | "shape"
  | "text"
  | "transform"
  | "utility";

export interface DesignPointerEvent {
  readonly canvasX: number;
  readonly canvasY: number;
  readonly viewportX: number;
  readonly viewportY: number;
  readonly pressure: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export interface ToolContext {
  readonly layers: LayerStackAccessor;
  readonly selection: readonly string[];
  selectLayer(layerId: string): void;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly zoom: number;
  requestRedraw(): void;
  commitAction(label: string): void;
}

// ---------------------------------------------------------------------------
// 4. Export Handlers
// ---------------------------------------------------------------------------

export interface ExportHandlerDefinition {
  readonly formatId: string;
  readonly displayName: string;
  readonly extension: string;
  readonly mimeType: string;
  canExport(layers: readonly DesignLayer[]): boolean;
  readonly optionsSchema?: LayerPropertySchema[];
  export(
    layers: readonly DesignLayer[],
    baseCanvas: HTMLCanvasElement | OffscreenCanvas,
    options: Record<string, LayerPropertyValue>,
  ): Promise<Blob>;
}

// ---------------------------------------------------------------------------
// 5. MCP Tool Definitions
// ---------------------------------------------------------------------------

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  handler(
    input: Record<string, unknown>,
    context: McpToolContext,
  ): Promise<McpToolResult>;
}

export interface McpToolContext {
  readonly layers: LayerStackAccessor;
  readonly sketchState: SketchStateAccessor;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  resolveAsset(assetId: string): Promise<Buffer | null>;
  captureComposite(format?: "png" | "jpeg"): Promise<Buffer>;
  emitChange(changeType: DesignChangeType): void;
}

export type DesignChangeType =
  | "layer-added"
  | "layer-removed"
  | "layer-updated"
  | "layer-reordered"
  | "selection-changed"
  | "composite-changed";

export interface McpToolResult {
  readonly content: McpToolContent[];
  readonly isError?: boolean;
}

export type McpToolContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly data: string; readonly mimeType: string };

// ---------------------------------------------------------------------------
// 6. Mutable Design Layer (runtime extension of format's readonly type)
// ---------------------------------------------------------------------------

/**
 * Mutable version of DesignLayer for runtime use in the layer stack.
 * Extends the format's readonly interface with writable fields.
 */
export interface MutableDesignLayer {
  readonly id: string;
  readonly type: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: LayerTransform;
  properties: LayerProperties;
  children?: MutableDesignLayer[];
}

// ---------------------------------------------------------------------------
// 7. Layer Stack Accessor
// ---------------------------------------------------------------------------

export interface LayerStackAccessor {
  getAll(): readonly DesignLayer[];
  get(layerId: string): DesignLayer | null;
  add(layer: DesignLayer, index?: number): void;
  remove(layerId: string): boolean;
  updateProperties(
    layerId: string,
    properties: Partial<LayerProperties>,
  ): void;
  updateTransform(
    layerId: string,
    transform: Partial<LayerTransform>,
  ): void;
  updateBlend(
    layerId: string,
    blendMode?: BlendMode,
    opacity?: number,
  ): void;
  reorder(layerId: string, newIndex: number): void;
  duplicate(layerId: string): string;
  readonly count: number;
}

// ---------------------------------------------------------------------------
// 8. Sketch State Accessor
// ---------------------------------------------------------------------------

export interface SketchStateAccessor {
  readonly seed: number;
  readonly params: Readonly<Record<string, number>>;
  readonly colorPalette: readonly string[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly rendererId: string;
}

// ---------------------------------------------------------------------------
// 9. Plugin Context
// ---------------------------------------------------------------------------

export interface PluginContext {
  registerComponent(componentId: string, component: unknown): void;
  registerAsset(
    assetId: string,
    data: Buffer | Uint8Array,
    mimeType: string,
  ): void;
  log: PluginLogger;
  readonly host: PluginHostInfo;
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PluginHostInfo {
  readonly surface: "desktop" | "vscode" | "web" | "mcp";
  readonly supportsInteractiveTools: boolean;
  readonly supportsRendering: boolean;
}

// ---------------------------------------------------------------------------
// 10. Render Resources
// ---------------------------------------------------------------------------

export interface RenderResources {
  getFont(family: string): FontFace | null;
  getImage(assetId: string): HTMLImageElement | ImageBitmap | null;
  readonly theme: "dark" | "light";
  readonly pixelRatio: number;
}

// ---------------------------------------------------------------------------
// 11. Plugin Registry Interface
// ---------------------------------------------------------------------------

export interface PluginRegistry {
  register(plugin: DesignPlugin): Promise<void>;
  unregister(pluginId: string): void;
  get(pluginId: string): DesignPlugin | null;
  getAll(): readonly DesignPlugin[];
  getLayerTypes(): readonly LayerTypeDefinition[];
  resolveLayerType(typeId: string): LayerTypeDefinition | null;
  getMcpTools(): readonly PrefixedMcpTool[];
  getDesignTools(): readonly DesignToolDefinition[];
  getExportHandlers(): readonly ExportHandlerDefinition[];
}

export interface PrefixedMcpTool {
  readonly name: string;
  readonly pluginId: string;
  readonly definition: McpToolDefinition;
}
