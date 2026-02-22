import { describe, it, expect } from "vitest";
import { SkillRegistry, createDefaultSkillRegistry } from "./registry.js";
import { COMPOSITION_SKILLS, COLOR_SKILLS } from "./skills.js";
import type { SkillDefinition } from "../types.js";

describe("SkillRegistry", () => {
  const mockSkill: SkillDefinition = {
    id: "test-skill",
    name: "Test Skill",
    category: "composition",
    complexity: "beginner",
    description: "A test skill",
    theory: "Some theory text.",
    principles: ["Principle 1", "Principle 2"],
    references: [{ title: "Test Book", author: "Test Author", year: 2020 }],
  };

  describe("register and resolve", () => {
    it("registers and resolves a skill", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      const resolved = registry.resolve("test-skill");
      expect(resolved).toBe(mockSkill);
    });

    it("throws on unknown skill ID", () => {
      const registry = new SkillRegistry();
      expect(() => registry.resolve("nonexistent")).toThrow(
        "Unknown skill: 'nonexistent'",
      );
    });
  });

  describe("get", () => {
    it("returns skill for known ID", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      expect(registry.get("test-skill")).toBe(mockSkill);
    });

    it("returns undefined for unknown ID", () => {
      const registry = new SkillRegistry();
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for registered skill", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      expect(registry.has("test-skill")).toBe(true);
    });

    it("returns false for unregistered skill", () => {
      const registry = new SkillRegistry();
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("lists all skills", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      registry.register({
        ...mockSkill,
        id: "color-skill",
        category: "color",
      });
      expect(registry.list()).toHaveLength(2);
    });

    it("filters by category", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      registry.register({
        ...mockSkill,
        id: "color-skill",
        category: "color",
      });

      expect(registry.list("composition")).toHaveLength(1);
      expect(registry.list("composition")[0]!.id).toBe("test-skill");

      expect(registry.list("color")).toHaveLength(1);
      expect(registry.list("color")[0]!.id).toBe("color-skill");
    });

    it("returns empty for unknown category", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      expect(registry.list("unknown")).toHaveLength(0);
    });
  });

  describe("categories", () => {
    it("returns unique categories sorted", () => {
      const registry = new SkillRegistry();
      registry.register(mockSkill);
      registry.register({
        ...mockSkill,
        id: "color-skill",
        category: "color",
      });
      expect(registry.categories()).toEqual(["color", "composition"]);
    });

    it("returns empty for empty registry", () => {
      const registry = new SkillRegistry();
      expect(registry.categories()).toEqual([]);
    });
  });
});

describe("createDefaultSkillRegistry", () => {
  const registry = createDefaultSkillRegistry();

  it("contains all composition skills", () => {
    for (const skill of COMPOSITION_SKILLS) {
      expect(registry.has(skill.id)).toBe(true);
    }
  });

  it("contains all color skills", () => {
    for (const skill of COLOR_SKILLS) {
      expect(registry.has(skill.id)).toBe(true);
    }
  });

  it("has expected total skill count", () => {
    const total = COMPOSITION_SKILLS.length + COLOR_SKILLS.length;
    expect(registry.list()).toHaveLength(total);
    expect(total).toBe(12);
  });

  it("has both categories", () => {
    expect(registry.categories()).toEqual(["color", "composition"]);
  });

  it("lists composition skills correctly", () => {
    const comps = registry.list("composition");
    expect(comps.length).toBe(COMPOSITION_SKILLS.length);
  });

  it("lists color skills correctly", () => {
    const colors = registry.list("color");
    expect(colors.length).toBe(COLOR_SKILLS.length);
  });

  describe("skill data validation", () => {
    const allSkills = registry.list();

    it.each(allSkills.map((s) => [s.id, s]))(
      "%s has required fields",
      (_id, skill) => {
        const s = skill as SkillDefinition;
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(["composition", "color"]).toContain(s.category);
        expect(["beginner", "intermediate", "advanced"]).toContain(s.complexity);
        expect(s.description.length).toBeGreaterThan(10);
        expect(s.theory.length).toBeGreaterThan(100);
        expect(s.principles.length).toBeGreaterThanOrEqual(3);
        expect(s.references.length).toBeGreaterThanOrEqual(1);
      },
    );

    it.each(allSkills.map((s) => [s.id, s]))(
      "%s references have author and title",
      (_id, skill) => {
        const s = skill as SkillDefinition;
        for (const ref of s.references) {
          expect(ref.author).toBeTruthy();
          expect(ref.title).toBeTruthy();
        }
      },
    );
  });
});
