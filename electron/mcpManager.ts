import { createMCPClient, IMCPClient, MCPServerConfig } from './mcpClient';
import { logger } from './logger';
import { oauth21Manager } from './oauthManager';

class MCPManager {
  private clients: Map<string, IMCPClient> = new Map();
  private configs: Map<string, MCPServerConfig> = new Map();
  
  // 加载配置的MCP服务器
  async loadServers(configs: MCPServerConfig[]): Promise<void> {
    logger.info(`📡 Loading ${configs.length} MCP servers...`);

    for (const config of configs) {
      if (config.enabled) {
        try {
          await this.addServer(config, false, true); // skipSave=false, skipOAuth=true (启动时不自动OAuth)
        } catch (error) {
          logger.error(`Failed to load MCP server: ${config.name}`, error);
          // 继续加载其他服务器
        }
      }
    }

    // 加载完成后，统一保存一次
    await this.saveConfigsToDisk();

    logger.info(`✅ Loaded ${this.clients.size} MCP servers`);
  }
  
  // 添加MCP服务器（支持OAuth授权）
  async addServer(config: MCPServerConfig, skipSave: boolean = false, skipOAuth: boolean = false): Promise<void> {
    try {
      // 保存配置到内存
      this.configs.set(config.id, config);
      logger.info(`✅ MCP server config saved: ${config.name} (${config.type})`);
      
      // 如果enabled=true，尝试连接
      if (config.enabled) {
        try {
          // 如果配置了OAuth但没有token
          if (config.oauth && !config.tokens) {
            if (skipOAuth) {
              // 启动时跳过OAuth，只标记状态
              console.log(`⏸️ [MCP] Server requires OAuth, but skipping auto-authorization on startup`);
              return; // 不连接，等待用户手动触发
            } else {
              // 手动添加时自动触发OAuth
              console.log(`🔐 [MCP] Server requires OAuth, starting authorization...`);
              await this.authorizeServer(config);
            }
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
          
          // 只在需要时保存到磁盘（避免loadServers时重复保存）
          if (skipSave) {
            await this.saveConfigsToDisk();
          }
        } catch (error: any) {
          // 检查是否需要OAuth授权
          if (error.message === 'OAUTH_REQUIRED' && !skipOAuth) {
            console.log(`🔐 [MCP] Server requires OAuth, starting authorization flow...`);
            try {
              await this.authorizeServer(config);
              
              // OAuth完成后，重新连接
              console.log(`🔄 [MCP] Retrying connection with OAuth token...`);
              const client = createMCPClient(config);
              await client.connect();
              
              this.configs.set(config.id, config);
              this.clients.set(config.id, client);
              logger.info(`✅ MCP server connected with OAuth: ${config.name}`);
              
              if (skipSave) {
                await this.saveConfigsToDisk();
              }
              return; // 成功连接，返回
            } catch (oauthError: any) {
              logger.error(`❌ OAuth authorization failed for ${config.name}:`, oauthError);
              throw oauthError;
            }
          }
          
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
  
  /**
   * 为服务器进行OAuth 2.1授权
   * 使用MCP规范要求的发现流程
   */
  async authorizeServer(config: MCPServerConfig): Promise<void> {
    console.log(`🔐 [MCP] Starting OAuth 2.1 authorization for ${config.name}...`);

    try {
      // Step 1: 发现授权服务器配置
      console.log(`🔍 [MCP] Discovering authorization server...`);
      const discovery = await oauth21Manager.discoverAuthorizationServer(config.url);

      console.log(`✅ [MCP] Authorization server discovered`);
      console.log(`   Resource URI: ${discovery.resourceUri}`);
      console.log(`   Auth Endpoint: ${discovery.authServerMetadata.authorization_endpoint}`);
      console.log(`   Token Endpoint: ${discovery.authServerMetadata.token_endpoint}`);

      // Step 2: 获取或注册客户端凭据
      let clientId = config.oauth?.clientId;
      let clientSecret = config.oauth?.clientSecret;

      // 如果没有配置客户端凭据,尝试动态注册
      if (!clientId && discovery.authServerMetadata.registration_endpoint) {
        console.log(`📝 [MCP] No client credentials configured, attempting dynamic registration...`);

        const redirectUri = 'http://localhost:23333/oauth/callback';
        const credentials = await oauth21Manager.registerClient(
          discovery.authServerMetadata.registration_endpoint,
          [redirectUri]
        );

        clientId = credentials.clientId;
        clientSecret = credentials.clientSecret;

        console.log(`✅ [MCP] Client registered successfully`);
        console.log(`   Client ID: ${clientId}`);
      } else if (!clientId) {
        throw new Error('需要配置Client ID或授权服务器必须支持动态客户端注册(RFC 7591)');
      }

      // Step 3: 执行OAuth 2.1授权流程 (PKCE + Resource Indicators)
      const scopes = config.oauth?.scopes || discovery.authServerMetadata.scopes_supported || ['openid'];
      const redirectUri = config.oauth?.redirectUri || 'http://localhost:23333/oauth/callback';

      const tokens = await oauth21Manager.authorize(
        discovery.authServerMetadata,
        { clientId, clientSecret },
        discovery.resourceUri,
        scopes,
        redirectUri
      );

      // Step 4: 保存OAuth配置和token
      config.oauth = {
        authUrl: discovery.authServerMetadata.authorization_endpoint,
        tokenUrl: discovery.authServerMetadata.token_endpoint,
        clientId,
        clientSecret,
        scopes,
        redirectUri,
        resource: discovery.resourceUri  // RFC 8707 Resource Indicators
      };

      config.tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        token_type: tokens.token_type
      };

      // 保存OAuth会话信息用于刷新token
      config.authServerMetadata = discovery.authServerMetadata;

      // 更新配置
      this.configs.set(config.id, config);
      await this.saveConfigsToDisk();

      console.log(`✅ [MCP] OAuth 2.1 authorization successful for ${config.name}`);
      logger.info(`✅ OAuth 2.1 authorization successful for ${config.name}`);
    } catch (error: any) {
      console.error(`❌ [MCP] OAuth 2.1 authorization failed:`, error);
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
        // RFC 8707要求: token刷新时也必须包含resource参数
        const newTokens = await oauth21Manager.refreshToken(
          config.tokens.refresh_token,
          config.oauth.tokenUrl,
          {
            clientId: config.oauth.clientId,
            clientSecret: config.oauth.clientSecret
          },
          config.oauth.resource!  // Resource URI必需
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
        await this.saveConfigsToDisk();

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
    }
    
    if (config) {
      this.configs.delete(serverId);
      logger.info(`🗑️ MCP server removed: ${config.name || serverId}`);
    } else {
      logger.warn(`⚠️ MCP server ${serverId} not found in configs`);
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
        
        // 转换为OpenAI Function格式，添加mcp_前缀和服务器名
        const formattedTools = tools.map(tool => ({
          type: 'function',
          function: {
            name: `mcp_${config.name}__${tool.name}`,  // mcp_前缀 + 服务器名 + 工具名
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
    // 从工具名解析: "mcp_服务器名__工具名"
    // 先移除 mcp_ 前缀
    let nameWithoutPrefix = toolName;
    if (toolName.startsWith('mcp_')) {
      nameWithoutPrefix = toolName.substring(4); // 移除 "mcp_"
    }
    
    const parts = nameWithoutPrefix.split('__');
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
      // 如果是OAuth错误，尝试授权
      if (error.message === 'OAUTH_REQUIRED') {
        console.log(`🔐 [MCP] Test requires OAuth, starting authorization...`);
        try {
          await this.authorizeServer(config);
          
          // 授权后重新测试
          const client = createMCPClient(config);
          await client.connect();
          client.disconnect();
          
          logger.info(`✅ Connection test passed with OAuth: ${config.name}`);
          return { success: true };
        } catch (oauthError: any) {
          logger.error(`❌ OAuth authorization failed: ${config.name}`, oauthError);
          return { success: false, error: `OAuth授权失败: ${oauthError.message}` };
        }
      }
      
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
