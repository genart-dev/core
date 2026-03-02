import { watch } from "node:fs";
import { basename } from "node:path";
import { compileProject } from "./compiler.js";
import { CompileFailure, OUTPUT_FILE_NAME } from "./types.js";
import type {
  CompileOptions,
  CompileResult,
  CompileError,
  WatchOptions,
  FileWatcher,
} from "./types.js";

/** Filenames and directories to ignore during watch. */
const IGNORE_PATTERNS = new Set([
  OUTPUT_FILE_NAME,
  "node_modules",
  ".git",
  ".DS_Store",
]);

/** Check if a filename should be ignored. */
function shouldIgnore(filename: string): boolean {
  if (!filename) return true;
  const base = basename(filename);
  if (base.startsWith(".")) return true;
  return IGNORE_PATTERNS.has(base);
}

/**
 * Watch a developer project directory and recompile on file changes.
 *
 * Uses Node 20+ `fs.watch` with `recursive: true` — no external dependencies.
 * Changes are debounced (default 150ms) before triggering recompilation.
 * The compiled output file (`sketch.genart`) is ignored to avoid loops.
 *
 * @param projectDir - Absolute path to the project directory.
 * @param onChange - Callback invoked with compile result or error after each recompilation.
 * @param options - Watch configuration.
 * @returns A `FileWatcher` handle to stop watching.
 */
export function watchProject(
  projectDir: string,
  onChange: (result: CompileResult | { errors: readonly CompileError[] }) => void,
  options?: WatchOptions,
): FileWatcher {
  const debounceMs = options?.debounce ?? 150;

  const compileOptions: CompileOptions = {
    projectDir,
    outputPath: options?.outputPath,
    preserveState: options?.preserveState,
    preserveLayers: options?.preserveLayers,
  };

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let compiling = false;
  let pendingRecompile = false;

  async function recompile(): Promise<void> {
    if (compiling) {
      pendingRecompile = true;
      return;
    }
    compiling = true;
    try {
      const result = await compileProject(compileOptions);
      onChange(result);
    } catch (err: unknown) {
      if (err instanceof CompileFailure) {
        onChange({ errors: err.errors });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        onChange({
          errors: [{ file: projectDir, message: msg }],
        });
      }
    } finally {
      compiling = false;
      if (pendingRecompile) {
        pendingRecompile = false;
        recompile();
      }
    }
  }

  function scheduleRecompile(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      recompile();
    }, debounceMs);
  }

  const watcher = watch(
    projectDir,
    { recursive: true },
    (_eventType, filename) => {
      if (filename && !shouldIgnore(filename)) {
        scheduleRecompile();
      }
    },
  );

  return {
    close() {
      watcher.close();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}
