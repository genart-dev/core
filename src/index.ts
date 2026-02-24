// Re-export all format types and utilities for convenience
// Consumers of @genart-dev/core get the full format API without a separate import
export * from "@genart-dev/format";

// Re-export component registry, resolver, and types
export {
  COMPONENT_REGISTRY,
  resolveComponents,
  type ComponentEntry,
  type ComponentCategory,
  type RendererTarget,
  type ResolvedComponent,
} from "@genart-dev/components";

// Core types (runtime interfaces not in the format package)
export type {
  SkillDefinition,
  SkillReference,
  ValidationResult,
  CompiledAlgorithm,
  RuntimeDependency,
  CaptureOptions,
  RendererAdapter,
  SketchInstance,
} from "./types.js";

// Renderer adapters
export {
  P5RendererAdapter,
  Canvas2DRendererAdapter,
  ThreeRendererAdapter,
  GLSLRendererAdapter,
  SVGRendererAdapter,
} from "./sketch/adapters/index.js";
export { hexToVec3 } from "./sketch/adapters/glsl.js";

// Renderer registry
export {
  RendererRegistry,
  createDefaultRegistry,
} from "./sketch/registry.js";

// Skill system
export {
  SkillRegistry,
  createDefaultSkillRegistry,
  COMPOSITION_SKILLS,
  COLOR_SKILLS,
} from "./skill/index.js";
