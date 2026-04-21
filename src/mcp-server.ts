import * as http from 'http';
import * as url from 'url';
import { BroadcastTools } from './tools/broadcast-tools';
import { ComponentTools } from './tools/component-tools';
import { DebugTools } from './tools/debug-tools';
import { createId } from './id';
import { NodeTools } from './tools/node-tools';
import { PreferencesTools } from './tools/preferences-tools';
import { PrefabTools } from './tools/prefab-tools';
import { ProjectTools } from './tools/project-tools';
import { SceneTools } from './tools/scene-tools';
import { ScriptTools } from './tools/script-tools';
import { ServerTools } from './tools/server-tools';
import { ToolManager } from './tools/tool-manager';
import { ValidationTools } from './tools/validation-tools';
import { WorkflowTools } from './tools/workflow-tools';
import { MCPClient, MCPServerSettings, ServerStatus, ToolDefinition } from './types';

type SessionRecord = {
  createdAt: Date;
  lastActivity: Date;
  initialized: boolean;
};

export class MCPServer {
  private readonly clients = new Map<string, MCPClient>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly tools: Record<string, any> = {};
  private toolsList: ToolDefinition[] = [];
  private httpServer: http.Server | null = null;

  constructor(
    private settings: MCPServerSettings,
    private readonly toolManager: ToolManager,
  ) {
    this.initializeTools();
    this.setupTools();
  }

  private initializeTools(): void {
    this.tools.scene = new SceneTools();
    this.tools.node = new NodeTools();
    this.tools.component = new ComponentTools();
    this.tools.prefab = new PrefabTools();
    this.tools.project = new ProjectTools();
    this.tools.script = new ScriptTools();
    this.tools.debug = new DebugTools();
    this.tools.preferences = new PreferencesTools();
    this.tools.broadcast = new BroadcastTools();
    this.tools.validation = new ValidationTools();
    this.tools.server = new ServerTools(() => this.getStatus());
    this.tools.workflow = new WorkflowTools((toolName, args) => this.executeToolCall(toolName, args));
  }

  private setupTools(): void {
    const enabled = new Set(this.toolManager.getEnabledTools().map((tool) => `${tool.category}_${tool.name}`));
    this.toolsList = [];

    Object.entries(this.tools).forEach(([category, toolSet]) => {
      toolSet.getTools().forEach((tool: ToolDefinition) => {
        const fullName = `${category}_${tool.name}`;
        if (enabled.size === 0 || enabled.has(fullName)) {
          this.toolsList.push({
            name: fullName,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }
      });
    });
  }

  updateSettings(settings: MCPServerSettings): void {
    this.settings = settings;
  }

  updateEnabledTools(): void {
    this.setupTools();
  }

  getSettings(): MCPServerSettings {
    return this.settings;
  }

  getAvailableTools(): ToolDefinition[] {
    return this.toolsList;
  }

  getClients(): MCPClient[] {
    return Array.from(this.clients.values());
  }

  getStatus(): ServerStatus {
    return {
      running: !!this.httpServer,
      port: this.settings.port,
      clients: this.clients.size,
    };
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      return;
    }

    this.setupTools();
    this.httpServer = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject);
      this.httpServer!.listen(this.settings.port, '127.0.0.1', () => resolve());
    });

    console.log(`[cocos-mcp] MCP server listening on http://127.0.0.1:${this.settings.port}/mcp`);
  }

  stop(): void {
    if (!this.httpServer) {
      return;
    }

    this.httpServer.close();
    this.httpServer = null;
    this.clients.clear();
    this.sessions.clear();
  }

  async executeToolCall(toolName: string, args: any): Promise<any> {
    const [category, ...rest] = toolName.split('_');
    const method = rest.join('_');
    const toolSet = this.tools[category];
    if (!toolSet) {
      throw new Error(`Tool category not found: ${category}`);
    }
    return toolSet.execute(method, args || {});
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsed = url.parse(req.url || '', true);
    const sessionId = this.getOrCreateSessionId(req);

    this.applyCommonHeaders(res, sessionId);

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (parsed.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', ...this.getStatus(), tools: this.toolsList.length }));
      return;
    }

    if (parsed.pathname === '/api/tools' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ tools: this.toolsList }));
      return;
    }

    if (parsed.pathname === '/mcp' && req.method === 'GET') {
      const accept = String(req.headers.accept || '');
      if (accept.indexOf('text/event-stream') === -1) {
        res.writeHead(406);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32000,
            message: 'Not Acceptable: Client must accept text/event-stream',
          },
        }));
        return;
      }

      res.writeHead(405, {
        Allow: 'POST, DELETE, OPTIONS',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Method Not Allowed');
      return;
    }

    if (parsed.pathname === '/mcp' && req.method === 'DELETE') {
      this.sessions.delete(sessionId);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (parsed.pathname !== '/mcp' || req.method !== 'POST') {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const body = await this.readBody(req);
    let message: any;
    try {
      message = body ? JSON.parse(body) : {};
    } catch (error: any) {
      res.writeHead(400);
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: error.message,
        },
      }));
      return;
    }

    const response = await this.handleMessage(message, req, sessionId);
    const statusCode = this.getHttpStatusCode(message);
    res.writeHead(statusCode);
    res.end(statusCode === 202 ? '' : JSON.stringify(response));
  }

  private getHttpStatusCode(message: any): number {
    if (message && typeof message.method === 'string' && message.method.indexOf('notifications/') === 0) {
      return 202;
    }
    return 200;
  }

  private getOrCreateSessionId(req: http.IncomingMessage): string {
    const header = req.headers['mcp-session-id'];
    const requested = Array.isArray(header) ? header[0] : header;
    const sessionId = requested || createId();
    const existing = this.sessions.get(sessionId);

    if (existing) {
      existing.lastActivity = new Date();
      return sessionId;
    }

    this.sessions.set(sessionId, {
      createdAt: new Date(),
      lastActivity: new Date(),
      initialized: false,
    });
    return sessionId;
  }

  private applyCommonHeaders(res: http.ServerResponse, sessionId: string): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
    res.setHeader('Mcp-Session-Id', sessionId);
    res.setHeader('MCP-Protocol-Version', '2024-11-05');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  private async handleMessage(message: any, req: http.IncomingMessage, sessionId: string): Promise<any> {
    const clientId = (req.headers['x-client-id'] as string) || createId();
    this.clients.set(clientId, {
      id: clientId,
      lastActivity: new Date(),
      userAgent: req.headers['user-agent'],
    });

    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }

    const { id, method, params } = message || {};

    try {
      switch (method) {
        case 'initialize':
          if (session) {
            session.initialized = true;
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {
                  listChanged: true,
                },
              },
              serverInfo: {
                name: 'cocos-mcp-2x',
                version: '0.1.0',
              },
            },
          };

        case 'notifications/initialized':
          if (session) {
            session.initialized = true;
          }
          return null;

        case 'ping':
          return {
            jsonrpc: '2.0',
            id,
            result: {},
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.toolsList,
            },
          };

        case 'tools/call': {
          const result = await this.executeToolCall(params?.name, params?.arguments || {});
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
              structuredContent: result,
            },
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id: id ?? null,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: -32000,
          message: error.message || String(error),
        },
      };
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
