import type {
  RendererType,
  SketchState,
  CanvasSpec,
  SketchDefinition,
  ParamDef,
  ColorDef,
} from "@genart-dev/format";
import type {
  RendererAdapter,
  ValidationResult,
  CompiledAlgorithm,
  SketchInstance,
  CaptureOptions,
  RuntimeDependency,
} from "../../types.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GenArtCompiledAlgorithm {
  source: string;
  code: string;
  params: Array<{ key: string; label: string; min: number; max: number; step: number; default: number }>;
  colors: Array<{ key: string; label: string; default: string }>;
}

interface CompiledExports {
  isAnimated: boolean;
  once?: (ctx: CanvasRenderingContext2D) => void;
  frame?: (
    ctx: CanvasRenderingContext2D,
    t: number,
    frame: number,
    w: number,
    h: number,
    fps: number,
    mouseX: number,
    mouseY: number,
    mouseDown: boolean,
    pmouseX: number,
    pmouseY: number,
  ) => void;
  post?: (ctx: CanvasRenderingContext2D, renderContext: "static" | "animated") => void;
}

// ---------------------------------------------------------------------------
// GenArt Script Renderer Adapter
// ---------------------------------------------------------------------------

/**
 * Renderer adapter for GenArt Script (`.genart-script` / `.gs`).
 *
 * Renderer type: `"genart"`.
 * Algorithm field: raw GenArt Script source text.
 * Compiles via `@genart-dev/genart-script` (dynamic import, zero hard dep).
 */
export class GenArtRendererAdapter implements RendererAdapter {
  readonly type: RendererType = "genart";
  readonly displayName = "GenArt Script";
  readonly algorithmLanguage = "genart-script" as const;

  validate(algorithm: string): ValidationResult {
    if (!algorithm || algorithm.trim().length === 0) {
      return { valid: false, errors: ["GenArt Script source is empty"] };
    }
    return { valid: true, errors: [] };
  }

  async compile(algorithm: string): Promise<CompiledAlgorithm> {
    const { compile } = await import("@genart-dev/genart-script");
    const result = compile(algorithm);

    if (!result.ok) {
      const msgs = result.errors.map((e: { line: number; col: number; message: string }) =>
        `${e.line}:${e.col} ${e.message}`
      ).join("; ");
      throw new Error(`GenArt Script compile error: ${msgs}`);
    }

    const compiled: GenArtCompiledAlgorithm = {
      source: algorithm,
      code: result.code,
      params: result.params,
      colors: result.colors,
    };
    return compiled as unknown as CompiledAlgorithm;
  }

  /**
   * Returns param/color defs extracted at compile time.
   * Merge into the sketch definition to expose them as controls.
   */
  extractDefinitions(compiled: CompiledAlgorithm): { params: ParamDef[]; colors: ColorDef[] } {
    const { params, colors } = compiled as unknown as GenArtCompiledAlgorithm;
    return {
      params: params.map(p => ({
        key: p.key, label: p.label,
        min: p.min, max: p.max, step: p.step, default: p.default,
      })),
      colors: colors.map(c => ({ key: c.key, label: c.label, default: c.default })),
    };
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { code, params, colors } = compiled as unknown as GenArtCompiledAlgorithm;
    const density = canvas.pixelDensity ?? 1;

    let canvasEl: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let container: HTMLElement | null = null;
    let currentState = { ...state };
    let animating = false;
    let animationFrameId: number | null = null;
    let exports: CompiledExports | null = null;
    let frameCount = 0;
    let startTime = 0;
    let mouseX = 0, mouseY = 0, mouseDown = false, pmouseX = 0, pmouseY = 0;

    // Inline PRNG (mulberry32) — seeded per state.seed
    let _seed = (state.seed ?? 42) >>> 0;
    function prngSeed(_ns: string | null, value: number) { _seed = value >>> 0; }
    function rnd(a: number, b?: number): number {
      _seed = (_seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return b === undefined ? r * a : a + r * (b - a);
    }

    // Inline value noise (full Perlin comes via runtime package in Phase 2)
    function noiseImpl(x: number, _y?: number, _z?: number): number {
      const i = Math.floor(x);
      const f = x - i;
      const u = f * f * (3 - 2 * f);
      const a = ((Math.sin(i * 127.1 + 311.7) * 43758.5453123) % 1 + 1) % 1;
      const b2 = ((Math.sin((i + 1) * 127.1 + 311.7) * 43758.5453123) % 1 + 1) % 1;
      return (a + u * (b2 - a)) * 2 - 1;
    }

    function buildScope(ctx2d: CanvasRenderingContext2D): Record<string, unknown> {
      const paramVals: Record<string, number> = {};
      for (const p of params) paramVals[p.key] = currentState.params[p.key] ?? p.default;

      const colorVals: Record<string, string> = {};
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i]!;
        colorVals[c.key] = currentState.colorPalette[i] ?? c.default;
      }

      const w = canvas.width;
      const h = canvas.height;

      return {
        __params__: paramVals,
        __colors__: colorVals,
        ctx: ctx2d,
        w, h,
        PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2,
        sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2,
        sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
        round: Math.round, min: Math.min, max: Math.max, pow: Math.pow,
        log: Math.log, exp: Math.exp,
        lerp: (a: number, b: number, t: number) => a + (b - a) * t,
        clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
        map: (v: number, il: number, ih: number, ol: number, oh: number) =>
          ol + ((v - il) / (ih - il)) * (oh - ol),
        dist: (x1: number, y1: number, x2: number, y2: number) =>
          Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
        __colorAlpha__: colorAlphaInline,
        __linearGradient__: (angle: number, stops: string[]) =>
          linearGradientInline(ctx2d, angle, stops),
        __radialGradient__: (cx: number, cy: number, stops: string[]) =>
          radialGradientInline(ctx2d, cx, cy, stops, w, h),
        rnd,
        rndInt: (a: number, b?: number) => Math.floor(rnd(a, b)),
        noise: noiseImpl,
        __rnd__: { seed: prngSeed },
        __canvas__: canvasEl,
      };
    }

    function evalCode(ctx2d: CanvasRenderingContext2D): CompiledExports {
      const scope = buildScope(ctx2d);
      const keys = Object.keys(scope);
      const vals = keys.map(k => scope[k]);
      const wrapped = `${code}\nreturn __exports__;`;
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function(...keys, wrapped);
      return fn(...vals) as CompiledExports;
    }

    function startLoop() {
      startTime = performance.now();
      frameCount = 0;
      animating = true;
      function loop() {
        if (!animating || !ctx) return;
        const t = (performance.now() - startTime) / 1000;
        exports!.frame!(ctx, t, frameCount, canvas.width, canvas.height, 60,
          mouseX, mouseY, mouseDown, pmouseX, pmouseY);
        if (exports!.post) exports!.post(ctx, "animated");
        frameCount++;
        animationFrameId = requestAnimationFrame(loop);
      }
      animationFrameId = requestAnimationFrame(loop);
    }

    function runStatic() {
      if (!ctx || !exports) return;
      if (exports.post) exports.post(ctx, "static");
    }

    const instance: SketchInstance = {
      mount(el: HTMLElement) {
        container = el;
        canvasEl = document.createElement("canvas");
        canvasEl.width = canvas.width * density;
        canvasEl.height = canvas.height * density;
        canvasEl.style.width = `${canvas.width}px`;
        canvasEl.style.height = `${canvas.height}px`;
        el.appendChild(canvasEl);

        ctx = canvasEl.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D rendering context");
        if (density !== 1) ctx.scale(density, density);

        canvasEl.addEventListener("pointermove", (e) => {
          const rect = canvasEl!.getBoundingClientRect();
          pmouseX = mouseX; pmouseY = mouseY;
          mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
          mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
        });
        canvasEl.addEventListener("pointerdown", () => { mouseDown = true; });
        canvasEl.addEventListener("pointerup", () => { mouseDown = false; });

        _seed = (currentState.seed ?? 42) >>> 0;
        exports = evalCode(ctx);
        if (exports.once) exports.once(ctx);

        if (exports.isAnimated) {
          startLoop();
        } else {
          runStatic();
        }
      },

      unmount() {
        animating = false;
        if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        if (canvasEl && container) container.removeChild(canvasEl);
        canvasEl = null; ctx = null; container = null; exports = null;
      },

      updateState(newState: SketchState) {
        currentState = { ...newState };
        _seed = (newState.seed ?? 42) >>> 0;
        if (ctx) {
          exports = evalCode(ctx);
          if (exports.once) exports.once(ctx);
          if (!exports.isAnimated) runStatic();
        }
      },

      redraw() {
        if (ctx && exports) {
          exports = evalCode(ctx);
          if (exports.once) exports.once(ctx);
          if (!exports.isAnimated) runStatic();
        }
      },

      pause() {
        animating = false;
        if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      },

      resume() {
        if (exports?.isAnimated) startLoop();
      },

      get isAnimating() { return animating; },

      async captureFrame(options?: CaptureOptions): Promise<string> {
        if (!canvasEl) throw new Error("GenArt adapter not mounted");
        const fmt = options?.format ?? "png";
        const q = options?.quality ?? 1.0;
        const mime = fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
        return canvasEl.toDataURL(mime, q);
      },

      async captureImageData(): Promise<ImageData> {
        if (!canvasEl || !ctx) throw new Error("GenArt adapter not mounted");
        return ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      },

      dispose() { instance.unmount(); },
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
      const inst = this.createInstance(compiled, state, canvas);
      inst.mount(el);
      await new Promise(resolve => setTimeout(resolve, 50));
      const dataUrl = await inst.captureFrame(options);
      inst.dispose();
      const base64 = dataUrl.split(",")[1] ?? "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } finally {
      document.body.removeChild(el);
    }
  }

  generateStandaloneHTML(sketch: SketchDefinition): string {
    const { width, height } = sketch.canvas;
    const stateJson = JSON.stringify(sketch.state, null, 2);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${sketch.title}</title>
<style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}canvas{display:block}</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script type="module">
import { compile } from "https://cdn.skypack.dev/@genart-dev/genart-script";
const source = ${JSON.stringify(sketch.algorithm)};
const state = ${stateJson};
const result = compile(source);
if (!result.ok) { console.error(result.errors); throw new Error("Compile failed"); }
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const w = ${width}, h = ${height};
const paramVals = state.params ?? {};
const colorVals = {};
${JSON.stringify(sketch.colors ?? [])}.forEach((c, i) => {
  colorVals[c.key] = (state.colorPalette ?? [])[i] ?? c.default;
});
const globals = { ctx, w, h, __params__: paramVals, __colors__: colorVals,
  PI: Math.PI, TWO_PI: Math.PI*2, HALF_PI: Math.PI/2,
  sin:Math.sin, cos:Math.cos, tan:Math.tan, atan2:Math.atan2,
  sqrt:Math.sqrt, abs:Math.abs, floor:Math.floor, ceil:Math.ceil,
  round:Math.round, min:Math.min, max:Math.max, pow:Math.pow, log:Math.log, exp:Math.exp,
  lerp:(a,b,t)=>a+(b-a)*t, clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
  map:(v,il,ih,ol,oh)=>ol+((v-il)/(ih-il))*(oh-ol),
  dist:(x1,y1,x2,y2)=>Math.sqrt((x2-x1)**2+(y2-y1)**2),
  __colorAlpha__:(c,a)=>c, __linearGradient__:()=>"#000", __radialGradient__:()=>"#000",
  rnd:(a,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a),
  rndInt:(a,b)=>Math.floor(b===undefined?Math.random()*a:a+Math.random()*(b-a)),
  noise:(x)=>Math.sin(x*127.1)*0.5,
  __rnd__:{seed:()=>{}}, __canvas__:canvas,
};
const fn = new Function(...Object.keys(globals), result.code + "\\nreturn __exports__;");
const exports = fn(...Object.values(globals));
if (exports.once) exports.once(ctx);
if (exports.isAnimated) {
  const t0 = performance.now();
  let frame = 0;
  function loop() {
    exports.frame(ctx, (performance.now()-t0)/1000, frame++, w, h, 60, 0,0,false,0,0);
    if (exports.post) exports.post(ctx, "animated");
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
} else {
  if (exports.post) exports.post(ctx, "static");
}
</script>
</body></html>`;
  }

  generateInteractiveHTML(sketch: SketchDefinition): string {
    return this.generateStandaloneHTML(sketch);
  }

  getAlgorithmTemplate(): string {
    return [
      "// GenArt Script",
      "bg #1a1a2e",
      "",
      "frame:",
      "  bg #1a1a2e",
      "  circle w/2 h/2 r:100 fill:coral",
    ].join("\n");
  }

  getRuntimeDependencies(): RuntimeDependency[] {
    return [
      {
        name: "@genart-dev/genart-script",
        version: "^0.1.0",
        cdnUrl: "https://cdn.skypack.dev/@genart-dev/genart-script",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Inline color helpers
// ---------------------------------------------------------------------------

function colorAlphaInline(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  return color;
}

function linearGradientInline(
  ctx: CanvasRenderingContext2D,
  angleDeg: number,
  stops: string[],
): CanvasGradient {
  const rad = (angleDeg * Math.PI) / 180;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const g = ctx.createLinearGradient(
    w / 2 - (Math.cos(rad) * w) / 2, h / 2 - (Math.sin(rad) * h) / 2,
    w / 2 + (Math.cos(rad) * w) / 2, h / 2 + (Math.sin(rad) * h) / 2,
  );
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function radialGradientInline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  stops: string[],
  w: number,
  h: number,
): CanvasGradient {
  const r = Math.min(w, h) / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

const NAMED_HEX: Record<string, string> = {
  red: "ff0000", green: "008000", blue: "0000ff", white: "ffffff",
  black: "000000", gray: "808080", grey: "808080", yellow: "ffff00",
  orange: "ffa500", purple: "800080", pink: "ffc0cb", cyan: "00ffff",
  magenta: "ff00ff", coral: "ff7f50", salmon: "fa8072", gold: "ffd700",
  silver: "c0c0c0", teal: "008080", navy: "000080", maroon: "800000",
  olive: "808000", lime: "00ff00", aqua: "00ffff", fuchsia: "ff00ff",
  indigo: "4b0082", violet: "ee82ee", crimson: "dc143c",
  turquoise: "40e0d0", beige: "f5f5dc", ivory: "fffff0", khaki: "f0e68c",
  lavender: "e6e6fa", linen: "faf0e6", tan: "d2b48c", wheat: "f5deb3",
};

function hexToRgb(color: string): [number, number, number] | null {
  const h = color.startsWith("#") ? color.slice(1) : NAMED_HEX[color.toLowerCase()];
  if (!h) return null;
  if (h.length === 3) return [
    parseInt(h[0]! + h[0]!, 16),
    parseInt(h[1]! + h[1]!, 16),
    parseInt(h[2]! + h[2]!, 16),
  ];
  if (h.length === 6) return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
  return null;
}
