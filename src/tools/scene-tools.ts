import { callSceneScript } from '../editor-api';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

export class SceneTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'management',
        description: 'Scene management for Cocos Creator 2.x',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['get_current', 'list', 'open', 'save', 'create', 'close', 'reload_current', 'bind_resources'],
            },
            scenePath: { type: 'string' },
            sceneName: { type: 'string' },
            bindings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            saveAfterApply: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
      {
        name: 'hierarchy',
        description: 'Read the active scene hierarchy',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_tree', 'get_all_nodes'] },
            includeComponents: { type: 'boolean', default: false },
          },
          required: ['action'],
        },
      },
      {
        name: 'execution_control',
        description: 'Low-level scene-script access helpers',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['ping', 'execute_debug_script'] },
            script: { type: 'string' },
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'management') {
      return this.handleManagement(args);
    }
    if (toolName === 'hierarchy') {
      return this.handleHierarchy(args);
    }
    if (toolName === 'execution_control') {
      return this.handleExecution(args);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async handleManagement(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'get_current':
        return callSceneScript('getCurrentSceneInfo');
      case 'save':
        return this.saveScene();
      case 'create':
        return callSceneScript('createScene', args.sceneName || 'New Scene', args.scenePath);
      case 'list':
        return this.getSceneList();
      case 'open':
        return this.openScene(args.scenePath);
      case 'reload_current':
        return callSceneScript('reloadCurrentScene');
      case 'bind_resources':
        return callSceneScript('applySceneResourceBindings', args.bindings || [], !!args.saveAfterApply);
      case 'close':
        return { success: true, message: 'Creator 2.x does not expose a stable close-scene API; no-op.' };
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async handleHierarchy(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'get_tree':
        return callSceneScript('getSceneHierarchy', !!args.includeComponents);
      case 'get_all_nodes':
        return callSceneScript('getAllNodes', !!args.includeComponents);
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async handleExecution(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'ping':
        return callSceneScript('ping');
      case 'execute_debug_script':
        return callSceneScript('executeDebugScript', args.script || '');
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async getSceneList(): Promise<ToolResponse> {
    const Editor = (global as any).Editor;
    try {
      if (Editor.assetdb && typeof Editor.assetdb.queryAssets === 'function') {
        const results = await new Promise<any[]>((resolve, reject) => {
          Editor.assetdb.queryAssets('db://assets/**\/*.fire', null, (err: Error | null, assets: any[]) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(assets || []);
          });
        });
        return {
          success: true,
          data: results.map((asset) => ({
            name: asset.name,
            path: asset.url,
            uuid: asset.uuid,
          })),
        };
      }
      return { success: false, error: 'assetdb.queryAssets is unavailable' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async openScene(scenePath: string): Promise<ToolResponse> {
    const Editor = (global as any).Editor;
    try {
      if (!scenePath) {
        throw new Error('scenePath is required');
      }
      if (Editor.scene && typeof Editor.scene.open === 'function') {
        await new Promise<void>((resolve, reject) => {
          Editor.scene.open(scenePath, (err: Error | null) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
        return { success: true, message: `Scene opened: ${scenePath}` };
      }
      return { success: false, error: 'Editor.scene.open is unavailable' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async saveScene(): Promise<ToolResponse> {
    const Editor = (global as any).Editor;
    try {
      if (Editor.scene && typeof Editor.scene.save === 'function') {
        await new Promise<void>((resolve, reject) => {
          Editor.scene.save((err: Error | null) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
        return { success: true, message: 'Scene saved' };
      }
      return callSceneScript('saveScene');
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
