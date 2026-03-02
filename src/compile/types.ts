import type {
  SketchDefinition,
  RendererSpec,
  CanvasSpec,
  ParamDef,
  ColorDef,
  ThemeDef,
  TabDef,
  SketchState,
  DesignLayer,
  Snapshot,
  SketchComponentValue,
} from "@genart-dev/format";

/**
 * Mapping from sketch file extension to renderer algorithm language.
 * Used by `discoverProject()` to determine which file is the sketch source.
 */
export const SKETCH_EXTENSIONS: Record<string, "javascript" | "glsl"> = {
  ".js": "javascript",
  ".ts": "javascript",
  ".frag": "glsl",
};

/** Ordered list of sketch filenames to look for during discovery. */
export const SKETCH_FILE_NAMES = [
  "sketch.js",
  "sketch.ts",
  "sketch.frag",
] as const;

/** The meta sidecar filename. */
export const META_FILE_NAME = "sketch.meta.json";

/** The compiled output filename. */
export const OUTPUT_FILE_NAME = "sketch.genart";

/** Components directory name. */
export const COMPONENTS_DIR_NAME = "components";

/**
 * A discovered developer project on disk.
 * Returned by `discoverProject()`.
 */
export interface DevProject {
  /** Absolute path to the project directory. */
  readonly projectDir: string;
  /** Sketch source filename relative to projectDir (e.g. "sketch.js"). */
  readonly sketchFile: string;
  /** Meta sidecar filename relative to projectDir ("sketch.meta.json"). */
  readonly metaFile: string;
  /** Component filenames relative to projectDir (e.g. "components/utils.js"). */
  readonly componentFiles: readonly string[];
}

/** Options for `compileProject()`. */
export interface CompileOptions {
  /** Absolute path to the project directory containing sketch.js and sketch.meta.json. */
  readonly projectDir: string;
  /** Output path for the .genart file. Defaults to `<projectDir>/sketch.genart`. */
  readonly outputPath?: string;
  /** Carry forward `state` from existing .genart output. Default: true. */
  readonly preserveState?: boolean;
  /** Carry forward `layers` from existing .genart output. Default: true. */
  readonly preserveLayers?: boolean;
}

/** Successful compilation result. */
export interface CompileResult {
  /** The assembled SketchDefinition. */
  readonly sketch: SketchDefinition;
  /** Path where the .genart file was written. */
  readonly outputPath: string;
  /** Non-fatal warnings encountered during compilation. */
  readonly warnings: readonly string[];
  /** Compilation duration in milliseconds. */
  readonly duration: number;
}

/** A single compilation error with source location. */
export interface CompileError {
  /** Source file path (relative to project directory). */
  readonly file: string;
  /** Line number (1-based), if available. */
  readonly line?: number;
  /** Column number (1-based), if available. */
  readonly column?: number;
  /** Error message. */
  readonly message: string;
}

/** Thrown when compilation fails. Contains one or more errors. */
export class CompileFailure extends Error {
  readonly errors: readonly CompileError[];

  constructor(errors: readonly CompileError[]) {
    const summary = errors.map((e) => {
      const loc = e.line ? `:${e.line}${e.column ? `:${e.column}` : ""}` : "";
      return `${e.file}${loc}: ${e.message}`;
    });
    super(`Compilation failed:\n${summary.join("\n")}`);
    this.name = "CompileFailure";
    this.errors = errors;
  }
}

/** Options for `watchProject()`. */
export interface WatchOptions {
  /** Debounce interval in milliseconds. Default: 150. */
  readonly debounce?: number;
  /** Output path for the .genart file. */
  readonly outputPath?: string;
  /** Carry forward `state` from existing .genart output. Default: true. */
  readonly preserveState?: boolean;
  /** Carry forward `layers` from existing .genart output. Default: true. */
  readonly preserveLayers?: boolean;
}

/** Handle returned by `watchProject()` to stop the watcher. */
export interface FileWatcher {
  /** Stop watching and clean up. */
  close(): void;
}

/**
 * Parsed `sketch.meta.json` contents.
 * A subset of `SketchDefinition` fields — everything except `algorithm`
 * and inline component code.
 */
export interface SketchMeta {
  readonly title: string;
  /** Auto-generated from title if absent. */
  readonly id?: string;
  readonly renderer: RendererSpec;
  readonly canvas: CanvasSpec;
  readonly parameters?: readonly ParamDef[];
  readonly colors?: readonly ColorDef[];
  readonly themes?: readonly ThemeDef[];
  readonly tabs?: readonly TabDef[];
  /** Registry component references (string version ranges). */
  readonly components?: Readonly<Record<string, SketchComponentValue>>;
  readonly philosophy?: string;
  readonly skills?: readonly string[];
  readonly agent?: string;
  readonly model?: string;
  /** Preserved from previous compilation. */
  readonly state?: SketchState;
  readonly layers?: readonly DesignLayer[];
  readonly snapshots?: readonly Snapshot[];
}
