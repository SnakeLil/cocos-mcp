import { readSettings, saveSettings } from '../settings';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

const anyJsonValueSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
    { type: 'object', additionalProperties: true },
    { type: 'array' },
    { type: 'null' },
  ],
};

export class PreferencesTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'manage',
        description: 'Manage extension-level preferences stored in project settings',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'set', 'reset', 'export'] },
            path: { type: 'string' },
            value: anyJsonValueSchema,
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName !== 'manage') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    switch (args.action) {
      case 'get':
        return { success: true, data: readSettings() };
      case 'set': {
        const current = readSettings() as any;
        current[args.path] = args.value;
        saveSettings(current);
        return { success: true, data: current, message: `Preference updated: ${args.path}` };
      }
      case 'reset': {
        const current = readSettings();
        saveSettings(current);
        return { success: true, data: current, message: 'Preferences reset to defaults' };
      }
      case 'export':
        return { success: true, data: readSettings() };
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }
}
