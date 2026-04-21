import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

function toAssetPath(fsPath: string): string {
  const assetsRoot = path.join(getProjectPath(), 'assets');
  if (fsPath.startsWith(assetsRoot)) {
    return `db://assets/${path.relative(assetsRoot, fsPath).replace(/\\/g, '/')}`;
  }
  return fsPath;
}

function scanFiles(root: string, matcher: (file: string) => boolean, result: string[] = []): string[] {
  if (!fs.existsSync(root)) {
    return result;
  }

  for (const entry of fs.readdirSync(root)) {
    const file = path.join(root, entry);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      scanFiles(file, matcher, result);
    } else if (matcher(file)) {
      result.push(file);
    }
  }
  return result;
}

function getEditor(): any {
  return (global as any).Editor;
}

export class ProjectTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'manage',
        description: 'Project info, settings and editor operations',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_project_info', 'get_project_settings', 'refresh_assets', 'run_project'] },
            category: { type: 'string' },
            folder: { type: 'string', default: 'db://assets' },
          },
          required: ['action'],
        },
      },
      {
        name: 'build_system',
        description: 'Build and preview related entry points',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['open_build_panel', 'get_build_settings', 'get_build_profiles', 'check_build_support', 'open_preview_panel', 'start_preview_server', 'stop_preview_server'],
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'asset_query',
        description: 'Query assets by path, type or name',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_assets', 'get_asset_info', 'query_asset_path', 'query_asset_url', 'find_asset_by_name', 'get_asset_details'] },
            type: { type: 'string' },
            folder: { type: 'string', default: 'db://assets' },
            assetPath: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'asset_operations',
        description: 'Create/copy/move/delete/save/reimport assets',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create_asset', 'copy_asset', 'move_asset', 'delete_asset', 'save_asset', 'reimport_asset', 'import_asset'] },
            url: { type: 'string' },
            source: { type: 'string' },
            target: { type: 'string' },
            content: { type: 'string' },
            sourcePath: { type: 'string' },
            targetFolder: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'asset_analyze',
        description: 'Dependency-like file analysis helpers',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['query_asset_uuid'] },
            assetPath: { type: 'string' },
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    switch (toolName) {
      case 'manage':
        return this.handleManage(args);
      case 'build_system':
        return this.handleBuildSystem(args);
      case 'asset_query':
        return this.handleAssetQuery(args);
      case 'asset_operations':
        return this.handleAssetOperations(args);
      case 'asset_analyze':
        return this.handleAssetAnalyze(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async handleManage(args: any): Promise<ToolResponse> {
    const Editor = getEditor();
    try {
      switch (args.action) {
        case 'get_project_info':
          return {
            success: true,
            data: {
              path: getProjectPath(),
              name: path.basename(getProjectPath()),
              cocosVersion: Editor?.versions?.CocosCreator || Editor?.versions?.cocos || '2.x',
              platform: process.platform,
              nodeVersion: process.version,
              hostname: os.hostname(),
            },
          };
        case 'get_project_settings': {
          const projectSettingsPath = path.join(getProjectPath(), 'settings', 'project.json');
          const localSettingsPath = path.join(getProjectPath(), 'local', 'local.json');
          return {
            success: true,
            data: {
              category: args.category || 'general',
              project: fs.existsSync(projectSettingsPath) ? JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8')) : null,
              local: fs.existsSync(localSettingsPath) ? JSON.parse(fs.readFileSync(localSettingsPath, 'utf8')) : null,
            },
          };
        }
        case 'refresh_assets':
          await this.refreshAsset(args.folder || 'db://assets');
          return { success: true, message: 'Assets refreshed' };
        case 'run_project':
          if (Editor.Panel && typeof Editor.Panel.open === 'function') {
            Editor.Panel.open('game-window');
            return { success: true, message: 'Opened game/preview panel' };
          }
          return { success: false, error: 'Preview panel API unavailable' };
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleBuildSystem(args: any): Promise<ToolResponse> {
    const Editor = getEditor();
    try {
      switch (args.action) {
        case 'open_build_panel':
          if (Editor.Panel?.open) {
            Editor.Panel.open('builder');
            return { success: true, message: 'Build panel opened' };
          }
          return { success: false, error: 'Build panel API unavailable' };
        case 'open_preview_panel':
          if (Editor.Panel?.open) {
            Editor.Panel.open('game-window');
            return { success: true, message: 'Preview panel opened' };
          }
          return { success: false, error: 'Preview panel API unavailable' };
        case 'get_build_settings':
          return {
            success: true,
            data: {
              note: 'Creator 2.x build configuration is not fully exposed to extensions. Use project settings and Builder panel for final build parameters.',
            },
          };
        case 'get_build_profiles':
          return this.getBuildProfiles();
        case 'check_build_support':
          return {
            success: true,
            data: {
              hasBuilderPanel: !!Editor?.Panel?.open,
              hasGamePanel: !!Editor?.Panel?.open,
              hasBuilderMessageRequest: !!Editor?.Message?.request,
              buildProfilesReadable: fs.existsSync(path.join(getProjectPath(), 'settings', 'builder.json')),
              canOpenBuilderPanel: !!Editor?.Panel?.open,
              canOpenPreviewPanel: !!Editor?.Panel?.open,
              canHeadlessBuild: false,
              canControlPreviewLifecycle: false,
              note: 'Creator 2.x extension environment can reliably open Builder/Game panels and read builder profiles, but does not expose a stable headless build or preview server lifecycle API to third-party extensions.',
            },
          };
        case 'start_preview_server':
        case 'stop_preview_server':
          return {
            success: true,
            message: `Action '${args.action}' is provided as a compatibility stub. Use Creator preview controls directly in 2.x.`,
          };
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleAssetQuery(args: any): Promise<ToolResponse> {
    try {
      switch (args.action) {
        case 'get_assets':
          return this.getAssets(args.type || 'all', args.folder || 'db://assets');
        case 'get_asset_info':
          return this.getAssetInfo(args.assetPath);
        case 'query_asset_path':
          return { success: true, data: { assetPath: args.assetPath, fsPath: toFsPath(args.assetPath) } };
        case 'query_asset_url':
          return { success: true, data: { fsPath: toFsPath(args.assetPath), assetPath: toAssetPath(args.assetPath) } };
        case 'find_asset_by_name':
          return this.findAssetByName(args.name || '');
        case 'get_asset_details':
          return this.getAssetInfo(args.assetPath);
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleAssetOperations(args: any): Promise<ToolResponse> {
    try {
      switch (args.action) {
        case 'create_asset': {
          const target = toFsPath(args.url);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, args.content ?? '');
          await this.refreshAsset(args.url);
          return { success: true, data: { path: args.url, fsPath: target }, message: 'Asset created' };
        }
        case 'copy_asset':
          fs.mkdirSync(path.dirname(toFsPath(args.target)), { recursive: true });
          fs.copyFileSync(toFsPath(args.source), toFsPath(args.target));
          await this.refreshAsset(args.target);
          return { success: true, message: 'Asset copied' };
        case 'move_asset':
          fs.mkdirSync(path.dirname(toFsPath(args.target)), { recursive: true });
          fs.renameSync(toFsPath(args.source), toFsPath(args.target));
          await this.refreshAsset(path.dirname(args.source || 'db://assets'));
          await this.refreshAsset(args.target);
          return { success: true, message: 'Asset moved' };
        case 'delete_asset':
          fs.rmSync(toFsPath(args.url), { recursive: true, force: true });
          await this.refreshAsset(path.dirname(args.url || 'db://assets'));
          return { success: true, message: 'Asset deleted' };
        case 'save_asset':
          fs.writeFileSync(toFsPath(args.url), args.content ?? '');
          await this.refreshAsset(args.url);
          return { success: true, message: 'Asset saved' };
        case 'reimport_asset':
          await this.refreshAsset(args.url);
          return { success: true, message: 'Asset refresh requested as 2.x-compatible reimport fallback.' };
        case 'import_asset': {
          const destination = path.join(toFsPath(args.targetFolder), path.basename(args.sourcePath));
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(args.sourcePath, destination);
          await this.refreshAsset(toAssetPath(destination));
          return { success: true, data: { destination: toAssetPath(destination) }, message: 'Asset imported' };
        }
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleAssetAnalyze(args: any): Promise<ToolResponse> {
    try {
      switch (args.action) {
        case 'query_asset_uuid': {
          const metaPath = `${toFsPath(args.assetPath)}.meta`;
          if (!fs.existsSync(metaPath)) {
            return { success: false, error: `Meta file not found: ${metaPath}` };
          }
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          return { success: true, data: { uuid: meta.uuid || null, meta } };
        }
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async getAssets(type: string, folder: string): Promise<ToolResponse> {
    const folderPath = toFsPath(folder);
    const suffixMap: Record<string, string[]> = {
      all: [],
      scene: ['.fire'],
      prefab: ['.prefab'],
      script: ['.js', '.ts'],
      texture: ['.png', '.jpg', '.jpeg', '.webp'],
      material: ['.mtl', '.material'],
      audio: ['.mp3', '.wav', '.ogg'],
      animation: ['.anim'],
    };
    const suffixes = suffixMap[type] ?? [];
    const files = scanFiles(folderPath, (file) => suffixes.length === 0 || suffixes.includes(path.extname(file).toLowerCase()));
    return {
      success: true,
      data: files.map((file) => ({
        name: path.basename(file),
        path: toAssetPath(file),
        fsPath: file,
        type: path.extname(file).slice(1),
        size: fs.statSync(file).size,
      })),
    };
  }

  private async getAssetInfo(assetPath: string): Promise<ToolResponse> {
    const fsPath = toFsPath(assetPath);
    const stat = fs.statSync(fsPath);
    const metaPath = `${fsPath}.meta`;
    return {
      success: true,
      data: {
        assetPath,
        fsPath,
        exists: fs.existsSync(fsPath),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
        meta: fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null,
      },
    };
  }

  private async findAssetByName(name: string): Promise<ToolResponse> {
    const files = scanFiles(path.join(getProjectPath(), 'assets'), (file) => path.basename(file).includes(name));
    return {
      success: true,
      data: files.map((file) => ({
        name: path.basename(file),
        path: toAssetPath(file),
        fsPath: file,
      })),
    };
  }

  private async refreshAsset(targetPath?: string): Promise<void> {
    const Editor = getEditor();
    const target = targetPath || 'db://assets';

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

    throw new Error('Asset refresh API unavailable');
  }

  private async getBuildProfiles(): Promise<ToolResponse> {
    const builderSettingsPath = path.join(getProjectPath(), 'settings', 'builder.json');
    const settingsPath = path.join(getProjectPath(), 'settings', 'project.json');

    return {
      success: true,
      data: {
        builderSettingsPath,
        exists: fs.existsSync(builderSettingsPath),
        builder: fs.existsSync(builderSettingsPath) ? JSON.parse(fs.readFileSync(builderSettingsPath, 'utf8')) : null,
        project: fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : null,
      },
    };
  }
}
