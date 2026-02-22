import type {
  RendererType,
  SketchState,
  CanvasSpec,
  SketchDefinition,
  ParamDef,
  ColorDef,
} from "@genart-dev/format";

// ---------------------------------------------------------------------------
// Skills (Design Knowledge System)
// ---------------------------------------------------------------------------

/** A design knowledge skill definition. */
export interface SkillDefinition {
  /** Unique skill identifier (kebab-case). */
  readonly id: string;
  /** Human-readable skill name. */
  readonly name: string;
  /** Skill category. */
  readonly category: "composition" | "color";
  /** Complexity level. */
  readonly complexity: "beginner" | "intermediate" | "advanced";
  /** Brief description. */
  readonly description: string;
  /** Core design theory (markdown). */
  readonly theory: string;
  /** Key principles. */
  readonly principles: readonly string[];
  /** Academic references. */
  readonly references: readonly SkillReference[];
  /** Suggested parameters for sketches using this skill. */
  readonly suggestedParameters?: readonly ParamDef[];
  /** Suggested color definitions. */
  readonly suggestedColors?: readonly ColorDef[];
  /** Renderer-specific example algorithms. */
  readonly examples?: Readonly<Partial<Record<RendererType, string>>>;
}

/** An academic reference for a skill. */
export interface SkillReference {
  /** Book or paper title. */
  readonly title: string;
  /** Author name. */
  readonly author: string;
  /** Year of publication. */
  readonly year?: number;
}

// ---------------------------------------------------------------------------
// Renderer Adapter & Sketch Instance (Phase 0.5 implementation)
// ---------------------------------------------------------------------------

/** Result of validating an algorithm string. */
export interface ValidationResult {
  /** Whether the algorithm is valid. */
  readonly valid: boolean;
  /** Validation error messages, if any. */
  readonly errors: readonly string[];
}

/** Opaque compiled algorithm handle. */
export type CompiledAlgorithm = unknown;

/** A runtime dependency required by a renderer. */
export interface RuntimeDependency {
  /** Package or CDN name. */
  readonly name: string;
  /** Version constraint. */
  readonly version: string;
  /** CDN URL for standalone HTML export. */
  readonly cdnUrl: string;
}

/** Options for frame capture. */
export interface CaptureOptions {
  /** Output format. */
  readonly format?: "png" | "jpeg" | "webp";
  /** Quality (0-1) for lossy formats. */
  readonly quality?: number;
  /** Scale multiplier. */
  readonly scale?: number;
}

/**
 * Renderer adapter — pluggable rendering engine interface.
 * Each renderer type (p5, Three.js, GLSL, Canvas 2D, SVG) implements this.
 */
export interface RendererAdapter {
  /** The renderer type this adapter handles. */
  readonly type: RendererType;
  /** Human-readable renderer name. */
  readonly displayName: string;
  /** Language used for the algorithm field. */
  readonly algorithmLanguage: "javascript" | "glsl" | "typescript";

  /** Validate algorithm source without executing it. */
  validate(algorithm: string): ValidationResult;
  /** Compile an algorithm string into a runnable form. */
  compile(algorithm: string): Promise<CompiledAlgorithm>;
  /** Create a live sketch instance from compiled algorithm + state. */
  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance;
  /** Render a single frame offscreen (for capture/export). */
  renderOffscreen(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
    options?: CaptureOptions,
  ): Promise<Uint8Array | Blob>;
  /** Generate a standalone HTML page embedding the sketch. */
  generateStandaloneHTML(sketch: SketchDefinition): string;
  /** Return a starter algorithm template for this renderer. */
  getAlgorithmTemplate(): string;
  /** List runtime dependencies needed for standalone export. */
  getRuntimeDependencies(): RuntimeDependency[];
}

/**
 * A live sketch instance mounted in the DOM.
 * Created by RendererAdapter.createInstance().
 */
export interface SketchInstance {
  /** Mount the sketch into a DOM container. */
  mount(container: HTMLElement): void;
  /** Unmount and remove from DOM. */
  unmount(): void;
  /** Update runtime state (params, colors, seed). */
  updateState(state: SketchState): void;
  /** Trigger a redraw with current state. */
  redraw(): void;
  /** Pause animation/rendering. */
  pause(): void;
  /** Resume animation/rendering. */
  resume(): void;
  /** Whether the sketch is currently animating. */
  readonly isAnimating: boolean;
  /** Capture the current frame as a data URL. */
  captureFrame(options?: CaptureOptions): Promise<string>;
  /** Capture raw ImageData from the current frame. */
  captureImageData(): Promise<ImageData>;
  /** Dispose all resources (WebGL contexts, event listeners, etc.). */
  dispose(): void;
}
