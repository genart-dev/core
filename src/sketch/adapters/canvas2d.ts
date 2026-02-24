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
import { generateCompositorScript, generateCompositorCall } from "../../design/iframe-compositor.js";

/**
 * Compiled Canvas 2D algorithm — wraps the algorithm source string
 * and a factory function for creating canvas sketches.
 */
interface Canvas2DCompiledAlgorithm {
  source: string;
  factory: (
    ctx: CanvasRenderingContext2D,
    state: SketchState,
  ) => Record<string, unknown>;
}

/**
 * Canvas 2D Renderer Adapter — full implementation.
 *
 * Validates algorithms for the `sketch(ctx, state)` function signature,
 * compiles them into executable factories, and creates live sketch instances.
 */
export class Canvas2DRendererAdapter implements RendererAdapter {
  readonly type: RendererType = "canvas2d";
  readonly displayName = "Canvas 2D";
  readonly algorithmLanguage = "javascript" as const;

  validate(algorithm: string): ValidationResult {
    const errors: string[] = [];

    if (!algorithm || algorithm.trim().length === 0) {
      return { valid: false, errors: ["Algorithm source is empty"] };
    }

    // Check for the canvas2d sketch function signature
    const hasSketchFn =
      /function\s+sketch\s*\(\s*ctx\s*,\s*state\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*(?:function\s*)?\(\s*ctx\s*,\s*state\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*\(\s*ctx\s*,\s*state\s*\)\s*=>/.test(algorithm);

    if (!hasSketchFn) {
      errors.push(
        'Canvas 2D algorithms must export a function with signature: function sketch(ctx, state)',
      );
    }

    return { valid: errors.length === 0, errors };
  }

  async compile(algorithm: string, components?: ResolvedComponent[]): Promise<CompiledAlgorithm> {
    const validation = this.validate(algorithm);
    if (!validation.valid) {
      throw new Error(
        `Canvas 2D compilation failed: ${validation.errors.join("; ")}`,
      );
    }

    const componentCode = components?.map(c =>
      `// --- ${c.name} v${c.version} ---\n${c.code}`
    ).join('\n\n') ?? '';

    const wrappedSource = `
      return (function() {
        ${componentCode}
        ${algorithm}
        return sketch;
      })();
    `;

    try {
      const factory = new Function(wrappedSource) as () => (
        ctx: CanvasRenderingContext2D,
        state: SketchState,
      ) => Record<string, unknown>;
      const compiled: Canvas2DCompiledAlgorithm = {
        source: algorithm,
        factory: factory(),
      };
      return compiled;
    } catch (err) {
      throw new Error(
        `Canvas 2D compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { factory } = compiled as Canvas2DCompiledAlgorithm;

    let canvasEl: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let container: HTMLElement | null = null;
    let currentState = { ...state };
    let animating = false;
    let animationFrameId: number | null = null;
    let sketchModule: Record<string, unknown> | null = null;

    const instance: SketchInstance = {
      mount(el: HTMLElement) {
        container = el;
        canvasEl = document.createElement("canvas");
        canvasEl.width = canvas.width;
        canvasEl.height = canvas.height;

        const density = canvas.pixelDensity ?? 1;
        if (density !== 1) {
          canvasEl.width = canvas.width * density;
          canvasEl.height = canvas.height * density;
          canvasEl.style.width = `${canvas.width}px`;
          canvasEl.style.height = `${canvas.height}px`;
        }

        el.appendChild(canvasEl);
        ctx = canvasEl.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D rendering context");

        if (density !== 1) {
          ctx.scale(density, density);
        }

        sketchModule = factory(ctx, currentState);
        if (sketchModule && typeof sketchModule["initializeSystem"] === "function") {
          (sketchModule["initializeSystem"] as () => void)();
        }
      },

      unmount() {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        if (canvasEl && container) {
          container.removeChild(canvasEl);
        }
        canvasEl = null;
        ctx = null;
        container = null;
        sketchModule = null;
        animating = false;
      },

      updateState(newState: SketchState) {
        currentState = { ...newState };
        if (sketchModule && typeof sketchModule["initializeSystem"] === "function") {
          (sketchModule["initializeSystem"] as () => void)();
        }
      },

      redraw() {
        if (sketchModule && typeof sketchModule["initializeSystem"] === "function") {
          (sketchModule["initializeSystem"] as () => void)();
        }
      },

      pause() {
        animating = false;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      },

      resume() {
        animating = true;
        if (sketchModule && typeof sketchModule["draw"] === "function") {
          const loop = () => {
            if (!animating) return;
            (sketchModule!["draw"] as () => void)();
            animationFrameId = requestAnimationFrame(loop);
          };
          loop();
        }
      },

      get isAnimating() {
        return animating;
      },

      async captureFrame(options?: CaptureOptions): Promise<string> {
        if (!canvasEl) throw new Error("Sketch is not mounted");
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
        if (!canvasEl || !ctx) throw new Error("Sketch is not mounted");
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
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);

    try {
      const instance = this.createInstance(compiled, state, canvas);
      instance.mount(el);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const dataUrl = await instance.captureFrame(options);
      instance.dispose();

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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sketch.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #111; }
    body { display: flex; justify-content: center; align-items: center; }
    canvas { display: block; }
  </style>
</head>
<body>
  <canvas id="canvas" width="${width * pixelDensity}" height="${height * pixelDensity}" style="width:${width}px;height:${height}px;"></canvas>
  <script>
    try {
      const state = ${stateJson};
      state.canvas = { width: ${width}, height: ${height}, pixelDensity: ${pixelDensity} };

      ${extractComponentCode(sketch.components)}
      ${sketch.algorithm}

      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      ${pixelDensity !== 1 ? `ctx.scale(${pixelDensity}, ${pixelDensity});` : ""}
      const module = sketch(ctx, state);
      if (module && module.initializeSystem) module.initializeSystem();
      ${sketch.layers && sketch.layers.length > 0 ? generateCompositorCall() : ""}
    } catch (e) {
      document.body.style.background = '#300';
      document.body.style.color = '#f88';
      document.body.style.fontFamily = 'monospace';
      document.body.style.fontSize = '12px';
      document.body.style.padding = '16px';
      document.body.textContent = 'Sketch error: ' + e.message;
    }
  </script>
  ${sketch.layers && sketch.layers.length > 0 ? generateCompositorScript(sketch.layers) : ""}
</body>
</html>`;
  }

  getAlgorithmTemplate(): string {
    return `function sketch(ctx, state) {
  const { width, height } = state.canvas;
  function initializeSystem() {
    ctx.clearRect(0, 0, width, height);
    // generative algorithm here
  }
  return { initializeSystem };
}`;
  }

  getRuntimeDependencies(): RuntimeDependency[] {
    // Canvas 2D has no external dependencies
    return [];
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
