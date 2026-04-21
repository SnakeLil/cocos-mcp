export interface MCPServerSettings {
  port: number;
  autoStart: boolean;
  enableDebugLog: boolean;
  allowedOrigins: string[];
  maxConnections: number;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  clients: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface ToolResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  warning?: string;
  details?: any;
}

export interface MCPClient {
  id: string;
  lastActivity: Date;
  userAgent?: string;
}

export interface ToolExecutor {
  getTools(): ToolDefinition[];
  execute(toolName: string, args: any): Promise<ToolResponse>;
}

export interface ToolConfig {
  category: string;
  name: string;
  enabled: boolean;
  description: string;
}

export interface ToolConfiguration {
  id: string;
  name: string;
  description?: string;
  tools: ToolConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ToolManagerSettings {
  configurations: ToolConfiguration[];
  currentConfigId: string;
  maxConfigSlots: number;
}

export interface ToolManagerState {
  availableTools: ToolConfig[];
  currentConfiguration: ToolConfiguration | null;
  configurations: ToolConfiguration[];
}
