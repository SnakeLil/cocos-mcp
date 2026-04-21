import * as fs from 'fs';
import * as path from 'path';
import { MCPServerSettings, ToolManagerSettings, ToolConfiguration } from './types';

const DEFAULT_SETTINGS: MCPServerSettings = {
  port: 3100,
  autoStart: false,
  enableDebugLog: false,
  allowedOrigins: ['*'],
  maxConnections: 10,
};

const DEFAULT_TOOL_MANAGER_SETTINGS: ToolManagerSettings = {
  configurations: [],
  currentConfigId: '',
  maxConfigSlots: 5,
};

function getProjectPath(): string {
  return (global as any).Editor?.Project?.path || process.cwd();
}

function getSettingsDir(): string {
  return path.join(getProjectPath(), 'settings');
}

function getSettingsPath(): string {
  return path.join(getSettingsDir(), 'cocos-mcp.json');
}

function getToolManagerSettingsPath(): string {
  return path.join(getSettingsDir(), 'cocos-mcp-tool-manager.json');
}

function ensureSettingsDir(): void {
  const dir = getSettingsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readSettings(): MCPServerSettings {
  try {
    ensureSettingsDir();
    const file = getSettingsPath();
    if (fs.existsSync(file)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  } catch (error) {
    console.error('[cocos-mcp] Failed to read settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: MCPServerSettings): void {
  ensureSettingsDir();
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

export function readToolManagerSettings(): ToolManagerSettings {
  try {
    ensureSettingsDir();
    const file = getToolManagerSettingsPath();
    if (fs.existsSync(file)) {
      return { ...DEFAULT_TOOL_MANAGER_SETTINGS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  } catch (error) {
    console.error('[cocos-mcp] Failed to read tool manager settings:', error);
  }
  return {
    configurations: [],
    currentConfigId: '',
    maxConfigSlots: DEFAULT_TOOL_MANAGER_SETTINGS.maxConfigSlots,
  };
}

export function saveToolManagerSettings(settings: ToolManagerSettings): void {
  ensureSettingsDir();
  fs.writeFileSync(getToolManagerSettingsPath(), JSON.stringify(settings, null, 2));
}

export function exportToolConfiguration(config: ToolConfiguration): string {
  return JSON.stringify(config, null, 2);
}

export function importToolConfiguration(configJson: string): ToolConfiguration {
  const config = JSON.parse(configJson);
  if (!config || !config.id || !config.name || !Array.isArray(config.tools)) {
    throw new Error('Invalid configuration structure');
  }
  return config;
}

export { DEFAULT_SETTINGS, DEFAULT_TOOL_MANAGER_SETTINGS };
