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
  WatchCallback,
  CaptureOptions,
  RuntimeDependency,
} from "../../types.js";
import { compile as compileGenArtScript } from "@genart-dev/genart-script";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type BuildGlobalsFn = (
  ctx: CanvasRenderingContext2D,
  params: Record<string, number>,
  colors: Record<string, string>,
  seed: number,
) => Record<string, unknown>;

interface GenArtCompiledAlgorithm {
  source: string;
  code: string;
  params: Array<{ key: string; label: string; min: number; max: number; step: number; default: number }>;
  colors: Array<{ key: string; label: string; default: string }>;
  buildGlobals: BuildGlobalsFn;
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
    touchX: number,
    touchY: number,
    touches: Array<{ id: number; x: number; y: number }>,
    prev: ImageData | null,
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
    const [{ compile }, { buildGlobals }] = await Promise.all([
      import("@genart-dev/genart-script"),
      import("@genart-dev/genart-script/runtime"),
    ]);
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
      buildGlobals: buildGlobals as unknown as BuildGlobalsFn,
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
    const { code, params, colors, buildGlobals } = compiled as unknown as GenArtCompiledAlgorithm;
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
    let touchX = 0, touchY = 0;
    let activeTouches: Map<number, { id: number; x: number; y: number }> = new Map();
    let prevFrame: ImageData | null = null;
    let watchCb: WatchCallback | undefined;
    // Stable wrapper — never changes reference so re-evals don't need to update scope.
    // Codegen emits `if (typeof __watch__ !== "undefined") __watch__(...)`, so this always fires;
    // the inner guard keeps it a no-op until a callback is registered.
    const stableWatch: WatchCallback = (label, value) => { watchCb?.(label, value); };

    function buildScope(ctx2d: CanvasRenderingContext2D): Record<string, unknown> {
      const paramVals: Record<string, number> = {};
      for (const p of params) paramVals[p.key] = currentState.params[p.key] ?? p.default;

      const colorVals: Record<string, string> = {};
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i]!;
        colorVals[c.key] = currentState.colorPalette[i] ?? c.default;
      }

      const globals = buildGlobals(ctx2d, paramVals, colorVals, currentState.seed ?? 42);
      return {
        ...globals,
        // Override w/h with logical dimensions — canvas element is scaled by pixelDensity
        w: canvas.width,
        h: canvas.height,
        // Top-level ctx alias (codegen wraps drawing in __once__/__frame__ fns that rebind ctx,
        // but top-level expressions may reference it directly)
        ctx: ctx2d,
        // Canvas element reference for compiled event handlers (on click:/drag:/key:)
        __canvas__: canvasEl,
        // Watch callback — stable wrapper delegates to current watchCb (set via setWatchCallback)
        __watch__: stableWatch,
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
        const touchArr = Array.from(activeTouches.values());
        exports!.frame!(ctx, t, frameCount, canvas.width, canvas.height, 60,
          mouseX, mouseY, mouseDown, pmouseX, pmouseY,
          touchX, touchY, touchArr, prevFrame);
        if (exports!.post) exports!.post(ctx, "animated");
        // Capture frame for `prev` built-in — available on next frame
        if (canvasEl) prevFrame = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
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
          // Update touch state for this pointer
          const tx = mouseX, ty = mouseY;
          touchX = tx; touchY = ty;
          if (activeTouches.has(e.pointerId)) {
            activeTouches.set(e.pointerId, { id: e.pointerId, x: tx, y: ty });
          }
        });
        canvasEl.addEventListener("pointerdown", (e) => {
          mouseDown = true;
          const rect = canvasEl!.getBoundingClientRect();
          const tx = (e.clientX - rect.left) * (canvas.width / rect.width);
          const ty = (e.clientY - rect.top) * (canvas.height / rect.height);
          touchX = tx; touchY = ty;
          activeTouches.set(e.pointerId, { id: e.pointerId, x: tx, y: ty });
        });
        canvasEl.addEventListener("pointerup", (e) => {
          mouseDown = false;
          activeTouches.delete(e.pointerId);
        });
        canvasEl.addEventListener("pointercancel", (e) => {
          activeTouches.delete(e.pointerId);
        });

        exports = evalCode(ctx);

        // `once` may be async (when script uses `await loadFont(...)`)
        function startAfterOnce() {
          if (exports!.isAnimated) startLoop(); else runStatic();
        }
        if (exports.once) {
          const result: unknown = exports.once(ctx);
          if (result instanceof Promise) { result.then(startAfterOnce).catch(console.error); }
          else startAfterOnce();
        } else {
          startAfterOnce();
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

      setWatchCallback(cb: WatchCallback | undefined) { watchCb = cb; },
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
    // Compile GenArt Script source at build time (static import, works in both Node and browser)
    const result = compileGenArtScript(sketch.algorithm);
    if (!result.ok) {
      const msgs = result.errors.map(e => `${e.line}:${e.col} ${e.message}`).join("; ");
      throw new Error(`GenArt Script compile error: ${msgs}`);
    }

    const { width, height } = sketch.canvas;
    const stateJson = JSON.stringify(sketch.state, null, 2);
    const compiledCode = result.code;
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${sketch.title}</title>
<style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}canvas{display:block}</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
(function() {
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const w = ${width}, h = ${height};
const state = ${stateJson};
const paramVals = state.params ?? {};
const colorVals = {};
${JSON.stringify(sketch.colors ?? [])}.forEach(function(c, i) {
  colorVals[c.key] = (state.colorPalette ?? [])[i] ?? c.default;
});

// Color alpha helper — converts hex/named to rgba with alpha
function __colorAlpha__(color, alpha) {
  var h = color.startsWith("#") ? color.slice(1) : {
    red:"ff0000",green:"008000",blue:"0000ff",white:"ffffff",black:"000000",
    gray:"808080",yellow:"ffff00",orange:"ffa500",purple:"800080",pink:"ffc0cb",
    cyan:"00ffff",coral:"ff7f50",salmon:"fa8072",gold:"ffd700",teal:"008080",
    navy:"000080",maroon:"800000",lime:"00ff00",indigo:"4b0082",violet:"ee82ee",
    crimson:"dc143c",turquoise:"40e0d0",lavender:"e6e6fa"
  }[color.toLowerCase()];
  if (!h) return color;
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return "rgba("+r+","+g+","+b+","+alpha+")";
}

// Gradient helpers
function __linearGradient__(angle, stops) {
  var rad = angle * Math.PI / 180;
  var x0 = w/2 - Math.cos(rad)*w/2, y0 = h/2 - Math.sin(rad)*h/2;
  var x1 = w/2 + Math.cos(rad)*w/2, y1 = h/2 + Math.sin(rad)*h/2;
  var g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(function(c,i) { g.addColorStop(i/(stops.length-1), c); });
  return g;
}
function __radialGradient__(cx, cy, stops) {
  var r = Math.min(w, h) / 2;
  var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(function(c,i) { g.addColorStop(i/(stops.length-1), c); });
  return g;
}

// Perlin noise
var noise = (function() {
  var P = new Uint8Array(512);
  var base = Array.from({length:256}, function(_,i){return i;});
  var s = 0;
  for (var i=255; i>0; i--) { s=(Math.imul(s,1664525)+1013904223)>>>0; var j=s%(i+1); var tmp=base[i]; base[i]=base[j]; base[j]=tmp; }
  for (var i=0; i<512; i++) P[i]=base[i&255];
  function fade(t){return t*t*t*(t*(t*6-15)+10);}
  function nlerp(t,a,b){return a+t*(b-a);}
  function grad(h,x,y,z){h&=15;var u=h<8?x:y,v=h<4?y:h===12||h===14?x:z;return((h&1)?-u:u)+((h&2)?-v:v);}
  function n3(x,y,z){var X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;x-=Math.floor(x);y-=Math.floor(y);z-=Math.floor(z);var u=fade(x),v=fade(y),fw=fade(z);var A=P[X]+Y,AA=P[A]+Z,AB=P[A+1]+Z,B=P[X+1]+Y,BA=P[B]+Z,BB=P[B+1]+Z;return nlerp(fw,nlerp(v,nlerp(u,grad(P[AA],x,y,z),grad(P[BA],x-1,y,z)),nlerp(u,grad(P[AB],x,y-1,z),grad(P[BB],x-1,y-1,z))),nlerp(v,nlerp(u,grad(P[AA+1],x,y,z-1),grad(P[BA+1],x-1,y,z-1)),nlerp(u,grad(P[AB+1],x,y-1,z-1),grad(P[BB+1],x-1,y-1,z-1))));}
  return function(x,y,z){return n3(x,y!==undefined?y:0,z!==undefined?z:0);};
})();

var __renderCtx__ = { value: "static" };
var globals = { ctx:ctx, w:w, h:h, __params__:paramVals, __colors__:colorVals,
  PI:Math.PI, TWO_PI:Math.PI*2, HALF_PI:Math.PI/2,
  sin:Math.sin, cos:Math.cos, tan:Math.tan, atan2:Math.atan2,
  sqrt:Math.sqrt, abs:Math.abs, floor:Math.floor, ceil:Math.ceil,
  round:Math.round, min:Math.min, max:Math.max, pow:Math.pow, log:Math.log, exp:Math.exp,
  lerp:function(a,b,t){return a+(b-a)*t;}, clamp:function(v,lo,hi){return Math.max(lo,Math.min(hi,v));},
  map:function(v,il,ih,ol,oh){return ol+((v-il)/(ih-il))*(oh-ol);},
  dist:function(x1,y1,x2,y2){return Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));},
  __colorAlpha__:__colorAlpha__, __linearGradient__:__linearGradient__, __radialGradient__:__radialGradient__,
  rnd:function(a,b){return b===undefined?Math.random()*a:a+Math.random()*(b-a);},
  rndInt:function(a,b){return Math.floor(b===undefined?Math.random()*a:a+Math.random()*(b-a));},
  noise:noise,
  __rnd__:{seed:function(){}}, __canvas__:canvas, __renderCtx__:__renderCtx__,
};
var code = ${JSON.stringify(compiledCode)};
var fn = new Function(Object.keys(globals).join(","), code + "\\nreturn __exports__;");
var exports = fn.apply(null, Object.keys(globals).map(function(k){return globals[k];}));
if (exports.once) exports.once(ctx);
if (exports.isAnimated) {
  var t0 = performance.now();
  var frame = 0;
  function loop() {
    exports.frame(ctx, (performance.now()-t0)/1000, frame++, w, h, 60, 0,0,false,0,0, 0,0,[],null);
    if (exports.post) exports.post(ctx, "animated");
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
} else {
  if (exports.post) exports.post(ctx, "static");
}
})();
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
