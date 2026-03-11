/**
 * ADR 059 — Compositor Code Generator
 *
 * Reads each plugin's dist/index.cjs bundle, wraps it in an IIFE to extract
 * render() functions for all layer types, and generates a dispatcher module
 * that the iframe compositor imports at build time.
 *
 * Usage: npx tsx scripts/generate-compositor.ts
 *
 * Output: src/design/generated-renderers.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PLUGINS_DIR = resolve(__dirname, "../../");
const OUTPUT_FILE = resolve(__dirname, "../src/design/generated-renderers.ts");

/** Layer types already hardcoded in iframe-compositor.ts — skip these */
const EXISTING_TYPES = new Set([
  "shapes:rect",
  "shapes:ellipse",
  "shapes:line",
  "shapes:polygon",
  "shapes:star",
  "typography:text",
  "filter:vignette",
  "filter:blur",
  "filter:grain",
  "filter:duotone",
  "filter:chromatic-aberration",
  "guides:grid",
  "guides:thirds",
  "guides:diagonal",
  "guides:golden-ratio",
  "guides:custom",
]);

/** Plugin directories to scan (order doesn't matter) */
const PLUGIN_DIRS = [
  "plugin-compositing",
  "plugin-perspective",
  "plugin-textures",
  "plugin-painting",
  "plugin-color-adjust",
  "plugin-construction",
  "plugin-distribution",
  "plugin-figure",
  "plugin-poses",
  "plugin-symbols",
  "plugin-animation",
  "plugin-styles",
  "plugin-layout-composition",
  "plugin-layout-guides",
  "plugin-shapes",
  "plugin-filters",
  "plugin-typography",
  "plugin-patterns",
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface ExtractedRenderer {
  typeId: string;
  pluginDir: string;
}

function extractLayerTypes(pluginDir: string): ExtractedRenderer[] {
  const cjsPath = resolve(PLUGINS_DIR, pluginDir, "dist/index.cjs");
  if (!existsSync(cjsPath)) {
    console.warn(`  SKIP ${pluginDir}: no dist/index.cjs`);
    return [];
  }

  // require() the CJS bundle to get the exported plugin object
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(cjsPath);
  const plugin = mod.default ?? mod;

  if (!plugin?.layerTypes || !Array.isArray(plugin.layerTypes)) {
    console.warn(`  SKIP ${pluginDir}: no layerTypes array`);
    return [];
  }

  const results: ExtractedRenderer[] = [];
  for (const lt of plugin.layerTypes) {
    if (!lt.typeId || !lt.render) continue;
    if (EXISTING_TYPES.has(lt.typeId)) continue;
    results.push({ typeId: lt.typeId, pluginDir });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * For each plugin that has new layer types, we wrap its entire CJS bundle
 * in an IIFE and extract the render functions by typeId. This preserves all
 * module-scoped helpers that render() depends on.
 *
 * The generated output is a plain JS string (embedded in a TS template literal)
 * that will be injected into the compositor's <script> block.
 */
function generatePluginIIFE(pluginDir: string, typeIds: string[]): string {
  const cjsPath = resolve(PLUGINS_DIR, pluginDir, "dist/index.cjs");
  let source = readFileSync(cjsPath, "utf-8");

  // Remove the sourcemap comment — it won't resolve inside an inline script
  source = source.replace(/\/\/# sourceMappingURL=.*/g, "");

  // Remove the "use strict" at the top (we're already in strict mode)
  source = source.replace(/^"use strict";\n?/, "");

  // Build the IIFE: execute the CJS module in a fake module scope,
  // then extract each layer type's render function by typeId.
  // NOTE: We pass RENDERERS as a parameter (__R) to avoid name collisions
  // with `var RENDERERS` declarations inside plugin bundles (e.g. plugin-figure
  // has `var RENDERERS = { stick: stickRenderer, ... }` which would shadow
  // the compositor's RENDERERS if accessed via closure).
  const typeIdLookups = typeIds
    .map(
      (id) =>
        `    var lt_${sanitize(id)} = __plugin.layerTypes.find(function(t) { return t.typeId === "${id}"; });\n` +
        `    if (lt_${sanitize(id)}) __R["${id}"] = (function(lt) {\n` +
        `      return function(ctx, properties, bounds) {\n` +
        `        lt.render(properties, ctx, bounds, {});\n` +
        `      };\n` +
        `    })(lt_${sanitize(id)});`
    )
    .join("\n");

  return `
  // --- ${pluginDir} ---
  (function(__R) {
    var module = { exports: {} };
    var exports = module.exports;
    var require = function(id) {
      // Stub: external deps are only used by MCP tools / Node utilities, not render()
      return {};
    };
    ${source}
    var __plugin = module.exports.default || module.exports;
    if (__plugin && __plugin.layerTypes) {
${typeIdLookups}
    }
  })(RENDERERS);`;
}

function sanitize(typeId: string): string {
  return typeId.replace(/[^a-zA-Z0-9]/g, "_");
}

function generate(): void {
  console.log("ADR 059 — Generating compositor renderers...\n");

  // Collect all new layer types grouped by plugin
  const pluginTypes = new Map<string, string[]>();
  let totalNew = 0;

  for (const dir of PLUGIN_DIRS) {
    const types = extractLayerTypes(dir);
    if (types.length > 0) {
      const ids = types.map((t) => t.typeId);
      pluginTypes.set(dir, ids);
      totalNew += ids.length;
      console.log(`  ${dir}: ${ids.join(", ")}`);
    }
  }

  console.log(`\n  Total new renderers: ${totalNew}`);
  console.log(`  Existing (hardcoded): ${EXISTING_TYPES.size}`);
  console.log(`  Total: ${totalNew + EXISTING_TYPES.size}\n`);

  // Generate the IIFE blocks
  const iifes: string[] = [];
  for (const [dir, ids] of pluginTypes) {
    iifes.push(generatePluginIIFE(dir, ids));
  }

  const generatedCode = iifes.join("\n");

  // Write the output as a TS module that exports the generated JS string
  const output = `/**
 * AUTO-GENERATED by scripts/generate-compositor.ts — DO NOT EDIT
 *
 * Contains IIFE-wrapped plugin bundles that register render() functions
 * for ${totalNew} layer types into the RENDERERS map.
 *
 * Generated: ${new Date().toISOString()}
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const GENERATED_RENDERERS_CODE = \`${escapeTemplateLiteral(generatedCode)}\`;
`;

  writeFileSync(OUTPUT_FILE, output, "utf-8");
  console.log(`  Written to: ${OUTPUT_FILE}`);
}

function escapeTemplateLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

generate();
