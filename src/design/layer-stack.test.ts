import { describe, it, expect, vi } from "vitest";
import { createLayerStack } from "./layer-stack.js";
import type { DesignLayer } from "@genart-dev/format";
import type { DesignChangeType } from "../types/design-plugin.js";

function makeLayer(overrides: Partial<DesignLayer> = {}): DesignLayer {
  return {
    id: "layer-1",
    type: "test:rect",
    name: "Test Layer",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    properties: { fill: "#ff0000" },
    ...overrides,
  };
}

describe("createLayerStack", () => {
  describe("initialization", () => {
    it("starts with provided layers", () => {
      const onChange = vi.fn();
      const stack = createLayerStack([makeLayer()], onChange);
      expect(stack.count).toBe(1);
      expect(stack.getAll()).toHaveLength(1);
    });

    it("starts empty when given no layers", () => {
      const stack = createLayerStack([], vi.fn());
      expect(stack.count).toBe(0);
    });
  });

  describe("get", () => {
    it("returns a layer by ID", () => {
      const stack = createLayerStack([makeLayer({ id: "abc" })], vi.fn());
      const layer = stack.get("abc");
      expect(layer).not.toBeNull();
      expect(layer!.id).toBe("abc");
    });

    it("returns null for unknown ID", () => {
      const stack = createLayerStack([], vi.fn());
      expect(stack.get("nonexistent")).toBeNull();
    });
  });

  describe("add", () => {
    it("adds a layer at the top (default)", () => {
      const onChange = vi.fn();
      const stack = createLayerStack([makeLayer({ id: "a" })], onChange);
      stack.add(makeLayer({ id: "b" }));

      expect(stack.count).toBe(2);
      expect(stack.getAll()[1]!.id).toBe("b");
      expect(onChange).toHaveBeenCalledWith("layer-added");
    });

    it("adds a layer at a specific index", () => {
      const stack = createLayerStack(
        [makeLayer({ id: "a" }), makeLayer({ id: "c" })],
        vi.fn(),
      );
      stack.add(makeLayer({ id: "b" }), 1);

      expect(stack.getAll()[1]!.id).toBe("b");
      expect(stack.getAll()[2]!.id).toBe("c");
    });
  });

  describe("remove", () => {
    it("removes a layer by ID", () => {
      const onChange = vi.fn();
      const stack = createLayerStack(
        [makeLayer({ id: "a" }), makeLayer({ id: "b" })],
        onChange,
      );

      const result = stack.remove("a");
      expect(result).toBe(true);
      expect(stack.count).toBe(1);
      expect(stack.get("a")).toBeNull();
      expect(onChange).toHaveBeenCalledWith("layer-removed");
    });

    it("returns false for unknown layer", () => {
      const stack = createLayerStack([], vi.fn());
      expect(stack.remove("nonexistent")).toBe(false);
    });
  });

  describe("updateProperties", () => {
    it("shallow-merges properties", () => {
      const onChange = vi.fn();
      const stack = createLayerStack(
        [makeLayer({ id: "a", properties: { fill: "#ff0000", stroke: "#000" } })],
        onChange,
      );

      stack.updateProperties("a", { fill: "#00ff00" });
      const layer = stack.get("a")!;
      expect(layer.properties.fill).toBe("#00ff00");
      expect(layer.properties.stroke).toBe("#000");
      expect(onChange).toHaveBeenCalledWith("layer-updated");
    });

    it("throws for unknown layer", () => {
      const stack = createLayerStack([], vi.fn());
      expect(() => stack.updateProperties("x", {})).toThrow('Layer "x" not found');
    });
  });

  describe("updateTransform", () => {
    it("partially updates transform fields", () => {
      const onChange = vi.fn();
      const stack = createLayerStack([makeLayer({ id: "a" })], onChange);

      stack.updateTransform("a", { x: 50, y: 75 });
      const t = stack.get("a")!.transform;
      expect(t.x).toBe(50);
      expect(t.y).toBe(75);
      expect(t.width).toBe(100); // unchanged
      expect(onChange).toHaveBeenCalledWith("layer-updated");
    });
  });

  describe("updateBlend", () => {
    it("updates blend mode", () => {
      const onChange = vi.fn();
      const stack = createLayerStack([makeLayer({ id: "a" })], onChange);

      stack.updateBlend("a", "multiply");
      expect(stack.get("a")!.blendMode).toBe("multiply");
    });

    it("updates opacity", () => {
      const stack = createLayerStack([makeLayer({ id: "a" })], vi.fn());
      stack.updateBlend("a", undefined, 0.5);
      expect(stack.get("a")!.opacity).toBe(0.5);
    });

    it("updates both simultaneously", () => {
      const onChange = vi.fn();
      const stack = createLayerStack([makeLayer({ id: "a" })], onChange);

      stack.updateBlend("a", "screen", 0.7);
      const layer = stack.get("a")!;
      expect(layer.blendMode).toBe("screen");
      expect(layer.opacity).toBe(0.7);
      expect(onChange).toHaveBeenCalledWith("layer-updated");
    });
  });

  describe("reorder", () => {
    it("moves a layer to a new index", () => {
      const onChange = vi.fn();
      const stack = createLayerStack(
        [makeLayer({ id: "a" }), makeLayer({ id: "b" }), makeLayer({ id: "c" })],
        onChange,
      );

      stack.reorder("a", 2);
      expect(stack.getAll().map((l) => l.id)).toEqual(["b", "c", "a"]);
      expect(onChange).toHaveBeenCalledWith("layer-reordered");
    });

    it("clamps index to valid range", () => {
      const stack = createLayerStack(
        [makeLayer({ id: "a" }), makeLayer({ id: "b" })],
        vi.fn(),
      );

      stack.reorder("a", 999);
      expect(stack.getAll().map((l) => l.id)).toEqual(["b", "a"]);
    });

    it("no-ops when target index equals current", () => {
      const onChange = vi.fn();
      const stack = createLayerStack(
        [makeLayer({ id: "a" }), makeLayer({ id: "b" })],
        onChange,
      );

      stack.reorder("a", 0);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("duplicate", () => {
    it("clones a layer with a new ID", () => {
      const onChange = vi.fn();
      const stack = createLayerStack(
        [makeLayer({ id: "a", name: "Original" })],
        onChange,
      );

      const newId = stack.duplicate("a");
      expect(newId).not.toBe("a");
      expect(stack.count).toBe(2);

      const clone = stack.get(newId)!;
      expect(clone.name).toBe("Original copy");
      expect(clone.type).toBe("test:rect");
      expect(clone.properties).toEqual({ fill: "#ff0000" });
      expect(onChange).toHaveBeenCalledWith("layer-added");
    });

    it("inserts the clone after the original", () => {
      const stack = createLayerStack(
        [makeLayer({ id: "a" }), makeLayer({ id: "b" })],
        vi.fn(),
      );

      const newId = stack.duplicate("a");
      const ids = stack.getAll().map((l) => l.id);
      expect(ids[0]).toBe("a");
      expect(ids[1]).toBe(newId);
      expect(ids[2]).toBe("b");
    });

    it("deep-clones children for group layers", () => {
      const group = makeLayer({
        id: "group-1",
        type: "group",
        children: [
          makeLayer({ id: "child-1", name: "Child" }),
        ],
      });

      const stack = createLayerStack([group], vi.fn());
      const newId = stack.duplicate("group-1");
      const clone = stack.get(newId)!;

      expect(clone.children).toHaveLength(1);
      expect(clone.children![0]!.id).not.toBe("child-1");
      expect(clone.children![0]!.name).toBe("Child copy");
    });
  });

  describe("onChange callback", () => {
    it("fires with correct change types", () => {
      const changes: DesignChangeType[] = [];
      const stack = createLayerStack([], (type) => changes.push(type));

      stack.add(makeLayer({ id: "a" }));
      stack.updateProperties("a", { fill: "#000" });
      stack.updateTransform("a", { x: 10 });
      stack.updateBlend("a", "overlay");
      stack.duplicate("a");
      stack.reorder("a", 1);
      stack.remove("a");

      expect(changes).toEqual([
        "layer-added",
        "layer-updated",
        "layer-updated",
        "layer-updated",
        "layer-added",
        "layer-reordered",
        "layer-removed",
      ]);
    });
  });
});
