import { ToolDefinition, ToolExecutor, ToolResponse } from '../types';

type ToolRunner = (toolName: string, args: any) => Promise<any>;

export class WorkflowTools implements ToolExecutor {
  constructor(private readonly runTool: ToolRunner) {}

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'plan',
        description: 'Execute a batch of MCP tool actions generated from YAML/Figma analysis',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['apply_plan', 'dry_run_plan'] },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tool: { type: 'string' },
                  arguments: { type: 'object', additionalProperties: true },
                  label: { type: 'string' },
                  stopOnError: { type: 'boolean' },
                },
                required: ['tool'],
              },
            },
          },
          required: ['action', 'steps'],
        },
      },
      {
        name: 'scene_apply',
        description: 'Apply a scene modification workflow with optional script refresh, scene reload and save steps',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['apply_workflow', 'dry_run_workflow'] },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tool: { type: 'string' },
                  arguments: { type: 'object', additionalProperties: true },
                  label: { type: 'string' },
                  stopOnError: { type: 'boolean' },
                },
                required: ['tool'],
              },
            },
            refreshScriptPaths: {
              type: 'array',
              items: { type: 'string' },
            },
            reloadSceneBeforeApply: { type: 'boolean' },
            reloadSceneAfterApply: { type: 'boolean' },
            saveSceneAfterApply: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
      {
        name: 'scene_bind',
        description: 'Bind scene resource references and optionally save the active scene in one stable operation',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['apply_bindings', 'dry_run_bindings'] },
            bindings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['sprite_frame', 'component_asset'] },
                  nodeUuid: { type: 'string' },
                  spriteFrameUuid: { type: 'string' },
                  sizeMode: { type: 'string' },
                  position: { type: 'object', additionalProperties: true },
                  size: { type: 'object', additionalProperties: true },
                  active: { type: 'boolean' },
                  componentType: { type: 'string' },
                  property: { type: 'string' },
                  assetUuid: { type: 'string' },
                  assetType: { type: 'string' },
                },
                required: ['kind'],
              },
            },
            saveAfterApply: { type: 'boolean' },
          },
          required: ['action', 'bindings'],
        },
      },
    ];
  }

  async execute(toolName: string, args: any): Promise<ToolResponse> {
    if (toolName === 'scene_bind') {
      return this.handleSceneBind(args);
    }
    if (toolName === 'scene_apply') {
      return this.handleSceneApply(args);
    }
    if (toolName === 'plan') {
      return this.handlePlan(args);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async handlePlan(args: any): Promise<ToolResponse> {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    if (args.action === 'dry_run_plan') {
      return {
        success: true,
        data: {
          stepCount: steps.length,
          steps: steps.map((step: any, index: number) => ({
            index,
            label: step.label || `step_${index + 1}`,
            tool: step.tool,
            arguments: step.arguments || {},
          })),
        },
      };
    }

    if (args.action !== 'apply_plan') {
      return { success: false, error: `Unsupported action: ${args.action}` };
    }

    const results = await this.runSteps(steps);
    if (!results.success) {
      return results.response!;
    }

    return {
      success: true,
      data: {
        stepCount: steps.length,
        results: results.operations,
      },
      message: 'Workflow plan executed',
    };
  }

  private async handleSceneApply(args: any): Promise<ToolResponse> {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const refreshScriptPaths = Array.isArray(args.refreshScriptPaths) ? args.refreshScriptPaths : [];

    const dryRunPayload = {
      reloadSceneBeforeApply: !!args.reloadSceneBeforeApply,
      reloadSceneAfterApply: !!args.reloadSceneAfterApply,
      saveSceneAfterApply: !!args.saveSceneAfterApply,
      refreshScriptPaths,
      steps: steps.map((step: any, index: number) => ({
        index,
        label: step.label || `step_${index + 1}`,
        tool: step.tool,
        arguments: step.arguments || {},
      })),
    };

    if (args.action === 'dry_run_workflow') {
      return {
        success: true,
        data: dryRunPayload,
      };
    }

    if (args.action !== 'apply_workflow') {
      return { success: false, error: `Unsupported action: ${args.action}` };
    }

    const operations: any[] = [];

    if (args.reloadSceneBeforeApply) {
      const step = await this.runSingleStep('scene_management', { action: 'reload_current' }, 'reload_scene_before', true);
      operations.push(step.operation);
      if (step.shouldStop) {
        return {
          success: false,
          error: `Workflow stopped on failed step: reload_scene_before`,
          data: operations,
        };
      }
    }

    for (const scriptPath of refreshScriptPaths) {
      const step = await this.runSingleStep('script_file', { action: 'refresh', scriptPath }, `refresh_script:${scriptPath}`, true);
      operations.push(step.operation);
      if (step.shouldStop) {
        return {
          success: false,
          error: `Workflow stopped on failed step: refresh_script:${scriptPath}`,
          data: operations,
        };
      }
    }

    const stepResults = await this.runSteps(steps);
    operations.push(...stepResults.operations);
    if (!stepResults.success) {
      return stepResults.response!;
    }

    if (args.reloadSceneAfterApply) {
      const step = await this.runSingleStep('scene_management', { action: 'reload_current' }, 'reload_scene_after', true);
      operations.push(step.operation);
      if (step.shouldStop) {
        return {
          success: false,
          error: `Workflow stopped on failed step: reload_scene_after`,
          data: operations,
        };
      }
    }

    if (args.saveSceneAfterApply) {
      const step = await this.runSingleStep('scene_management', { action: 'save' }, 'save_scene_after', true);
      operations.push(step.operation);
      if (step.shouldStop) {
        return {
          success: false,
          error: `Workflow stopped on failed step: save_scene_after`,
          data: operations,
        };
      }
    }

    return {
      success: true,
      data: {
        ...dryRunPayload,
        operations,
      },
      message: 'Scene workflow executed',
    };
  }

  private async handleSceneBind(args: any): Promise<ToolResponse> {
    const bindings = Array.isArray(args.bindings) ? args.bindings : [];

    if (args.action === 'dry_run_bindings') {
      return {
        success: true,
        data: {
          bindings,
          saveAfterApply: !!args.saveAfterApply,
          bindingCount: bindings.length,
        },
      };
    }

    if (args.action !== 'apply_bindings') {
      return { success: false, error: `Unsupported action: ${args.action}` };
    }

    return this.runTool('scene_management', {
      action: 'bind_resources',
      bindings,
      saveAfterApply: !!args.saveAfterApply,
    });
  }

  private async runSteps(steps: any[]): Promise<{ success: boolean; operations: any[]; response?: ToolResponse }> {
    const operations: any[] = [];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const label = step.label || `step_${index + 1}`;
      const result = await this.runSingleStep(step.tool, step.arguments || {}, label, step.stopOnError !== false);
      operations.push(result.operation);

      if (result.shouldStop) {
        return {
          success: false,
          operations,
          response: {
            success: false,
            error: `Workflow stopped on failed step: ${label}`,
            data: operations,
          },
        };
      }
    }

    return {
      success: true,
      operations,
    };
  }

  private async runSingleStep(tool: string, toolArgs: any, label: string, stopOnError: boolean): Promise<{ shouldStop: boolean; operation: any }> {
    try {
      const result = await this.runTool(tool, toolArgs || {});
      const operation = {
        label,
        tool,
        success: !result || result.success !== false,
        result,
      };
      return {
        shouldStop: !!(result && result.success === false && stopOnError),
        operation,
      };
    } catch (error: any) {
      const operation = {
        label,
        tool,
        success: false,
        error: error.message || String(error),
      };
      return {
        shouldStop: stopOnError,
        operation,
      };
    }
  }
}
