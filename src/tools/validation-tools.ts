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

export class ValidationTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'helpers',
        description: 'Small validation helpers for AI clients',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['validate_json_params', 'safe_string_value', 'format_mcp_request'] },
            value: anyJsonValueSchema,
            name: { type: 'string' },
            arguments: { type: 'object', additionalProperties: true },
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName !== 'helpers') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    switch (args.action) {
      case 'validate_json_params':
        return {
          success: true,
          data: {
            valid: typeof args.value === 'object' && args.value !== null,
            receivedType: Array.isArray(args.value) ? 'array' : typeof args.value,
          },
        };
      case 'safe_string_value':
        return {
          success: true,
          data: {
            value: args.value == null ? '' : String(args.value),
          },
        };
      case 'format_mcp_request':
        return {
          success: true,
          data: {
            jsonrpc: '2.0',
            id: 'example',
            method: 'tools/call',
            params: {
              name: args.name,
              arguments: args.arguments || {},
            },
          },
        };
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }
}
