import type {
  SketchComponentValue,
  SketchSymbolValue,
  SketchDataSource,
  LibraryDependency,
} from "@genart-dev/format";

/**
 * Generate `<script src="...">` tags for external library dependencies.
 * Returns an empty string when there are no libraries.
 * Tags are emitted one per line, suitable for insertion into an HTML `<head>`
 * or `<body>` block directly after the renderer runtime script tag.
 */
export function generateLibraryScriptTags(
  libraries?: readonly LibraryDependency[],
): string {
  if (!libraries || libraries.length === 0) return '';
  return libraries.map(lib => `  <script src="${lib.cdnUrl}"></script>`).join('\n');
}

/**
 * Extract component source code from a SketchDefinition.components record.
 * Returns a string of JS code to embed in standalone HTML.
 * Only includes components that have cached `code` (resolved form).
 */
export function extractComponentCode(
  components?: Readonly<Record<string, SketchComponentValue>>,
): string {
  if (!components) return '';

  const blocks: string[] = [];
  for (const [name, value] of Object.entries(components)) {
    if (typeof value === 'string') continue; // unresolved — no code to inject
    if (value.code) {
      const ver = value.version ? ` v${value.version}` : '';
      blocks.push(`// --- ${name}${ver} ---\n${value.code}`);
    }
  }
  return blocks.join('\n\n');
}

/**
 * Extract resolved symbol data from a SketchDefinition.symbols record.
 * Returns a `const __symbols__ = { ... };` declaration for injection into
 * algorithm scope, or an empty string if there are no resolved symbols.
 * Only SketchSymbolDef (object) values are included; string refs are skipped.
 */
export function extractSymbolData(
  symbols?: Readonly<Record<string, SketchSymbolValue>>,
): string {
  if (!symbols) return '';

  const resolved: Record<string, SketchSymbolValue> = {};
  for (const [id, value] of Object.entries(symbols)) {
    if (typeof value !== 'string') {
      resolved[id] = value;
    }
  }

  if (Object.keys(resolved).length === 0) return '';
  return `const __symbols__ = ${JSON.stringify(resolved)};`;
}

/**
 * Generate inline JS that resolves data sources and populates `state.data`.
 *
 * For `source: "component"`: calls the component factory function (already in
 * scope from extractComponentCode) with config + runtime context.
 * For `source: "inline"`: injects the value directly.
 * For `source: "file"`: the value must be pre-resolved before HTML generation —
 * the caller should replace file sources with inline values.
 *
 * @param data - Data sources from SketchDefinition.data
 * @param components - Component definitions (to find factory export names)
 * @returns JS code string to inject after state is constructed
 */
export function generateDataInjection(
  data?: Readonly<Record<string, SketchDataSource>>,
  components?: Readonly<Record<string, SketchComponentValue>>,
): string {
  if (!data || Object.keys(data).length === 0) return '';

  const hasComponentSources = Object.values(data).some(s => s.source === 'component');

  const lines: string[] = ['state.data = {};'];

  // Provide a local PRNG for component data source initialization
  if (hasComponentSources) {
    lines.push(
      `var __dataRand = (typeof mulberry32 === "function") ? mulberry32(state.seed) : (function(s) { return function() { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(state.seed);`,
    );
  }

  for (const [key, source] of Object.entries(data)) {
    if (source.source === 'inline') {
      lines.push(`state.data[${JSON.stringify(key)}] = ${JSON.stringify(source.value)};`);
    } else if (source.source === 'component') {
      // Find the factory function name from the component's exports
      const factoryName = resolveFactoryName(source.component, components);
      if (factoryName) {
        const configJson = JSON.stringify(source.config ?? {});
        lines.push(
          `state.data[${JSON.stringify(key)}] = ${factoryName}(${configJson}, { seed: state.seed, rand: __dataRand, width: state.canvas.width, height: state.canvas.height });`,
        );
      }
    } else if (source.source === 'file') {
      // File sources must be pre-resolved to inline values before HTML generation.
      // If we still see one here, inject null and log a warning.
      lines.push(
        `state.data[${JSON.stringify(key)}] = null; /* WARNING: unresolved file source "${source.path}" */`,
      );
    }
  }

  return lines.join('\n      ');
}

/**
 * Resolve the factory function name for a data source component.
 * Convention: the component's first export is the factory function.
 */
function resolveFactoryName(
  componentName?: string,
  components?: Readonly<Record<string, SketchComponentValue>>,
): string | undefined {
  if (!componentName || !components) return undefined;
  const comp = components[componentName];
  if (!comp || typeof comp === 'string') return undefined;
  return comp.exports?.[0];
}

/**
 * Pre-resolve file-based data sources by replacing them with inline values.
 * Call this before generating standalone HTML so that `generateDataInjection`
 * can handle all sources without async file I/O.
 *
 * @param data - Data sources from SketchDefinition.data
 * @param resolvedFiles - Map of path → parsed value from .genart-data files
 * @returns New data record with file sources converted to inline
 */
export function resolveFileDataSources(
  data: Readonly<Record<string, SketchDataSource>>,
  resolvedFiles: Readonly<Record<string, unknown>>,
): Record<string, SketchDataSource> {
  const result: Record<string, SketchDataSource> = {};
  for (const [key, source] of Object.entries(data)) {
    if (source.source === 'file' && source.path && source.path in resolvedFiles) {
      result[key] = {
        type: source.type,
        source: 'inline',
        value: resolvedFiles[source.path],
      };
    } else {
      result[key] = source;
    }
  }
  return result;
}
