import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import {
  serializeGenart,
  parseGenart,
  resolvePreset,
} from "@genart-dev/format";
import type {
  SketchDefinition,
  SketchComponentValue,
  SketchComponentDef,
  CanvasSpec,
} from "@genart-dev/format";
import { resolveComponents } from "@genart-dev/components";
import { createDefaultRegistry } from "../sketch/registry.js";
import { parseSketchMeta } from "./meta-parser.js";
import { parseExportsComment } from "./exports-parser.js";
import {
  SKETCH_FILE_NAMES,
  META_FILE_NAME,
  OUTPUT_FILE_NAME,
  COMPONENTS_DIR_NAME,
  SKETCH_EXTENSIONS,
  CompileFailure,
} from "./types.js";
import type {
  DevProject,
  CompileOptions,
  CompileResult,
  CompileError,
  SketchMeta,
} from "./types.js";

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Discover a developer project in the given directory.
 *
 * Looks for sketch source files (`sketch.js`, `sketch.ts`, `sketch.frag`)
 * and the metadata sidecar (`sketch.meta.json`).
 *
 * @param projectDir - Absolute path to the project directory.
 * @returns Discovered project structure.
 * @throws If the required files are not found.
 */
export async function discoverProject(projectDir: string): Promise<DevProject> {
  // Find sketch source file
  let sketchFile: string | undefined;
  for (const name of SKETCH_FILE_NAMES) {
    try {
      const s = await stat(join(projectDir, name));
      if (s.isFile()) {
        sketchFile = name;
        break;
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  if (!sketchFile) {
    throw new CompileFailure([
      {
        file: projectDir,
        message: `No sketch source file found. Expected one of: ${SKETCH_FILE_NAMES.join(", ")}`,
      },
    ]);
  }

  // Check for meta file
  try {
    const s = await stat(join(projectDir, META_FILE_NAME));
    if (!s.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw new CompileFailure([
      {
        file: META_FILE_NAME,
        message: `Missing ${META_FILE_NAME}`,
      },
    ]);
  }

  // Scan components directory
  const componentFiles: string[] = [];
  const componentsDir = join(projectDir, COMPONENTS_DIR_NAME);
  try {
    const entries = await readdir(componentsDir);
    for (const entry of entries.sort()) {
      const ext = extname(entry);
      if (ext === ".js" || ext === ".ts") {
        componentFiles.push(`${COMPONENTS_DIR_NAME}/${entry}`);
      }
    }
  } catch {
    // No components directory — that's fine
  }

  return {
    projectDir,
    sketchFile,
    metaFile: META_FILE_NAME,
    componentFiles,
  };
}

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

/** Convert a title to a URL-safe kebab-case identifier. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ---------------------------------------------------------------------------
// TypeScript transpilation
// ---------------------------------------------------------------------------

/**
 * Transpile TypeScript source to JavaScript via esbuild.
 * Returns the transpiled JS. Throws CompileFailure on error.
 */
async function transpileTypeScript(
  source: string,
  file: string,
): Promise<string> {
  let esbuild: typeof import("esbuild");
  try {
    esbuild = await import("esbuild");
  } catch {
    throw new CompileFailure([
      {
        file,
        message:
          'TypeScript transpilation requires esbuild. Install it: pnpm add -D esbuild',
      },
    ]);
  }

  try {
    const result = await esbuild.transform(source, {
      loader: "ts",
      target: "esnext",
      format: "esm",
    });
    return result.code;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CompileFailure([{ file, message: `TypeScript error: ${msg}` }]);
  }
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

/**
 * Compile a developer project directory to a `.genart` file.
 *
 * Pipeline:
 * 1. Discover project files
 * 2. Parse metadata sidecar
 * 3. Read and optionally transpile sketch source
 * 4. Validate algorithm via renderer adapter
 * 5. Read and parse local component files
 * 6. Resolve registry components
 * 7. Merge local + registry components
 * 8. Optionally carry forward state/layers from previous output
 * 9. Assemble SketchDefinition and serialize
 *
 * @param options - Compilation options.
 * @returns Compilation result with the assembled sketch and output path.
 * @throws {CompileFailure} On compilation errors.
 */
export async function compileProject(
  options: CompileOptions,
): Promise<CompileResult> {
  const start = performance.now();
  const warnings: string[] = [];

  const { projectDir, preserveState = true, preserveLayers = true } = options;
  const outputPath =
    options.outputPath ?? join(projectDir, OUTPUT_FILE_NAME);

  // 1. Discover project
  const project = await discoverProject(projectDir);

  // 2. Parse meta
  let meta: SketchMeta;
  try {
    const metaRaw = await readFile(
      join(projectDir, project.metaFile),
      "utf-8",
    );
    meta = parseSketchMeta(JSON.parse(metaRaw));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CompileFailure([
      { file: project.metaFile, message: msg },
    ]);
  }

  // 3. Read sketch source
  let algorithm = await readFile(
    join(projectDir, project.sketchFile),
    "utf-8",
  );

  // Transpile TypeScript if needed
  const ext = extname(project.sketchFile);
  if (ext === ".ts") {
    algorithm = await transpileTypeScript(algorithm, project.sketchFile);
  }

  // 4. Validate via renderer adapter
  const registry = createDefaultRegistry();
  const adapter = registry.resolve(meta.renderer.type);
  const validation = adapter.validate(algorithm);
  if (!validation.valid) {
    throw new CompileFailure(
      validation.errors.map((msg) => ({
        file: project.sketchFile,
        message: msg,
      })),
    );
  }

  // 5. Read local component files
  const localComponents: Record<string, SketchComponentDef> = {};
  for (const compFile of project.componentFiles) {
    const compPath = join(projectDir, compFile);
    const compSource = await readFile(compPath, "utf-8");
    const exports = parseExportsComment(compSource);

    if (!exports) {
      throw new CompileFailure([
        {
          file: compFile,
          message: `Missing // @exports: comment. Each component file must declare its exports.`,
        },
      ]);
    }

    const compName = basename(compFile, extname(compFile));
    localComponents[compName] = {
      code: compSource,
      exports,
    };
  }

  // 6. Resolve registry components from meta
  const registryComponentEntries: Record<string, string> = {};
  const resolvedRegistryComponents: Record<string, SketchComponentDef> = {};

  if (meta.components) {
    for (const [name, value] of Object.entries(meta.components)) {
      if (typeof value === "string") {
        // Registry reference — needs resolution
        registryComponentEntries[name] = value;
      } else {
        // Already inline (from a previous compile or manually specified)
        resolvedRegistryComponents[name] = value;
      }
    }
  }

  // Resolve registry components
  if (Object.keys(registryComponentEntries).length > 0) {
    try {
      const resolved = resolveComponents(
        registryComponentEntries,
        meta.renderer.type,
      );
      for (const rc of resolved) {
        resolvedRegistryComponents[rc.name] = {
          version: rc.version,
          code: rc.code,
          exports: [...rc.exports],
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CompileFailure([
        { file: project.metaFile, message: `Component resolution: ${msg}` },
      ]);
    }
  }

  // 7. Merge components (registry first, then local overrides)
  const allComponents: Record<string, SketchComponentValue> = {
    ...resolvedRegistryComponents,
    ...localComponents,
  };

  // Check for name collisions between local and registry
  for (const name of Object.keys(localComponents)) {
    if (name in resolvedRegistryComponents) {
      warnings.push(
        `Local component "${name}" shadows registry component of the same name`,
      );
    }
  }

  // 8. Carry forward state/layers from existing .genart
  let existingSketch: SketchDefinition | undefined;
  try {
    const existingRaw = await readFile(outputPath, "utf-8");
    existingSketch = parseGenart(JSON.parse(existingRaw));
  } catch {
    // No existing output or invalid — that's fine
  }

  // Determine canvas
  const canvas: CanvasSpec = meta.canvas.width
    ? meta.canvas
    : meta.canvas.preset
      ? { ...resolvePreset(meta.canvas.preset!), preset: meta.canvas.preset }
      : { width: 1200, height: 1200 };

  // Build default state from parameter/color definitions
  const parameters = meta.parameters ?? [];
  const colors = meta.colors ?? [];
  const defaultParams: Record<string, number> = {};
  for (const p of parameters) {
    defaultParams[p.key] = p.default;
  }
  const defaultColorPalette = colors.map((c) => c.default);

  const now = new Date().toISOString();
  const id = meta.id ?? slugify(meta.title);

  // Determine state: preserved > meta > defaults
  const state =
    preserveState && existingSketch?.state
      ? existingSketch.state
      : meta.state ?? {
          seed: Math.floor(Math.random() * 100000),
          params: defaultParams,
          colorPalette: defaultColorPalette,
        };

  // Determine layers
  const layers =
    preserveLayers && existingSketch?.layers
      ? existingSketch.layers
      : meta.layers;

  // Determine timestamps
  const created = existingSketch?.created ?? now;

  // 9. Assemble SketchDefinition
  const sketch: SketchDefinition = {
    genart: "1.1",
    id,
    title: meta.title,
    created,
    modified: now,
    ...(meta.agent !== undefined ? { agent: meta.agent } : {}),
    ...(meta.model !== undefined ? { model: meta.model } : {}),
    ...(meta.skills !== undefined ? { skills: meta.skills } : {}),
    ...(Object.keys(allComponents).length > 0
      ? { components: allComponents }
      : {}),
    ...(layers !== undefined && layers.length > 0 ? { layers } : {}),
    renderer: meta.renderer,
    canvas,
    ...(meta.philosophy !== undefined ? { philosophy: meta.philosophy } : {}),
    ...(meta.tabs !== undefined ? { tabs: meta.tabs } : {}),
    parameters,
    colors,
    ...(meta.themes !== undefined ? { themes: meta.themes } : {}),
    state,
    ...(existingSketch?.snapshots !== undefined
      ? { snapshots: existingSketch.snapshots }
      : meta.snapshots !== undefined
        ? { snapshots: meta.snapshots }
        : {}),
    algorithm,
  };

  // Serialize and write
  const json = serializeGenart(sketch);
  await writeFile(outputPath, json, "utf-8");

  const duration = performance.now() - start;
  return { sketch, outputPath, warnings, duration };
}
