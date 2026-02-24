import type {
  DesignPlugin,
  PluginRegistry,
  PluginHostInfo,
  PluginContext,
  PluginLogger,
  LayerTypeDefinition,
  DesignToolDefinition,
  ExportHandlerDefinition,
  PrefixedMcpTool,
} from "../types/design-plugin.js";

/**
 * Create a plugin registry that manages plugin lifecycle and lookup.
 * Mirrors the RendererRegistry / SkillRegistry pattern.
 */
export function createPluginRegistry(host: PluginHostInfo): PluginRegistry {
  const plugins = new Map<string, DesignPlugin>();

  function createPluginContext(plugin: DesignPlugin): PluginContext {
    const log: PluginLogger = {
      info: (msg) =>
        console.log(`[plugin:${plugin.id}] ${msg}`),
      warn: (msg) =>
        console.warn(`[plugin:${plugin.id}] ${msg}`),
      error: (msg) =>
        console.error(`[plugin:${plugin.id}] ${msg}`),
    };
    const components = new Map<string, unknown>();
    const assets = new Map<string, { data: Buffer | Uint8Array; mimeType: string }>();

    return {
      registerComponent(componentId: string, component: unknown) {
        components.set(componentId, component);
      },
      registerAsset(assetId: string, data: Buffer | Uint8Array, mimeType: string) {
        assets.set(assetId, { data, mimeType });
      },
      log,
      host,
    };
  }

  const registry: PluginRegistry = {
    async register(plugin: DesignPlugin): Promise<void> {
      if (plugins.has(plugin.id)) {
        throw new Error(`Plugin "${plugin.id}" is already registered`);
      }

      // Validate dependencies are loaded
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!plugins.has(dep)) {
            throw new Error(
              `Plugin "${plugin.id}" depends on "${dep}" which is not registered`,
            );
          }
        }
      }

      const context = createPluginContext(plugin);
      await plugin.initialize(context);
      plugins.set(plugin.id, plugin);
    },

    unregister(pluginId: string): void {
      const plugin = plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin "${pluginId}" is not registered`);
      }
      plugin.dispose();
      plugins.delete(pluginId);
    },

    get(pluginId: string): DesignPlugin | null {
      return plugins.get(pluginId) ?? null;
    },

    getAll(): readonly DesignPlugin[] {
      return Array.from(plugins.values());
    },

    getLayerTypes(): readonly LayerTypeDefinition[] {
      const types: LayerTypeDefinition[] = [];
      for (const plugin of plugins.values()) {
        types.push(...plugin.layerTypes);
      }
      return types;
    },

    resolveLayerType(typeId: string): LayerTypeDefinition | null {
      for (const plugin of plugins.values()) {
        const found = plugin.layerTypes.find((lt) => lt.typeId === typeId);
        if (found) return found;
      }
      return null;
    },

    getMcpTools(): readonly PrefixedMcpTool[] {
      const tools: PrefixedMcpTool[] = [];
      for (const plugin of plugins.values()) {
        for (const tool of plugin.mcpTools) {
          tools.push({
            name: `design_${tool.name}`,
            pluginId: plugin.id,
            definition: tool,
          });
        }
      }
      return tools;
    },

    getDesignTools(): readonly DesignToolDefinition[] {
      const tools: DesignToolDefinition[] = [];
      for (const plugin of plugins.values()) {
        tools.push(...plugin.tools);
      }
      return tools;
    },

    getExportHandlers(): readonly ExportHandlerDefinition[] {
      const handlers: ExportHandlerDefinition[] = [];
      for (const plugin of plugins.values()) {
        handlers.push(...plugin.exportHandlers);
      }
      return handlers;
    },
  };

  return registry;
}
