import type { SketchComponentValue, SketchSymbolValue } from "@genart-dev/format";

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
