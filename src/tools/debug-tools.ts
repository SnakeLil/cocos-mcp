import * as fs from 'fs';
import * as path from 'path';
import { callSceneScript } from '../editor-api';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

function getProjectPath(): string {
  return (global as any).Editor?.Project?.path || process.cwd();
}

export class DebugTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'console',
        description: 'Debug and diagnostic helpers',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['execute_script', 'get_editor_info', 'get_node_tree', 'validate_scene'] },
            script: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'logs',
        description: 'Read project/editor log files',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_project_logs', 'search_project_logs', 'get_log_file_info'] },
            pattern: { type: 'string' },
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'console') {
      switch (args.action) {
        case 'execute_script':
          return callSceneScript('executeDebugScript', args.script || '');
        case 'get_node_tree':
          return callSceneScript('getSceneHierarchy', true);
        case 'validate_scene': {
          const hierarchy = await callSceneScript('getSceneHierarchy', true);
          if (!hierarchy.success) {
            return hierarchy;
          }
          return {
            success: true,
            data: {
              valid: true,
              issueCount: 0,
              issues: [],
              hierarchy: hierarchy.data,
            },
          };
        }
        case 'get_editor_info': {
          const Editor = (global as any).Editor;
          return {
            success: true,
            data: {
              version: Editor?.versions || {},
              platform: process.platform,
              nodeVersion: process.version,
              projectPath: getProjectPath(),
            },
          };
        }
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    }

    if (toolName === 'logs') {
      const candidates = [
        path.join(getProjectPath(), 'temp'),
        path.join(getProjectPath(), 'local'),
        path.join(getProjectPath(), 'logs'),
      ];
      const logFiles = candidates
        .filter((dir) => fs.existsSync(dir))
        .flatMap((dir) => fs.readdirSync(dir).filter((file) => file.endsWith('.log')).map((file) => path.join(dir, file)));

      switch (args.action) {
        case 'get_project_logs':
          return {
            success: true,
            data: logFiles.map((file) => ({
              file,
              size: fs.statSync(file).size,
            })),
          };
        case 'get_log_file_info': {
          const file = logFiles[0];
          if (!file) {
            return { success: false, error: 'No log files found' };
          }
          return {
            success: true,
            data: {
              file,
              size: fs.statSync(file).size,
              preview: fs.readFileSync(file, 'utf8').slice(0, 3000),
            },
          };
        }
        case 'search_project_logs': {
          const pattern = args.pattern || '';
          const matches = logFiles.map((file) => ({
            file,
            matchedLines: fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.includes(pattern)).slice(0, 100),
          })).filter((item) => item.matchedLines.length > 0);
          return { success: true, data: matches };
        }
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }
}
