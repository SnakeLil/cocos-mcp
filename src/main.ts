import { MCPServer } from './mcp-server';
import { readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';

let server: MCPServer | null = null;
let toolManager: ToolManager;

function reply(event: any, error: any, result?: any) {
  if (event && typeof event.reply === 'function') {
    event.reply(error || null, result);
  }
}

async function handleWithReply(event: any, handler: () => any | Promise<any>) {
  try {
    const result = await handler();
    reply(event, null, result);
    return result;
  } catch (error: any) {
    console.error('[cocos-mcp] IPC handler failed:', error);
    reply(event, error?.message || String(error));
    return undefined;
  }
}

function ensureServer(): MCPServer {
  if (!toolManager) {
    toolManager = new ToolManager();
  }
  if (!server) {
    server = new MCPServer(readSettings(), toolManager);
  }
  return server;
}

function load() {
  try {
    console.log('[cocos-mcp] load start');
    toolManager = new ToolManager();
    server = new MCPServer(readSettings(), toolManager);
    if (readSettings().autoStart) {
      server.start().catch((error) => console.error('[cocos-mcp] Auto start failed:', error));
    }
    console.log('[cocos-mcp] extension loaded');
  } catch (error) {
    console.error('[cocos-mcp] load failed:', error);
    throw error;
  }
}

function unload() {
  if (server) {
    server.stop();
    server = null;
  }
  console.log('[cocos-mcp] extension unloaded');
}

const messages = {
  'open-panel'(event?: any) {
    const result = (global as any).Editor.Panel.open('cocos-mcp');
    reply(event, null, result);
  },

  async 'start-server'(event: any) {
    return handleWithReply(event, async () => {
      const instance = ensureServer();
      instance.updateEnabledTools();
      await instance.start();
      return instance.getStatus();
    });
  },

  'stop-server'(event: any) {
    return handleWithReply(event, () => {
      if (server) {
        server.stop();
      }
      return server?.getStatus() || { running: false, port: readSettings().port, clients: 0 };
    });
  },

  'get-server-status'(event: any) {
    return handleWithReply(event, () => {
      const instance = ensureServer();
      return {
        ...instance.getStatus(),
        settings: instance.getSettings(),
      };
    });
  },

  'get-server-settings'(event: any) {
    return handleWithReply(event, () => readSettings());
  },

  'update-settings'(event: any, settings: Partial<MCPServerSettings>) {
    return handleWithReply(event, () => {
      const next = { ...readSettings(), ...settings };
      saveSettings(next);
      if (server) {
        const running = server.getStatus().running;
        server.stop();
        server = new MCPServer(next, toolManager);
        if (running) {
          server.start().catch((error) => console.error('[cocos-mcp] Failed to restart server:', error));
        }
      }
      return next;
    });
  },

  'get-tools-list'(event: any) {
    return handleWithReply(event, () => ensureServer().getAvailableTools());
  },

  'get-tool-manager-state'(event: any) {
    return handleWithReply(event, () => toolManager.getToolManagerState());
  },

  'create-tool-configuration'(event: any, name: string, description?: string) {
    return handleWithReply(event, () => toolManager.createConfiguration(name, description));
  },

  'update-tool-configuration'(event: any, configId: string, updates: any) {
    return handleWithReply(event, () => {
      const result = toolManager.updateConfiguration(configId, updates);
      server?.updateEnabledTools();
      return result;
    });
  },

  'delete-tool-configuration'(event: any, configId: string) {
    return handleWithReply(event, () => {
      toolManager.deleteConfiguration(configId);
      server?.updateEnabledTools();
      return { success: true };
    });
  },

  'set-current-tool-configuration'(event: any, configId: string) {
    return handleWithReply(event, () => {
      toolManager.setCurrentConfiguration(configId);
      server?.updateEnabledTools();
      return { success: true };
    });
  },

  'update-tool-status'(event: any, category: string, name: string, enabled: boolean) {
    return handleWithReply(event, () => {
      const current = toolManager.getCurrentConfiguration();
      if (!current) {
        throw new Error('Current configuration not found');
      }
      toolManager.updateToolStatus(current.id, category, name, enabled);
      server?.updateEnabledTools();
      return { success: true };
    });
  },

  'update-tool-status-batch'(event: any, updates: Array<{ category: string; name: string; enabled: boolean }>) {
    return handleWithReply(event, () => {
      const current = toolManager.getCurrentConfiguration();
      if (!current) {
        throw new Error('Current configuration not found');
      }
      toolManager.updateToolStatusBatch(current.id, updates);
      server?.updateEnabledTools();
      return { success: true };
    });
  },

  'export-tool-configuration'(event: any, configId: string) {
    return handleWithReply(event, () => toolManager.exportConfiguration(configId));
  },

  'import-tool-configuration'(event: any, configJson: string) {
    return handleWithReply(event, () => {
      const result = toolManager.importConfiguration(configJson);
      server?.updateEnabledTools();
      return result;
    });
  },

  'get-enabled-tools'(event: any) {
    return handleWithReply(event, () => toolManager.getEnabledTools());
  },
};

const mainModule = {
  load,
  unload,
  messages,
  methods() {},
};

export = mainModule;
