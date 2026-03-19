import type {
  RendererType,
  SketchState,
  CanvasSpec,
  SketchDefinition,
  ParamDef,
  TabDef,
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
import { resolveComponents } from "@genart-dev/components";
import { generateCompositorScript } from "../../design/iframe-compositor.js";
import { generateLibraryScriptTags } from "./component-utils.js";

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
  params: Array<{ key: string; label: string; min: number; max: number; step: number; default: number; tab?: string }>;
  tabs: Array<{ id: string; label: string }>;
  colors: Array<{ key: string; label: string; default: string }>;
  /** Component code to prepend before compiled algorithm. */
  componentCode: string;
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

    // Resolve components declared via `use "component-name"`
    // The `components` field is added in genart-script >=0.2.0; gracefully handle older versions.
    let componentCode = "";
    const componentNames: string[] = (result as unknown as Record<string, unknown>).components as string[] ?? [];
    if (componentNames.length > 0) {
      const componentMap: Record<string, string> = {};
      for (const name of componentNames) componentMap[name] = "*";
      const resolved = resolveComponents(componentMap, "canvas2d");
      componentCode = resolved.map(c =>
        `// --- component: ${c.name} v${c.version} ---\n${c.code}`
      ).join("\n\n");
    }

    const compiled: GenArtCompiledAlgorithm = {
      source: algorithm,
      code: result.code,
      params: result.params,
      tabs: (result as unknown as Record<string, unknown>).tabs as GenArtCompiledAlgorithm["tabs"] ?? [],
      colors: result.colors,
      componentCode,
      buildGlobals: buildGlobals as unknown as BuildGlobalsFn,
    };
    return compiled as unknown as CompiledAlgorithm;
  }

  /**
   * Returns param/color defs extracted at compile time.
   * Merge into the sketch definition to expose them as controls.
   */
  extractDefinitions(compiled: CompiledAlgorithm): { params: ParamDef[]; tabs: TabDef[]; colors: ColorDef[] } {
    const { params, tabs, colors } = compiled as unknown as GenArtCompiledAlgorithm;
    return {
      params: params.map(p => ({
        key: p.key, label: p.label, tab: p.tab,
        min: p.min, max: p.max, step: p.step, default: p.default,
      })),
      tabs: tabs.map(t => ({ id: t.id, label: t.label })),
      colors: colors.map(c => ({ key: c.key, label: c.label, default: c.default })),
    };
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { code, componentCode, params, colors, buildGlobals } = compiled as unknown as GenArtCompiledAlgorithm;
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
        // renderLayers() bridge — calls compositor to get layers as offscreen canvas
        renderLayers: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          if (typeof win.__genart_compositeToOffscreen === "function") {
            return win.__genart_compositeToOffscreen(canvas.width, canvas.height);
          }
          return null;
        },
        // renderLayer(type) bridge — renders a single layer type to offscreen canvas
        renderLayer: (layerType: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          if (typeof win.__genart_compositeLayerToOffscreen === "function") {
            return win.__genart_compositeLayerToOffscreen(
              layerType,
              canvas.width,
              canvas.height,
            );
          }
          return null;
        },
      };
    }

    function evalCode(ctx2d: CanvasRenderingContext2D): CompiledExports {
      const scope = buildScope(ctx2d);
      const keys = Object.keys(scope);
      const vals = keys.map(k => scope[k]);
      const wrapped = `${componentCode}\n${code}\nreturn __exports__;`;
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

    // Resolve components declared via `use "component-name"`
    const componentNames: string[] = (result as unknown as Record<string, unknown>).components as string[] ?? [];
    let standaloneComponentCode = "";
    if (componentNames.length > 0) {
      const componentMap: Record<string, string> = {};
      for (const name of componentNames) componentMap[name] = "*";
      const resolved = resolveComponents(componentMap, "canvas2d");
      standaloneComponentCode = resolved.map(c =>
        `// --- component: ${c.name} v${c.version} ---\n${c.code}`
      ).join("\n\n") + "\n\n";
    }

    const { width, height } = sketch.canvas;
    const stateJson = JSON.stringify(sketch.state, null, 2);
    const compiledCode = result.code;
    const hasLayers = sketch.layers && sketch.layers.length > 0;
    const libTags = generateLibraryScriptTags(sketch.libraries);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${sketch.title}</title>
${libTags ? `${libTags}\n` : ""}<style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}canvas{display:block}</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
${hasLayers ? generateCompositorScript(sketch.layers!, sketch.canvas.width, sketch.canvas.height) : ""}
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

// Post-processing effects
function __resolveQ__(q) { if(q==="high")return"high";if(q==="fast")return"fast";return __renderCtx__.value==="static"?"high":"fast"; }
function __tmpCanvas__() { var c=document.createElement("canvas");c.width=canvas.width;c.height=canvas.height;return c; }
function vignette(s){s=s||0.5;var r=Math.max(w,h)*0.65;var g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,r);g.addColorStop(0,"transparent");g.addColorStop(1,"rgba(0,0,0,"+s+")");ctx.save();ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();}
function grain(a){a=a||0.15;var n=Math.floor(w*h*a*0.1);ctx.save();ctx.globalAlpha=0.35;for(var i=0;i<n;i++){var x=Math.random()*w,y=Math.random()*h,v=Math.random()>0.5?255:0;ctx.fillStyle="rgb("+v+","+v+","+v+")";ctx.fillRect(x,y,1,1);}ctx.restore();}
function bloom(s,r){s=s||0.5;r=r||8;var t=__tmpCanvas__();var tc=t.getContext("2d");tc.filter="blur("+r+"px)";tc.drawImage(canvas,0,0);ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=s;ctx.drawImage(t,0,0);ctx.restore();}
function grade(c,s,b,hu){c=c||1;s=s||1;b=b||1;hu=hu||0;var p=[];if(c!==1)p.push("contrast("+c+")");if(s!==1)p.push("saturate("+s+")");if(b!==1)p.push("brightness("+b+")");if(hu!==0)p.push("hue-rotate("+hu+"deg)");if(!p.length)return;var t=__tmpCanvas__();var tc=t.getContext("2d");tc.filter=p.join(" ");tc.drawImage(canvas,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(t,0,0);}
function blur(r){var t=__tmpCanvas__();var tc=t.getContext("2d");tc.filter="blur("+r+"px)";tc.drawImage(canvas,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(t,0,0);}
function scanlines(o){o=o||0.15;ctx.save();ctx.globalAlpha=o;ctx.fillStyle="black";for(var y=0;y<h;y+=2)ctx.fillRect(0,y,w,1);ctx.restore();}
function pixelate(bs){if(bs<2)return;var dw=Math.ceil(w/bs),dh=Math.ceil(h/bs);var t=document.createElement("canvas");t.width=dw;t.height=dh;var tc=t.getContext("2d");tc.imageSmoothingEnabled=false;tc.drawImage(canvas,0,0,dw,dh);ctx.save();ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);ctx.drawImage(t,0,0,w,h);ctx.restore();}
function chromatic_aberration(amt,q){amt=amt||3;var m=__resolveQ__(q);if(m==="fast"){var t=__tmpCanvas__();var tc=t.getContext("2d");tc.drawImage(canvas,0,0);ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=0.5;ctx.drawImage(t,amt,0);ctx.drawImage(t,-amt,0);ctx.restore();return;}var cw=canvas.width,ch=canvas.height;var id=ctx.getImageData(0,0,cw,ch);var s=id.data;var o=new Uint8ClampedArray(s.length);var a=Math.round(amt);for(var y=0;y<ch;y++)for(var x=0;x<cw;x++){var i=(y*cw+x)*4;var rx=Math.min(Math.max(x-a,0),cw-1);o[i]=s[(y*cw+rx)*4];o[i+1]=s[i+1];var bx=Math.min(Math.max(x+a,0),cw-1);o[i+2]=s[(y*cw+bx)*4+2];o[i+3]=s[i+3];}ctx.putImageData(new ImageData(o,cw,ch),0,0);}
function distort(type,amt,q){type=type||"wave";amt=amt||10;if(__resolveQ__(q)==="fast")return;var cw=canvas.width,ch=canvas.height;var id=ctx.getImageData(0,0,cw,ch);var s=id.data;var o=new Uint8ClampedArray(s.length);for(var y=0;y<ch;y++)for(var x=0;x<cw;x++){var sx=x,sy=y;if(type==="wave"){sx=x+Math.round(amt*Math.sin(y*0.05));sy=y+Math.round(amt*Math.cos(x*0.05));}else if(type==="ripple"){var dx=x-cw/2,dy=y-ch/2,d=Math.sqrt(dx*dx+dy*dy),off=Math.round(amt*Math.sin(d*0.05));sx=x+(dx===0?0:Math.round(off*dx/d));sy=y+(dy===0?0:Math.round(off*dy/d));}else{sx=x+Math.round(amt*(Math.sin(x*127.1+y*311.7)*0.5));sy=y+Math.round(amt*(Math.sin(x*269.5+y*183.3)*0.5));}sx=Math.min(Math.max(sx,0),cw-1);sy=Math.min(Math.max(sy,0),ch-1);var si2=(sy*cw+sx)*4,di=(y*cw+x)*4;o[di]=s[si2];o[di+1]=s[si2+1];o[di+2]=s[si2+2];o[di+3]=s[si2+3];}ctx.putImageData(new ImageData(o,cw,ch),0,0);}
function dither(str){str=str||0.5;var cw=canvas.width,ch=canvas.height;var id=ctx.getImageData(0,0,cw,ch);var d=id.data;var b=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];var sc=str*32;for(var y=0;y<ch;y++)for(var x=0;x<cw;x++){var i=(y*cw+x)*4;var th=(b[(y%4)*4+(x%4)]/16-0.5)*sc;d[i]=Math.min(255,Math.max(0,d[i]+th));d[i+1]=Math.min(255,Math.max(0,d[i+1]+th));d[i+2]=Math.min(255,Math.max(0,d[i+2]+th));}ctx.putImageData(id,0,0);}
function halftone(ds,ang){ds=ds||4;ang=ang||0.3;var cw=canvas.width,ch=canvas.height;var id=ctx.getImageData(0,0,cw,ch);var s=id.data;ds=Math.max(2,Math.round(ds));ctx.clearRect(0,0,w,h);ctx.save();ctx.fillStyle="white";ctx.fillRect(0,0,w,h);var ca=Math.cos(ang),sa=Math.sin(ang);for(var y=0;y<ch;y+=ds)for(var x=0;x<cw;x+=ds){var cx2=Math.min(x+Math.floor(ds/2),cw-1),cy2=Math.min(y+Math.floor(ds/2),ch-1);var si2=(cy2*cw+cx2)*4;var lum=(s[si2]*0.299+s[si2+1]*0.587+s[si2+2]*0.114)/255;var r=(1-lum)*ds*0.5;if(r<0.5)continue;var px=x+ds/2,py=y+ds/2;var rx=px*ca-py*sa+w/2*(1-ca)+h/2*sa;var ry=px*sa+py*ca+h/2*(1-ca)-w/2*sa;ctx.beginPath();ctx.arc(rx,ry,r,0,Math.PI*2);ctx.fillStyle="rgb("+s[si2]+","+s[si2+1]+","+s[si2+2]+")";ctx.fill();}ctx.restore();}

// Globals — declared as local vars so compiled code can reference them directly
var __params__ = paramVals, __colors__ = colorVals;
var PI = Math.PI, TWO_PI = Math.PI*2, HALF_PI = Math.PI/2;
var sin = Math.sin, cos = Math.cos, tan = Math.tan, atan2 = Math.atan2;
var sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor, ceil = Math.ceil;
var round = Math.round, min = Math.min, max = Math.max, pow = Math.pow, log = Math.log, exp = Math.exp;
function lerp(a,b,t){return a+(b-a)*t;} function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function map(v,il,ih,ol,oh){return ol+((v-il)/(ih-il))*(oh-ol);}
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));}
function rnd(a,b){return b===undefined?Math.random()*a:a+Math.random()*(b-a);}
function rndInt(a,b){return Math.floor(b===undefined?Math.random()*a:a+Math.random()*(b-a));}
var __rnd__ = {seed:function(){}};
var __canvas__ = canvas;
function buffer(bw, bh) { var c = document.createElement("canvas"); c.width = bw; c.height = bh; return c; }

// Pixel sampling — works with HTMLCanvasElement and OffscreenCanvas
var __pixelCache__ = new WeakMap();
function __getPixels__(src) {
  if (!src) return null;
  var cached = __pixelCache__.get(src);
  if (cached) return cached;
  var c2 = src.getContext("2d");
  if (!c2) return null;
  var id = c2.getImageData(0, 0, src.width, src.height);
  var entry = {data: id.data, w: src.width};
  __pixelCache__.set(src, entry);
  return entry;
}
function colorAt(src, x, y) {
  var e = __getPixels__(src);
  if (!e) return [0, 0, 0];
  var i = (Math.round(y) * e.w + Math.round(x)) * 4;
  return [e.data[i], e.data[i+1], e.data[i+2]];
}
function alphaAt(src, x, y) {
  var e = __getPixels__(src);
  if (!e) return 0;
  var i = (Math.round(y) * e.w + Math.round(x)) * 4;
  return e.data[i+3];
}
function pixelAt(src, x, y) {
  var e = __getPixels__(src);
  if (!e) return [0, 0, 0, 0];
  var i = (Math.round(y) * e.w + Math.round(x)) * 4;
  return [e.data[i], e.data[i+1], e.data[i+2], e.data[i+3]];
}

// --- components (from use "component-name" declarations) ---
${standaloneComponentCode}// renderLayers() bridge — calls compositor to get layers as offscreen canvas
var __renderLayersCalled__ = false;
function renderLayers() {
  __renderLayersCalled__ = true;
  if (typeof window.__genart_compositeToOffscreen === "function") return window.__genart_compositeToOffscreen(${width}, ${height});
  return null;
}
function renderLayer(layerType) {
  __renderLayersCalled__ = true;
  if (typeof window.__genart_compositeLayerToOffscreen === "function") return window.__genart_compositeLayerToOffscreen(layerType, ${width}, ${height});
  return null;
}

// --- compiled code (inlined, no eval/new Function) ---
${compiledCode}

// Resolve param-bound layer opacities (e.g. opacity:fog → paramVals["fog"])
if (window.__genart_design && window.__genart_design.layers) {
  window.__genart_design.layers.forEach(function(l) {
    if (l.properties && l.properties.__opacityParam) {
      var pv = paramVals[l.properties.__opacityParam];
      if (pv !== undefined) l.opacity = pv;
    }
  });
}

// --- run ---
if (typeof __exports__ !== "undefined") {
  if (__exports__.once) __exports__.once(ctx);
  if (__exports__.isAnimated) {
    var t0 = performance.now();
    var frame = 0;
    function loop() {
      try { __exports__.frame(ctx, (performance.now()-t0)/1000, frame++, w, h, 60, 0,0,false,0,0, 0,0,[],null); } catch(e) { console.error("[genart]",e); }
      try { if (__exports__.post) __exports__.post(ctx, "animated"); } catch(e) { console.error("[genart post]",e); }
      if (!__renderLayersCalled__ && window.__genart_compositeLayersFrame) window.__genart_compositeLayersFrame(canvas);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  } else {
    try { if (__exports__.post) __exports__.post(ctx, "static"); } catch(e) { console.error("[genart post]",e); }
    if (!__renderLayersCalled__ && window.__genart_compositeLayers) window.__genart_compositeLayers(canvas);
  }
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
