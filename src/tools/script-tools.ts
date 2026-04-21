import * as fs from 'fs';
import * as path from 'path';
import { callSceneScript } from '../editor-api';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

function getEditor(): any {
  return (global as any).Editor;
}

function getProjectPath(): string {
  return getEditor()?.Project?.path || process.cwd();
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

function toAssetPath(fsPath: string): string {
  const assetsRoot = path.join(getProjectPath(), 'assets');
  if (fsPath.startsWith(assetsRoot)) {
    return `db://assets/${path.relative(assetsRoot, fsPath).replace(/\\/g, '/')}`;
  }
  return fsPath;
}

function inferClassName(scriptPath: string): string {
  const base = path.basename(scriptPath).replace(/\.(ts|js)$/i, '');
  return base.replace(/[^A-Za-z0-9_$]/g, '');
}

function ensureParentDir(fsPath: string): void {
  fs.mkdirSync(path.dirname(fsPath), { recursive: true });
}

async function refreshAsset(assetPath?: string): Promise<void> {
  const Editor = getEditor();
  const target = assetPath || 'db://assets';

  if (Editor?.assetdb?.refresh) {
    await new Promise<void>((resolve, reject) => {
      Editor.assetdb.refresh(target, (err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    return;
  }

  if (Editor?.Message?.request) {
    try {
      await Editor.Message.request('asset-db', 'refresh-asset', target);
      return;
    } catch (error) {
      return;
    }
  }
}

function buildComponentTemplate(className: string, componentName?: string): string {
  const displayName = componentName || className;
  return `const { ccclass, property } = cc._decorator;

@ccclass
export default class ${className} extends cc.Component {
  @property(cc.Node)
  target: cc.Node = null;

  onLoad() {
    // ${displayName}
  }
}
`;
}

export class ScriptTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'file',
        description: 'Read, create, update and refresh script assets',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['read', 'create', 'update', 'append', 'delete', 'refresh', 'get_info', 'find_by_class_name'],
            },
            scriptPath: { type: 'string' },
            className: { type: 'string' },
            content: { type: 'string' },
            componentName: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'workflow',
        description: 'High-level script workflow helpers for AI scene/page generation',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create_and_attach', 'attach_existing', 'sync_and_attach'],
            },
            nodeUuid: { type: 'string' },
            scriptPath: { type: 'string' },
            className: { type: 'string' },
            content: { type: 'string' },
            componentName: { type: 'string' },
          },
          required: ['action', 'nodeUuid'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'file') {
      return this.handleFile(args);
    }
    if (toolName === 'workflow') {
      return this.handleWorkflow(args);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async handleFile(args: any): Promise<ToolResponse> {
    try {
      switch (args.action) {
        case 'read': {
          const fsPath = toFsPath(args.scriptPath);
          return {
            success: true,
            data: {
              scriptPath: args.scriptPath,
              fsPath,
              content: fs.readFileSync(fsPath, 'utf8'),
            },
          };
        }

        case 'create': {
          const className = args.className || inferClassName(args.scriptPath);
          const fsPath = toFsPath(args.scriptPath);
          ensureParentDir(fsPath);
          const content = args.content || buildComponentTemplate(className, args.componentName);
          fs.writeFileSync(fsPath, content);
          await refreshAsset(args.scriptPath);
          return {
            success: true,
            data: {
              scriptPath: args.scriptPath,
              fsPath,
              className,
            },
            message: 'Script created',
          };
        }

        case 'update': {
          const fsPath = toFsPath(args.scriptPath);
          ensureParentDir(fsPath);
          fs.writeFileSync(fsPath, args.content || '');
          await refreshAsset(args.scriptPath);
          return {
            success: true,
            data: {
              scriptPath: args.scriptPath,
              fsPath,
            },
            message: 'Script updated',
          };
        }

        case 'append': {
          const fsPath = toFsPath(args.scriptPath);
          ensureParentDir(fsPath);
          fs.appendFileSync(fsPath, args.content || '');
          await refreshAsset(args.scriptPath);
          return {
            success: true,
            data: {
              scriptPath: args.scriptPath,
              fsPath,
            },
            message: 'Script appended',
          };
        }

        case 'delete': {
          const fsPath = toFsPath(args.scriptPath);
          fs.rmSync(fsPath, { force: true });
          await refreshAsset(path.dirname(args.scriptPath || 'db://assets'));
          return { success: true, message: 'Script deleted' };
        }

        case 'refresh':
          await refreshAsset(args.scriptPath);
          return { success: true, message: 'Script asset refreshed' };

        case 'get_info': {
          const fsPath = toFsPath(args.scriptPath);
          const content = fs.readFileSync(fsPath, 'utf8');
          return {
            success: true,
            data: {
              scriptPath: args.scriptPath,
              fsPath,
              className: args.className || inferClassName(args.scriptPath),
              size: fs.statSync(fsPath).size,
              preview: content.slice(0, 2000),
            },
          };
        }

        case 'find_by_class_name': {
          const assetsRoot = path.join(getProjectPath(), 'assets');
          const result: Array<{ scriptPath: string; fsPath: string; className: string }> = [];
          const walk = (root: string) => {
            if (!fs.existsSync(root)) {
              return;
            }
            for (const entry of fs.readdirSync(root)) {
              const file = path.join(root, entry);
              const stat = fs.statSync(file);
              if (stat.isDirectory()) {
                walk(file);
                continue;
              }
              if (!/\.(ts|js)$/i.test(file)) {
                continue;
              }
              const content = fs.readFileSync(file, 'utf8');
              if (content.includes(`class ${args.className}`) || inferClassName(file) === args.className) {
                result.push({
                  scriptPath: toAssetPath(file),
                  fsPath: file,
                  className: inferClassName(file),
                });
              }
            }
          };
          walk(assetsRoot);
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleWorkflow(args: any): Promise<ToolResponse> {
    try {
      switch (args.action) {
        case 'create_and_attach': {
          const className = args.className || inferClassName(args.scriptPath);
          const createResult = await this.handleFile({
            action: 'create',
            scriptPath: args.scriptPath,
            className,
            content: args.content,
            componentName: args.componentName,
          });
          if (!createResult.success) {
            return createResult;
          }
          const attachResult = await callSceneScript('attachScript', args.nodeUuid, className);
          return {
            success: !!attachResult.success,
            data: {
              script: createResult.data,
              attach: attachResult.data,
            },
            error: attachResult.error,
            message: attachResult.success ? 'Script created and attached' : undefined,
          };
        }

        case 'attach_existing': {
          const className = args.className || inferClassName(args.scriptPath || '');
          return callSceneScript('attachScript', args.nodeUuid, className);
        }

        case 'sync_and_attach': {
          if (args.scriptPath) {
            await refreshAsset(args.scriptPath);
          }
          const className = args.className || inferClassName(args.scriptPath || '');
          return callSceneScript('attachScript', args.nodeUuid, className);
        }

        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
