import type {
  RendererType,
  RendererSpec,
  CanvasSpec,
  ParamDef,
  ColorDef,
  ThemeDef,
  TabDef,
  SketchComponentValue,
  SketchComponentDef,
  SketchState,
  DesignLayer,
  Snapshot,
} from "@genart-dev/format";
import { resolvePreset } from "@genart-dev/format";
import type { SketchMeta } from "./types.js";

// ---------------------------------------------------------------------------
// Validation helpers (same patterns as format parser)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

const VALID_RENDERER_TYPES: readonly RendererType[] = [
  "p5",
  "three",
  "glsl",
  "canvas2d",
  "svg",
  "genart",
];

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`"${field}" must be a string`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`"${field}" must be a finite number`);
  }
}

function assertObject(value: unknown, field: string): asserts value is Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`"${field}" must be an object`);
  }
}

function assertArray(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`"${field}" must be an array`);
  }
}

// ---------------------------------------------------------------------------
// Sub-parsers
// ---------------------------------------------------------------------------

function parseRenderer(raw: unknown): RendererSpec {
  assertObject(raw, "renderer");
  const type = raw["type"];
  assertString(type, "renderer.type");
  if (!VALID_RENDERER_TYPES.includes(type as RendererType)) {
    throw new Error(
      `Unknown renderer type "${type}". Valid types: ${VALID_RENDERER_TYPES.join(", ")}`,
    );
  }
  const version = raw["version"];
  if (version !== undefined) {
    assertString(version, "renderer.version");
    return { type: type as RendererType, version };
  }
  return { type: type as RendererType };
}

function parseCanvas(raw: unknown): CanvasSpec {
  assertObject(raw, "canvas");

  // If only preset is given, resolve to width/height
  if (
    raw["width"] === undefined &&
    raw["height"] === undefined &&
    raw["preset"] !== undefined
  ) {
    assertString(raw["preset"], "canvas.preset");
    const resolved = resolvePreset(raw["preset"]);
    return { preset: raw["preset"], ...resolved };
  }

  // Otherwise require explicit width/height
  assertNumber(raw["width"], "canvas.width");
  assertNumber(raw["height"], "canvas.height");

  return {
    width: raw["width"] as number,
    height: raw["height"] as number,
    ...(raw["preset"] !== undefined
      ? (() => {
          assertString(raw["preset"], "canvas.preset");
          return { preset: raw["preset"] as string };
        })()
      : {}),
    ...(raw["pixelDensity"] !== undefined
      ? (() => {
          assertNumber(raw["pixelDensity"], "canvas.pixelDensity");
          return { pixelDensity: raw["pixelDensity"] as number };
        })()
      : {}),
  };
}

function parseParamDef(raw: unknown, index: number): ParamDef {
  assertObject(raw, `parameters[${index}]`);
  assertString(raw["key"], `parameters[${index}].key`);
  assertString(raw["label"], `parameters[${index}].label`);
  assertNumber(raw["min"], `parameters[${index}].min`);
  assertNumber(raw["max"], `parameters[${index}].max`);
  assertNumber(raw["step"], `parameters[${index}].step`);
  assertNumber(raw["default"], `parameters[${index}].default`);

  const def = raw["default"] as number;
  const min = raw["min"] as number;
  const max = raw["max"] as number;

  if (def < min || def > max) {
    throw new Error(
      `parameters[${index}] ("${raw["key"]}"): default ${def} is outside [${min}, ${max}]`,
    );
  }

  return {
    key: raw["key"] as string,
    label: raw["label"] as string,
    min,
    max,
    step: raw["step"] as number,
    default: def,
    ...(raw["tab"] !== undefined
      ? (() => {
          assertString(raw["tab"], `parameters[${index}].tab`);
          return { tab: raw["tab"] as string };
        })()
      : {}),
  };
}

function parseColorDef(raw: unknown, index: number): ColorDef {
  assertObject(raw, `colors[${index}]`);
  assertString(raw["key"], `colors[${index}].key`);
  assertString(raw["label"], `colors[${index}].label`);
  assertString(raw["default"], `colors[${index}].default`);
  return {
    key: raw["key"] as string,
    label: raw["label"] as string,
    default: raw["default"] as string,
  };
}

function parseThemeDef(raw: unknown, index: number): ThemeDef {
  assertObject(raw, `themes[${index}]`);
  assertString(raw["name"], `themes[${index}].name`);
  assertArray(raw["colors"], `themes[${index}].colors`);
  return {
    name: raw["name"] as string,
    colors: (raw["colors"] as unknown[]).map((c, i) => {
      assertString(c, `themes[${index}].colors[${i}]`);
      return c;
    }),
  };
}

function parseTabDef(raw: unknown, index: number): TabDef {
  assertObject(raw, `tabs[${index}]`);
  assertString(raw["id"], `tabs[${index}].id`);
  assertString(raw["label"], `tabs[${index}].label`);
  return { id: raw["id"] as string, label: raw["label"] as string };
}

function parseComponentValue(
  raw: unknown,
  name: string,
): SketchComponentValue {
  if (typeof raw === "string") {
    if (raw.length === 0) {
      throw new Error(`components["${name}"] string value must not be empty`);
    }
    return raw;
  }
  assertObject(raw, `components["${name}"]`);
  const obj = raw as Obj;
  const def: Record<string, unknown> = {};

  if (obj["version"] !== undefined) {
    assertString(obj["version"], `components["${name}"].version`);
    def["version"] = obj["version"];
  }
  if (obj["code"] !== undefined) {
    assertString(obj["code"], `components["${name}"].code`);
    def["code"] = obj["code"];
  }
  if (obj["exports"] !== undefined) {
    assertArray(obj["exports"], `components["${name}"].exports`);
    def["exports"] = (obj["exports"] as unknown[]).map((e, i) => {
      assertString(e, `components["${name}"].exports[${i}]`);
      return e;
    });
  }
  if (def["version"] === undefined && def["code"] === undefined) {
    throw new Error(
      `components["${name}"] must have at least "version" or "code"`,
    );
  }
  return def as unknown as SketchComponentDef;
}

function parseSketchState(raw: unknown): SketchState {
  assertObject(raw, "state");
  assertNumber(raw["seed"], "state.seed");
  assertObject(raw["params"], "state.params");
  assertArray(raw["colorPalette"], "state.colorPalette");
  return {
    seed: raw["seed"] as number,
    params: raw["params"] as Record<string, number>,
    colorPalette: (raw["colorPalette"] as unknown[]).map((c, i) => {
      assertString(c, `state.colorPalette[${i}]`);
      return c;
    }),
  };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/** Default canvas when none is specified in meta. */
const DEFAULT_CANVAS: CanvasSpec = { preset: "square-1200", width: 1200, height: 1200 };

/**
 * Parse and validate a `sketch.meta.json` object.
 *
 * Required fields: `title`, `renderer`.
 * Defaults: `canvas` → square-1200, `parameters` → [], `colors` → [].
 *
 * @param json - Parsed JSON value from `sketch.meta.json`.
 * @returns Validated `SketchMeta`.
 * @throws On validation failure.
 */
export function parseSketchMeta(json: unknown): SketchMeta {
  assertObject(json, "sketch.meta.json");
  const raw = json as Obj;

  // Required fields
  if (raw["title"] === undefined) {
    throw new Error('sketch.meta.json: required field "title" is missing');
  }
  assertString(raw["title"], "title");

  if (raw["renderer"] === undefined) {
    throw new Error('sketch.meta.json: required field "renderer" is missing');
  }
  const renderer = parseRenderer(raw["renderer"]);

  // Canvas (defaults to square-1200)
  const canvas =
    raw["canvas"] !== undefined ? parseCanvas(raw["canvas"]) : DEFAULT_CANVAS;

  // Parameters (defaults to empty)
  let parameters: ParamDef[] | undefined;
  if (raw["parameters"] !== undefined) {
    assertArray(raw["parameters"], "parameters");
    parameters = (raw["parameters"] as unknown[]).map((p, i) =>
      parseParamDef(p, i),
    );
    // Check for duplicate keys
    const keys = new Set<string>();
    for (const p of parameters) {
      if (keys.has(p.key)) {
        throw new Error(`Duplicate parameter key "${p.key}"`);
      }
      keys.add(p.key);
    }
  }

  // Colors (defaults to empty)
  let colors: ColorDef[] | undefined;
  if (raw["colors"] !== undefined) {
    assertArray(raw["colors"], "colors");
    colors = (raw["colors"] as unknown[]).map((c, i) => parseColorDef(c, i));
  }

  // Optional arrays
  let themes: ThemeDef[] | undefined;
  if (raw["themes"] !== undefined) {
    assertArray(raw["themes"], "themes");
    themes = (raw["themes"] as unknown[]).map((t, i) => parseThemeDef(t, i));
  }

  let tabs: TabDef[] | undefined;
  if (raw["tabs"] !== undefined) {
    assertArray(raw["tabs"], "tabs");
    tabs = (raw["tabs"] as unknown[]).map((t, i) => parseTabDef(t, i));
  }

  // Components
  let components: Record<string, SketchComponentValue> | undefined;
  if (raw["components"] !== undefined) {
    assertObject(raw["components"], "components");
    components = {};
    for (const [key, value] of Object.entries(raw["components"] as Obj)) {
      components[key] = parseComponentValue(value, key);
    }
  }

  // Optional strings
  const result: Record<string, unknown> = {
    title: raw["title"] as string,
    renderer,
    canvas,
  };

  if (raw["id"] !== undefined) {
    assertString(raw["id"], "id");
    result["id"] = raw["id"];
  }
  if (parameters !== undefined) result["parameters"] = parameters;
  if (colors !== undefined) result["colors"] = colors;
  if (themes !== undefined) result["themes"] = themes;
  if (tabs !== undefined) result["tabs"] = tabs;
  if (components !== undefined) result["components"] = components;
  if (raw["philosophy"] !== undefined) {
    assertString(raw["philosophy"], "philosophy");
    result["philosophy"] = raw["philosophy"];
  }
  if (raw["skills"] !== undefined) {
    assertArray(raw["skills"], "skills");
    result["skills"] = (raw["skills"] as unknown[]).map((s, i) => {
      assertString(s, `skills[${i}]`);
      return s;
    });
  }
  if (raw["agent"] !== undefined) {
    assertString(raw["agent"], "agent");
    result["agent"] = raw["agent"];
  }
  if (raw["model"] !== undefined) {
    assertString(raw["model"], "model");
    result["model"] = raw["model"];
  }

  // Preserved fields (from previous compilation)
  if (raw["state"] !== undefined) {
    result["state"] = parseSketchState(raw["state"]);
  }
  if (raw["layers"] !== undefined) {
    assertArray(raw["layers"], "layers");
    result["layers"] = raw["layers"] as DesignLayer[];
  }
  if (raw["snapshots"] !== undefined) {
    assertArray(raw["snapshots"], "snapshots");
    result["snapshots"] = raw["snapshots"] as Snapshot[];
  }

  return result as unknown as SketchMeta;
}
