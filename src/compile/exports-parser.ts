/**
 * Parses the `// @exports: fn1, fn2` leading comment from component source files.
 *
 * The comment must appear within the first 10 lines of the file. Supports
 * both single-line (`// @exports:`) and block (`/* @exports: *​/`) syntax.
 *
 * @param source - Component source code.
 * @returns Array of exported names, or `null` if no @exports comment is found.
 * @throws If @exports comment is found but contains invalid identifiers.
 */
export function parseExportsComment(source: string): string[] | null {
  const lines = source.split("\n").slice(0, 10);

  for (const line of lines) {
    const trimmed = line.trim();

    // Single-line: // @exports: fn1, fn2
    const singleMatch = trimmed.match(/^\/\/\s*@exports:\s*(.+)$/);
    if (singleMatch?.[1]) {
      return parseNames(singleMatch[1]);
    }

    // Block comment: /* @exports: fn1, fn2 */
    const blockMatch = trimmed.match(/^\/\*\s*@exports:\s*(.+?)\s*\*\/$/);
    if (blockMatch?.[1]) {
      return parseNames(blockMatch[1]);
    }
  }

  return null;
}

/** Valid JavaScript identifier pattern. */
const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Split comma-separated names and validate each as a JS identifier. */
function parseNames(raw: string): string[] {
  const names = raw
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    throw new Error("@exports comment has no export names");
  }

  for (const name of names) {
    if (!IDENTIFIER_RE.test(name)) {
      throw new Error(
        `Invalid export name "${name}" — must be a valid JavaScript identifier`,
      );
    }
  }

  return names;
}
