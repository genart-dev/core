import { describe, it, expect } from "vitest";
import { extractComponentCode } from "./component-utils.js";

describe("extractComponentCode", () => {
  it("returns empty string for undefined components", () => {
    expect(extractComponentCode(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(extractComponentCode({})).toBe("");
  });

  it("skips string values (unresolved version ranges)", () => {
    expect(extractComponentCode({ prng: "^1.0.0" })).toBe("");
  });

  it("extracts code from object values", () => {
    const result = extractComponentCode({
      prng: { version: "1.0.0", code: "function mulberry32(a) { return a; }" },
    });
    expect(result).toContain("prng v1.0.0");
    expect(result).toContain("function mulberry32(a)");
  });

  it("skips objects without code", () => {
    const result = extractComponentCode({
      prng: { version: "1.0.0" },
    });
    expect(result).toBe("");
  });

  it("handles mixed values", () => {
    const result = extractComponentCode({
      prng: { version: "1.0.0", code: "// prng code" },
      "noise-2d": "^1.0.0",
      math: { code: "// math code" },
    });
    expect(result).toContain("prng v1.0.0");
    expect(result).toContain("// prng code");
    expect(result).toContain("math");
    expect(result).toContain("// math code");
    expect(result).not.toContain("noise-2d");
  });

  it("omits version suffix when version is absent", () => {
    const result = extractComponentCode({
      custom: { code: "// inline custom" },
    });
    expect(result).toContain("// --- custom ---");
    expect(result).toContain("// inline custom");
  });
});

import { extractSymbolData } from "./component-utils.js";

describe("extractSymbolData", () => {
  it("returns empty string for undefined symbols", () => {
    expect(extractSymbolData(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(extractSymbolData({})).toBe("");
  });

  it("skips string values (unresolved registry refs)", () => {
    expect(extractSymbolData({ "pine-tree": "pine-tree" })).toBe("");
  });

  it("generates __symbols__ declaration for resolved defs", () => {
    const result = extractSymbolData({
      "pine-tree": {
        id: "pine-tree",
        name: "Pine Tree",
        style: "geometric" as const,
        paths: [{ d: "M50 5 L80 50 L20 50 Z", fill: "#2d6a4f" }],
        viewBox: "0 0 100 120",
      },
    });
    expect(result).toContain("const __symbols__ =");
    expect(result).toContain("pine-tree");
    expect(result).toContain("M50 5 L80 50 L20 50 Z");
  });

  it("skips string refs but includes resolved defs in mixed input", () => {
    const result = extractSymbolData({
      "oak-tree": "oak-tree",
      "sailboat": {
        id: "sailboat",
        paths: [{ d: "M50 10 L50 80 L20 80 Z" }],
        viewBox: "0 0 100 110",
      },
    });
    expect(result).toContain("sailboat");
    expect(result).not.toContain('"oak-tree": "oak-tree"');
  });

  it("returns valid JSON in the declaration", () => {
    const def = {
      id: "test",
      paths: [{ d: "M0 0 L100 100" }],
      viewBox: "0 0 100 100",
    };
    const result = extractSymbolData({ test: def });
    const match = result.match(/const __symbols__ = (.+);/s);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed.test.id).toBe("test");
  });
});
