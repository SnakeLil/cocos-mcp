import * as os from 'os';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

export class ServerTools implements ToolExecutor {
  constructor(private readonly statusProvider: () => any) {}

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'info',
        description: 'MCP server and network information',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_status', 'get_network_interfaces', 'query_ip_list'] },
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName !== 'info') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    switch (args.action) {
      case 'get_status':
        return { success: true, data: this.statusProvider() };
      case 'query_ip_list':
        return {
          success: true,
          data: Object.values(os.networkInterfaces())
            .flat()
            .filter(Boolean)
            .filter((item: any) => !item.internal)
            .map((item: any) => item.address),
        };
      case 'get_network_interfaces':
        return { success: true, data: os.networkInterfaces() };
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }
}
