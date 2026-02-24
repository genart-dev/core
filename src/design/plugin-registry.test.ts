import { describe, it, expect, vi } from "vitest";
import { createPluginRegistry } from "./plugin-registry.js";
import type {
  DesignPlugin,
  PluginHostInfo,
} from "../types/design-plugin.js";

const HOST: PluginHostInfo = {
  surface: "desktop",
  supportsInteractiveTools: true,
  supportsRendering: true,
};

function createMockPlugin(overrides: Partial<DesignPlugin> = {}): DesignPlugin {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    layerTypes: [],
    tools: [],
    exportHandlers: [],
    mcpTools: [],
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe("createPluginRegistry", () => {
  describe("register", () => {
    it("registers a plugin and makes it retrievable", async () => {
      const registry = createPluginRegistry(HOST);
      const plugin = createMockPlugin();
      await registry.register(plugin);

      expect(registry.get("test-plugin")).toBe(plugin);
      expect(plugin.initialize).toHaveBeenCalledOnce();
    });

    it("rejects duplicate registration", async () => {
      const registry = createPluginRegistry(HOST);
      await registry.register(createMockPlugin());

      await expect(
        registry.register(createMockPlugin()),
      ).rejects.toThrow('Plugin "test-plugin" is already registered');
    });

    it("validates dependencies are loaded", async () => {
      const registry = createPluginRegistry(HOST);
      const dependent = createMockPlugin({
        id: "dependent",
        dependencies: ["missing-plugin"],
      });

      await expect(registry.register(dependent)).rejects.toThrow(
        'Plugin "dependent" depends on "missing-plugin" which is not registered',
      );
    });

    it("allows registration when dependencies are satisfied", async () => {
      const registry = createPluginRegistry(HOST);
      await registry.register(createMockPlugin({ id: "base" }));
      const dependent = createMockPlugin({
        id: "dependent",
        dependencies: ["base"],
      });

      await registry.register(dependent);
      expect(registry.get("dependent")).toBe(dependent);
    });
  });

  describe("unregister", () => {
    it("unregisters and disposes a plugin", async () => {
      const registry = createPluginRegistry(HOST);
      const plugin = createMockPlugin();
      await registry.register(plugin);

      registry.unregister("test-plugin");
      expect(plugin.dispose).toHaveBeenCalledOnce();
      expect(registry.get("test-plugin")).toBeNull();
    });

    it("throws for unknown plugin", () => {
      const registry = createPluginRegistry(HOST);
      expect(() => registry.unregister("nonexistent")).toThrow(
        'Plugin "nonexistent" is not registered',
      );
    });
  });

  describe("getAll", () => {
    it("returns all registered plugins", async () => {
      const registry = createPluginRegistry(HOST);
      await registry.register(createMockPlugin({ id: "a" }));
      await registry.register(createMockPlugin({ id: "b" }));

      expect(registry.getAll()).toHaveLength(2);
    });
  });

  describe("getLayerTypes", () => {
    it("collects layer types across plugins", async () => {
      const registry = createPluginRegistry(HOST);
      const layerType = {
        typeId: "test:text",
        displayName: "Text",
        icon: "text",
        category: "text" as const,
        properties: [],
        createDefault: () => ({}),
        render: vi.fn(),
        validate: () => null,
        propertyEditorId: "text-editor",
      };

      await registry.register(
        createMockPlugin({ id: "a", layerTypes: [layerType] }),
      );

      expect(registry.getLayerTypes()).toHaveLength(1);
      expect(registry.getLayerTypes()[0]).toBe(layerType);
    });
  });

  describe("resolveLayerType", () => {
    it("resolves a layer type by typeId", async () => {
      const registry = createPluginRegistry(HOST);
      const layerType = {
        typeId: "test:shape",
        displayName: "Shape",
        icon: "shape",
        category: "shape" as const,
        properties: [],
        createDefault: () => ({}),
        render: vi.fn(),
        validate: () => null,
        propertyEditorId: "shape-editor",
      };

      await registry.register(
        createMockPlugin({ layerTypes: [layerType] }),
      );

      expect(registry.resolveLayerType("test:shape")).toBe(layerType);
      expect(registry.resolveLayerType("unknown:type")).toBeNull();
    });
  });

  describe("getMcpTools", () => {
    it("prefixes tool names with design_", async () => {
      const registry = createPluginRegistry(HOST);
      const mcpTool = {
        name: "set_text",
        description: "Set text",
        inputSchema: { type: "object" },
        handler: vi.fn(),
      };

      await registry.register(
        createMockPlugin({ mcpTools: [mcpTool] }),
      );

      const tools = registry.getMcpTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe("design_set_text");
      expect(tools[0]!.pluginId).toBe("test-plugin");
      expect(tools[0]!.definition).toBe(mcpTool);
    });

  });

  describe("getDesignTools", () => {
    it("collects tools across plugins", async () => {
      const registry = createPluginRegistry(HOST);
      const tool = {
        toolId: "test:select",
        displayName: "Select",
        icon: "cursor",
        section: "select" as const,
        cursor: "default",
        onActivate: vi.fn(),
        onDeactivate: vi.fn(),
      };

      await registry.register(createMockPlugin({ tools: [tool] }));
      expect(registry.getDesignTools()).toHaveLength(1);
    });
  });

  describe("getExportHandlers", () => {
    it("collects export handlers across plugins", async () => {
      const registry = createPluginRegistry(HOST);
      const handler = {
        formatId: "test:gif",
        displayName: "GIF",
        extension: "gif",
        mimeType: "image/gif",
        canExport: () => true,
        export: vi.fn(),
      };

      await registry.register(createMockPlugin({ exportHandlers: [handler] }));
      expect(registry.getExportHandlers()).toHaveLength(1);
    });
  });
});
