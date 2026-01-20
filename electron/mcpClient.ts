// 从SDK导入所需模块
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { CustomAuthProvider } from './mcpAuthProvider';
import { logger } from './logger';
import { BrowserWindow } from 'electron';

// 日志发送到渲染进程的辅助函数
function sendLogToRenderer(message: string, level: 'log' | 'error' | 'warn' = 'log') {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('mcp:log', { message, level, timestamp: new Date().toISOString() });
    }
  });
  
  // 同时输出到主进程console
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.log(message);
  }
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  type: 'http' | 'sse';
  enabled: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  sessionId?: string; // SDK会话ID
  
  // OAuth 2.1配置
  oauth?: {
    authUrl: string;      // 授权端点
    tokenUrl: string;     // Token端点
    clientId: string;     // 客户端ID
    clientSecret?: string; // 客户端密钥
    scopes: string[];     // 权限范围
    redirectUri: string;  // 重定向URI
  };
  
  // OAuth tokens（授权后自动填充）
  tokens?: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number; // 过期时间戳
    token_type: string;
  };
}

// 统一接口
export interface IMCPClient {
  connect(): Promise<void>;
  disconnect(): void;
  getTools(): Promise<any[]>;
  callTool(name: string, args: any): Promise<any>;
}

/**
 * SDK客户端适配器
 * 使用官方SDK替代手动HTTP实现
 */
class SDKMCPClient implements IMCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private authProvider: CustomAuthProvider | null = null;
  
  constructor(private config: MCPServerConfig) {}
  
  async connect(): Promise<void> {
    const startTime = Date.now();
    console.log('🔌 [MCP SDK] Connecting to:', this.config.name);
    console.log('   URL:', this.config.url);
    console.log('   Has OAuth config:', !!this.config.oauth);
    console.log('   Has existing tokens:', !!this.config.tokens);
    
    try {
      // 1. 创建Client实例
      this.client = new Client(
        {
          name: 'lingxi',
          version: '0.1.0'
        },
        { capabilities: {} }
      );
      
      // 设置错误处理
      this.client.onerror = (error: Error) => {
        console.error('❌ [MCP SDK] Client error:', error);
        sendLogToRenderer(`❌ Client error: ${error.message}`, 'error');
      };
      
      // 2. 准备认证（如果需要OAuth）
      if (this.config.oauth) {
        console.log('🔐 [MCP SDK] OAuth configuration found');
        
        // 创建CustomAuthProvider
        this.authProvider = new CustomAuthProvider(
          this.config.oauth,
          this.config.tokens
        );
        
        console.log('✅ [MCP SDK] CustomAuthProvider created');
      }
      
      // 3. 创建Transport（不带authProvider，我们手动添加token）
      console.log('🚢 [MCP SDK] Creating transport...');
      
      // 准备transport选项
      const transportOptions: any = {
        sessionId: this.config.sessionId
      };
      
      // 如果有token，手动添加到headers
      if (this.config.tokens?.access_token) {
        console.log('✅ [MCP SDK] Using existing access token (' + this.config.tokens.token_type + ')');
        
        // 创建一个函数来自定义fetch请求，确保Authorization header被包含
        const originalFetch = global.fetch;
        const authToken = `${this.config.tokens.token_type} ${this.config.tokens.access_token}`;
        
        // 包装fetch以添加Authorization header
        transportOptions.fetch = async (url: any, init: any) => {
          console.log('🔍 [DEBUG] Intercepting fetch request:');
          console.log('   URL:', url);
          console.log('   Original headers:', init?.headers);
          
          // 确保headers存在
          const headers = new Headers(init?.headers || {});
          headers.set('Authorization', authToken);
          
          console.log('   ✅ Added Authorization:', authToken.substring(0, 30) + '...');
          console.log('   Final headers:', Array.from(headers.entries()));
          
          return originalFetch(url, {
            ...init,
            headers
          });
        };
        
        console.log('✅ Custom fetch with Authorization configured');
        console.log('   Token:', authToken.substring(0, 20) + '...');
      }
      
      this.transport = new StreamableHTTPClientTransport(
        new URL(this.config.url),
        transportOptions
      );
      
      console.log('✅ [MCP SDK] Transport created');
      
      // 4. 连接客户端
      console.log('🔗 [MCP SDK] Connecting client...');
      await this.client.connect(this.transport);
      
      // 保存会话ID
      if (this.transport.sessionId) {
        this.config.sessionId = this.transport.sessionId;
        console.log('📋 [MCP SDK] Session ID:', this.transport.sessionId);
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ [MCP SDK] Connected successfully (${duration}ms)`);
      logger.info(`✅ MCP SDK connected: ${this.config.name}`);
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ [MCP SDK] Connection failed (${duration}ms):`, error);
      
      // 检查是否是OAuth相关错误
      if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
        console.log('🔐 [MCP SDK] Unauthorized - OAuth required');
        sendLogToRenderer('🔐 需要OAuth授权', 'warn');
        
        // 抛出特殊错误标记需要OAuth
        throw new Error('OAUTH_REQUIRED');
      }
      
      logger.error(`❌ MCP SDK connection failed: ${this.config.name}`, error);
      throw error;
    }
  }
  
  async getTools(): Promise<any[]> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }
    
    console.log('🔧 [MCP SDK] Fetching tools from:', this.config.name);
    
    try {
      const result = await this.client.request(
        {
          method: 'tools/list',
          params: {}
        },
        ListToolsResultSchema
      );
      
      const tools = result.tools || [];
      console.log(`✅ [MCP SDK] Got ${tools.length} tools from ${this.config.name}`);
      
      if (tools.length > 0) {
        console.log('   Tools:', tools.map(t => t.name).join(', '));
      }
      
      logger.info(`📦 Got ${tools.length} tools from ${this.config.name}`);
      return tools;
      
    } catch (error: any) {
      console.error(`❌ [MCP SDK] Failed to get tools:`, error);
      logger.error(`❌ Failed to get tools from ${this.config.name}:`, error);
      throw error;
    }
  }
  
  async callTool(name: string, args: any): Promise<any> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }
    
    console.log(`🔧 [MCP SDK] Calling tool: ${this.config.name}/${name}`);
    logger.info(`🔧 Calling MCP tool: ${this.config.name}/${name}`);
    
    try {
      const result = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name,
            arguments: args
          }
        },
        CallToolResultSchema
      );
      
      console.log(`✅ [MCP SDK] Tool call completed: ${name}`);
      logger.info(`✅ MCP tool completed: ${this.config.name}/${name}`);
      return result;
      
    } catch (error: any) {
      console.error(`❌ [MCP SDK] Tool call failed:`, error);
      logger.error(`❌ MCP tool call failed: ${this.config.name}/${name}`, error);
      throw error;
    }
  }
  
  disconnect(): void {
    if (this.transport) {
      try {
        this.transport.close();
        console.log('🔌 [MCP SDK] Disconnected from:', this.config.name);
        logger.info(`🔌 Disconnected: ${this.config.name}`);
      } catch (error) {
        console.error('❌ [MCP SDK] Error during disconnect:', error);
      }
      
      this.client = null;
      this.transport = null;
      this.authProvider = null;
    }
  }
}

// 工厂函数
export function createMCPClient(config: MCPServerConfig): IMCPClient {
  // 目前只支持HTTP类型使用SDK
  if (config.type === 'http') {
    return new SDKMCPClient(config);
  } else if (config.type === 'sse') {
    // SSE暂时不支持，需要后续迁移
    throw new Error('SSE type not yet migrated to SDK. Please use HTTP type.');
  }
  
  throw new Error(`Unknown MCP type: ${config.type}`);
}
