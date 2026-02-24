import type {
  RendererType,
  SketchState,
  CanvasSpec,
  SketchDefinition,
} from "@genart-dev/format";
import type { ResolvedComponent } from "@genart-dev/components";
import type {
  RendererAdapter,
  ValidationResult,
  CompiledAlgorithm,
  SketchInstance,
  CaptureOptions,
  RuntimeDependency,
} from "../../types.js";
import { extractComponentCode } from "./component-utils.js";

const P5_CDN_VERSION = "1.11.3";
const P5_CDN_URL = `https://cdnjs.cloudflare.com/ajax/libs/p5.js/${P5_CDN_VERSION}/p5.min.js`;

/**
 * Compiled p5 algorithm — wraps the algorithm source string
 * and a factory function for creating p5 instance-mode sketches.
 */
interface P5CompiledAlgorithm {
  source: string;
  factory: (p: unknown, state: SketchState) => unknown;
}

/**
 * P5 Renderer Adapter — full implementation.
 *
 * Validates algorithms for the `sketch(p, state)` instance-mode signature,
 * compiles them into executable factories, and creates live sketch instances.
 */
export class P5RendererAdapter implements RendererAdapter {
  readonly type: RendererType = "p5";
  readonly displayName = "p5.js";
  readonly algorithmLanguage = "javascript" as const;

  validate(algorithm: string): ValidationResult {
    const errors: string[] = [];

    if (!algorithm || algorithm.trim().length === 0) {
      return { valid: false, errors: ["Algorithm source is empty"] };
    }

    // Check for the instance-mode sketch function signature
    const hasSketchFn =
      /function\s+sketch\s*\(\s*p\s*,\s*state\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*(?:function\s*)?\(\s*p\s*,\s*state\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*\(\s*p\s*,\s*state\s*\)\s*=>/.test(algorithm);

    if (!hasSketchFn) {
      errors.push(
        'p5 algorithms must export a function with signature: function sketch(p, state)',
      );
    }

    // Check for p.setup assignment
    const hasSetup = /p\s*\.\s*setup\s*=/.test(algorithm);
    if (!hasSetup) {
      errors.push("p5 algorithms must assign p.setup");
    }

    return { valid: errors.length === 0, errors };
  }

  async compile(algorithm: string, components?: ResolvedComponent[]): Promise<CompiledAlgorithm> {
    const validation = this.validate(algorithm);
    if (!validation.valid) {
      throw new Error(
        `p5 compilation failed: ${validation.errors.join("; ")}`,
      );
    }

    const componentCode = components?.map(c =>
      `// --- ${c.name} v${c.version} ---\n${c.code}`
    ).join('\n\n') ?? '';

    // Wrap the algorithm source into a factory function
    // The factory takes (p, state) and returns the sketch module
    const wrappedSource = `
      return (function() {
        ${componentCode}
        ${algorithm}
        return sketch;
      })();
    `;

    try {
      const factory = new Function(wrappedSource) as () => (
        p: unknown,
        state: SketchState,
      ) => unknown;
      const compiled: P5CompiledAlgorithm = {
        source: algorithm,
        factory: factory(),
      };
      return compiled;
    } catch (err) {
      throw new Error(
        `p5 compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { factory } = compiled as P5CompiledAlgorithm;

    let p5Instance: Record<string, unknown> | null = null;
    let container: HTMLElement | null = null;
    let currentState = { ...state };
    let animating = true;
    let sketchModule: Record<string, unknown> | null = null;

    const instance: SketchInstance = {
      mount(el: HTMLElement) {
        container = el;

        // Requires p5 to be available globally or as a module
        const P5Constructor = (globalThis as Record<string, unknown>)[
          "p5"
        ] as new (
          sketch: (p: Record<string, unknown>) => void,
          container: HTMLElement,
        ) => Record<string, unknown>;

        if (!P5Constructor) {
          throw new Error(
            "p5.js is not loaded. Include p5.js before mounting a p5 sketch.",
          );
        }

        p5Instance = new P5Constructor((p: Record<string, unknown>) => {
          sketchModule = factory(p, currentState) as Record<string, unknown>;
        }, el);
      },

      unmount() {
        if (p5Instance && typeof p5Instance["remove"] === "function") {
          (p5Instance["remove"] as () => void)();
        }
        p5Instance = null;
        sketchModule = null;
        container = null;
      },

      updateState(newState: SketchState) {
        currentState = { ...newState };
        if (
          sketchModule &&
          typeof sketchModule["initializeSystem"] === "function"
        ) {
          (sketchModule["initializeSystem"] as () => void)();
        }
      },

      redraw() {
        if (p5Instance && typeof p5Instance["redraw"] === "function") {
          (p5Instance["redraw"] as () => void)();
        }
      },

      pause() {
        animating = false;
        if (p5Instance && typeof p5Instance["noLoop"] === "function") {
          (p5Instance["noLoop"] as () => void)();
        }
      },

      resume() {
        animating = true;
        if (p5Instance && typeof p5Instance["loop"] === "function") {
          (p5Instance["loop"] as () => void)();
        }
      },

      get isAnimating() {
        return animating;
      },

      async captureFrame(options?: CaptureOptions): Promise<string> {
        if (!container) throw new Error("Sketch is not mounted");
        const canvasEl = container.querySelector("canvas");
        if (!canvasEl) throw new Error("No canvas element found");

        const format = options?.format ?? "png";
        const quality = options?.quality ?? 1.0;
        const mimeType =
          format === "jpeg"
            ? "image/jpeg"
            : format === "webp"
              ? "image/webp"
              : "image/png";

        return canvasEl.toDataURL(mimeType, quality);
      },

      async captureImageData(): Promise<ImageData> {
        if (!container) throw new Error("Sketch is not mounted");
        const canvasEl = container.querySelector("canvas");
        if (!canvasEl) throw new Error("No canvas element found");
        const ctx = canvasEl.getContext("2d");
        if (!ctx) throw new Error("Cannot get 2D context from canvas");
        return ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      },

      dispose() {
        instance.unmount();
      },
    };

    return instance;
  }

  async renderOffscreen(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
    options?: CaptureOptions,
  ): Promise<Uint8Array | Blob> {
    // Offscreen rendering requires a DOM context (browser or jsdom)
    // This creates a temporary container, mounts, captures, and unmounts
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);

    try {
      const instance = this.createInstance(compiled, state, canvas);
      instance.mount(el);

      // Wait for setup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const dataUrl = await instance.captureFrame(options);
      instance.dispose();

      // Convert data URL to Uint8Array
      const base64 = dataUrl.split(",")[1] ?? "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } finally {
      document.body.removeChild(el);
    }
  }

  generateStandaloneHTML(sketch: SketchDefinition): string {
    const { width, height } = sketch.canvas;
    const pixelDensity = sketch.canvas.pixelDensity ?? 1;

    const stateJson = JSON.stringify(sketch.state, null, 2);

    // Build a keyed COLORS object from ColorDef keys → colorPalette values
    // so algorithms can use state.COLORS.bg instead of state.colorPalette[0].
    const colorsMap: Record<string, string> = {};
    for (let i = 0; i < sketch.colors.length; i++) {
      const colorDef = sketch.colors[i];
      if (colorDef) {
        colorsMap[colorDef.key] = sketch.state.colorPalette[i] ?? "#000000";
      }
    }
    const colorsJson = JSON.stringify(colorsMap);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sketch.title)}</title>
  <script src="${P5_CDN_URL}"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #111; }
    #canvas-container canvas { display: block; max-width: 100vw; max-height: 100vh; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <script>
    const state = ${stateJson};
    state.canvas = { width: ${width}, height: ${height}, pixelDensity: ${pixelDensity} };
    // Convenience aliases — algorithms may use either naming convention
    state.WIDTH = ${width};
    state.HEIGHT = ${height};
    state.SEED = state.seed;
    state.PARAMS = state.params;
    state.COLORS = ${colorsJson};

    ${extractComponentCode(sketch.components)}
    ${sketch.algorithm}

    new p5(function(p) {
      sketch(p, state);
    }, document.getElementById('canvas-container'));
  </script>
</body>
</html>`;
  }

  getAlgorithmTemplate(): string {
    return `function sketch(p, state) {
  const { WIDTH, HEIGHT, SEED, PARAMS, COLORS } = state;
  p.setup = () => {
    p.createCanvas(WIDTH, HEIGHT);
    p.randomSeed(SEED);
  };
  p.draw = () => {
    p.background(COLORS.background);
    // generative algorithm here
  };
  return { initializeSystem() { /* rebuild from state */ } };
}`;
  }

  getRuntimeDependencies(): RuntimeDependency[] {
    return [
      {
        name: "p5",
        version: P5_CDN_VERSION,
        cdnUrl: P5_CDN_URL,
      },
    ];
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
