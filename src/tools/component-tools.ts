import { callSceneScript } from '../editor-api';
import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

const anyJsonValueSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
    { type: 'object', additionalProperties: true },
    { type: 'array', items: {} },
    { type: 'null' },
  ],
};

export class ComponentTools implements ToolExecutor {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'manage',
        description: 'Add or remove components on nodes',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['add', 'remove'] },
            nodeUuid: { type: 'string' },
            componentType: { type: 'string' },
          },
          required: ['action', 'nodeUuid', 'componentType'],
        },
      },
      {
        name: 'query',
        description: 'Query node components and available built-in components',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_components', 'get_component_info', 'get_available_components'] },
            nodeUuid: { type: 'string' },
            componentType: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'property',
        description: 'Set component properties',
        inputSchema: {
          type: 'object',
          properties: {
            nodeUuid: { type: 'string' },
            componentType: { type: 'string' },
            property: { type: 'string' },
            value: anyJsonValueSchema,
          },
          required: ['nodeUuid', 'componentType', 'property'],
        },
      },
      {
        name: 'resource',
        description: 'Assign strongly-typed resource references such as SpriteFrame by asset uuid',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['set_sprite_frame', 'bind_component_asset'] },
            nodeUuid: { type: 'string' },
            spriteFrameUuid: { type: 'string' },
            sizeMode: { type: 'string', enum: ['RAW', 'TRIMMED', 'CUSTOM'] },
            componentType: { type: 'string' },
            property: { type: 'string' },
            assetUuid: { type: 'string' },
            assetType: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'script',
        description: 'Attach script component to node by class name',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['attach'] },
            nodeUuid: { type: 'string' },
            scriptClassName: { type: 'string' },
          },
          required: ['action', 'nodeUuid', 'scriptClassName'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'manage') {
      return args.action === 'add'
        ? callSceneScript('addComponent', args.nodeUuid, args.componentType)
        : callSceneScript('removeComponent', args.nodeUuid, args.componentType);
    }
    if (toolName === 'query') {
      switch (args.action) {
        case 'get_components':
          return callSceneScript('getComponents', args.nodeUuid);
        case 'get_component_info':
          return callSceneScript('getComponentInfo', args.nodeUuid, args.componentType);
        case 'get_available_components':
          return callSceneScript('getAvailableComponents');
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    }
    if (toolName === 'property') {
      return callSceneScript('setComponentProperty', args);
    }
    if (toolName === 'resource') {
      switch (args.action) {
        case 'set_sprite_frame':
          return callSceneScript('setSpriteFrameByUuid', args.nodeUuid, args.spriteFrameUuid, args.sizeMode);
        case 'bind_component_asset':
          return callSceneScript('bindComponentAsset', args);
        default:
          return { success: false, error: `Unsupported action: ${args.action}` };
      }
    }
    if (toolName === 'script') {
      return callSceneScript('attachScript', args.nodeUuid, args.scriptClassName);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }
}
