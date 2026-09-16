/**
 * ADR 059 — Compositor Code Generator
 *
 * Reads each plugin's dist/index.cjs bundle, wraps it in an IIFE to extract
 * render() functions for all layer types, and generates per-plugin modules
 * plus an index barrel that the iframe compositor imports at build time.
 *
 * Usage: npx tsx scripts/generate-compositor.ts
 *
 * Output: src/design/generated-renderers/<plugin-name>.ts  (one per plugin)
 *         src/design/generated-renderers/index.ts           (barrel)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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
const OUTPUT_DIR = resolve(__dirname, "../src/design/generated-renderers");

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

/**
 * The layer types the compositor's hand-written MODIFIER_TYPES table used to
 * list (ADR 111). Each one is rendered straight onto the composite because it
 * reads existing pixels, so each one must now carry `reads: "composite"` in its
 * own plugin. Generation fails if one of them stops declaring it: dropping a
 * type from the table is silent at render time, and this is where it is caught.
 */
const LEGACY_READS_COMPOSITE = [
  "painting:watercolor",
  "painting:charcoal",
  "painting:ink",
  "painting:fill",
  "painting:stroke",
  "painting:scene",
  "painting:bristle-dab",
  "painting:bristle-stroke",
  "adjust:hsl",
  "adjust:levels",
  "adjust:curves",
  "filter:grain",
  "filter:chromatic-aberration",
  "filter:duotone",
  "filter:blur",
];

/**
 * Types whose renderer lives in `iframe-compositor.ts` rather than in the
 * plugin, AND whose implementation there honours `bounds.scale` (ADR 111).
 *
 * A type in EXISTING_TYPES is rendered by the compositor's own code, so
 * declaring `resolution: "device"` in its plugin marks the type without
 * changing a single line of what actually draws it. That has been missed
 * twice: once for the filters, once for text and the basic shapes, and both
 * times it showed up as marks at half their size in a 2x render. Generation
 * fails if a hardcoded type declares device resolution and is not listed here.
 */
const SCALE_AWARE_BUILTINS = new Set([
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
  "plugin-terrain",
  "plugin-particles",
  "plugin-atmosphere",
  "plugin-water",
  "plugin-architecture",
  "plugin-plants",
  "plugin-trace",
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface ExtractedRenderer {
  typeId: string;
  pluginDir: string;
}

/** What a registered layer type declares about pixels (ADR 111). */
interface LayerContract {
  typeId: string;
  pluginDir: string;
  reads: string;
  resolution: string;
}

/** Contracts for every registered type, including ones whose renderer is hardcoded. */
const contracts: LayerContract[] = [];

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
    // Contracts are collected for every registered type. A type whose renderer
    // is hardcoded in the compositor still declares how it treats pixels.
    contracts.push({
      typeId: lt.typeId,
      pluginDir,
      reads: lt.reads ?? "none",
      resolution: lt.resolution ?? "logical",
    });
    if (EXISTING_TYPES.has(lt.typeId)) continue;
    results.push({ typeId: lt.typeId, pluginDir });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * Build a map of known inlineable CJS packages (id → exports object).
 * These are packages that render() functions legitimately depend on at runtime
 * in the browser compositor — i.e. not just Node/MCP utilities.
 */
function buildInlineableRequireMap(): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  // @genart-dev/illustration — used by particles:flow and particles:mark-field
  const illustrationCjs = resolve(PLUGINS_DIR, "illustration/dist/index.cjs");
  if (existsSync(illustrationCjs)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    map.set("@genart-dev/illustration", require(illustrationCjs) as Record<string, unknown>);
  }

  return map;
}

function generatePluginIIFE(pluginDir: string, typeIds: string[], inlineMap: Map<string, Record<string, unknown>>): string {
  const cjsPath = resolve(PLUGINS_DIR, pluginDir, "dist/index.cjs");
  let source = readFileSync(cjsPath, "utf-8");

  // Remove the sourcemap comment — it won't resolve inside an inline script
  source = source.replace(/\/\/# sourceMappingURL=.*/g, "");

  // Remove the "use strict" at the top (we're already in strict mode)
  source = source.replace(/^"use strict";\n?/, "");

  // Detect which inlineable deps this plugin's source actually requires
  const neededDeps: Array<[string, string]> = []; // [id, varName]
  for (const [id] of inlineMap) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`require\\(["']${escapedId}["']\\)`).test(source)) {
      const varName = `__dep_${sanitize(id)}`;
      neededDeps.push([id, varName]);
    }
  }

  // Build inline dep variable declarations
  const depSetup = neededDeps
    .map(([id, varName]) => {
      const depCjs = resolve(PLUGINS_DIR, id.replace("@genart-dev/", ""), "dist/index.cjs");
      let depSource = readFileSync(depCjs, "utf-8");
      depSource = depSource.replace(/\/\/# sourceMappingURL=.*/g, "").replace(/^"use strict";\n?/, "");
      return `    var ${varName} = (function() { var module={exports:{}}; var exports=module.exports; ${depSource}; return module.exports; })();`;
    })
    .join("\n");

  // Build require stub that resolves known deps and stubs everything else
  const requireCases = neededDeps
    .map(([id, varName]) => `if (id === "${id}") return ${varName};`)
    .join(" ");
  const requireStub = `function(id) { ${requireCases} return {}; }`;

  // Build the IIFE: execute the CJS module in a fake module scope,
  // then extract each layer type's render function by typeId.
  // NOTE: We pass RENDERERS as a parameter (__R) to avoid name collisions
  // with `var RENDERERS` declarations inside plugin bundles.
  const typeIdLookups = typeIds
    .map(
      (id) =>
        `    var lt_${sanitize(id)} = __plugin.layerTypes.find(function(t) { return t.typeId === "${id}"; });\n` +
        `    if (lt_${sanitize(id)}) __R["${id}"] = (function(lt) {\n` +
        `      return function(ctx, properties, bounds) {\n` +
        `        lt.render(properties, ctx, bounds, RESOURCES);\n` +
        `      };\n` +
        `    })(lt_${sanitize(id)});`
    )
    .join("\n");

  return `
  // --- ${pluginDir} ---
  (function(__R) {
    var module = { exports: {} };
    var exports = module.exports;
${depSetup}
    var require = ${requireStub};
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

/** Convert plugin-dir-name to a valid TS identifier: plugin-terrain → pluginTerrain */
function toIdentifier(pluginDir: string): string {
  return pluginDir.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function escapeTemplateLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function generate(): void {
  console.log("ADR 059 — Generating compositor renderers (per-plugin split)...\n");

  mkdirSync(OUTPUT_DIR, { recursive: true });

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

  // Build the inlineable require map (illustration, etc.)
  const inlineMap = buildInlineableRequireMap();

  // Generate one file per plugin
  const pluginExports: Array<{ dir: string; identifier: string; typeCount: number }> = [];

  for (const [dir, ids] of pluginTypes) {
    const iife = generatePluginIIFE(dir, ids, inlineMap);
    const identifier = toIdentifier(dir);
    const fileName = `${dir}.ts`;

    const content = `/** AUTO-GENERATED — DO NOT EDIT — ${ids.length} layer types from ${dir} */\nexport const ${identifier} = \`${escapeTemplateLiteral(iife)}\`;\n`;

    writeFileSync(resolve(OUTPUT_DIR, fileName), content, "utf-8");
    pluginExports.push({ dir, identifier, typeCount: ids.length });
    console.log(`  Written: ${fileName} (${ids.length} types)`);
  }

  // Generate barrel index.ts
  const imports = pluginExports
    .map((p) => `import { ${p.identifier} } from "./${p.dir}.js";`)
    .join("\n");

  const concat = pluginExports.map((p) => p.identifier).join("\n  + ");

  const barrel = `/**
 * AUTO-GENERATED by scripts/generate-compositor.ts — DO NOT EDIT
 *
 * Barrel that concatenates per-plugin renderer code strings.
 * ${totalNew} layer types from ${pluginExports.length} plugins.
 *
 * Generated: ${new Date().toISOString()}
 */

${imports}

export const GENERATED_RENDERERS_CODE =
  ${concat};
`;

  writeFileSync(resolve(OUTPUT_DIR, "index.ts"), barrel, "utf-8");
  console.log(`\n  Written: index.ts (barrel for ${pluginExports.length} plugins)`);

  writeContracts();
}

/**
 * Write the layer contract tables the compositor routes on (ADR 111), and
 * fail if a type that used to be in the hand-written table has stopped
 * declaring that it reads the composite.
 */
function writeContracts(): void {
  const readsComposite = contracts
    .filter((c) => c.reads === "composite")
    .map((c) => c.typeId)
    .sort();
  const deviceResolution = contracts
    .filter((c) => c.resolution === "device")
    .map((c) => c.typeId)
    .sort();

  const unscaledBuiltins = contracts
    .filter(
      (c) =>
        c.resolution === "device" &&
        EXISTING_TYPES.has(c.typeId) &&
        !SCALE_AWARE_BUILTINS.has(c.typeId),
    )
    .map((c) => c.typeId);
  if (unscaledBuiltins.length > 0) {
    console.error(
      `\n  ERROR: ${unscaledBuiltins.length} type(s) declare resolution: "device" but are ` +
        `rendered by the compositor's own hardcoded implementation, which has not been ` +
        `made scale-aware. Their marks would come out at the wrong size:\n` +
        unscaledBuiltins.map((t) => `    - ${t}`).join("\n") +
        `\n\n  Scale the renderer in src/design/iframe-compositor.ts, then add the type to ` +
        `SCALE_AWARE_BUILTINS in this script.\n`,
    );
    process.exit(1);
  }

  const declared = new Set(readsComposite);
  const undeclared = LEGACY_READS_COMPOSITE.filter((t) => !declared.has(t));
  if (undeclared.length > 0) {
    console.error(
      `\n  ERROR: ${undeclared.length} type(s) read the composite but no longer declare ` +
        `reads: "composite" — they would render into a blank buffer and draw nothing:\n` +
        undeclared.map((t) => `    - ${t}`).join("\n") +
        `\n\n  Add the declaration in the plugin, rebuild it, and regenerate.\n`,
    );
    process.exit(1);
  }

  const content = `/**
 * AUTO-GENERATED by scripts/generate-compositor.ts — DO NOT EDIT
 *
 * Layer contract tables (ADR 111), read from each plugin's own declarations.
 *
 * Generated: ${new Date().toISOString()}
 */

/** Types rendered straight onto the composite because they read its pixels. */
export const READS_COMPOSITE_TYPES: readonly string[] = ${JSON.stringify(readsComposite, null, 2)};

/** Types that want a device-resolution buffer and scale-aware bounds. */
export const DEVICE_RESOLUTION_TYPES: readonly string[] = ${JSON.stringify(deviceResolution, null, 2)};
`;
  writeFileSync(resolve(OUTPUT_DIR, "contracts.ts"), content, "utf-8");
  console.log(
    `  Written: contracts.ts (${readsComposite.length} read the composite, ` +
      `${deviceResolution.length} at device resolution)`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

generate();
