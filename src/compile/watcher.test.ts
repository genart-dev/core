import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { watchProject } from "./watcher.js";
import type { CompileResult, CompileError } from "./types.js";

const FIXTURES = join(import.meta.dirname, "__fixtures__");

describe("watchProject", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "genart-watch-"));
    // Copy minimal fixture
    const srcDir = join(FIXTURES, "minimal");
    await writeFile(
      join(tmp, "sketch.js"),
      await readFile(join(srcDir, "sketch.js"), "utf-8"),
    );
    await writeFile(
      join(tmp, "sketch.meta.json"),
      await readFile(join(srcDir, "sketch.meta.json"), "utf-8"),
    );
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true });
  });

  it("compiles on file change and calls onChange with result", async () => {
    const results: (CompileResult | { errors: readonly CompileError[] })[] = [];

    const watcher = watchProject(
      tmp,
      (result) => results.push(result),
      { debounce: 50 },
    );

    try {
      // Trigger a change by modifying sketch.js
      const original = await readFile(join(tmp, "sketch.js"), "utf-8");
      await writeFile(
        join(tmp, "sketch.js"),
        original + "\n// modified",
      );

      // Wait for debounce + compilation
      await new Promise((r) => setTimeout(r, 500));

      expect(results.length).toBeGreaterThanOrEqual(1);

      const last = results[results.length - 1];
      expect("sketch" in last).toBe(true);
      expect((last as CompileResult).sketch.title).toBe("Minimal Test");
    } finally {
      watcher.close();
    }
  });

  it("reports errors on invalid changes", async () => {
    const results: (CompileResult | { errors: readonly CompileError[] })[] = [];

    const watcher = watchProject(
      tmp,
      (result) => results.push(result),
      { debounce: 50 },
    );

    try {
      // Break the sketch
      await writeFile(join(tmp, "sketch.js"), "const x = 42;");

      await new Promise((r) => setTimeout(r, 500));

      expect(results.length).toBeGreaterThanOrEqual(1);

      const last = results[results.length - 1];
      expect("errors" in last).toBe(true);
      expect((last as { errors: CompileError[] }).errors.length).toBeGreaterThan(0);
    } finally {
      watcher.close();
    }
  });

  it("ignores changes to sketch.genart output file", async () => {
    const results: (CompileResult | { errors: readonly CompileError[] })[] = [];

    const watcher = watchProject(
      tmp,
      (result) => results.push(result),
      { debounce: 50 },
    );

    try {
      // Let FSEvents settle from beforeEach file copies
      await new Promise((r) => setTimeout(r, 300));
      const baseline = results.length;

      // Write to the output file — should be ignored
      await writeFile(join(tmp, "sketch.genart"), "{}");

      await new Promise((r) => setTimeout(r, 300));

      expect(results.length).toBe(baseline);
    } finally {
      watcher.close();
    }
  });

  it("closes cleanly", async () => {
    const results: (CompileResult | { errors: readonly CompileError[] })[] = [];

    const watcher = watchProject(
      tmp,
      (result) => results.push(result),
      { debounce: 50 },
    );

    watcher.close();

    // Changes after close should not trigger callbacks
    await writeFile(
      join(tmp, "sketch.js"),
      'function sketch(p,s){p.setup=()=>p.createCanvas(100,100);p.draw=()=>p.background(0);}',
    );

    await new Promise((r) => setTimeout(r, 300));

    expect(results.length).toBe(0);
  });
});
