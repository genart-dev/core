/**
 * Self-contained compositor script generator for iframe-level design layer rendering.
 *
 * Exports `generateCompositorScript()` which returns an inline `<script>` block
 * that can be injected into any adapter's standalone HTML. The script reads layer
 * JSON from `#design-layers` and draws all layers onto the canvas surface.
 *
 * All render logic is inlined — no imports, no external dependencies. This is
 * intentional: the script runs inside a sandboxed iframe or standalone HTML file.
 *
 * @see ADR 026 — Renderer-Level Design Layer Compositing
 */

import type { DesignLayer } from "@genart-dev/format";

/**
 * Generate a self-contained `<script>` block that composites design layers
 * onto a canvas. Supports all 16 layer types from the plugin packages.
 *
 * @param layers - Design layers to embed directly (avoids JSON tag parsing)
 * @returns HTML `<script>` string to inject into standalone HTML
 */
export function generateCompositorScript(layers: readonly DesignLayer[]): string {
  if (!layers || layers.length === 0) return "";

  const layersJson = JSON.stringify(layers);

  return `<script>
(function() {
  "use strict";

  var __genart_layers = ${layersJson};

  // --- Blend mode mapping ---
  function toCompositeOp(mode) {
    return mode === "normal" ? "source-over" : mode;
  }

  // --- Shape helpers ---
  function applyShapeStyle(props, ctx) {
    var fillEnabled = props.fillEnabled !== undefined ? props.fillEnabled : true;
    var strokeEnabled = props.strokeEnabled !== undefined ? props.strokeEnabled : false;
    if (fillEnabled) {
      ctx.fillStyle = props.fillColor || "#ffffff";
      ctx.fill();
    }
    if (strokeEnabled) {
      var sw = props.strokeWidth || 0;
      if (sw > 0) {
        ctx.strokeStyle = props.strokeColor || "#000000";
        ctx.lineWidth = sw;
        ctx.stroke();
      }
    }
  }

  // --- Guide helpers ---
  function setupGuideStyle(ctx, color, lineWidth, dashPattern) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    var dashes = dashPattern.split(",").map(Number).filter(function(n) { return !isNaN(n) && n > 0; });
    ctx.setLineDash(dashes.length > 0 ? dashes : [6, 4]);
  }

  function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // --- Font stack resolution ---
  function resolveFontStack(family) {
    var sansStack = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    var monoStack = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";
    var serifStack = "Georgia, 'Times New Roman', serif";
    var map = {
      "Inter": sansStack, "Arial": sansStack, "Helvetica": sansStack, "Verdana": sansStack,
      "JetBrains Mono": monoStack, "Courier New": monoStack,
      "Georgia": serifStack, "Times New Roman": serifStack
    };
    var fallback = map[family];
    return fallback ? "'" + family + "', " + fallback : "'" + family + "', sans-serif";
  }

  // --- Hex color parser ---
  function hexToRgb(hex) {
    var c = hex.replace("#", "");
    return [parseInt(c.substring(0,2),16), parseInt(c.substring(2,4),16), parseInt(c.substring(4,6),16)];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // --- Seeded PRNG (mulberry32) ---
  function mulberry32(seed) {
    var s = seed | 0;
    return function() {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =================================================================
  // Layer renderers — one function per layer type
  // =================================================================

  // --- shapes:rect ---
  function renderRect(ctx, props, b) {
    var cr = props.cornerRadius || 0;
    ctx.save();
    ctx.beginPath();
    if (cr > 0) {
      var r = Math.min(cr, b.width / 2, b.height / 2);
      ctx.roundRect(b.x, b.y, b.width, b.height, r);
    } else {
      ctx.rect(b.x, b.y, b.width, b.height);
    }
    applyShapeStyle(props, ctx);
    ctx.restore();
  }

  // --- shapes:ellipse ---
  function renderEllipse(ctx, props, b) {
    var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    var rx = b.width / 2, ry = b.height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    applyShapeStyle(props, ctx);
    ctx.restore();
  }

  // --- shapes:line ---
  function renderLine(ctx, props, b) {
    var color = props.strokeColor || "#ffffff";
    var width = props.strokeWidth || 2;
    var cap = props.lineCap || "round";
    var dashStr = props.dashPattern || "";
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.width, b.y + b.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    if (dashStr) {
      var dashes = dashStr.split(",").map(Number).filter(function(n) { return !isNaN(n) && n > 0; });
      if (dashes.length > 0) ctx.setLineDash(dashes);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --- shapes:polygon ---
  function polygonPoints(cx, cy, radius, sides, rotDeg) {
    var pts = [], step = (Math.PI * 2) / sides;
    var start = (rotDeg * Math.PI) / 180 - Math.PI / 2;
    for (var i = 0; i < sides; i++) {
      var a = start + i * step;
      pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    }
    return pts;
  }

  function renderPolygon(ctx, props, b) {
    var sides = props.sides || 6, rot = props.rotation || 0;
    var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    var r = Math.min(b.width, b.height) / 2;
    var pts = polygonPoints(cx, cy, r, sides, rot);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    applyShapeStyle(props, ctx);
    ctx.restore();
  }

  // --- shapes:star ---
  function starPoints(cx, cy, outerR, innerRatio, numPts, rotDeg) {
    var verts = [], innerR = outerR * innerRatio;
    var step = Math.PI / numPts;
    var start = (rotDeg * Math.PI) / 180 - Math.PI / 2;
    for (var i = 0; i < numPts * 2; i++) {
      var a = start + i * step;
      var r = i % 2 === 0 ? outerR : innerR;
      verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return verts;
  }

  function renderStar(ctx, props, b) {
    var numPts = props.points || 5;
    var innerRatio = props.innerRadius || 0.4;
    var rot = props.rotation || 0;
    var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    var outerR = Math.min(b.width, b.height) / 2;
    var verts = starPoints(cx, cy, outerR, innerRatio, numPts, rot);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (var i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    applyShapeStyle(props, ctx);
    ctx.restore();
  }

  // --- typography:text ---
  function renderText(ctx, props, b) {
    var text = props.text || ""; if (!text) return;
    var fontSize = props.fontSize || 48;
    var fontFamily = props.fontFamily || "Inter";
    var fontWeight = props.fontWeight || "400";
    var fontStyle = props.fontStyle || "normal";
    var color = props.color || "#ffffff";
    var align = props.align || "left";
    var baseline = props.baseline || "top";
    var lineHeight = props.lineHeight || 1.2;
    var strokeEnabled = props.strokeEnabled || false;
    var strokeColor = props.strokeColor || "#000000";
    var strokeWidth = props.strokeWidth || 2;
    var shadowEnabled = props.shadowEnabled || false;
    var shadowColor = props.shadowColor || "rgba(0,0,0,0.5)";
    var shadowBlur = props.shadowBlur || 4;
    var shadowOffsetX = props.shadowOffsetX || 2;
    var shadowOffsetY = props.shadowOffsetY || 2;

    ctx.save();
    ctx.font = fontStyle + " " + fontWeight + " " + fontSize + "px " + resolveFontStack(fontFamily);
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    var x = b.x;
    if (align === "center") x = b.x + b.width / 2;
    else if (align === "right") x = b.x + b.width;

    if (shadowEnabled) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = shadowOffsetX;
      ctx.shadowOffsetY = shadowOffsetY;
    }

    var lines = text.split("\\n");
    var spacing = fontSize * lineHeight;
    for (var i = 0; i < lines.length; i++) {
      var ly = b.y + i * spacing;
      if (strokeEnabled && strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = "round";
        ctx.strokeText(lines[i], x, ly);
      }
      ctx.fillStyle = color;
      ctx.fillText(lines[i], x, ly);
    }
    ctx.restore();
  }

  // --- filter:vignette ---
  function renderVignette(ctx, props, b) {
    var intensity = props.intensity !== undefined ? props.intensity : 0.5;
    var radius = props.radius !== undefined ? props.radius : 0.7;
    var softness = props.softness !== undefined ? props.softness : 0.5;
    var color = props.color || "#000000";
    if (intensity <= 0) return;
    var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    var maxDim = Math.max(b.width, b.height);
    var innerR = maxDim * radius * (1 - softness);
    var outerR = maxDim * radius;
    var rgb = hexToRgb(color);
    var grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
    grad.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + intensity + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(b.x, b.y, b.width, b.height);
  }

  // --- filter:blur ---
  function renderBlur(ctx, props, b) {
    var radius = props.radius !== undefined ? props.radius : 4;
    if (radius <= 0) return;
    var w = Math.ceil(b.width), h = Math.ceil(b.height);
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.filter = "blur(" + radius + "px)";
    var imgData = ctx.getImageData(b.x, b.y, w, h);
    var tmp = new OffscreenCanvas(w, h);
    var tCtx = tmp.getContext("2d");
    tCtx.putImageData(imgData, 0, 0);
    ctx.clearRect(b.x, b.y, w, h);
    ctx.drawImage(tmp, b.x, b.y);
    ctx.restore();
  }

  // --- filter:grain ---
  function renderGrain(ctx, props, b) {
    var intensity = props.intensity !== undefined ? props.intensity : 0.3;
    var grainSize = props.size || 1;
    var seed = props.seed || 0;
    var monochrome = props.monochrome !== undefined ? props.monochrome : true;
    if (intensity <= 0) return;
    var w = Math.ceil(b.width), h = Math.ceil(b.height);
    if (w <= 0 || h <= 0) return;
    var imgData = ctx.getImageData(b.x, b.y, w, h);
    var data = imgData.data;
    var rand = mulberry32(seed);
    var amount = intensity * 255;
    var step = Math.max(1, Math.round(grainSize));
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var noise = (rand() - 0.5) * amount;
        for (var dy = 0; dy < step && y + dy < h; dy++) {
          for (var dx = 0; dx < step && x + dx < w; dx++) {
            var idx = ((y + dy) * w + (x + dx)) * 4;
            if (monochrome) {
              data[idx]   = Math.max(0, Math.min(255, data[idx]   + noise));
              data[idx+1] = Math.max(0, Math.min(255, data[idx+1] + noise));
              data[idx+2] = Math.max(0, Math.min(255, data[idx+2] + noise));
            } else {
              data[idx]   = Math.max(0, Math.min(255, data[idx]   + (rand()-0.5)*amount));
              data[idx+1] = Math.max(0, Math.min(255, data[idx+1] + (rand()-0.5)*amount));
              data[idx+2] = Math.max(0, Math.min(255, data[idx+2] + (rand()-0.5)*amount));
            }
          }
        }
      }
    }
    ctx.putImageData(imgData, b.x, b.y);
  }

  // --- filter:duotone ---
  function renderDuotone(ctx, props, b) {
    var darkColor = props.darkColor || "#000033";
    var lightColor = props.lightColor || "#ffcc00";
    var intensity = props.intensity !== undefined ? props.intensity : 1.0;
    if (intensity <= 0) return;
    var w = Math.ceil(b.width), h = Math.ceil(b.height);
    if (w <= 0 || h <= 0) return;
    var dark = hexToRgb(darkColor), light = hexToRgb(lightColor);
    var imgData = ctx.getImageData(b.x, b.y, w, h);
    var data = imgData.data;
    for (var i = 0; i < data.length; i += 4) {
      var lum = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) / 255;
      data[i]   = Math.round(lerp(data[i],   lerp(dark[0], light[0], lum), intensity));
      data[i+1] = Math.round(lerp(data[i+1], lerp(dark[1], light[1], lum), intensity));
      data[i+2] = Math.round(lerp(data[i+2], lerp(dark[2], light[2], lum), intensity));
    }
    ctx.putImageData(imgData, b.x, b.y);
  }

  // --- filter:chromatic-aberration ---
  function renderChromaticAberration(ctx, props, b) {
    var offsetX = props.offsetX !== undefined ? props.offsetX : 3;
    var offsetY = props.offsetY !== undefined ? props.offsetY : 0;
    var intensity = props.intensity !== undefined ? props.intensity : 1.0;
    if (intensity <= 0 || (offsetX === 0 && offsetY === 0)) return;
    var w = Math.ceil(b.width), h = Math.ceil(b.height);
    if (w <= 0 || h <= 0) return;
    var ox = Math.round(offsetX * intensity), oy = Math.round(offsetY * intensity);
    var imgData = ctx.getImageData(b.x, b.y, w, h);
    var src = new Uint8ClampedArray(imgData.data);
    var dst = imgData.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var di = (y * w + x) * 4;
        var rx = Math.max(0, Math.min(w-1, x+ox)), ry = Math.max(0, Math.min(h-1, y+oy));
        dst[di] = src[(ry * w + rx) * 4];
        dst[di+1] = src[di+1];
        var bx = Math.max(0, Math.min(w-1, x-ox)), by = Math.max(0, Math.min(h-1, y-oy));
        dst[di+2] = src[(by * w + bx) * 4 + 2];
        dst[di+3] = src[di+3];
      }
    }
    ctx.putImageData(imgData, b.x, b.y);
  }

  // --- guides:grid ---
  function renderGridGuide(ctx, props, b) {
    var color = props.guideColor || "rgba(0,200,255,0.5)";
    var lw = props.lineWidth || 1;
    var dash = props.dashPattern || "6,4";
    var cols = props.columns || 4, rows = props.rows || 4;
    var margin = props.margin || 0;
    var x0 = b.x + margin, y0 = b.y + margin;
    var w = b.width - margin * 2, h = b.height - margin * 2;
    ctx.save();
    setupGuideStyle(ctx, color, lw, dash);
    for (var i = 0; i <= cols; i++) drawLine(ctx, x0 + (w/cols)*i, y0, x0 + (w/cols)*i, y0 + h);
    for (var j = 0; j <= rows; j++) drawLine(ctx, x0, y0 + (h/rows)*j, x0 + w, y0 + (h/rows)*j);
    ctx.restore();
  }

  // --- guides:thirds ---
  function renderThirdsGuide(ctx, props, b) {
    var color = props.guideColor || "rgba(0,200,255,0.5)";
    var lw = props.lineWidth || 1;
    var dash = props.dashPattern || "6,4";
    ctx.save();
    setupGuideStyle(ctx, color, lw, dash);
    var x1 = b.x + b.width / 3, x2 = b.x + (b.width * 2) / 3;
    drawLine(ctx, x1, b.y, x1, b.y + b.height);
    drawLine(ctx, x2, b.y, x2, b.y + b.height);
    var y1 = b.y + b.height / 3, y2 = b.y + (b.height * 2) / 3;
    drawLine(ctx, b.x, y1, b.x + b.width, y1);
    drawLine(ctx, b.x, y2, b.x + b.width, y2);
    ctx.restore();
  }

  // --- guides:diagonal ---
  function renderDiagonalGuide(ctx, props, b) {
    var color = props.guideColor || "rgba(0,200,255,0.5)";
    var lw = props.lineWidth || 1;
    var dash = props.dashPattern || "6,4";
    var pattern = props.pattern || "x";
    ctx.save();
    setupGuideStyle(ctx, color, lw, dash);
    if (pattern === "x" || pattern === "baroque") drawLine(ctx, b.x, b.y, b.x + b.width, b.y + b.height);
    if (pattern === "x" || pattern === "sinister") drawLine(ctx, b.x + b.width, b.y, b.x, b.y + b.height);
    ctx.restore();
  }

  // --- guides:golden-ratio ---
  function renderGoldenRatioGuide(ctx, props, b) {
    var color = props.guideColor || "rgba(0,200,255,0.5)";
    var lw = props.lineWidth || 1;
    var dash = props.dashPattern || "6,4";
    var PHI_INV = 0.6180339887498949;
    ctx.save();
    setupGuideStyle(ctx, color, lw, dash);
    var xL = b.x + b.width * (1 - PHI_INV), xR = b.x + b.width * PHI_INV;
    drawLine(ctx, xL, b.y, xL, b.y + b.height);
    drawLine(ctx, xR, b.y, xR, b.y + b.height);
    var yT = b.y + b.height * (1 - PHI_INV), yB = b.y + b.height * PHI_INV;
    drawLine(ctx, b.x, yT, b.x + b.width, yT);
    drawLine(ctx, b.x, yB, b.x + b.width, yB);
    ctx.restore();
  }

  // --- guides:custom ---
  function renderCustomGuide(ctx, props, b) {
    var color = props.guideColor || "rgba(0,200,255,0.5)";
    var lw = props.lineWidth || 1;
    var dash = props.dashPattern || "6,4";
    var orientation = props.orientation || "horizontal";
    var position = props.position !== undefined ? props.position : 50;
    ctx.save();
    setupGuideStyle(ctx, color, lw, dash);
    var t = position / 100;
    if (orientation === "horizontal") {
      var y = b.y + b.height * t;
      drawLine(ctx, b.x, y, b.x + b.width, y);
    } else {
      var x = b.x + b.width * t;
      drawLine(ctx, x, b.y, x, b.y + b.height);
    }
    ctx.restore();
  }

  // =================================================================
  // Layer type dispatch
  // =================================================================

  var RENDERERS = {
    "shapes:rect": renderRect,
    "shapes:ellipse": renderEllipse,
    "shapes:line": renderLine,
    "shapes:polygon": renderPolygon,
    "shapes:star": renderStar,
    "typography:text": renderText,
    "filter:vignette": renderVignette,
    "filter:blur": renderBlur,
    "filter:grain": renderGrain,
    "filter:duotone": renderDuotone,
    "filter:chromatic-aberration": renderChromaticAberration,
    "guides:grid": renderGridGuide,
    "guides:thirds": renderThirdsGuide,
    "guides:diagonal": renderDiagonalGuide,
    "guides:golden-ratio": renderGoldenRatioGuide,
    "guides:custom": renderCustomGuide
  };

  // =================================================================
  // Compositing entry point
  // =================================================================

  function compositeLayer(layer, ctx) {
    if (!layer.visible) return;

    // Recurse into group layers
    if (layer.children && layer.children.length > 0) {
      ctx.save();
      ctx.globalAlpha *= layer.opacity;
      ctx.globalCompositeOperation = toCompositeOp(layer.blendMode);
      for (var i = 0; i < layer.children.length; i++) {
        compositeLayer(layer.children[i], ctx);
      }
      ctx.restore();
      return;
    }

    var render = RENDERERS[layer.type];
    if (!render) return;

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = toCompositeOp(layer.blendMode);

    // Transform: translate → rotate → scale around anchor
    var t = layer.transform;
    var ax = t.x + t.width * t.anchorX;
    var ay = t.y + t.height * t.anchorY;
    ctx.translate(ax, ay);
    if (t.rotation !== 0) ctx.rotate((t.rotation * Math.PI) / 180);
    if (t.scaleX !== 1 || t.scaleY !== 1) ctx.scale(t.scaleX, t.scaleY);
    ctx.translate(-ax, -ay);

    var bounds = { x: t.x, y: t.y, width: t.width, height: t.height };
    render(ctx, layer.properties, bounds);

    ctx.restore();
  }

  // Stores a snapshot of the canvas before layers are composited so live
  // layer updates can restore the clean sketch output before re-compositing.
  var __cleanSnapshot = null;

  window.__genart_compositeLayers = function(canvas) {
    if (!canvas || !__genart_layers || __genart_layers.length === 0) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Save a clean copy of the sketch output (before any layers)
    try { __cleanSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch(e) {}
    for (var i = 0; i < __genart_layers.length; i++) {
      compositeLayer(__genart_layers[i], ctx);
    }
  };

  // --- WebGL compositing helper ---
  // Renders layers to an offscreen 2D canvas for upload as a WebGL texture.
  window.__genart_compositeToOffscreen = function(width, height) {
    if (!__genart_layers || __genart_layers.length === 0) return null;
    var oc = new OffscreenCanvas(width, height);
    var ctx = oc.getContext("2d");
    if (!ctx) return null;
    for (var i = 0; i < __genart_layers.length; i++) {
      compositeLayer(__genart_layers[i], ctx);
    }
    return oc;
  };

  // --- postMessage listener for live layer updates ---
  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "design:updateLayers") {
      __genart_layers = e.data.layers;
      var canvas = document.getElementById("canvas") || document.querySelector("canvas");
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      // Restore the clean sketch output before re-compositing layers
      if (ctx && __cleanSnapshot) {
        ctx.putImageData(__cleanSnapshot, 0, 0);
      }
      if (__genart_layers && __genart_layers.length > 0) {
        for (var i = 0; i < __genart_layers.length; i++) {
          compositeLayer(__genart_layers[i], ctx);
        }
      }
    }
  });
})();
</script>`;
}

/**
 * Generate a compositor call to insert at the end of a Canvas2D/p5 standalone HTML script.
 * This triggers compositing after the sketch finishes its initial render.
 */
export function generateCompositorCall(): string {
  return `
      // Composite design layers onto the sketch canvas
      if (window.__genart_compositeLayers) {
        var __c = document.getElementById('canvas') || document.querySelector('canvas');
        if (__c) window.__genart_compositeLayers(__c);
      }`;
}

/**
 * Generate the WebGL composite shader pass code for GLSL/Three.js adapters.
 * After the sketch renders to the main canvas, this code:
 * 1. Renders layers to an offscreen 2D canvas
 * 2. Uploads that canvas as a WebGL texture
 * 3. Draws a fullscreen quad that alpha-blends the layer texture on top
 */
export function generateWebGLCompositorCode(): string {
  return `
    // --- Design layer compositing (Canvas→Texture) ---
    var __layerTex = null;
    var __compositeProgram = null;
    var __compositeVao = null;

    function __setupCompositePass(gl) {
      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, '#version 300 es\\nin vec2 a_position;out vec2 v_uv;void main(){v_uv=vec2(a_position.x*0.5+0.5,0.5-a_position.y*0.5);gl_Position=vec4(a_position,0,1);}');
      gl.compileShader(vs);
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, '#version 300 es\\nprecision highp float;uniform sampler2D u_layers;in vec2 v_uv;out vec4 fragColor;void main(){vec4 c=texture(u_layers,v_uv);fragColor=c;}');
      gl.compileShader(fs);
      __compositeProgram = gl.createProgram();
      gl.attachShader(__compositeProgram, vs);
      gl.attachShader(__compositeProgram, fs);
      gl.linkProgram(__compositeProgram);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      __layerTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, __layerTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      var positions = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      __compositeVao = gl.createVertexArray();
      gl.bindVertexArray(__compositeVao);
      var aPos = gl.getAttribLocation(__compositeProgram, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }

    function __compositeLayersWebGL(gl, width, height) {
      if (!window.__genart_compositeToOffscreen) return;
      var oc = window.__genart_compositeToOffscreen(width, height);
      if (!oc) return;

      if (!__compositeProgram) __setupCompositePass(gl);

      // Upload offscreen canvas as texture
      gl.bindTexture(gl.TEXTURE_2D, __layerTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, oc);

      // Draw with alpha blending
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(__compositeProgram);
      var loc = gl.getUniformLocation(__compositeProgram, 'u_layers');
      gl.uniform1i(loc, 0);
      gl.bindVertexArray(__compositeVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }`;
}

/**
 * Generate a `<script>` block that injects SVG elements for design layers
 * into the sketch's SVG container. Only layers with SVG-compatible types
 * (shapes, text) are rendered; filters and some guides are skipped.
 *
 * @param layers - Design layers to render as SVG
 * @returns HTML `<script>` string to inject into SVG standalone HTML
 */
export function generateSVGLayerScript(layers: readonly DesignLayer[]): string {
  if (!layers || layers.length === 0) return "";

  const layersJson = JSON.stringify(layers);

  return `<script>
(function() {
  "use strict";

  var __layers = ${layersJson};

  function polygonPts(cx, cy, r, sides, rotDeg) {
    var pts = [], step = (Math.PI * 2) / sides;
    var start = (rotDeg * Math.PI) / 180 - Math.PI / 2;
    for (var i = 0; i < sides; i++) {
      var a = start + i * step;
      pts.push(cx + r * Math.cos(a) + "," + (cy + r * Math.sin(a)));
    }
    return pts.join(" ");
  }

  function starPts(cx, cy, outerR, innerRatio, numPts, rotDeg) {
    var pts = [], innerR = outerR * innerRatio;
    var step = Math.PI / numPts;
    var start = (rotDeg * Math.PI) / 180 - Math.PI / 2;
    for (var i = 0; i < numPts * 2; i++) {
      var a = start + i * step;
      var r = i % 2 === 0 ? outerR : innerR;
      pts.push(cx + r * Math.cos(a) + "," + (cy + r * Math.sin(a)));
    }
    return pts.join(" ");
  }

  function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function renderLayerSVG(layer) {
    if (!layer.visible) return "";
    var t = layer.transform;
    var b = { x: t.x, y: t.y, width: t.width, height: t.height };
    var p = layer.properties;
    var svg = "";

    switch (layer.type) {
      case "shapes:rect": {
        var fill = p.fillEnabled !== false ? (p.fillColor || "#ffffff") : "none";
        var stroke = p.strokeEnabled ? (p.strokeColor || "#000000") : "none";
        var sw = p.strokeEnabled ? (p.strokeWidth || 0) : 0;
        var cr = p.cornerRadius || 0;
        svg = '<rect x="'+b.x+'" y="'+b.y+'" width="'+b.width+'" height="'+b.height+'" rx="'+cr+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
        break;
      }
      case "shapes:ellipse": {
        var fill = p.fillEnabled !== false ? (p.fillColor || "#ffffff") : "none";
        var stroke = p.strokeEnabled ? (p.strokeColor || "#000000") : "none";
        var sw = p.strokeEnabled ? (p.strokeWidth || 0) : 0;
        svg = '<ellipse cx="'+(b.x+b.width/2)+'" cy="'+(b.y+b.height/2)+'" rx="'+(b.width/2)+'" ry="'+(b.height/2)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
        break;
      }
      case "shapes:line": {
        var color = p.strokeColor || "#ffffff";
        var w = p.strokeWidth || 2;
        var cap = p.lineCap || "round";
        svg = '<line x1="'+b.x+'" y1="'+b.y+'" x2="'+(b.x+b.width)+'" y2="'+(b.y+b.height)+'" stroke="'+color+'" stroke-width="'+w+'" stroke-linecap="'+cap+'"/>';
        break;
      }
      case "shapes:polygon": {
        var fill = p.fillEnabled !== false ? (p.fillColor || "#ffffff") : "none";
        var stroke = p.strokeEnabled ? (p.strokeColor || "#000000") : "none";
        var sw = p.strokeEnabled ? (p.strokeWidth || 0) : 0;
        var sides = p.sides || 6, rot = p.rotation || 0;
        var r = Math.min(b.width, b.height) / 2;
        svg = '<polygon points="'+polygonPts(b.x+b.width/2, b.y+b.height/2, r, sides, rot)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
        break;
      }
      case "shapes:star": {
        var fill = p.fillEnabled !== false ? (p.fillColor || "#ffffff") : "none";
        var stroke = p.strokeEnabled ? (p.strokeColor || "#000000") : "none";
        var sw = p.strokeEnabled ? (p.strokeWidth || 0) : 0;
        var numPts = p.points || 5, ir = p.innerRadius || 0.4, rot = p.rotation || 0;
        var outerR = Math.min(b.width, b.height) / 2;
        svg = '<polygon points="'+starPts(b.x+b.width/2, b.y+b.height/2, outerR, ir, numPts, rot)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
        break;
      }
      case "typography:text": {
        var text = p.text || ""; if (!text) break;
        var fontSize = p.fontSize || 48;
        var fontFamily = p.fontFamily || "Inter";
        var fontWeight = p.fontWeight || "400";
        var fontStyle = p.fontStyle || "normal";
        var color = p.color || "#ffffff";
        var align = p.align || "left";
        var anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
        var x = align === "center" ? b.x + b.width/2 : align === "right" ? b.x + b.width : b.x;
        svg = '<text x="'+x+'" y="'+(b.y+fontSize)+'" font-family="'+fontFamily+'" font-size="'+fontSize+'" font-weight="'+fontWeight+'" font-style="'+fontStyle+'" fill="'+color+'" text-anchor="'+anchor+'">'+esc(text)+'</text>';
        break;
      }
      default:
        // Filters and guides are not supported in SVG mode
        break;
    }

    if (!svg) return "";

    // Wrap in a group with transform, opacity, blend mode
    var transforms = [];
    var ax = t.x + t.width * t.anchorX, ay = t.y + t.height * t.anchorY;
    if (t.rotation !== 0) transforms.push("rotate("+t.rotation+" "+ax+" "+ay+")");
    if (t.scaleX !== 1 || t.scaleY !== 1) transforms.push("translate("+ax+" "+ay+") scale("+t.scaleX+" "+t.scaleY+") translate("+ (-ax)+" "+(-ay)+")");
    var tfAttr = transforms.length > 0 ? ' transform="'+transforms.join(" ")+'"' : "";
    var opAttr = layer.opacity < 1 ? ' opacity="'+layer.opacity+'"' : "";

    return '<g'+tfAttr+opAttr+'>'+svg+'</g>';
  }

  // Wait for SVG to be rendered, then inject layer elements
  setTimeout(function() {
    var container = document.getElementById("svg-container");
    if (!container) return;
    var svgEl = container.querySelector("svg");
    if (!svgEl) return;

    var svgContent = "";
    for (var i = 0; i < __layers.length; i++) {
      svgContent += renderLayerSVG(__layers[i]);
    }

    if (svgContent) {
      // Append layer elements inside the SVG
      var wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
      wrapper.setAttribute("id", "design-layers");
      wrapper.innerHTML = svgContent;
      svgEl.appendChild(wrapper);
    }
  }, 50);

  // postMessage listener for live updates
  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "design:updateLayers") {
      __layers = e.data.layers;
      var container = document.getElementById("svg-container");
      if (!container) return;
      var svgEl = container.querySelector("svg");
      if (!svgEl) return;
      var existing = svgEl.getElementById("design-layers");
      if (existing) existing.remove();
      var svgContent = "";
      for (var i = 0; i < __layers.length; i++) svgContent += renderLayerSVG(__layers[i]);
      if (svgContent) {
        var wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wrapper.setAttribute("id", "design-layers");
        wrapper.innerHTML = svgContent;
        svgEl.appendChild(wrapper);
      }
    }
  });
})();
</script>`;
}
