import { callSceneScript } from '../editor-api';
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

export class NodeTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'query',
        description: 'Query nodes in the active scene',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_info', 'find', 'find_first', 'get_all'] },
            uuid: { type: 'string' },
            pattern: { type: 'string' },
            exactMatch: { type: 'boolean', default: false },
            includeComponents: { type: 'boolean', default: false },
          },
          required: ['action'],
        },
      },
      {
        name: 'lifecycle',
        description: 'Create/delete/move/duplicate scene nodes',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'delete', 'move', 'duplicate'] },
            uuid: { type: 'string' },
            nodeUuid: { type: 'string' },
            newParentUuid: { type: 'string' },
            parentUuid: { type: 'string' },
            name: { type: 'string' },
            siblingIndex: { type: 'number' },
            includeChildren: { type: 'boolean', default: true },
            components: { type: 'array', items: { type: 'string' } },
            initialTransform: { type: 'object' },
          },
          required: ['action'],
        },
      },
      {
        name: 'transform',
        description: 'Update node properties and transform',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['set_property', 'set_transform'] },
            uuid: { type: 'string' },
            property: { type: 'string' },
            value: anyJsonValueSchema,
            position: { type: 'object' },
            rotation: { type: 'object' },
            scale: { type: 'object' },
          },
          required: ['action', 'uuid'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'query') {
      return this.handleQuery(args);
    }
    if (toolName === 'lifecycle') {
      return this.handleLifecycle(args);
    }
    if (toolName === 'transform') {
      return this.handleTransform(args);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async handleQuery(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'get_info':
        return callSceneScript('getNodeInfo', args.uuid, args.includeComponents !== false);
      case 'find':
        return callSceneScript('findNodes', args.pattern || '', !!args.exactMatch, !!args.includeComponents);
      case 'find_first': {
        const result = await callSceneScript('findNodes', args.pattern || '', true, !!args.includeComponents);
        if (!result.success) {
          return result;
        }
        return {
          success: true,
          data: Array.isArray(result.data) ? result.data[0] || null : null,
        };
      }
      case 'get_all':
        return callSceneScript('getAllNodes', !!args.includeComponents);
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async handleLifecycle(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'create':
        return callSceneScript('createNode', args);
      case 'delete':
        return callSceneScript('deleteNode', args.uuid);
      case 'move':
        return callSceneScript('moveNode', args.nodeUuid, args.newParentUuid, args.siblingIndex ?? -1);
      case 'duplicate':
        return callSceneScript('duplicateNode', args.uuid, args.parentUuid, args.includeChildren !== false);
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }

  private async handleTransform(args: any): Promise<ToolResponse> {
    switch (args.action) {
      case 'set_property':
        return callSceneScript('setNodeProperty', args.uuid, args.property, args.value);
      case 'set_transform':
        return callSceneScript('setNodeTransform', args.uuid, args.position, args.rotation, args.scale);
      default:
        return { success: false, error: `Unsupported action: ${args.action}` };
    }
  }
}
