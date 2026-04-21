import { createId } from '../id';
import {
  ToolConfig,
  ToolConfiguration,
  ToolManagerSettings,
  ToolManagerState,
} from '../types';
import {
  readToolManagerSettings,
  saveToolManagerSettings,
  exportToolConfiguration,
  importToolConfiguration,
} from '../settings';
import { TOOL_CATALOG } from '../tool-catalog';

export class ToolManager {
  private settings: ToolManagerSettings;

  constructor() {
    this.settings = readToolManagerSettings();
    this.ensureDefaultConfiguration();
  }

  private ensureDefaultConfiguration(): void {
    if (this.settings.configurations.length > 0 && this.settings.currentConfigId) {
      this.migrateConfigurations();
      return;
    }

    const now = new Date().toISOString();
    const config: ToolConfiguration = {
      id: createId(),
      name: 'Default',
      description: 'All core tools enabled',
      tools: TOOL_CATALOG.map((tool) => ({ ...tool })),
      createdAt: now,
      updatedAt: now,
    };

    this.settings.configurations = [config];
    this.settings.currentConfigId = config.id;
    this.persist();
  }

  private migrateConfigurations(): void {
    const catalogMap = new Map(TOOL_CATALOG.map((tool) => [`${tool.category}_${tool.name}`, tool]));
    let changed = false;

    this.settings.configurations = this.settings.configurations.map((config) => {
      const migratedTools: ToolConfig[] = [];
      const seen = new Set<string>();

      config.tools.forEach((tool) => {
        let category = tool.category;
        let name = tool.name;

        if (category === 'asset' && ['query', 'operations', 'analyze'].includes(name)) {
          category = 'project';
          name = `asset_${name}`;
          changed = true;
        }

        const key = `${category}_${name}`;
        if (!catalogMap.has(key) || seen.has(key)) {
          changed = true;
          return;
        }

        const catalogTool = catalogMap.get(key)!;
        migratedTools.push({
          ...catalogTool,
          enabled: tool.enabled,
        });
        seen.add(key);
      });

      TOOL_CATALOG.forEach((tool) => {
        const key = `${tool.category}_${tool.name}`;
        if (!seen.has(key)) {
          migratedTools.push({ ...tool });
          seen.add(key);
          changed = true;
        }
      });

      return {
        ...config,
        tools: migratedTools,
        updatedAt: changed ? new Date().toISOString() : config.updatedAt,
      };
    });

    if (changed) {
      this.persist();
    }
  }

  private persist(): void {
    saveToolManagerSettings(this.settings);
  }

  getAvailableTools(): ToolConfig[] {
    return TOOL_CATALOG.map((tool) => ({ ...tool }));
  }

  getCurrentConfiguration(): ToolConfiguration | null {
    return this.settings.configurations.find((config) => config.id === this.settings.currentConfigId) || null;
  }

  getEnabledTools(): ToolConfig[] {
    const config = this.getCurrentConfiguration();
    if (!config) {
      return this.getAvailableTools();
    }
    return config.tools.filter((tool) => tool.enabled);
  }

  getToolManagerState(): ToolManagerState {
    return {
      availableTools: this.getAvailableTools(),
      currentConfiguration: this.getCurrentConfiguration(),
      configurations: this.settings.configurations,
    };
  }

  createConfiguration(name: string, description?: string): ToolConfiguration {
    if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
      throw new Error(`Maximum configuration count reached: ${this.settings.maxConfigSlots}`);
    }

    const now = new Date().toISOString();
    const config: ToolConfiguration = {
      id: createId(),
      name,
      description,
      tools: TOOL_CATALOG.map((tool) => ({ ...tool })),
      createdAt: now,
      updatedAt: now,
    };

    this.settings.configurations.push(config);
    this.settings.currentConfigId = config.id;
    this.persist();
    return config;
  }

  updateConfiguration(configId: string, updates: Partial<ToolConfiguration>): ToolConfiguration {
    const config = this.settings.configurations.find((item) => item.id === configId);
    if (!config) {
      throw new Error('Configuration not found');
    }

    if (updates.name !== undefined) {
      config.name = updates.name;
    }
    if (updates.description !== undefined) {
      config.description = updates.description;
    }
    if (updates.tools !== undefined) {
      config.tools = updates.tools;
    }
    config.updatedAt = new Date().toISOString();
    this.persist();
    return config;
  }

  deleteConfiguration(configId: string): void {
    const index = this.settings.configurations.findIndex((item) => item.id === configId);
    if (index === -1) {
      throw new Error('Configuration not found');
    }

    this.settings.configurations.splice(index, 1);
    if (this.settings.currentConfigId === configId) {
      this.settings.currentConfigId = this.settings.configurations[0]?.id || '';
    }
    this.ensureDefaultConfiguration();
    this.persist();
  }

  setCurrentConfiguration(configId: string): void {
    const exists = this.settings.configurations.some((item) => item.id === configId);
    if (!exists) {
      throw new Error('Configuration not found');
    }
    this.settings.currentConfigId = configId;
    this.persist();
  }

  updateToolStatus(configId: string, category: string, name: string, enabled: boolean): void {
    const config = this.settings.configurations.find((item) => item.id === configId);
    if (!config) {
      throw new Error('Configuration not found');
    }

    const tool = config.tools.find((item) => item.category === category && item.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${category}_${name}`);
    }

    tool.enabled = enabled;
    config.updatedAt = new Date().toISOString();
    this.persist();
  }

  updateToolStatusBatch(configId: string, updates: Array<{ category: string; name: string; enabled: boolean }>): void {
    updates.forEach((update) => this.updateToolStatus(configId, update.category, update.name, update.enabled));
  }

  exportConfiguration(configId: string): string {
    const config = this.settings.configurations.find((item) => item.id === configId);
    if (!config) {
      throw new Error('Configuration not found');
    }
    return exportToolConfiguration(config);
  }

  importConfiguration(configJson: string): ToolConfiguration {
    const parsed = importToolConfiguration(configJson);
    const now = new Date().toISOString();
    const config: ToolConfiguration = {
      ...parsed,
      id: createId(),
      createdAt: parsed.createdAt || now,
      updatedAt: now,
    };
    this.settings.configurations.push(config);
    this.settings.currentConfigId = config.id;
    this.persist();
    return config;
  }
}
