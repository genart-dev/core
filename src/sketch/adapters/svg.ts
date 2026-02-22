import type {
  RendererType,
  SketchState,
  CanvasSpec,
  SketchDefinition,
} from "@genart-dev/format";
import type {
  RendererAdapter,
  ValidationResult,
  CompiledAlgorithm,
  SketchInstance,
  CaptureOptions,
  RuntimeDependency,
} from "../../types.js";

/**
 * Compiled SVG algorithm — wraps the algorithm source string
 * and a factory function for creating SVG sketches.
 */
interface SVGCompiledAlgorithm {
  source: string;
  factory: (
    state: SketchState & { canvas: CanvasSpec },
  ) => Record<string, unknown>;
}

/**
 * SVG Renderer Adapter — full implementation.
 *
 * Validates algorithms for the `sketch(state)` function signature,
 * compiles them into executable factories, and creates live sketch instances.
 * SVG sketches are static — there is no animation loop.
 */
export class SVGRendererAdapter implements RendererAdapter {
  readonly type: RendererType = "svg";
  readonly displayName = "SVG";
  readonly algorithmLanguage = "javascript" as const;

  validate(algorithm: string): ValidationResult {
    if (!algorithm || algorithm.trim().length === 0) {
      return { valid: false, errors: ["Algorithm source is empty"] };
    }
    // Check for sketch function signature
    const hasSketchFn =
      /function\s+sketch\s*\(\s*state\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*(?:function\s*)?\(\s*state\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*\(\s*state\s*\)\s*=>/.test(algorithm);

    if (!hasSketchFn) {
      return {
        valid: false,
        errors: [
          "SVG algorithms must export a function with signature: function sketch(state)",
        ],
      };
    }
    return { valid: true, errors: [] };
  }

  async compile(algorithm: string): Promise<CompiledAlgorithm> {
    const validation = this.validate(algorithm);
    if (!validation.valid) {
      throw new Error(
        `SVG compilation failed: ${validation.errors.join("; ")}`,
      );
    }

    const wrappedSource = `
      return (function() {
        ${algorithm}
        return sketch;
      })();
    `;

    try {
      const factory = new Function(wrappedSource) as () => (
        state: SketchState & { canvas: CanvasSpec },
      ) => Record<string, unknown>;
      const compiled: SVGCompiledAlgorithm = {
        source: algorithm,
        factory: factory(),
      };
      return compiled;
    } catch (err) {
      throw new Error(
        `SVG compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { factory } = compiled as SVGCompiledAlgorithm;

    let container: HTMLElement | null = null;
    let currentState = { ...state, canvas };
    let sketchModule: Record<string, unknown> | null = null;

    function regenerate() {
      if (!container || !sketchModule) return;
      if (typeof sketchModule["generate"] === "function") {
        const svgString = (sketchModule["generate"] as () => string)();
        container.innerHTML = svgString;
      }
    }

    const instance: SketchInstance = {
      mount(el: HTMLElement) {
        container = el;
        sketchModule = factory(currentState);
        regenerate();
      },

      unmount() {
        if (container) {
          container.innerHTML = "";
        }
        container = null;
        sketchModule = null;
      },

      updateState(newState: SketchState) {
        currentState = { ...newState, canvas };
        // Recreate the sketch module with the new state
        sketchModule = factory(currentState);
        regenerate();
      },

      redraw() {
        regenerate();
      },

      pause() {
        // No-op: SVG is static
      },

      resume() {
        // No-op: SVG is static
      },

      get isAnimating() {
        return false;
      },

      async captureFrame(_options?: CaptureOptions): Promise<string> {
        if (!container) throw new Error("Sketch is not mounted");
        const svgEl = container.querySelector("svg");
        if (!svgEl) throw new Error("No SVG element found");

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgEl);
        const base64 = btoa(unescape(encodeURIComponent(svgString)));
        return `data:image/svg+xml;base64,${base64}`;
      },

      async captureImageData(): Promise<ImageData> {
        if (!container) throw new Error("Sketch is not mounted");
        const svgEl = container.querySelector("svg");
        if (!svgEl) throw new Error("No SVG element found");

        // Render SVG to an offscreen canvas via Image
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgEl);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load SVG as image"));
          img.src = url;
        });

        const offscreen = document.createElement("canvas");
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) throw new Error("Cannot get 2D context");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        return ctx.getImageData(0, 0, canvas.width, canvas.height);
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
    _options?: CaptureOptions,
  ): Promise<Uint8Array | Blob> {
    const { factory } = compiled as SVGCompiledAlgorithm;
    const stateWithCanvas = { ...state, canvas };
    const module = factory(stateWithCanvas);

    let svgString: string;
    if (typeof module["generate"] === "function") {
      svgString = (module["generate"] as () => string)();
    } else {
      throw new Error("SVG sketch module must have a generate() method");
    }

    // Encode SVG string as UTF-8 Uint8Array
    const encoder = new TextEncoder();
    return encoder.encode(svgString);
  }

  generateStandaloneHTML(sketch: SketchDefinition): string {
    const { width, height } = sketch.canvas;
    const stateJson = JSON.stringify(sketch.state, null, 2);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sketch.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #111; }
    #svg-container svg { display: block; width: 100%; height: auto; max-width: 100vw; max-height: 100vh; }
  </style>
</head>
<body>
  <div id="svg-container"></div>
  <script>
    const state = ${stateJson};
    state.canvas = { width: ${width}, height: ${height} };

    ${sketch.algorithm}

    const module = sketch(state);
    const svgString = module.generate ? module.generate() : module.initializeSystem();
    document.getElementById('svg-container').innerHTML = svgString;
  </script>
</body>
</html>`;
  }

  getAlgorithmTemplate(): string {
    return `function sketch(state) {
  const { width, height } = state.canvas;
  function generate() {
    return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${width}" height="\${height}" viewBox="0 0 \${width} \${height}">
      <!-- generated elements -->
    </svg>\`;
  }
  return { generate, initializeSystem: generate };
}`;
  }

  getRuntimeDependencies(): RuntimeDependency[] {
    // SVG has no external dependencies
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
