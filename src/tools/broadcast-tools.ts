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

type MessageEntry = {
  type: string;
  payload: any;
  timestamp: string;
};

export class BroadcastTools implements ToolExecutor {
  private readonly entries: MessageEntry[] = [];

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'message',
        description: 'Lightweight internal broadcast log',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['emit', 'history', 'clear'] },
            type: { type: 'string' },
            payload: anyJsonValueSchema,
            limit: { type: 'number', default: 50 },
          },
          required: ['action'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName !== 'message') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    switch (args.action) {
      case 'emit': {
        const entry = {
          type: args.type || 'message',
          payload: args.payload ?? null,
          timestamp: new Date().toISOString(),
        };
        this.entries.push(entry);
        if (this.entries.length > 500) {
          this.entries.splice(0, this.entries.length - 500);
        }
        return { success: true, data: entry, message: 'Message logged' };
      }
      case 'history':
        return { success: true, data: this.entries.slice(-(args.limit || 50)) };
      case 'clear':
        this.entries.splice(0, this.entries.length);
        return { success: true, message: 'Broadcast history cleared' };
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }
}
