import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { parseGenart, serializeGenart } from "@genart-dev/format";
import { compileProject, discoverProject } from "./compiler.js";
import { CompileFailure } from "./types.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");

describe("discoverProject", () => {
  it("discovers a minimal project", async () => {
    const project = await discoverProject(join(FIXTURES, "minimal"));
    expect(project.sketchFile).toBe("sketch.js");
    expect(project.metaFile).toBe("sketch.meta.json");
    expect(project.componentFiles).toEqual([]);
  });

  it("discovers a project with components", async () => {
    const project = await discoverProject(
      join(FIXTURES, "with-components"),
    );
    expect(project.sketchFile).toBe("sketch.js");
    expect(project.componentFiles).toEqual(["components/helpers.js"]);
  });

  it("discovers a GLSL project", async () => {
    const project = await discoverProject(join(FIXTURES, "glsl"));
    expect(project.sketchFile).toBe("sketch.frag");
    expect(project.componentFiles).toEqual([]);
  });

  it("throws on missing meta file", async () => {
    await expect(
      discoverProject(join(FIXTURES, "invalid/missing-meta")),
    ).rejects.toThrow(CompileFailure);
    await expect(
      discoverProject(join(FIXTURES, "invalid/missing-meta")),
    ).rejects.toThrow("Missing sketch.meta.json");
  });

  it("throws when no sketch file exists", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "genart-test-"));
    await writeFile(join(tmp, "sketch.meta.json"), "{}");
    try {
      await expect(discoverProject(tmp)).rejects.toThrow(
        "No sketch source file found",
      );
    } finally {
      await rm(tmp, { recursive: true });
    }
  });
});

describe("compileProject", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "genart-compile-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true });
  });

  it("compiles a minimal p5 project", async () => {
    const outputPath = join(outputDir, "out.genart");
    const result = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });

    expect(result.warnings).toEqual([]);
    expect(result.sketch.title).toBe("Minimal Test");
    expect(result.sketch.renderer).toEqual({ type: "p5" });
    expect(result.sketch.canvas).toEqual({
      preset: "square-600",
      width: 600,
      height: 600,
    });
    expect(result.sketch.parameters).toHaveLength(1);
    expect(result.sketch.parameters[0].key).toBe("size");
    expect(result.sketch.colors).toHaveLength(2);
    expect(result.sketch.algorithm).toContain("function sketch(p, state)");
    expect(result.sketch.genart).toBe("1.1");
    expect(result.sketch.id).toBe("minimal-test");
    expect(result.duration).toBeGreaterThan(0);

    // Verify file was written
    const raw = await readFile(outputPath, "utf-8");
    const parsed = parseGenart(JSON.parse(raw));
    expect(parsed.title).toBe("Minimal Test");
  });

  it("compiles a project with local and registry components", async () => {
    const outputPath = join(outputDir, "out.genart");
    const result = await compileProject({
      projectDir: join(FIXTURES, "with-components"),
      outputPath,
    });

    expect(result.sketch.components).toBeDefined();

    // Registry component (prng) should be resolved
    const prng = result.sketch.components!["prng"];
    expect(typeof prng).toBe("object");
    expect((prng as { code: string }).code).toBeTruthy();

    // Local component (helpers) should be inline
    const helpers = result.sketch.components!["helpers"];
    expect(typeof helpers).toBe("object");
    expect((helpers as { exports: string[] }).exports).toEqual([
      "drawDot",
      "drawLine",
    ]);
  });

  it("compiles a GLSL project", async () => {
    const outputPath = join(outputDir, "out.genart");
    const result = await compileProject({
      projectDir: join(FIXTURES, "glsl"),
      outputPath,
    });

    expect(result.sketch.renderer).toEqual({ type: "glsl" });
    expect(result.sketch.algorithm).toContain("#version 300 es");
    expect(result.sketch.algorithm).toContain("void main()");
  });

  it("generates default state from parameter/color defaults", async () => {
    const outputPath = join(outputDir, "out.genart");
    const result = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });

    expect(result.sketch.state.params).toHaveProperty("size", 0.5);
    expect(result.sketch.state.colorPalette).toEqual(["#1a1a1a", "#ffffff"]);
    expect(result.sketch.state.seed).toBeGreaterThanOrEqual(0);
  });

  it("preserves state from existing .genart output", async () => {
    const outputPath = join(outputDir, "out.genart");

    // First compile
    await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });

    // Modify the output to have specific state
    const raw = JSON.parse(await readFile(outputPath, "utf-8"));
    raw.state = { seed: 12345, params: { size: 0.8 }, colorPalette: ["#ff0000", "#00ff00"] };
    await writeFile(outputPath, JSON.stringify(raw, null, 2));

    // Recompile with preserveState (default)
    const result = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });

    expect(result.sketch.state.seed).toBe(12345);
    expect(result.sketch.state.params.size).toBe(0.8);
  });

  it("does not preserve state when preserveState is false", async () => {
    const outputPath = join(outputDir, "out.genart");

    // First compile
    await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });

    // Modify state
    const raw = JSON.parse(await readFile(outputPath, "utf-8"));
    raw.state = { seed: 12345, params: { size: 0.8 }, colorPalette: ["#ff0000", "#00ff00"] };
    await writeFile(outputPath, JSON.stringify(raw, null, 2));

    // Recompile without preserving state
    const result = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
      preserveState: false,
    });

    // State should be fresh from defaults
    expect(result.sketch.state.params.size).toBe(0.5);
    expect(result.sketch.state.colorPalette).toEqual(["#1a1a1a", "#ffffff"]);
  });

  it("throws CompileFailure on invalid algorithm", async () => {
    const outputPath = join(outputDir, "out.genart");
    await expect(
      compileProject({
        projectDir: join(FIXTURES, "invalid/bad-algorithm"),
        outputPath,
      }),
    ).rejects.toThrow(CompileFailure);
  });

  it("throws CompileFailure on missing @exports", async () => {
    const outputPath = join(outputDir, "out.genart");
    await expect(
      compileProject({
        projectDir: join(FIXTURES, "invalid/bad-exports"),
        outputPath,
      }),
    ).rejects.toThrow("Missing // @exports:");
  });

  it("defaults output path to projectDir/sketch.genart", async () => {
    // Create a temp project from minimal fixture
    const tmp = await mkdtemp(join(tmpdir(), "genart-default-out-"));
    const srcDir = join(FIXTURES, "minimal");
    await writeFile(
      join(tmp, "sketch.js"),
      await readFile(join(srcDir, "sketch.js"), "utf-8"),
    );
    await writeFile(
      join(tmp, "sketch.meta.json"),
      await readFile(join(srcDir, "sketch.meta.json"), "utf-8"),
    );

    try {
      const result = await compileProject({ projectDir: tmp });
      expect(result.outputPath).toBe(join(tmp, "sketch.genart"));

      // Verify the file exists
      const raw = await readFile(result.outputPath, "utf-8");
      expect(JSON.parse(raw).title).toBe("Minimal Test");
    } finally {
      await rm(tmp, { recursive: true });
    }
  });

  it("preserves created timestamp across recompiles", async () => {
    const outputPath = join(outputDir, "out.genart");

    const first = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });
    const created = first.sketch.created;

    // Small delay to ensure timestamps differ
    await new Promise((r) => setTimeout(r, 10));

    const second = await compileProject({
      projectDir: join(FIXTURES, "minimal"),
      outputPath,
    });

    expect(second.sketch.created).toBe(created);
    expect(second.sketch.modified).not.toBe(first.sketch.modified);
  });
});
