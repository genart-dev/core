import type { SketchDefinition } from "@genart-dev/format";

/**
 * Generate the interactive control panel HTML (CSS + JS) for embedding
 * in a self-contained interactive HTML preview.
 *
 * The panel includes:
 * - Seed controls (numeric input, prev/next, random)
 * - Parameter sliders (auto-generated from ParamDef[])
 * - Color pickers (auto-generated from ColorDef[])
 * - Theme selector (dropdown if themes exist)
 * - Re-render button
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
    #genart-panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 280px; background: #1a1a1a; color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px; overflow-y: auto; z-index: 1000;
      border-left: 1px solid #333; padding: 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    #genart-panel h2 {
      margin: 0; font-size: 14px; font-weight: 600; color: #fff;
      padding-bottom: 8px; border-bottom: 1px solid #333;
    }
    #genart-panel .gp-section { margin-top: 4px; }
    #genart-panel .gp-section-title {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
      color: #888; margin-bottom: 6px;
    }
    #genart-panel .gp-row {
      display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    }
    #genart-panel .gp-label {
      flex: 0 0 80px; font-size: 11px; color: #aaa;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #genart-panel input[type="range"] {
      flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
      background: #444; border-radius: 2px; outline: none;
    }
    #genart-panel input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none; width: 14px; height: 14px;
      border-radius: 50%; background: #7c8aff; cursor: pointer;
    }
    #genart-panel input[type="number"] {
      width: 56px; background: #222; border: 1px solid #444; color: #e0e0e0;
      border-radius: 3px; padding: 2px 4px; font-size: 11px; text-align: right;
    }
    #genart-panel input[type="color"] {
      width: 28px; height: 22px; border: 1px solid #444; border-radius: 3px;
      background: none; cursor: pointer; padding: 0;
    }
    #genart-panel select {
      flex: 1; background: #222; border: 1px solid #444; color: #e0e0e0;
      border-radius: 3px; padding: 3px 6px; font-size: 11px;
    }
    #genart-panel button {
      background: #333; border: 1px solid #555; color: #e0e0e0;
      border-radius: 3px; padding: 4px 8px; font-size: 11px; cursor: pointer;
    }
    #genart-panel button:hover { background: #444; }
    #genart-panel button.gp-primary {
      background: #4a5acd; border-color: #5a6adf; color: #fff;
    }
    #genart-panel button.gp-primary:hover { background: #5a6adf; }
    #genart-panel .gp-seed-row {
      display: flex; align-items: center; gap: 4px;
    }
    #genart-panel .gp-seed-row input[type="number"] {
      flex: 1; width: auto;
    }
    #genart-panel .gp-actions {
      display: flex; gap: 6px; margin-top: 8px;
      padding-top: 8px; border-top: 1px solid #333;
    }
    #genart-panel .gp-actions button { flex: 1; }
    #genart-panel .gp-toast {
      position: fixed; bottom: 20px; right: 20px;
      background: #4a5acd; color: #fff; padding: 8px 16px;
      border-radius: 6px; font-size: 12px; opacity: 0;
      transition: opacity 0.3s; pointer-events: none; z-index: 1001;
    }
    body { margin-right: 280px; }
  `;
}

function generatePanelHTML(sketch: SketchDefinition): string {
  const parts: string[] = [];

  parts.push(`<div id="genart-panel">`);
  parts.push(`<h2>${escapeHtml(sketch.title)}</h2>`);

  // Seed controls
  parts.push(`<div class="gp-section">`);
  parts.push(`<div class="gp-section-title">Seed</div>`);
  parts.push(`<div class="gp-seed-row">`);
  parts.push(`<button onclick="__gp_seedPrev()" title="Previous seed">&larr;</button>`);
  parts.push(`<input type="number" id="gp-seed" value="${sketch.state.seed}" min="0" max="99999" step="1">`);
  parts.push(`<button onclick="__gp_seedNext()" title="Next seed">&rarr;</button>`);
  parts.push(`<button onclick="__gp_seedRandom()" title="Random seed">&#x1f3b2;</button>`);
  parts.push(`</div></div>`);

  // Parameters
  if (sketch.parameters.length > 0) {
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-section-title">Parameters</div>`);
    for (const param of sketch.parameters) {
      const value = sketch.state.params[param.key] ?? param.default;
      parts.push(`<div class="gp-row">`);
      parts.push(`<span class="gp-label" title="${escapeHtml(param.label)}">${escapeHtml(param.label)}</span>`);
      parts.push(`<input type="range" id="gp-param-${param.key}" min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" oninput="__gp_paramChange('${param.key}', this.value)">`);
      parts.push(`<input type="number" id="gp-param-val-${param.key}" min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" onchange="__gp_paramChange('${param.key}', this.value)">`);
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
      parts.push(`<div class="gp-row">`);
      parts.push(`<span class="gp-label" title="${escapeHtml(colorDef.label)}">${escapeHtml(colorDef.label)}</span>`);
      parts.push(`<input type="color" id="gp-color-${i}" value="${value}" onchange="__gp_colorChange(${i}, this.value)">`);
      parts.push(`<span id="gp-color-hex-${i}" style="font-size:10px;color:#888;">${value}</span>`);
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  // Themes
  if (sketch.themes && sketch.themes.length > 0) {
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-section-title">Theme</div>`);
    parts.push(`<div class="gp-row">`);
    parts.push(`<select id="gp-theme" onchange="__gp_themeChange(this.value)">`);
    parts.push(`<option value="">Custom</option>`);
    for (let i = 0; i < sketch.themes.length; i++) {
      parts.push(`<option value="${i}">${escapeHtml(sketch.themes[i].name)}</option>`);
    }
    parts.push(`</select>`);
    parts.push(`</div></div>`);
  }

  // Actions
  parts.push(`<div class="gp-actions">`);
  parts.push(`<button class="gp-primary" onclick="__gp_rerender()">Re-render</button>`);
  parts.push(`<button onclick="__gp_copyState()">Copy State</button>`);
  parts.push(`</div>`);

  parts.push(`</div>`);
  parts.push(`<div class="gp-toast" id="gp-toast"></div>`);

  return parts.join("\n");
}

function generatePanelJS(sketch: SketchDefinition): string {
  // Build the initial state snapshot for the panel
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
      document.getElementById('gp-seed').value = s;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedNext() {
      __gp_state.seed = __gp_state.seed + 1;
      document.getElementById('gp-seed').value = __gp_state.seed;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedRandom() {
      var s = Math.floor(Math.random() * 100000);
      __gp_state.seed = s;
      document.getElementById('gp-seed').value = s;
      __gp_rerender && __gp_rerender();
    }
    document.getElementById('gp-seed').addEventListener('change', function(e) {
      __gp_state.seed = parseInt(e.target.value, 10) || 0;
      __gp_rerender && __gp_rerender();
    });

    function __gp_paramChange(key, val) {
      var v = parseFloat(val);
      __gp_state.params[key] = v;
      __gp_state.PARAMS && (__gp_state.PARAMS[key] = v);
      document.getElementById('gp-param-' + key).value = v;
      document.getElementById('gp-param-val-' + key).value = v;
      __gp_rerender && __gp_rerender();
    }

    function __gp_colorChange(idx, val) {
      __gp_state.colorPalette[idx] = val;
      document.getElementById('gp-color-hex-' + idx).textContent = val;
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
        var hexEl = document.getElementById('gp-color-hex-' + i);
        if (hexEl) hexEl.textContent = theme.colors[i];
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
