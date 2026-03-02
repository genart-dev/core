import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  SketchDefinition,
  SketchComponentDef,
  SketchComponentValue,
} from "@genart-dev/format";

/** Determine the sketch source file extension based on renderer type. */
function sketchFileName(rendererType: string): string {
  return rendererType === "glsl" ? "sketch.frag" : "sketch.js";
}

/**
 * Eject a `.genart` file into a developer project directory.
 *
 * Creates:
 * - `sketch.js` (or `sketch.frag` for GLSL) from the algorithm field
 * - `components/<name>.js` for each inline component (with `@exports` header)
 * - `sketch.meta.json` with remaining metadata
 *
 * Registry-only components (string version ranges) are preserved in the meta
 * as-is. Inline components (with `code` + `exports`) are extracted to files.
 *
 * @param sketch - The SketchDefinition to eject.
 * @param outputDir - Directory to write the project files to.
 * @throws If the directory cannot be created or files cannot be written.
 */
export async function ejectProject(
  sketch: SketchDefinition,
  outputDir: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  // 1. Write sketch source file
  const srcFile = sketchFileName(sketch.renderer.type);
  await writeFile(join(outputDir, srcFile), sketch.algorithm, "utf-8");

  // 2. Separate inline components from registry references
  const metaComponents: Record<string, SketchComponentValue> = {};
  const inlineComponents: Record<string, SketchComponentDef> = {};

  if (sketch.components) {
    for (const [name, value] of Object.entries(sketch.components)) {
      if (typeof value === "string") {
        // Registry reference — keep in meta
        metaComponents[name] = value;
      } else if (value.code && value.exports) {
        // Inline component — extract to file
        inlineComponents[name] = value;
      } else {
        // Object without code/exports — keep in meta
        metaComponents[name] = value;
      }
    }
  }

  // 3. Write inline component files
  if (Object.keys(inlineComponents).length > 0) {
    const componentsDir = join(outputDir, "components");
    await mkdir(componentsDir, { recursive: true });

    for (const [name, comp] of Object.entries(inlineComponents)) {
      const exports = comp.exports
        ? (comp.exports as readonly string[]).join(", ")
        : "";
      const header = `// @exports: ${exports}\n\n`;

      // Strip existing @exports comment from code if present (avoid duplication)
      let code = comp.code!;
      code = code.replace(/^\/\/\s*@exports:.*\n\n?/, "");
      code = code.replace(/^\/\*\s*@exports:.*?\*\/\n\n?/, "");

      await writeFile(join(componentsDir, `${name}.js`), header + code, "utf-8");
    }
  }

  // 4. Build meta object
  const meta: Record<string, unknown> = {
    title: sketch.title,
  };

  if (sketch.id) meta["id"] = sketch.id;

  meta["renderer"] = sketch.renderer;
  meta["canvas"] = sketch.canvas;

  if (sketch.parameters.length > 0) meta["parameters"] = sketch.parameters;
  if (sketch.colors.length > 0) meta["colors"] = sketch.colors;
  if (sketch.themes && sketch.themes.length > 0) meta["themes"] = sketch.themes;
  if (sketch.tabs && sketch.tabs.length > 0) meta["tabs"] = sketch.tabs;

  if (Object.keys(metaComponents).length > 0) {
    meta["components"] = metaComponents;
  }

  if (sketch.philosophy) meta["philosophy"] = sketch.philosophy;
  if (sketch.skills && sketch.skills.length > 0) meta["skills"] = sketch.skills;
  if (sketch.agent) meta["agent"] = sketch.agent;
  if (sketch.model) meta["model"] = sketch.model;

  // Preserve state, layers, and snapshots
  meta["state"] = sketch.state;
  if (sketch.layers && sketch.layers.length > 0) meta["layers"] = sketch.layers;
  if (sketch.snapshots && sketch.snapshots.length > 0) {
    meta["snapshots"] = sketch.snapshots;
  }

  // 5. Write meta file
  await writeFile(
    join(outputDir, "sketch.meta.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}
