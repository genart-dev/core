import { describe, it, expect } from "vitest";
import { parseExportsComment } from "./exports-parser.js";

describe("parseExportsComment", () => {
  it("parses single-line comment", () => {
    const source = `// @exports: waveLine, waveGrid, waveCircle

function waveLine() {}`;
    expect(parseExportsComment(source)).toEqual([
      "waveLine",
      "waveGrid",
      "waveCircle",
    ]);
  });

  it("parses block comment", () => {
    const source = `/* @exports: mulberry32, sfc32 */

function mulberry32(a) {}`;
    expect(parseExportsComment(source)).toEqual(["mulberry32", "sfc32"]);
  });

  it("parses single export", () => {
    const source = `// @exports: helper\nfunction helper() {}`;
    expect(parseExportsComment(source)).toEqual(["helper"]);
  });

  it("handles extra whitespace around names", () => {
    const source = `// @exports:   foo ,  bar  ,  baz  `;
    expect(parseExportsComment(source)).toEqual(["foo", "bar", "baz"]);
  });

  it("handles indented comment", () => {
    const source = `  // @exports: fn1, fn2`;
    expect(parseExportsComment(source)).toEqual(["fn1", "fn2"]);
  });

  it("returns null when no @exports comment is found", () => {
    const source = `function doStuff() { return 42; }`;
    expect(parseExportsComment(source)).toBeNull();
  });

  it("returns null when @exports is beyond line 10", () => {
    const lines = Array(10).fill("// some other comment");
    lines.push("// @exports: tooLate");
    expect(parseExportsComment(lines.join("\n"))).toBeNull();
  });

  it("finds @exports within first 10 lines", () => {
    const lines = Array(8).fill("// some comment");
    lines.push("// @exports: found");
    expect(parseExportsComment(lines.join("\n"))).toEqual(["found"]);
  });

  it("supports underscores and dollar signs in names", () => {
    const source = `// @exports: _private, $special, camelCase123`;
    expect(parseExportsComment(source)).toEqual([
      "_private",
      "$special",
      "camelCase123",
    ]);
  });

  it("throws on invalid identifier", () => {
    const source = `// @exports: valid, 123invalid`;
    expect(() => parseExportsComment(source)).toThrow(
      'Invalid export name "123invalid"',
    );
  });

  it("throws on identifier with spaces", () => {
    const source = `// @exports: two words`;
    expect(() => parseExportsComment(source)).toThrow(
      'Invalid export name "two words"',
    );
  });

  it("returns null for empty exports value (no match)", () => {
    // Trailing whitespace only — regex requires at least one char after colon
    const source = `// @exports: `;
    expect(parseExportsComment(source)).toBeNull();
  });

  it("ignores trailing commas", () => {
    const source = `// @exports: foo, bar,`;
    expect(parseExportsComment(source)).toEqual(["foo", "bar"]);
  });
});
