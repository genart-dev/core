# @genart-dev/core

Renderer adapters, skill registry, and runtime interfaces for [genart.dev](https://genart.dev) — a generative art platform with an MCP server, desktop app, and IDE extensions.

Re-exports everything from [`@genart-dev/format`](https://github.com/genart-dev/format) so consumers get the full format API without a separate import.

## Install

```bash
npm install @genart-dev/core
```

## Usage

```typescript
import {
  createDefaultRegistry,
  createDefaultSkillRegistry,
  parseGenart,
  resolvePreset,
} from "@genart-dev/core";

// Set up renderer registry with all 5 adapters
const renderers = createDefaultRegistry();

// Parse a .genart file and resolve its renderer
const sketch = parseGenart(JSON.parse(fileContents));
const adapter = renderers.resolve(sketch.renderer.type); // → P5RendererAdapter

// Validate an algorithm for a specific renderer
const result = adapter.validate(sketch.algorithm);
if (!result.valid) {
  console.error(result.errors);
}

// Generate standalone HTML (embeds algorithm + CDN runtime)
const html = adapter.generateStandaloneHTML(sketch);

// Browse design knowledge skills
const skills = createDefaultSkillRegistry();
skills.list("composition"); // → 6 composition skills
skills.list("color");       // → 6 color skills
```

## Renderer Adapters

Five pluggable rendering engines, each implementing the `RendererAdapter` interface:

| Adapter | Type | Language | Runtime | Algorithm Signature |
|---------|------|----------|---------|-------------------|
| `P5RendererAdapter` | `p5` | JavaScript | p5.js 1.x | `function sketch(p, state)` |
| `Canvas2DRendererAdapter` | `canvas2d` | JavaScript | Native | `function sketch(ctx, state)` |
| `ThreeRendererAdapter` | `three` | JavaScript | Three.js | `function sketch(THREE, state, container)` |
| `GLSLRendererAdapter` | `glsl` | GLSL | WebGL2 | Fragment shader source |
| `SVGRendererAdapter` | `svg` | JavaScript | Native | `function sketch(state)` |

```typescript
import { P5RendererAdapter } from "@genart-dev/core";

const p5 = new P5RendererAdapter();

// Validate algorithm source
p5.validate(algorithm);

// Compile for execution
const compiled = await p5.compile(algorithm);

// Create a live instance (browser context)
const instance = p5.createInstance(compiled, sketch.state, sketch.canvas);
instance.mount(document.getElementById("canvas"));
instance.updateState(newState);
instance.captureFrame({ format: "png" }); // → data URL

// Generate standalone HTML with embedded CDN runtime
const html = p5.generateStandaloneHTML(sketch);

// Get starter template for new sketches
const template = p5.getAlgorithmTemplate();
```

### RendererRegistry

```typescript
import { createDefaultRegistry, RendererRegistry } from "@genart-dev/core";

// Pre-loaded with all 5 adapters
const registry = createDefaultRegistry();

registry.resolve("p5");      // → P5RendererAdapter
registry.resolve("glsl");    // → GLSLRendererAdapter
registry.list();             // → ["p5", "canvas2d", "three", "glsl", "svg"]
registry.getDefault();       // → P5RendererAdapter
registry.has("three");       // → true
```

## Skill Registry

11 built-in design knowledge skills grounded in classical design theory — composition principles (Arnheim, Wong) and color theory (Albers, Itten). Each skill includes theory text, key principles, academic references, and optional renderer-specific algorithm examples.

### Composition Skills (6)

| ID | Complexity | Source |
|----|-----------|--------|
| `golden-ratio` | Intermediate | 1:1.618 proportions, spiral layouts |
| `rule-of-thirds` | Beginner | 3x3 grid, power points, dynamic balance |
| `visual-weight` | Intermediate | Size, value, saturation, position balance |
| `gestalt-grouping` | Intermediate | Proximity, similarity, closure, continuity |
| `figure-ground` | Beginner | Positive forms vs. negative space |
| `rhythm-movement` | Advanced | Repetition, variation, progression, flow |

### Color Skills (6)

| ID | Complexity | Source |
|----|-----------|--------|
| `color-harmony` | Beginner | Complementary, analogous, triadic, split-complementary |
| `simultaneous-contrast` | Advanced | Albers' adjacent color perception shifts |
| `color-temperature` | Beginner | Warm (advances) vs. cool (recedes) |
| `itten-contrasts` | Advanced | Itten's 7 contrast types |
| `value-structure` | Intermediate | Lights, mid-tones, darks; tonal keys |
| `palette-generation` | Intermediate | Algorithmic OKLCH color space generation |

```typescript
import { createDefaultSkillRegistry } from "@genart-dev/core";

const skills = createDefaultSkillRegistry();

const skill = skills.resolve("golden-ratio");
skill.theory;              // Markdown theory text
skill.principles;          // Key design principles
skill.references;          // Academic citations
skill.suggestedParameters; // Example ParamDefs for this technique
skill.examples?.p5;        // p5.js algorithm example
```

## API Reference

### Interfaces

| Interface | Description |
|-----------|-------------|
| `RendererAdapter` | Contract for rendering engines — validate, compile, mount, capture, export |
| `SketchInstance` | Live sketch — mount/unmount, updateState, pause/resume, captureFrame |
| `SkillDefinition` | Design knowledge skill — theory, principles, references, examples |
| `SkillReference` | Academic citation (title, author, year) |
| `ValidationResult` | Algorithm validation result (`valid` + `errors[]`) |
| `RuntimeDependency` | CDN dependency for standalone HTML export (name, version, cdnUrl) |
| `CaptureOptions` | Screenshot options (format, quality, scale) |
| `CompiledAlgorithm` | Opaque compiled algorithm handle |

### Classes

| Class | Description |
|-------|-------------|
| `RendererRegistry` | Register and resolve renderer adapters by type |
| `SkillRegistry` | Register and resolve design knowledge skills |

### Factory Functions

| Function | Description |
|----------|-------------|
| `createDefaultRegistry()` | Registry pre-loaded with all 5 renderer adapters |
| `createDefaultSkillRegistry()` | Registry pre-loaded with all 11 skills |

### Utilities

| Function | Description |
|----------|-------------|
| `hexToVec3(hex)` | Convert `"#rrggbb"` to `[r, g, b]` floats in [0, 1] — for GLSL uniforms |

### Re-exports from @genart-dev/format

All types and functions from `@genart-dev/format` are re-exported: `parseGenart`, `serializeGenart`, `parseWorkspace`, `serializeWorkspace`, `convertLegacySketch`, `CANVAS_PRESETS`, `resolvePreset`, `SketchDefinition`, `WorkspaceDefinition`, `ParamDef`, `ColorDef`, and more. See the [format README](https://github.com/genart-dev/format) for the full list.

## Related Packages

| Package | Purpose |
|---------|---------|
| [`@genart-dev/format`](https://github.com/genart-dev/format) | File format types, parsers, presets (dependency) |
| [`@genart-dev/mcp-server`](https://github.com/genart-dev/mcp-server) | 33-tool MCP server + CLI (depends on core) |

## License

MIT
