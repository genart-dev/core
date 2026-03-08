import type { SketchDefinition } from "@genart-dev/format";

/**
 * Generate the interactive control panel HTML (CSS + JS) for embedding
 * in a self-contained interactive HTML preview.
 *
 * The panel includes:
 * - Header with genart.dev branding, filename, renderer badge, seed + reseed
 * - Parameter sliders (auto-generated from ParamDef[])
 * - Color pickers (auto-generated from ColorDef[])
 * - Theme selector (dropdown if themes exist)
 * - Philosophy section
 * - File metadata section
 * - Copy State button (outputs JSON for update_sketch)
 */
export function generateInteractivePanel(sketch: SketchDefinition): {
  css: string;
  html: string;
  js: string;
} {
  const css = generatePanelCSS();
  const html = generatePanelHTML(sketch);
  const js = generatePanelJS(sketch);
  return { css, html, js };
}

function generatePanelCSS(): string {
  return `
    :root {
      --gp-bg: #0a0a0a;
      --gp-panel: #141414;
      --gp-border: #2a2a2a;
      --gp-text: #f0f0f0;
      --gp-text-secondary: #aaaaaa;
      --gp-text-muted: #666666;
      --gp-accent: #c4342d;
      --gp-input-bg: #1a1a1a;
      --gp-input-border: #333333;
      --gp-slider-track: #333333;
      --gp-slider-thumb: #c4342d;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--gp-bg);
      color: var(--gp-text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
      font-size: 13px;
      display: flex;
      min-height: 100vh;
    }
    #canvas-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: 0;
    }
    #canvas-container canvas {
      display: block;
      max-width: 100%;
      max-height: 100vh;
    }

    /* Panel */
    #genart-panel {
      width: 320px;
      min-width: 320px;
      background: var(--gp-panel);
      border-left: 1px solid var(--gp-border);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .gp-header {
      padding: 16px;
      border-bottom: 1px solid var(--gp-border);
    }
    .gp-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .gp-brand {
      font-size: 13px;
      font-weight: 600;
      color: var(--gp-text-secondary);
      letter-spacing: -0.3px;
    }
    .gp-filename {
      font-size: 12px;
      color: var(--gp-text-muted);
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }
    .gp-meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .gp-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--gp-accent);
      color: #fff;
    }
    .gp-seed-display {
      font-size: 12px;
      color: var(--gp-text-secondary);
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }
    .gp-reseed-btn {
      margin-left: auto;
      background: none;
      border: 1px solid var(--gp-border);
      color: var(--gp-text-secondary);
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
    }
    .gp-reseed-btn:hover { background: #1e1e1e; color: var(--gp-text); }

    /* Sections */
    .gp-section {
      padding: 14px 16px;
      border-bottom: 1px solid var(--gp-border);
    }
    .gp-section-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gp-text-muted);
      margin-bottom: 12px;
      font-weight: 600;
    }

    /* Parameter rows */
    .gp-param-row {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }
    .gp-param-row:last-child { margin-bottom: 0; }
    .gp-param-label {
      flex: 0 0 auto;
      min-width: 0;
      font-size: 12px;
      color: var(--gp-text-secondary);
      margin-right: 12px;
    }
    .gp-param-slider {
      flex: 1;
      -webkit-appearance: none;
      appearance: none;
      height: 3px;
      background: var(--gp-slider-track);
      border-radius: 2px;
      outline: none;
      margin: 0 10px;
    }
    .gp-param-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--gp-slider-thumb);
      cursor: pointer;
    }
    .gp-param-value {
      flex: 0 0 auto;
      min-width: 36px;
      font-size: 12px;
      color: var(--gp-accent);
      text-align: right;
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }

    /* Color rows */
    .gp-color-row {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .gp-color-row:last-child { margin-bottom: 0; }
    .gp-color-label {
      flex: 1;
      font-size: 12px;
      color: var(--gp-text-secondary);
    }
    .gp-color-input {
      width: 32px;
      height: 24px;
      border: 1px solid var(--gp-border);
      border-radius: 4px;
      background: none;
      cursor: pointer;
      padding: 0;
    }

    /* Theme selector */
    .gp-theme-select {
      width: 100%;
      background: var(--gp-input-bg);
      border: 1px solid var(--gp-input-border);
      color: var(--gp-text);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      font-family: inherit;
    }

    /* Philosophy */
    .gp-philosophy {
      font-size: 12px;
      line-height: 1.5;
      color: var(--gp-text-muted);
    }

    /* File info */
    .gp-info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      font-size: 11px;
    }
    .gp-info-key {
      color: var(--gp-text-muted);
    }
    .gp-info-val {
      color: var(--gp-text-secondary);
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }

    /* Toast */
    .gp-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--gp-accent);
      color: #fff;
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      z-index: 1001;
    }
  `;
}

function generatePanelHTML(sketch: SketchDefinition): string {
  const parts: string[] = [];
  const renderer =
    typeof sketch.renderer === "string"
      ? sketch.renderer
      : sketch.renderer?.type ?? "p5";
  const filename = `${sketch.id}.genart`;

  parts.push(`<div id="genart-panel">`);

  // Header
  parts.push(`<div class="gp-header">`);
  parts.push(`<div class="gp-header-top">`);
  parts.push(`<span class="gp-brand">genart.dev</span>`);
  parts.push(`<span class="gp-filename">${escapeHtml(filename)}</span>`);
  parts.push(`</div>`);
  parts.push(`<div class="gp-meta-row">`);
  parts.push(
    `<span class="gp-badge">${escapeHtml(renderer.toUpperCase())}</span>`,
  );
  parts.push(
    `<span class="gp-seed-display">seed: <span id="gp-seed-val">${sketch.state.seed}</span></span>`,
  );
  parts.push(
    `<button class="gp-reseed-btn" onclick="__gp_seedRandom()">&#x21bb; reseed</button>`,
  );
  parts.push(`</div>`);
  parts.push(`</div>`);

  // Parameters
  if (sketch.parameters.length > 0) {
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-section-title">Parameters</div>`);
    for (const param of sketch.parameters) {
      const value = sketch.state.params[param.key] ?? param.default;
      parts.push(`<div class="gp-param-row">`);
      parts.push(
        `<span class="gp-param-label">${escapeHtml(param.label)}</span>`,
      );
      parts.push(
        `<input type="range" class="gp-param-slider" id="gp-param-${param.key}" min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" oninput="__gp_paramChange('${param.key}', this.value)">`,
      );
      parts.push(
        `<span class="gp-param-value" id="gp-param-val-${param.key}">${value}</span>`,
      );
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  // Colors
  if (sketch.colors.length > 0) {
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-section-title">Colors</div>`);
    for (let i = 0; i < sketch.colors.length; i++) {
      const colorDef = sketch.colors[i];
      const value = sketch.state.colorPalette[i] ?? colorDef.default;
      parts.push(`<div class="gp-color-row">`);
      parts.push(
        `<span class="gp-color-label">${escapeHtml(colorDef.label)}</span>`,
      );
      parts.push(
        `<input type="color" class="gp-color-input" id="gp-color-${i}" value="${value}" onchange="__gp_colorChange(${i}, this.value)">`,
      );
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  // Themes
  if (sketch.themes && sketch.themes.length > 0) {
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-section-title">Themes</div>`);
    parts.push(
      `<select class="gp-theme-select" id="gp-theme" onchange="__gp_themeChange(this.value)">`,
    );
    parts.push(`<option value="">Custom</option>`);
    for (let i = 0; i < sketch.themes.length; i++) {
      parts.push(
        `<option value="${i}">${escapeHtml(sketch.themes[i].name)}</option>`,
      );
    }
    parts.push(`</select>`);
    parts.push(`</div>`);
  }

  // Philosophy
  if (sketch.philosophy) {
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-section-title">Philosophy</div>`);
    parts.push(
      `<div class="gp-philosophy">${escapeHtml(sketch.philosophy)}</div>`,
    );
    parts.push(`</div>`);
  }

  // File info
  parts.push(`<div class="gp-section">`);
  parts.push(`<div class="gp-section-title">File</div>`);
  parts.push(`<div class="gp-info-grid">`);
  parts.push(`<span class="gp-info-key">id:</span>`);
  parts.push(
    `<span class="gp-info-val">${escapeHtml(sketch.id)}</span>`,
  );
  parts.push(`<span class="gp-info-key">renderer:</span>`);
  parts.push(
    `<span class="gp-info-val">${escapeHtml(renderer)}</span>`,
  );
  parts.push(`<span class="gp-info-key">canvas:</span>`);
  parts.push(
    `<span class="gp-info-val">${sketch.canvas.width} &times; ${sketch.canvas.height}</span>`,
  );
  parts.push(`<span class="gp-info-key">format:</span>`);
  parts.push(
    `<span class="gp-info-val">genart ${(sketch as Record<string, unknown>).genart ?? "1.1"}</span>`,
  );
  if (sketch.agent) {
    parts.push(`<span class="gp-info-key">agent:</span>`);
    parts.push(
      `<span class="gp-info-val">${escapeHtml(sketch.agent)}</span>`,
    );
  }
  parts.push(`</div>`);
  parts.push(`</div>`);

  parts.push(`</div>`); // end #genart-panel
  parts.push(`<div class="gp-toast" id="gp-toast"></div>`);

  return parts.join("\n");
}

function generatePanelJS(sketch: SketchDefinition): string {
  const colorsJson = JSON.stringify(sketch.colors);
  const themesJson = JSON.stringify(sketch.themes ?? []);
  const sketchId = sketch.id;

  return `
    // --- Interactive Panel State ---
    var __gp_state = JSON.parse(JSON.stringify(state));
    var __gp_colorDefs = ${colorsJson};
    var __gp_themes = ${themesJson};
    var __gp_sketchId = ${JSON.stringify(sketchId)};
    var __gp_rerender = null; // set by adapter

    function __gp_seedPrev() {
      var s = Math.max(0, __gp_state.seed - 1);
      __gp_state.seed = s;
      document.getElementById('gp-seed-val').textContent = s;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedNext() {
      __gp_state.seed = __gp_state.seed + 1;
      document.getElementById('gp-seed-val').textContent = __gp_state.seed;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedRandom() {
      var s = Math.floor(Math.random() * 100000);
      __gp_state.seed = s;
      document.getElementById('gp-seed-val').textContent = s;
      __gp_rerender && __gp_rerender();
    }

    function __gp_paramChange(key, val) {
      var v = parseFloat(val);
      __gp_state.params[key] = v;
      __gp_state.PARAMS && (__gp_state.PARAMS[key] = v);
      document.getElementById('gp-param-' + key).value = v;
      document.getElementById('gp-param-val-' + key).textContent = v;
      __gp_rerender && __gp_rerender();
    }

    function __gp_colorChange(idx, val) {
      __gp_state.colorPalette[idx] = val;
      // Update COLORS map
      if (__gp_state.COLORS && __gp_colorDefs[idx]) {
        __gp_state.COLORS[__gp_colorDefs[idx].key] = val;
      }
      // Clear theme selection
      var themeEl = document.getElementById('gp-theme');
      if (themeEl) themeEl.value = '';
      __gp_rerender && __gp_rerender();
    }

    function __gp_themeChange(val) {
      if (val === '') return;
      var theme = __gp_themes[parseInt(val, 10)];
      if (!theme) return;
      for (var i = 0; i < theme.colors.length; i++) {
        __gp_state.colorPalette[i] = theme.colors[i];
        var el = document.getElementById('gp-color-' + i);
        if (el) el.value = theme.colors[i];
        if (__gp_state.COLORS && __gp_colorDefs[i]) {
          __gp_state.COLORS[__gp_colorDefs[i].key] = theme.colors[i];
        }
      }
      __gp_rerender && __gp_rerender();
    }

    function __gp_copyState() {
      var out = {
        sketchId: __gp_sketchId,
        seed: __gp_state.seed,
        params: Object.assign({}, __gp_state.params),
        colors: __gp_state.colorPalette.slice()
      };
      var json = JSON.stringify(out, null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(json).then(function() {
          __gp_showToast('State copied to clipboard');
        });
      } else {
        prompt('Copy this state JSON:', json);
      }
    }

    function __gp_showToast(msg) {
      var el = document.getElementById('gp-toast');
      el.textContent = msg;
      el.style.opacity = '1';
      setTimeout(function() { el.style.opacity = '0'; }, 2000);
    }
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
