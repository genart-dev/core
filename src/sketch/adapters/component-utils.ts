import type { SketchComponentValue } from "@genart-dev/format";

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
