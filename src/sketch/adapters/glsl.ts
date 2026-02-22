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

/** Built-in uniforms that are not mapped from user parameters. */
const BUILTIN_UNIFORMS = new Set([
  "u_resolution",
  "u_time",
  "u_seed",
]);

/** Standard fullscreen quad vertex shader for WebGL2. */
const FULLSCREEN_QUAD_VERTEX = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * Compiled GLSL algorithm — contains the fragment and vertex shaders
 * plus extracted uniform name mappings.
 */
interface GLSLCompiledAlgorithm {
  fragmentSource: string;
  vertexSource: string;
  uniformNames: {
    params: string[];
    colors: string[];
  };
}

/**
 * Parse a hex color string to RGB floats in [0, 1] range.
 * Accepts "#rrggbb" or "rrggbb" format.
 */
export function hexToVec3(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Extract uniform declarations from GLSL source.
 * Returns uniform names categorized as built-in, param-mapped, or color-mapped.
 */
function extractUniforms(source: string): {
  params: string[];
  colors: string[];
} {
  const params: string[] = [];
  const colors: string[] = [];
  const uniformRegex = /uniform\s+(?:float|vec[234]|int|mat[234])\s+(u_\w+)/g;
  let match;

  while ((match = uniformRegex.exec(source)) !== null) {
    const name = match[1]!;
    if (BUILTIN_UNIFORMS.has(name)) continue;
    // Color uniforms are vec3 named u_color followed by a digit
    if (/^u_color\d+$/.test(name)) {
      colors.push(name);
    } else {
      params.push(name);
    }
  }

  return { params, colors };
}

/**
 * GLSL Renderer Adapter — full implementation.
 *
 * Validates GLSL fragment shaders, compiles them with a fullscreen quad
 * vertex shader, and creates live sketch instances using WebGL2.
 */
export class GLSLRendererAdapter implements RendererAdapter {
  readonly type: RendererType = "glsl";
  readonly displayName = "GLSL Shader";
  readonly algorithmLanguage = "glsl" as const;

  validate(algorithm: string): ValidationResult {
    if (!algorithm || algorithm.trim().length === 0) {
      return { valid: false, errors: ["Algorithm source is empty"] };
    }
    // Basic GLSL validation — check for version directive and main function
    const hasVersion = /#version\s+\d+\s+es/.test(algorithm);
    const hasMain = /void\s+main\s*\(\s*\)/.test(algorithm);
    const hasFragColor =
      /fragColor/.test(algorithm) || /gl_FragColor/.test(algorithm);

    const errors: string[] = [];
    if (!hasVersion) {
      errors.push("GLSL shaders should start with a #version directive (e.g., #version 300 es)");
    }
    if (!hasMain) {
      errors.push("GLSL shaders must contain a void main() function");
    }
    if (!hasFragColor) {
      errors.push("GLSL shaders must write to fragColor or gl_FragColor");
    }

    return { valid: errors.length === 0, errors };
  }

  async compile(algorithm: string): Promise<CompiledAlgorithm> {
    const validation = this.validate(algorithm);
    if (!validation.valid) {
      throw new Error(
        `GLSL compilation failed: ${validation.errors.join("; ")}`,
      );
    }

    const uniforms = extractUniforms(algorithm);

    const compiled: GLSLCompiledAlgorithm = {
      fragmentSource: algorithm,
      vertexSource: FULLSCREEN_QUAD_VERTEX,
      uniformNames: uniforms,
    };

    return compiled;
  }

  createInstance(
    compiled: CompiledAlgorithm,
    state: SketchState,
    canvas: CanvasSpec,
  ): SketchInstance {
    const { fragmentSource, vertexSource, uniformNames } =
      compiled as GLSLCompiledAlgorithm;

    let canvasEl: HTMLCanvasElement | null = null;
    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let container: HTMLElement | null = null;
    let currentState = { ...state };
    let animating = false;
    let animationFrameId: number | null = null;
    let startTime = 0;

    function compileShader(
      glCtx: WebGL2RenderingContext,
      type: number,
      source: string,
    ): WebGLShader {
      const shader = glCtx.createShader(type);
      if (!shader) throw new Error("Failed to create shader");
      glCtx.shaderSource(shader, source);
      glCtx.compileShader(shader);
      if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
        const info = glCtx.getShaderInfoLog(shader);
        glCtx.deleteShader(shader);
        throw new Error(`Shader compilation error: ${info}`);
      }
      return shader;
    }

    function bindUniforms(glCtx: WebGL2RenderingContext, prog: WebGLProgram) {
      // Built-in uniforms
      const resLoc = glCtx.getUniformLocation(prog, "u_resolution");
      if (resLoc) {
        glCtx.uniform2f(resLoc, canvas.width, canvas.height);
      }

      const seedLoc = glCtx.getUniformLocation(prog, "u_seed");
      if (seedLoc) {
        glCtx.uniform1f(seedLoc, currentState.seed);
      }

      const timeLoc = glCtx.getUniformLocation(prog, "u_time");
      if (timeLoc) {
        const elapsed = (performance.now() - startTime) / 1000;
        glCtx.uniform1f(timeLoc, elapsed);
      }

      // Parameter uniforms: u_paramName → state.params[paramName]
      for (const uName of uniformNames.params) {
        const loc = glCtx.getUniformLocation(prog, uName);
        if (!loc) continue;
        // Strip u_ prefix to get param key
        const paramKey = uName.substring(2);
        const value = currentState.params[paramKey];
        if (value !== undefined) {
          glCtx.uniform1f(loc, value);
        }
      }

      // Color uniforms: u_color1 → state.colorPalette[0], etc.
      for (const uName of uniformNames.colors) {
        const loc = glCtx.getUniformLocation(prog, uName);
        if (!loc) continue;
        // Extract 1-indexed number from u_colorN
        const idx = parseInt(uName.replace("u_color", ""), 10) - 1;
        const hex = currentState.colorPalette[idx];
        if (hex) {
          const [r, g, b] = hexToVec3(hex);
          glCtx.uniform3f(loc, r, g, b);
        }
      }
    }

    function renderFrame() {
      if (!gl || !program || !vao) return;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      bindUniforms(gl, program);

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    function animationLoop() {
      if (!animating) return;
      renderFrame();
      animationFrameId = requestAnimationFrame(animationLoop);
    }

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

        gl = canvasEl.getContext("webgl2", {
          preserveDrawingBuffer: true,
        });
        if (!gl) throw new Error("WebGL2 is not supported");

        // Compile and link shaders
        const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        const fragShader = compileShader(
          gl,
          gl.FRAGMENT_SHADER,
          fragmentSource,
        );

        program = gl.createProgram();
        if (!program) throw new Error("Failed to create WebGL program");
        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          const info = gl.getProgramInfoLog(program);
          throw new Error(`Program linking error: ${info}`);
        }

        // Clean up individual shaders (linked into program)
        gl.deleteShader(vertShader);
        gl.deleteShader(fragShader);

        // Set up fullscreen quad (two triangles covering clip space)
        // prettier-ignore
        const positions = new Float32Array([
          -1, -1,  1, -1,  -1, 1,
          -1,  1,  1, -1,   1, 1,
        ]);

        positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const aPosition = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        startTime = performance.now();
        animating = true;
        animationLoop();
      },

      unmount() {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        animating = false;

        if (gl) {
          if (vao) gl.deleteVertexArray(vao);
          if (positionBuffer) gl.deleteBuffer(positionBuffer);
          if (program) gl.deleteProgram(program);
        }

        if (canvasEl && container) {
          container.removeChild(canvasEl);
        }

        gl = null;
        program = null;
        vao = null;
        positionBuffer = null;
        canvasEl = null;
        container = null;
      },

      updateState(newState: SketchState) {
        currentState = { ...newState };
        // Uniforms are rebound on the next frame
        if (!animating) {
          renderFrame();
        }
      },

      redraw() {
        renderFrame();
      },

      pause() {
        animating = false;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      },

      resume() {
        if (!animating) {
          animating = true;
          animationLoop();
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
        if (!canvasEl || !gl) throw new Error("Sketch is not mounted");

        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // WebGL pixels are bottom-up — flip vertically
        const flipped = new Uint8Array(width * height * 4);
        const rowSize = width * 4;
        for (let y = 0; y < height; y++) {
          const srcOffset = y * rowSize;
          const dstOffset = (height - 1 - y) * rowSize;
          flipped.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
        }

        return new ImageData(
          new Uint8ClampedArray(flipped.buffer),
          width,
          height,
        );
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

      // Wait for initial render
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

    // Extract uniforms from the fragment shader for binding code
    const uniforms = extractUniforms(sketch.algorithm);
    const paramBindings = uniforms.params
      .map((u) => {
        const key = u.substring(2); // strip u_ prefix
        return `    { const loc = gl.getUniformLocation(program, "${u}"); if (loc && state.params["${key}"] !== undefined) gl.uniform1f(loc, state.params["${key}"]); }`;
      })
      .join("\n");

    const colorBindings = uniforms.colors
      .map((u) => {
        const idx = parseInt(u.replace("u_color", ""), 10) - 1;
        return `    { const loc = gl.getUniformLocation(program, "${u}"); if (loc && state.colorPalette[${idx}]) { const c = state.colorPalette[${idx}].replace('#',''); gl.uniform3f(loc, parseInt(c.substring(0,2),16)/255, parseInt(c.substring(2,4),16)/255, parseInt(c.substring(4,6),16)/255); } }`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sketch.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #111; }
    canvas { display: block; max-width: 100vw; max-height: 100vh; }
  </style>
</head>
<body>
  <canvas id="canvas" width="${width * pixelDensity}" height="${height * pixelDensity}" style="width:${width}px;height:${height}px;"></canvas>
  <script>
    const state = ${stateJson};

    const canvas = document.getElementById('canvas');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) { document.body.textContent = 'WebGL2 not supported'; throw new Error('No WebGL2'); }

    // Vertex shader: fullscreen quad
    const vertSrc = \`${FULLSCREEN_QUAD_VERTEX}\`;

    // Fragment shader
    const fragSrc = \`${sketch.algorithm.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`;

    function createShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }

    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

    const positions = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const startTime = performance.now();
    function render() {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      // Built-in uniforms
      { const loc = gl.getUniformLocation(program, 'u_resolution'); if (loc) gl.uniform2f(loc, ${width}, ${height}); }
      { const loc = gl.getUniformLocation(program, 'u_seed'); if (loc) gl.uniform1f(loc, state.seed); }
      { const loc = gl.getUniformLocation(program, 'u_time'); if (loc) gl.uniform1f(loc, (performance.now() - startTime) / 1000); }

      // Parameter uniforms
${paramBindings}

      // Color uniforms
${colorBindings}

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`;
  }

  getAlgorithmTemplate(): string {
    return `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform float u_noiseScale;    // mapped from state.params.noiseScale
uniform vec3 u_color1;         // mapped from state.colorPalette[0]
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}`;
  }

  getRuntimeDependencies(): RuntimeDependency[] {
    // GLSL runs on WebGL — no external CDN dependency
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
