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
