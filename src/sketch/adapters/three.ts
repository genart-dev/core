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

const THREE_CDN_VERSION = "0.172.0";
const THREE_CDN_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_CDN_VERSION}/build/three.module.min.js`;

/**
 * Compiled Three.js algorithm — wraps the algorithm source string
 * and a factory function for creating Three.js sketches.
 */
interface ThreeCompiledAlgorithm {
  source: string;
  factory: (
    THREE: unknown,
    state: SketchState & { canvas: CanvasSpec },
    container: HTMLElement,
  ) => Record<string, unknown>;
}

/**
 * Three.js Renderer Adapter — full implementation.
 *
 * Validates algorithms for the `sketch(THREE, state, container)` signature,
 * compiles them into executable factories, and creates live sketch instances.
 */
export class ThreeRendererAdapter implements RendererAdapter {
  readonly type: RendererType = "three";
  readonly displayName = "Three.js";
  readonly algorithmLanguage = "javascript" as const;

  validate(algorithm: string): ValidationResult {
    if (!algorithm || algorithm.trim().length === 0) {
      return { valid: false, errors: ["Algorithm source is empty"] };
    }
    // Basic validation — check for sketch function signature
    const hasSketchFn =
      /function\s+sketch\s*\(\s*THREE\s*,\s*state\s*,\s*container\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*(?:function\s*)?\(\s*THREE\s*,\s*state\s*,\s*container\s*\)/.test(algorithm) ||
      /(?:const|let|var)\s+sketch\s*=\s*\(\s*THREE\s*,\s*state\s*,\s*container\s*\)\s*=>/.test(algorithm);

    if (!hasSketchFn) {
      return {
        valid: false,
        errors: [
          "Three.js algorithms must export a function with signature: function sketch(THREE, state, container)",
        ],
      };
    }
    return { valid: true, errors: [] };
  }

  async compile(algorithm: string): Promise<CompiledAlgorithm> {
    const validation = this.validate(algorithm);
    if (!validation.valid) {
      throw new Error(
        `Three.js compilation failed: ${validation.errors.join("; ")}`,
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
        THREE: unknown,
        state: SketchState & { canvas: CanvasSpec },
        container: HTMLElement,
      ) => Record<string, unknown>;
      const compiled: ThreeCompiledAlgorithm = {
        source: algorithm,
        factory: factory(),
      };
      return compiled;
    } catch (err) {
      throw new Error(
        `Three.js compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { factory } = compiled as ThreeCompiledAlgorithm;

    let container: HTMLElement | null = null;
    let currentState = { ...state, canvas };
    let sketchModule: Record<string, unknown> | null = null;
    let animating = false;

    const instance: SketchInstance = {
      mount(el: HTMLElement) {
        container = el;

        // Requires THREE to be available globally
        const THREEGlobal = (globalThis as Record<string, unknown>)["THREE"];

        if (!THREEGlobal) {
          throw new Error(
            "Three.js is not loaded. Include Three.js before mounting a Three.js sketch.",
          );
        }

        sketchModule = factory(THREEGlobal, currentState, el);
        animating = true;
      },

      unmount() {
        if (
          sketchModule &&
          typeof sketchModule["dispose"] === "function"
        ) {
          (sketchModule["dispose"] as () => void)();
        }
        if (container) {
          container.innerHTML = "";
        }
        sketchModule = null;
        container = null;
        animating = false;
      },

      updateState(newState: SketchState) {
        currentState = { ...newState, canvas };
        if (
          sketchModule &&
          typeof sketchModule["initializeSystem"] === "function"
        ) {
          (sketchModule["initializeSystem"] as () => void)();
        }
      },

      redraw() {
        if (
          sketchModule &&
          typeof sketchModule["initializeSystem"] === "function"
        ) {
          (sketchModule["initializeSystem"] as () => void)();
        }
      },

      pause() {
        animating = false;
        if (
          sketchModule &&
          typeof sketchModule["pause"] === "function"
        ) {
          (sketchModule["pause"] as () => void)();
        }
      },

      resume() {
        animating = true;
        if (
          sketchModule &&
          typeof sketchModule["resume"] === "function"
        ) {
          (sketchModule["resume"] as () => void)();
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
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);

    try {
      const instance = this.createInstance(compiled, state, canvas);
      instance.mount(el);

      // Three.js scenes need more setup time
      await new Promise((resolve) => setTimeout(resolve, 200));

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
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #111; overflow: hidden; }
    #canvas-container { width: ${width}px; height: ${height}px; }
    #canvas-container canvas { display: block; max-width: 100vw; max-height: 100vh; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <script type="module">
    import * as THREE from '${THREE_CDN_URL}';

    const state = ${stateJson};
    state.canvas = { width: ${width}, height: ${height}, pixelDensity: ${pixelDensity} };

    ${sketch.algorithm}

    sketch(THREE, state, document.getElementById('canvas-container'));
  </script>
</body>
</html>`;
  }

  getAlgorithmTemplate(): string {
    return `function sketch(THREE, state, container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, state.canvas.width / state.canvas.height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(state.canvas.width, state.canvas.height);
  container.appendChild(renderer.domElement);
  camera.position.z = 5;

  let animating = true;
  let animId = null;

  function initializeSystem() {
    // Rebuild scene from state.params and state.seed
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
  }

  function animate() {
    if (!animating) return;
    animId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  function pause() {
    animating = false;
    if (animId !== null) cancelAnimationFrame(animId);
  }

  function resume() {
    animating = true;
    animate();
  }

  function dispose() {
    pause();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  initializeSystem();
  animate();

  return { initializeSystem, dispose, pause, resume };
}`;
  }

  getRuntimeDependencies(): RuntimeDependency[] {
    return [
      {
        name: "three",
        version: THREE_CDN_VERSION,
        cdnUrl: THREE_CDN_URL,
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
