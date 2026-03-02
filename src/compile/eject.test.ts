import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import type { SketchDefinition } from "@genart-dev/format";
import { ejectProject } from "./eject.js";
import { compileProject } from "./compiler.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");

function makeSketch(overrides: Partial<SketchDefinition> = {}): SketchDefinition {
  return {
    genart: "1.1",
    id: "test-sketch",
    title: "Test Sketch",
    created: "2026-03-01T00:00:00.000Z",
    modified: "2026-03-01T00:00:00.000Z",
    renderer: { type: "p5" },
    canvas: { preset: "square-600", width: 600, height: 600 },
    parameters: [
      { key: "size", label: "Size", min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    colors: [
      { key: "bg", label: "Background", default: "#1a1a1a" },
    ],
    state: {
      seed: 42,
      params: { size: 0.5 },
      colorPalette: ["#1a1a1a"],
    },
    algorithm: 'function sketch(p, state) {\n  p.setup = () => p.createCanvas(600, 600);\n  p.draw = () => p.background(0);\n}',
    ...overrides,
  };
}

describe("ejectProject", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "genart-eject-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true });
  });

  it("ejects a basic JS sketch", async () => {
    await ejectProject(makeSketch(), outputDir);

    // Check sketch.js
    const js = await readFile(join(outputDir, "sketch.js"), "utf-8");
    expect(js).toContain("function sketch(p, state)");

    // Check sketch.meta.json
    const meta = JSON.parse(
      await readFile(join(outputDir, "sketch.meta.json"), "utf-8"),
    );
    expect(meta.title).toBe("Test Sketch");
    expect(meta.renderer).toEqual({ type: "p5" });
    expect(meta.parameters).toHaveLength(1);
    expect(meta.state.seed).toBe(42);

    // No components directory should exist
    await expect(stat(join(outputDir, "components"))).rejects.toThrow();
  });

  it("ejects a GLSL sketch to sketch.frag", async () => {
    const glsl = makeSketch({
      renderer: { type: "glsl" },
      algorithm: "#version 300 es\nprecision highp float;\nvoid main() {}",
    });
    await ejectProject(glsl, outputDir);

    const frag = await readFile(join(outputDir, "sketch.frag"), "utf-8");
    expect(frag).toContain("#version 300 es");

    // No sketch.js should exist
    await expect(stat(join(outputDir, "sketch.js"))).rejects.toThrow();
  });

  it("extracts inline components to files", async () => {
    const sketch = makeSketch({
      components: {
        helpers: {
          code: 'function drawDot(ctx, x, y, r) {\n  ctx.beginPath();\n  ctx.arc(x, y, r, 0, Math.PI * 2);\n  ctx.fill();\n}',
          exports: ["drawDot"],
        },
      },
    });
    await ejectProject(sketch, outputDir);

    const helperSrc = await readFile(
      join(outputDir, "components/helpers.js"),
      "utf-8",
    );
    expect(helperSrc).toContain("// @exports: drawDot");
    expect(helperSrc).toContain("function drawDot(");

    // Inline component should NOT be in meta
    const meta = JSON.parse(
      await readFile(join(outputDir, "sketch.meta.json"), "utf-8"),
    );
    expect(meta.components).toBeUndefined();
  });

  it("keeps registry components in meta", async () => {
    const sketch = makeSketch({
      components: {
        prng: "^1.0.0",
        helpers: {
          code: "function foo() {}",
          exports: ["foo"],
        },
      },
    });
    await ejectProject(sketch, outputDir);

    const meta = JSON.parse(
      await readFile(join(outputDir, "sketch.meta.json"), "utf-8"),
    );
    expect(meta.components).toEqual({ prng: "^1.0.0" });

    // Inline component extracted to file
    const helperSrc = await readFile(
      join(outputDir, "components/helpers.js"),
      "utf-8",
    );
    expect(helperSrc).toContain("// @exports: foo");
  });

  it("preserves optional fields in meta", async () => {
    const sketch = makeSketch({
      philosophy: "# Test\nA test sketch.",
      skills: ["color-theory"],
      agent: "claude-code",
      model: "claude-opus-4-6",
      themes: [{ name: "Dark", colors: ["#000000"] }],
    });
    await ejectProject(sketch, outputDir);

    const meta = JSON.parse(
      await readFile(join(outputDir, "sketch.meta.json"), "utf-8"),
    );
    expect(meta.philosophy).toBe("# Test\nA test sketch.");
    expect(meta.skills).toEqual(["color-theory"]);
    expect(meta.agent).toBe("claude-code");
    expect(meta.model).toBe("claude-opus-4-6");
    expect(meta.themes).toHaveLength(1);
  });

  it("omits empty arrays from meta", async () => {
    const sketch = makeSketch({
      parameters: [],
      colors: [],
    });
    await ejectProject(sketch, outputDir);

    const meta = JSON.parse(
      await readFile(join(outputDir, "sketch.meta.json"), "utf-8"),
    );
    expect(meta.parameters).toBeUndefined();
    expect(meta.colors).toBeUndefined();
  });
});

describe("round-trip: compile → eject → recompile", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "genart-roundtrip-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true });
  });

  it("minimal project round-trips", async () => {
    // Compile
    const genartPath = join(outputDir, "first.genart");
    const first = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath: genartPath,
    });

    // Eject
    const ejectedDir = join(outputDir, "ejected");
    await ejectProject(first.sketch, ejectedDir);

    // Recompile from ejected
    const recompiledPath = join(outputDir, "second.genart");
    const second = await compileProject({
      projectDir: ejectedDir,
      outputPath: recompiledPath,
      preserveState: false,
    });

    // Compare key fields
    expect(second.sketch.title).toBe(first.sketch.title);
    expect(second.sketch.renderer).toEqual(first.sketch.renderer);
    expect(second.sketch.canvas).toEqual(first.sketch.canvas);
    expect(second.sketch.parameters).toEqual(first.sketch.parameters);
    expect(second.sketch.colors).toEqual(first.sketch.colors);
    expect(second.sketch.algorithm).toBe(first.sketch.algorithm);
  });

  it("project with components round-trips", async () => {
    const genartPath = join(outputDir, "first.genart");
    const first = await compileProject({
      projectDir: join(FIXTURES, "with-components"),
      outputPath: genartPath,
    });

    const ejectedDir = join(outputDir, "ejected");
    await ejectProject(first.sketch, ejectedDir);

    const recompiledPath = join(outputDir, "second.genart");
    const second = await compileProject({
      projectDir: ejectedDir,
      outputPath: recompiledPath,
      preserveState: false,
    });

    expect(second.sketch.title).toBe(first.sketch.title);
    expect(second.sketch.algorithm).toBe(first.sketch.algorithm);

    // Both should have the same component names
    const firstNames = Object.keys(first.sketch.components ?? {}).sort();
    const secondNames = Object.keys(second.sketch.components ?? {}).sort();
    expect(secondNames).toEqual(firstNames);
  });
});
