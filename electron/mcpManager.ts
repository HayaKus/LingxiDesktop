import { createMCPClient, IMCPClient, MCPServerConfig } from './mcpClient';
import { logger } from './logger';
import { oauthManager } from './oauthManager';

class MCPManager {
  private clients: Map<string, IMCPClient> = new Map();
  private configs: Map<string, MCPServerConfig> = new Map();
  
  // 加载配置的MCP服务器
  async loadServers(configs: MCPServerConfig[]): Promise<void> {
    logger.info(`📡 Loading ${configs.length} MCP servers...`);
    
    for (const config of configs) {
      if (config.enabled) {
        try {
          await this.addServer(config);
        } catch (error) {
          logger.error(`Failed to load MCP server: ${config.name}`, error);
          // 继续加载其他服务器
        }
      }
    }
    
    logger.info(`✅ Loaded ${this.clients.size} MCP servers`);
  }
  
  // 添加MCP服务器（支持OAuth授权）
  async addServer(config: MCPServerConfig): Promise<void> {
    try {
      // 保存配置
      this.configs.set(config.id, config);
      logger.info(`✅ MCP server config saved: ${config.name} (${config.type})`);
      
      // 如果enabled=true，尝试连接
      if (config.enabled) {
        try {
          // 如果配置了OAuth但没有token，先进行授权
          if (config.oauth && !config.tokens) {
            console.log(`🔐 [MCP] Server requires OAuth, starting authorization...`);
            await this.authorizeServer(config);
          }
          
          // 如果有OAuth token，检查是否过期并刷新
          if (config.oauth && config.tokens) {
            await this.ensureValidToken(config);
          }
          
          // 如果有OAuth token，添加到headers
          if (config.tokens) {
            config.headers = config.headers || {};
            config.headers['Authorization'] = `${config.tokens.token_type} ${config.tokens.access_token}`;
            console.log(`🔑 [MCP] Added OAuth token to headers`);
          }
          
          const client = createMCPClient(config);
          await client.connect();
          
          // ⚠️ 连接后，client可能已更新config.tokens（在OAuth流程中）
          // 需要获取更新后的config并保存
          this.configs.set(config.id, config);
          
          this.clients.set(config.id, client);
          logger.info(`✅ MCP server connected: ${config.name}`);
          
          // 保存tokens到磁盘
          await this.saveConfigsToDisk();
        } catch (error: any) {
          logger.warn(`⚠️ Could not connect to MCP server: ${config.name}`, error);
          // 不抛出错误，允许保存配置
        }
      }
    } catch (error: any) {
      logger.error(`❌ Failed to add MCP server: ${config.name}`, error);
      throw error;
    }
  }
  
  // 保存配置到磁盘
  private async saveConfigsToDisk(): Promise<void> {
    try {
      const Store = require('electron-store');
      const store = new Store();
      const configs = Array.from(this.configs.values());
      store.set('mcpServers', configs);
      console.log(`💾 [MCP] Saved ${configs.length} server configs to disk`);
      logger.info(`💾 Saved ${configs.length} MCP server configs`);
    } catch (error) {
      console.error('❌ [MCP] Failed to save configs to disk:', error);
      logger.error('Failed to save MCP configs:', error);
    }
  }
  
  // 为服务器进行OAuth授权
  async authorizeServer(config: MCPServerConfig): Promise<void> {
    if (!config.oauth) {
      throw new Error('No OAuth configuration found');
    }
    
    console.log(`🔐 [MCP] Starting OAuth authorization for ${config.name}...`);
    
    try {
      const tokens = await oauthManager.authorize(config.oauth);
      
      // 保存token到配置
      config.tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        token_type: tokens.token_type
      };
      
      // 更新配置
      this.configs.set(config.id, config);
      
      console.log(`✅ [MCP] OAuth authorization successful for ${config.name}`);
      logger.info(`✅ OAuth authorization successful for ${config.name}`);
    } catch (error: any) {
      console.error(`❌ [MCP] OAuth authorization failed:`, error);
      throw new Error(`OAuth授权失败: ${error.message}`);
    }
  }
  
  // 确保token有效（如果过期则刷新）
  async ensureValidToken(config: MCPServerConfig): Promise<void> {
    if (!config.tokens || !config.oauth) {
      return;
    }
    
    // 检查token是否过期（提前5分钟刷新）
    const now = Date.now();
    const expiresAt = config.tokens.expires_at || 0;
    const bufferTime = 5 * 60 * 1000; // 5分钟缓冲
    
    if (expiresAt > 0 && now >= (expiresAt - bufferTime)) {
      console.log(`🔄 [MCP] Token expired or expiring soon, refreshing...`);
      
      if (!config.tokens.refresh_token) {
        console.log(`⚠️ [MCP] No refresh token, need to re-authorize`);
        await this.authorizeServer(config);
        return;
      }
      
      try {
        const newTokens = await oauthManager.refreshToken(
          config.tokens.refresh_token,
          config.oauth
        );
        
        // 更新token
        config.tokens = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || config.tokens.refresh_token,
          expires_in: newTokens.expires_in,
          expires_at: newTokens.expires_in ? Date.now() + newTokens.expires_in * 1000 : undefined,
          token_type: newTokens.token_type
        };
        
        // 更新配置
        this.configs.set(config.id, config);
        
        console.log(`✅ [MCP] Token refreshed successfully`);
        logger.info(`✅ Token refreshed for ${config.name}`);
      } catch (error: any) {
        console.error(`❌ [MCP] Token refresh failed:`, error);
        console.log(`🔐 [MCP] Attempting re-authorization...`);
        // 刷新失败，尝试重新授权
        await this.authorizeServer(config);
      }
    }
  }
  
  // 移除服务器
  removeServer(serverId: string): void {
    const client = this.clients.get(serverId);
    const config = this.configs.get(serverId);
    
    if (client) {
      client.disconnect();
      this.clients.delete(serverId);
      this.configs.delete(serverId);
      logger.info(`🗑️ MCP server removed: ${config?.name || serverId}`);
    }
  }
  
  // 移除所有服务器
  removeAllServers(): void {
    for (const [serverId] of this.clients.entries()) {
      this.removeServer(serverId);
    }
    logger.info('🗑️ All MCP servers removed');
  }
  
  // 获取单个服务器的工具列表
  async getToolsForServer(serverId: string): Promise<Array<{
    name: string;
    description: string;
    inputSchema?: any;
  }>> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`MCP server not found: ${serverId}`);
    }
    
    try {
      const tools = await client.getTools();
      logger.info(`📦 Got ${tools.length} tools from server ${serverId}`);
      return tools;
    } catch (error: any) {
      logger.error(`❌ Failed to get tools from ${serverId}:`, error);
      throw error;
    }
  }
  
  // 获取所有MCP工具（合并为OpenAI格式）
  async getAllTools(): Promise<any[]> {
    console.log('🔍 [mcpManager] getAllTools() 被调用');
    console.log(`📡 [mcpManager] 当前已连接的服务器数量: ${this.clients.size}`);
    console.log(`📋 [mcpManager] 当前配置的服务器数量: ${this.configs.size}`);
    
    const allTools: any[] = [];
    
    // 列出所有服务器
    for (const [serverId, config] of this.configs.entries()) {
      const isConnected = this.clients.has(serverId);
      console.log(`  - ${config.name} (${serverId}): ${isConnected ? '✅ 已连接' : '❌ 未连接'}, enabled: ${config.enabled}`);
    }
    
    for (const [serverId, client] of this.clients.entries()) {
      try {
        const config = this.configs.get(serverId)!;
        console.log(`🔧 [mcpManager] 正在从 ${config.name} 获取工具...`);
        
        const tools = await client.getTools();
        console.log(`📦 [mcpManager] ${config.name} 返回了 ${tools.length} 个工具`);
        
        if (tools.length > 0) {
          console.log(`   工具列表:`, tools.map(t => t.name).join(', '));
        }
        
        // 转换为OpenAI Function格式，添加服务器前缀
        const formattedTools = tools.map(tool => ({
          type: 'function',
          function: {
            name: `${config.name}__${tool.name}`,  // 前缀避免冲突
            description: `[MCP: ${config.name}] ${tool.description || tool.name}`,
            parameters: tool.inputSchema || { 
              type: 'object', 
              properties: {},
              required: []
            }
          }
        }));
        
        allTools.push(...formattedTools);
        console.log(`✅ [mcpManager] 已添加 ${formattedTools.length} 个工具从 ${config.name}`);
        logger.info(`📦 Added ${formattedTools.length} tools from ${config.name}`);
      } catch (error: any) {
        console.error(`❌ [mcpManager] 从 ${serverId} 获取工具失败:`, error);
        logger.error(`❌ Failed to get tools from ${serverId}:`, error);
      }
    }
    
    console.log(`📊 [mcpManager] 总计获取到 ${allTools.length} 个MCP工具`);
    logger.info(`📦 Total MCP tools available: ${allTools.length}`);
    return allTools;
  }
  
  // 调用MCP工具
  async callTool(toolName: string, args: any): Promise<any> {
    // 从工具名解析服务器名: "服务器名__工具名"
    const parts = toolName.split('__');
    if (parts.length !== 2) {
      throw new Error(`Invalid MCP tool name format: ${toolName}`);
    }
    
    const [serverName, actualToolName] = parts;
    
    // 找到对应的客户端
    for (const [serverId, client] of this.clients.entries()) {
      const config = this.configs.get(serverId);
      if (config?.name === serverName) {
        logger.info(`🔧 Calling MCP tool: ${serverName}/${actualToolName}`);
        const result = await client.callTool(actualToolName, args);
        logger.info(`✅ MCP tool call completed: ${serverName}/${actualToolName}`);
        return result;
      }
    }
    
    throw new Error(`MCP server not found: ${serverName}`);
  }
  
  // 测试连接
  async testConnection(config: MCPServerConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createMCPClient(config);
      await client.connect();
      client.disconnect();
      logger.info(`✅ Connection test passed: ${config.name}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`❌ Connection test failed: ${config.name}`, error);
      return { success: false, error: error.message };
    }
  }
  
  // 获取服务器列表
  getServers(): MCPServerConfig[] {
    return Array.from(this.configs.values());
  }
  
  // 获取服务器状态
  getServerStatus(serverId: string): 'connected' | 'disconnected' {
    return this.clients.has(serverId) ? 'connected' : 'disconnected';
  }
}

export const mcpManager = new MCPManager();
