import type { SkillDefinition } from "../types.js";
import { COMPOSITION_SKILLS, COLOR_SKILLS } from "./skills.js";

/**
 * Registry for design knowledge skills.
 * Mirrors the RendererRegistry pattern.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  /** Register a skill definition. */
  register(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  /** Resolve a skill by ID. Throws if not found. */
  resolve(id: string): SkillDefinition {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new Error(`Unknown skill: '${id}'`);
    }
    return skill;
  }

  /** Get a skill by ID, or undefined if not found. */
  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /** List all skills, optionally filtered by category. */
  list(category?: string): SkillDefinition[] {
    const all = Array.from(this.skills.values());
    if (category) {
      return all.filter((s) => s.category === category);
    }
    return all;
  }

  /** Check if a skill ID is registered. */
  has(id: string): boolean {
    return this.skills.has(id);
  }

  /** Return unique categories across all registered skills. */
  categories(): string[] {
    const cats = new Set<string>();
    for (const skill of this.skills.values()) {
      cats.add(skill.category);
    }
    return Array.from(cats).sort();
  }
}

/**
 * Create a skill registry pre-loaded with all built-in skills.
 */
export function createDefaultSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of [...COMPOSITION_SKILLS, ...COLOR_SKILLS]) {
    registry.register(skill);
  }
  return registry;
}
