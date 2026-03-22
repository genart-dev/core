import type { SketchDefinition } from "@genart-dev/format";

/**
 * Generate the interactive control panel HTML (CSS + JS) for embedding
 * in a self-contained interactive HTML preview.
 *
 * The panel matches the genart.dev app design system (see genart-vscode.pen
 * vdPropertiesPanel). Supports dark and light themes via prefers-color-scheme.
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

const RENDERER_COLORS: Record<string, string> = {
  p5: "#ED225D",
  three: "#049EF4",
  glsl: "#5C6BC0",
  canvas2d: "#FF9800",
  svg: "#FFB13B",
  genart: "#7C4DFF",
};

function getRendererColor(renderer: string): string {
  return RENDERER_COLORS[renderer.toLowerCase()] ?? "#E0E0E0";
}

function generatePanelCSS(): string {
  return `
    /* ─── Shared layout ─── */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; min-height: 100vh; background: var(--bg-primary, #0A0A0A); }
    #canvas-container { flex: 1; display: flex; justify-content: center; align-items: center; padding: 1rem; min-width: 0; overflow: hidden; }
    #canvas-container canvas { display: block; max-width: 100%; max-height: calc(100vh - 2rem); }

    /* ─── Theme tokens (genart.dev design system) ─── */
    :root {
      --bg-primary: #0A0A0A;
      --bg-surface: #1A1A1A;
      --bg-inset: #0A0A0A;
      --text-primary: #FFFFFF;
      --text-secondary: #999999;
      --text-tertiary: #666666;
      --text-muted: #3A3A3A;
      --accent-primary: #E0E0E0;
      --border: #3A3A3A;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg-primary: #FAFAFA;
        --bg-surface: #FFFFFF;
        --bg-inset: #E5E5E5;
        --text-primary: #0A0A0A;
        --text-secondary: #666666;
        --text-tertiary: #999999;
        --text-muted: #CCCCCC;
        --accent-primary: #333333;
        --border: #E5E5E5;
      }
    }

    /* Panel */
    #genart-panel {
      width: 320px;
      min-width: 320px;
      background: var(--bg-surface);
      border-left: 1px solid var(--border);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: var(--text-primary);
    }

    /* Divider */
    .gp-divider {
      height: 1px;
      background: var(--border);
      width: 100%;
      flex-shrink: 0;
    }

    /* Section label */
    .gp-section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      padding: 12px 16px 4px;
    }

    /* Header */
    .gp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px;
      min-height: 40px;
    }
    .gp-sketch-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gp-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
    }

    /* Seed controls */
    .gp-seed-row {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 0 16px 12px;
    }
    .gp-seed-btn {
      width: 32px;
      height: 32px;
      background: var(--bg-inset);
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .gp-seed-btn:hover { color: var(--accent-primary); }
    .gp-seed-btn svg {
      width: 16px; height: 16px;
      stroke: currentColor; stroke-width: 2; fill: none;
      stroke-linecap: round; stroke-linejoin: round;
    }
    .gp-seed-input {
      flex: 1;
      height: 32px;
      background: var(--bg-inset);
      border: none;
      color: var(--accent-primary);
      font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      outline: none;
      padding: 0 8px;
      min-width: 0;
    }

    /* Parameter slider */
    .gp-param {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .gp-param:last-child { margin-bottom: 0; }
    .gp-param-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gp-param-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .gp-param-val {
      font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-primary);
    }
    .gp-param-track {
      position: relative;
      width: 100%;
      height: 6px;
      background: var(--bg-inset);
      border-radius: 3px;
      overflow: hidden;
    }
    .gp-param-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: var(--accent-primary);
      border-radius: 3px;
    }
    .gp-param-input {
      position: absolute;
      left: 0; top: -7px;
      width: 100%;
      height: 20px;
      opacity: 0;
      cursor: pointer;
      margin: 0;
    }

    /* Color swatches */
    .gp-colors {
      display: flex;
      gap: 8px;
      padding: 0 16px;
      flex-wrap: wrap;
    }
    .gp-swatch {
      width: 28px;
      height: 28px;
      border: none;
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
    }
    .gp-swatch-active {
      outline: 2px solid var(--accent-primary);
      outline-offset: -2px;
    }
    .gp-swatch-input {
      position: absolute;
      left: 0; top: 0;
      width: 100%; height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    /* Theme selector */
    .gp-theme-row {
      display: flex;
      gap: 8px;
      padding: 0 16px;
    }
    .gp-theme-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      flex: 1;
      height: 32px;
      background: var(--bg-inset);
      border: none;
      color: var(--text-tertiary);
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
    }
    .gp-theme-btn.active {
      background: var(--border);
      color: var(--accent-primary);
      outline: 1px solid var(--accent-primary);
      outline-offset: -1px;
    }
    .gp-theme-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    /* Philosophy */
    .gp-philosophy {
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-tertiary);
      padding: 0 16px;
    }

    /* File info */
    .gp-info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      font-size: 11px;
      padding: 0 16px;
    }
    .gp-info-key { color: var(--text-tertiary); }
    .gp-info-val {
      color: var(--text-secondary);
      font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    }

    /* Sections wrapper */
    .gp-section { padding: 12px 0; }

    /* Copy state */
    .gp-copy-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 0 16px 16px;
      height: 32px;
      background: var(--bg-inset);
      border: none;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .gp-copy-btn:hover { color: var(--accent-primary); }
    .gp-copy-btn svg {
      width: 14px; height: 14px;
      stroke: currentColor; stroke-width: 2; fill: none;
      stroke-linecap: round; stroke-linejoin: round;
    }

    /* Toast */
    .gp-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--accent-primary);
      color: var(--bg-primary);
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
  const badgeColor = getRendererColor(renderer);
  const rendererLabel =
    renderer === "canvas2d" ? "Canvas 2D" : renderer.toLowerCase();

  parts.push(`<div id="genart-panel">`);

  // Header: sketch name + renderer badge
  parts.push(`<div class="gp-header">`);
  parts.push(
    `<span class="gp-sketch-name">${escapeHtml(sketch.title || sketch.id)}</span>`,
  );
  parts.push(
    `<span class="gp-badge" style="background:${badgeColor}">${escapeHtml(rendererLabel)}</span>`,
  );
  parts.push(`</div>`);
  parts.push(`<div class="gp-divider"></div>`);

  // Seed
  parts.push(`<div class="gp-section-label">SEED</div>`);
  parts.push(`<div class="gp-seed-row">`);
  parts.push(
    `<button class="gp-seed-btn" onclick="__gp_seedPrev()"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>`,
  );
  parts.push(
    `<input class="gp-seed-input" id="gp-seed-val" value="${sketch.state.seed}" onchange="__gp_seedSet(this.value)">`,
  );
  parts.push(
    `<button class="gp-seed-btn" onclick="__gp_seedNext()"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>`,
  );
  parts.push(
    `<button class="gp-seed-btn" onclick="__gp_seedRandom()"><svg viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg></button>`,
  );
  parts.push(`</div>`);
  parts.push(`<div class="gp-divider"></div>`);

  // Parameters
  if (sketch.parameters.length > 0) {
    parts.push(`<div class="gp-section-label">PARAMETERS</div>`);
    parts.push(`<div class="gp-section">`);
    for (const param of sketch.parameters) {
      const value = sketch.state.params[param.key] ?? param.default;
      const pct =
        param.max !== param.min
          ? ((value - param.min) / (param.max - param.min)) * 100
          : 0;
      parts.push(`<div class="gp-param">`);
      parts.push(`<div class="gp-param-header">`);
      parts.push(
        `<span class="gp-param-name">${escapeHtml(param.label)}</span>`,
      );
      parts.push(
        `<span class="gp-param-val" id="gp-pv-${param.key}">${value}</span>`,
      );
      parts.push(`</div>`);
      parts.push(`<div class="gp-param-track">`);
      parts.push(
        `<div class="gp-param-fill" id="gp-pf-${param.key}" style="width:${pct}%"></div>`,
      );
      parts.push(
        `<input type="range" class="gp-param-input" id="gp-pi-${param.key}" min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" oninput="__gp_paramChange('${param.key}',this.value)">`,
      );
      parts.push(`</div>`);
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
    parts.push(`<div class="gp-divider"></div>`);
  }

  // Colors
  if (sketch.colors.length > 0) {
    parts.push(`<div class="gp-section-label">COLORS</div>`);
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-colors">`);
    for (let i = 0; i < sketch.colors.length; i++) {
      const value = sketch.state.colorPalette[i] ?? sketch.colors[i].default;
      const isFirst = i === 0 ? " gp-swatch-active" : "";
      parts.push(
        `<div class="gp-swatch${isFirst}" id="gp-sw-${i}" style="background:${value}"><input type="color" class="gp-swatch-input" id="gp-ci-${i}" value="${value}" onchange="__gp_colorChange(${i},this.value)"></div>`,
      );
    }
    parts.push(`</div>`);
    parts.push(`</div>`);
    parts.push(`<div class="gp-divider"></div>`);
  }

  // Themes
  if (sketch.themes && sketch.themes.length > 0) {
    parts.push(`<div class="gp-section-label">THEMES</div>`);
    parts.push(`<div class="gp-section">`);
    parts.push(`<div class="gp-theme-row">`);
    for (let i = 0; i < sketch.themes.length; i++) {
      const theme = sketch.themes[i];
      const active = i === 0 ? " active" : "";
      const dots = (theme.colors || [])
        .slice(0, 3)
        .map((c: string) => `<span class="gp-theme-dot" style="background:${c}"></span>`)
        .join("");
      parts.push(
        `<button class="gp-theme-btn${active}" onclick="__gp_themeChange(${i})">${dots}</button>`,
      );
    }
    parts.push(`</div>`);
    parts.push(`</div>`);
    parts.push(`<div class="gp-divider"></div>`);
  }

  // Philosophy
  if (sketch.philosophy) {
    parts.push(`<div class="gp-section-label">PHILOSOPHY</div>`);
    parts.push(`<div class="gp-section">`);
    parts.push(
      `<div class="gp-philosophy">${escapeHtml(sketch.philosophy)}</div>`,
    );
    parts.push(`</div>`);
    parts.push(`<div class="gp-divider"></div>`);
  }

  // File info
  parts.push(`<div class="gp-section-label">FILE</div>`);
  parts.push(`<div class="gp-section">`);
  parts.push(`<div class="gp-info-grid">`);
  parts.push(`<span class="gp-info-key">id:</span>`);
  parts.push(`<span class="gp-info-val">${escapeHtml(sketch.id)}</span>`);
  parts.push(`<span class="gp-info-key">renderer:</span>`);
  parts.push(`<span class="gp-info-val">${escapeHtml(renderer)}</span>`);
  parts.push(`<span class="gp-info-key">canvas:</span>`);
  parts.push(
    `<span class="gp-info-val">${sketch.canvas.width} &times; ${sketch.canvas.height}</span>`,
  );
  if (sketch.agent) {
    parts.push(`<span class="gp-info-key">agent:</span>`);
    parts.push(
      `<span class="gp-info-val">${escapeHtml(sketch.agent)}</span>`,
    );
  }
  parts.push(`</div>`);
  parts.push(`</div>`);
  parts.push(`<div class="gp-divider"></div>`);

  // Actions
  parts.push(`<div class="gp-section" style="display:flex;flex-direction:column;gap:8px;padding:12px 16px">`);
  parts.push(
    `<button class="gp-copy-btn" onclick="__gp_saveSnapshot()"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>Save Snapshot</button>`,
  );
  parts.push(
    `<button class="gp-copy-btn" onclick="__gp_downloadScreenshot()"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Screenshot</button>`,
  );
  parts.push(
    `<button class="gp-copy-btn" onclick="__gp_copyState()"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy State JSON</button>`,
  );
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
      document.getElementById('gp-seed-val').value = s;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedNext() {
      __gp_state.seed = __gp_state.seed + 1;
      document.getElementById('gp-seed-val').value = __gp_state.seed;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedRandom() {
      var s = Math.floor(Math.random() * 100000);
      __gp_state.seed = s;
      document.getElementById('gp-seed-val').value = s;
      __gp_rerender && __gp_rerender();
    }
    function __gp_seedSet(val) {
      var s = parseInt(val, 10);
      if (isNaN(s)) return;
      __gp_state.seed = s;
      __gp_rerender && __gp_rerender();
    }

    function __gp_paramChange(key, val) {
      var v = parseFloat(val);
      __gp_state.params[key] = v;
      __gp_state.PARAMS && (__gp_state.PARAMS[key] = v);
      // Update fill bar
      var input = document.getElementById('gp-pi-' + key);
      var pct = ((v - input.min) / (input.max - input.min)) * 100;
      document.getElementById('gp-pf-' + key).style.width = pct + '%';
      document.getElementById('gp-pv-' + key).textContent = v;
      __gp_rerender && __gp_rerender();
    }

    function __gp_colorChange(idx, val) {
      __gp_state.colorPalette[idx] = val;
      // Update swatch background
      document.getElementById('gp-sw-' + idx).style.background = val;
      // Select this swatch
      document.querySelectorAll('.gp-swatch').forEach(function(s) { s.classList.remove('gp-swatch-active'); });
      document.getElementById('gp-sw-' + idx).classList.add('gp-swatch-active');
      // Update COLORS map
      if (__gp_state.COLORS && __gp_colorDefs[idx]) {
        __gp_state.COLORS[__gp_colorDefs[idx].key] = val;
      }
      __gp_rerender && __gp_rerender();
    }

    function __gp_themeChange(idx) {
      var theme = __gp_themes[idx];
      if (!theme) return;
      // Activate button
      document.querySelectorAll('.gp-theme-btn').forEach(function(b) { b.classList.remove('active'); });
      event.target.closest('.gp-theme-btn').classList.add('active');
      for (var i = 0; i < theme.colors.length; i++) {
        __gp_state.colorPalette[i] = theme.colors[i];
        var sw = document.getElementById('gp-sw-' + i);
        if (sw) sw.style.background = theme.colors[i];
        var ci = document.getElementById('gp-ci-' + i);
        if (ci) ci.value = theme.colors[i];
        if (__gp_state.COLORS && __gp_colorDefs[i]) {
          __gp_state.COLORS[__gp_colorDefs[i].key] = theme.colors[i];
        }
      }
      __gp_rerender && __gp_rerender();
    }

    function __gp_saveSnapshot() {
      try {
        var snap = {
          seed: __gp_state.seed,
          params: Object.assign({}, __gp_state.params),
          colors: __gp_state.colorPalette.slice(),
          timestamp: Date.now()
        };
        var key = 'genart_snapshot_' + __gp_sketchId;
        var existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push(snap);
        localStorage.setItem(key, JSON.stringify(existing));
        __gp_showToast('Snapshot saved (' + existing.length + ' total)');
      } catch(e) {
        __gp_showToast('Could not save snapshot');
      }
    }

    function __gp_downloadScreenshot() {
      var canvas = document.querySelector('#canvas-container canvas');
      if (!canvas) { __gp_showToast('No canvas found'); return; }
      try {
        var link = document.createElement('a');
        link.download = __gp_sketchId + '_' + __gp_state.seed + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        __gp_showToast('Screenshot downloaded');
      } catch(e) {
        __gp_showToast('Could not capture canvas');
      }
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
