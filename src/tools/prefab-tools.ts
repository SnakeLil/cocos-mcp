import * as fs from 'fs';
import * as path from 'path';
import { callSceneScript } from '../editor-api';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

function getProjectPath(): string {
  return (global as any).Editor?.Project?.path || process.cwd();
}

function toFsPath(assetPath: string): string {
  if (assetPath.startsWith('db://assets/')) {
    return path.join(getProjectPath(), 'assets', assetPath.slice('db://assets/'.length));
  }
  if (assetPath.startsWith('db://')) {
    return path.join(getProjectPath(), assetPath.slice('db://'.length));
  }
  return assetPath;
}

export class PrefabTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'browse',
        description: 'List and inspect prefab assets',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'info', 'validate'] },
            folder: { type: 'string', default: 'db://assets' },
            prefabPath: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'lifecycle',
        description: 'Create, duplicate or delete prefab assets',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'duplicate', 'delete'] },
            nodeUuid: { type: 'string' },
            prefabPath: { type: 'string' },
            sourcePrefabPath: { type: 'string' },
            targetPrefabPath: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'instance',
        description: 'Instantiate prefab payloads into active scene',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['instantiate'] },
            prefabPath: { type: 'string' },
            parentUuid: { type: 'string' },
            position: { type: 'object' },
          },
          required: ['action', 'prefabPath'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'browse') {
      return this.handleBrowse(args);
    }
    if (toolName === 'lifecycle') {
      return this.handleLifecycle(args);
    }
    if (toolName === 'instance') {
      return this.instantiatePrefab(args.prefabPath, args.parentUuid, args.position);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async handleBrowse(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'list':
        return this.listPrefabs(args.folder || 'db://assets');
      case 'info':
        return this.getPrefabInfo(args.prefabPath);
      case 'validate':
        return this.validatePrefab(args.prefabPath);
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async handleLifecycle(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'create':
        return this.createPrefab(args.nodeUuid, args.prefabPath);
      case 'duplicate':
        return this.duplicatePrefab(args.sourcePrefabPath, args.targetPrefabPath);
      case 'delete':
        return this.deletePrefab(args.prefabPath);
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async listPrefabs(folder: string): Promise<ToolResponse> {
    const Editor = (global as any).Editor;
    try {
      if (Editor.assetdb && typeof Editor.assetdb.queryAssets === 'function') {
        const pattern = `${folder.replace(/\/$/, '')}/**/*.prefab`;
        const assets = await new Promise<any[]>((resolve, reject) => {
          Editor.assetdb.queryAssets(pattern, null, (err: Error | null, results: any[]) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(results || []);
          });
        });
        return {
          success: true,
          data: assets.map((asset) => ({
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

  private async getPrefabInfo(prefabPath: string): Promise<ToolResponse> {
    try {
      const fsPath = toFsPath(prefabPath);
      const content = fs.readFileSync(fsPath, 'utf8');
      const stat = fs.statSync(fsPath);
      return {
        success: true,
        data: {
          path: prefabPath,
          fsPath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          preview: content.slice(0, 2000),
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async validatePrefab(prefabPath: string): Promise<ToolResponse> {
    try {
      const fsPath = toFsPath(prefabPath);
      const content = fs.readFileSync(fsPath, 'utf8');
      JSON.parse(content);
      return { success: true, message: 'Prefab JSON is valid' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async createPrefab(nodeUuid: string, prefabPath: string): Promise<ToolResponse> {
    try {
      const snapshot = await callSceneScript('createPrefabFromNode', nodeUuid, prefabPath);
      if (!snapshot.success) {
        return snapshot;
      }

      const fsPath = toFsPath(prefabPath);
      fs.mkdirSync(path.dirname(fsPath), { recursive: true });
      fs.writeFileSync(fsPath, typeof snapshot.data.serialized === 'string' ? snapshot.data.serialized : JSON.stringify(snapshot.data.serialized, null, 2));
      return {
        success: true,
        data: {
          path: prefabPath,
          fsPath,
          node: snapshot.data.node,
        },
        message: 'Prefab file created',
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async duplicatePrefab(sourcePrefabPath: string, targetPrefabPath: string): Promise<ToolResponse> {
    try {
      const source = toFsPath(sourcePrefabPath);
      const target = toFsPath(targetPrefabPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      return {
        success: true,
        data: { sourcePrefabPath, targetPrefabPath },
        message: 'Prefab duplicated',
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async deletePrefab(prefabPath: string): Promise<ToolResponse> {
    try {
      fs.unlinkSync(toFsPath(prefabPath));
      return { success: true, message: `Prefab deleted: ${prefabPath}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async instantiatePrefab(prefabPath: string, parentUuid?: string, position?: any): Promise<ToolResponse> {
    try {
      const content = fs.readFileSync(toFsPath(prefabPath), 'utf8');
      return callSceneScript('instantiatePrefab', content, parentUuid, position);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
