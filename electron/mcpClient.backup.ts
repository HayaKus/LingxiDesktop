import { logger } from './logger';
import { BrowserWindow } from 'electron';
import { oauth21Manager } from './oauthManager';

// 使用require导入eventsource以避免TypeScript类型问题
const EventSource = require('eventsource');

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
interface IMCPClient {
  connect(): Promise<void>;
  disconnect(): void;
  getTools(): Promise<any[]>;
  callTool(name: string, args: any): Promise<any>;
}

// HTTP客户端
class HTTPMCPClient implements IMCPClient {
  private sessionId: string | null = null;
  
  constructor(private config: MCPServerConfig) {}
  
  async connect(): Promise<void> {
    const startTime = Date.now();
    console.log('🔌 [MCP] Connecting to:', this.config.name);
    console.log('   URL:', this.config.url);
    console.log('   Has tokens:', !!this.config.tokens);
    
    try {
      // 如果已经有token，直接添加到headers并返回
      if (this.config.tokens?.access_token) {
        console.log('✅ [MCP] Using existing access token');
        this.config.headers = this.config.headers || {};
        this.config.headers['Authorization'] = `${this.config.tokens.token_type} ${this.config.tokens.access_token}`;
        logger.info(`✅ HTTP MCP connected with existing token: ${this.config.name}`);
        return;
      }
      
      // 没有token，需要进行OAuth授权
      console.log('🔐 [MCP] No token found, starting OAuth flow...');
      
      // ===== 第一步：发送不带token的请求，触发401以获取WWW-Authenticate =====
      console.log('📡 [STEP 1/7] Initial request without token...');
      
      const initialRequest = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'lingxi', version: '0.1.0' }
          },
          id: 1
        })
      });
      
      sendLogToRenderer(`   Response: ${initialRequest.status} ${initialRequest.statusText}`);
      
      if (initialRequest.status !== 401) {
        sendLogToRenderer('⚠️ Expected 401 Unauthorized, got ' + initialRequest.status, 'warn');
        sendLogToRenderer('   Server may not require OAuth, attempting direct connection...');
        // 继续尝试直接连接
      }
      
      // ===== 第二步：解析WWW-Authenticate header =====
      sendLogToRenderer('\n📡 [STEP 2/7] Parsing WWW-Authenticate header...');
      
      const wwwAuth = initialRequest.headers.get('www-authenticate');
      if (!wwwAuth) {
        throw new Error('No WWW-Authenticate header found in 401 response');
      }
      
      sendLogToRenderer(`   WWW-Authenticate: ${wwwAuth}`);
      
      // 解析 WWW-Authenticate header
      // 格式: Bearer realm="...", resource_metadata="/.well-known/oauth-protected-resource"
      const resourceMetadataMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
      if (!resourceMetadataMatch) {
        throw new Error('No resource_metadata found in WWW-Authenticate header');
      }
      
      const resourceMetadataPath = resourceMetadataMatch[1];
      const resourceMetadataUrl = new URL(resourceMetadataPath, this.config.url).href;
      sendLogToRenderer(`   ✅ Resource Metadata URL: ${resourceMetadataUrl}`);
      
      // ===== 第三步：获取Protected Resource Metadata (RFC 9728) =====
      sendLogToRenderer('\n📡 [STEP 3/7] Fetching Protected Resource Metadata (RFC 9728)...');
      
      const resourceMetadataResponse = await fetch(resourceMetadataUrl);
      if (!resourceMetadataResponse.ok) {
        throw new Error(`Failed to fetch resource metadata: ${resourceMetadataResponse.status}`);
      }
      
      const resourceMetadata = await resourceMetadataResponse.json();
      sendLogToRenderer(`   Response: ${JSON.stringify(resourceMetadata).substring(0, 200)}...`);
      
      if (!resourceMetadata.authorization_servers || resourceMetadata.authorization_servers.length === 0) {
        throw new Error('No authorization_servers found in resource metadata');
      }
      
      const authServerUrl = resourceMetadata.authorization_servers[0];
      sendLogToRenderer(`   ✅ Authorization Server: ${authServerUrl}`);
      
      // ===== 第四步：获取Authorization Server Metadata (RFC 8414) =====
      sendLogToRenderer('\n📡 [STEP 4/7] Fetching AS Metadata (RFC 8414)...');
      
      const asMetadataUrl = `${authServerUrl}/.well-known/oauth-authorization-server`;
      sendLogToRenderer(`   AS Metadata URL: ${asMetadataUrl}`);
      
      const asMetadataResponse = await fetch(asMetadataUrl);
      if (!asMetadataResponse.ok) {
        throw new Error(`Failed to fetch AS metadata: ${asMetadataResponse.status}`);
      }
      
      const asMetadata = await asMetadataResponse.json();
      sendLogToRenderer(`   Response: ${JSON.stringify(asMetadata).substring(0, 200)}...`);
      sendLogToRenderer(`   ✅ Authorization Endpoint: ${asMetadata.authorization_endpoint}`);
      sendLogToRenderer(`   ✅ Token Endpoint: ${asMetadata.token_endpoint}`);
      
      // ===== 第五步：Dynamic Client Registration (RFC 7591 - 可选) =====
      sendLogToRenderer('\n📡 [STEP 5/7] Dynamic Client Registration (RFC 7591)...');
      
      let clientId = this.config.oauth?.clientId;
      let clientSecret = this.config.oauth?.clientSecret;
      
      if (!clientId && asMetadata.registration_endpoint) {
        sendLogToRenderer('   Attempting dynamic client registration...');
        
        const registrationResponse = await fetch(asMetadata.registration_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'lingxi',
            redirect_uris: [this.config.oauth?.redirectUri || 'lingxi://oauth/callback'],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none' // Public client
          })
        });
        
        if (registrationResponse.ok) {
          const registration = await registrationResponse.json();
          clientId = registration.client_id;
          clientSecret = registration.client_secret;
          sendLogToRenderer(`   ✅ Dynamic registration successful`);
          sendLogToRenderer(`      Client ID: ${clientId}`);
        } else {
          sendLogToRenderer(`   ⚠️ Dynamic registration not available`, 'warn');
          throw new Error('No client_id configured and dynamic registration failed');
        }
      } else if (!clientId) {
        throw new Error('No client_id configured and no registration_endpoint available');
      }
      
      sendLogToRenderer(`   Client ID: ${clientId}`);
      
      // ===== 第六步和第七步：使用oauthManager完成完整的OAuth授权流程 =====
      sendLogToRenderer('\n📡 [STEP 6-7/7] OAuth 2.1 Authorization & Token Exchange...');
      sendLogToRenderer('   Opening authorization window...');
      sendLogToRenderer('   ⚠️ Please login and authorize in the popup window');
      
      // 使用oauth21Manager执行完整的OAuth流程
      const tokens = await oauth21Manager.authorize(
        { 
          issuer: authServerUrl,
          authorization_endpoint: asMetadata.authorization_endpoint,
          token_endpoint: asMetadata.token_endpoint
        },
        { clientId, clientSecret },
        this.config.url,
        this.config.oauth?.scopes || [],
        this.config.oauth?.redirectUri || 'lingxi://oauth/callback'
      );
      
      /* 旧的调用方式 - 保留用于参考
      const tokens = await oauth21Manager.authorize({
        authUrl: asMetadata.authorization_endpoint,
        tokenUrl: asMetadata.token_endpoint,
        clientId: clientId,
        clientSecret: clientSecret,
        scopes: this.config.oauth?.scopes || [],
        redirectUri: this.config.oauth?.redirectUri || 'lingxi://oauth/callback',
        resource: this.config.url  // RFC 8707 - 传递resource参数
      });
      */
      
      sendLogToRenderer(`   ✅ Access Token received!`);
      sendLogToRenderer(`   Token type: ${tokens.token_type}`);
      sendLogToRenderer(`   Expires in: ${tokens.expires_in || 'unknown'} seconds`);
      sendLogToRenderer(`   Has refresh token: ${!!tokens.refresh_token}`);
      
      // 保存tokens到config
      this.config.tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        token_type: tokens.token_type
      };
      
      // 添加到headers
      this.config.headers = this.config.headers || {};
      this.config.headers['Authorization'] = `${tokens.token_type} ${tokens.access_token}`;
      
      sendLogToRenderer('\n========================================');
      sendLogToRenderer(`✅ OAuth Authorization COMPLETE (${Date.now() - startTime}ms)`);
      sendLogToRenderer('   Access token has been obtained and saved!');
      sendLogToRenderer('   You can now use MCP tools.');
      sendLogToRenderer('========================================\n');
      
      logger.info(`✅ HTTP MCP OAuth completed: ${this.config.name}`);
      
    } catch (error: any) {
      sendLogToRenderer('\n❌ [EXCEPTION] OAuth discovery failed!', 'error');
      sendLogToRenderer(`   Error type: ${error.name}`, 'error');
      sendLogToRenderer(`   Error message: ${error.message}`, 'error');
      if (error.stack) {
        sendLogToRenderer(`   Stack trace:`, 'error');
        error.stack.split('\n').slice(0, 5).forEach((line: string) => {
          sendLogToRenderer(`      ${line}`, 'error');
        });
      }
      
      logger.error(`❌ HTTP MCP connection failed: ${this.config.name}`, error);
      
      sendLogToRenderer('\n========================================');
      sendLogToRenderer(`❌ Test FAILED (${Date.now() - startTime}ms)`, 'error');
      sendLogToRenderer('========================================\n');
      
      throw error;
    }
  }
  
  // PKCE辅助方法（使用Node.js crypto）
  private generateCodeVerifier(): string {
    const crypto = require('crypto');
    const buffer = crypto.randomBytes(32);
    return this.base64URLEncode(buffer);
  }
  
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return this.base64URLEncode(hash);
  }
  
  private base64URLEncode(buffer: Buffer): string {
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  private generateState(): string {
    const crypto = require('crypto');
    const buffer = crypto.randomBytes(16);
    return this.base64URLEncode(buffer);
  }
  
  // 旧的实现方法保留用于参考
  private async oldConnect(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const initHeaders = {
        'Content-Type': 'application/json',
        ...(this.config.headers || {})
      };
      
      const initBody = JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'lingxi',
            version: '0.1.0'
          }
        },
        id: 1
      });
      
      sendLogToRenderer('📤 [INIT REQUEST]');
      sendLogToRenderer(`   Method: POST`);
      sendLogToRenderer(`   URL: ${this.config.url}`);
      sendLogToRenderer(`   Headers:`);
      Object.entries(initHeaders).forEach(([key, value]) => {
        if (key.toLowerCase().includes('authorization') && value.length > 20) {
          sendLogToRenderer(`      ${key}: ${value.substring(0, 20)}...`);
        } else {
          sendLogToRenderer(`      ${key}: ${value}`);
        }
      });
      sendLogToRenderer(`   Body: ${initBody}`);
      sendLogToRenderer('');
      
      // 发送初始化请求
      const initController = new AbortController();
      const initTimeoutId = setTimeout(() => initController.abort(), 10000);
      
      sendLogToRenderer('🚀 [SENDING] Initializing...');
      const initResponse = await fetch(this.config.url, {
        method: 'POST',
        headers: initHeaders,
        body: initBody,
        signal: initController.signal
      });
      
      clearTimeout(initTimeoutId);
      
      const initResponseText = await initResponse.text();
      sendLogToRenderer(`📥 [INIT RESPONSE] Status: ${initResponse.status}`);
      sendLogToRenderer(`   Body: ${initResponseText.substring(0, 300)}...`);
      
      if (!initResponse.ok) {
        throw new Error(`Initialize failed: ${initResponse.status} ${initResponseText}`);
      }
      
      // 第二步：使用返回的Session ID请求工具列表
      sendLogToRenderer('\n📡 [STEP 2] Fetching tools list...');
      
      // 从响应头获取Session ID
      const sessionId = initResponse.headers.get('mcp-session-id');
      sendLogToRenderer(`   Session ID: ${sessionId || 'Not provided by server'}`);
      
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...(this.config.headers || {})
      };
      
      // 如果服务器返回了Session ID，添加到后续请求
      if (sessionId) {
        requestHeaders['Mcp-Session-Id'] = sessionId;
      }
      
      const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      });
      
      sendLogToRenderer('📤 [REQUEST] Preparing request...');
      sendLogToRenderer(`   Method: POST`);
      sendLogToRenderer(`   URL: ${this.config.url}`);
      sendLogToRenderer(`   Headers:`);
      Object.entries(requestHeaders).forEach(([key, value]) => {
        if (key.toLowerCase().includes('authorization') && value.length > 20) {
          sendLogToRenderer(`      ${key}: ${value.substring(0, 20)}...`);
        } else {
          sendLogToRenderer(`      ${key}: ${value}`);
        }
      });
      sendLogToRenderer(`   Body: ${requestBody}`);
      sendLogToRenderer('');
      
      // 发送请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        sendLogToRenderer('⏱️ [TIMEOUT] Request timeout after 10 seconds', 'warn');
        controller.abort();
      }, 10000);
      
      sendLogToRenderer('🚀 [SENDING] Sending request...');
      const requestStartTime = Date.now();
      
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const requestDuration = Date.now() - requestStartTime;
      
      sendLogToRenderer(`\n📥 [RESPONSE] Received response (${requestDuration}ms)`);
      sendLogToRenderer(`   Status: ${response.status} ${response.statusText}`);
      sendLogToRenderer(`   Headers:`);
      response.headers.forEach((value, key) => {
        sendLogToRenderer(`      ${key}: ${value}`);
      });
      
      // 读取响应体
      const responseText = await response.text();
      sendLogToRenderer(`   Body length: ${responseText.length} bytes`);
      sendLogToRenderer(`   Body preview: ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);
      sendLogToRenderer('');
      
      if (!response.ok) {
        sendLogToRenderer('❌ [ERROR] Request failed!', 'error');
        sendLogToRenderer(`   Status: ${response.status} ${response.statusText}`, 'error');
        sendLogToRenderer(`   Response body: ${responseText}`, 'error');
        sendLogToRenderer('\n========================================');
        sendLogToRenderer(`❌ Test FAILED (${Date.now() - startTime}ms)`, 'error');
        sendLogToRenderer('========================================\n');
        throw new Error(`HTTP ${response.status}: ${response.statusText}\n${responseText}`);
      }
      
      // 解析JSON响应
      let data;
      try {
        data = JSON.parse(responseText);
        sendLogToRenderer('✅ [PARSE] Response is valid JSON');
        sendLogToRenderer(`   Parsed data: ${JSON.stringify(data).substring(0, 200)}...`);
      } catch (parseError) {
        sendLogToRenderer('⚠️ [PARSE] Response is not valid JSON', 'warn');
        sendLogToRenderer('\n========================================');
        sendLogToRenderer(`⚠️ Test completed with warnings (${Date.now() - startTime}ms)`, 'warn');
        sendLogToRenderer('========================================\n');
        throw new Error('Response is not valid JSON');
      }
      
      // 验证响应格式（JSON-RPC响应）
      if (data.result && data.result.tools) {
        sendLogToRenderer(`✅ [TOOLS] Found ${data.result.tools.length} tools`);
        data.result.tools.forEach((tool: any, index: number) => {
          sendLogToRenderer(`   ${index + 1}. ${tool.name}: ${tool.description || 'No description'}`);
        });
      } else if (data.tools) {
        sendLogToRenderer(`✅ [TOOLS] Found ${data.tools.length} tools`);
        data.tools.forEach((tool: any, index: number) => {
          sendLogToRenderer(`   ${index + 1}. ${tool.name}: ${tool.description || 'No description'}`);
        });
      } else if (Array.isArray(data)) {
        sendLogToRenderer(`✅ [TOOLS] Found ${data.length} tools (array format)`);
      } else if (data.error) {
        sendLogToRenderer(`❌ [RPC ERROR] ${data.error.message}`, 'error');
        sendLogToRenderer(`   Code: ${data.error.code}`, 'error');
      } else {
        sendLogToRenderer('⚠️ [FORMAT] Unexpected response format', 'warn');
        sendLogToRenderer('   Expected: { result: { tools: [...] } } or { tools: [...] }');
        sendLogToRenderer(`   Got: ${JSON.stringify(data).substring(0, 100)}`);
      }
      
      logger.info(`✅ HTTP MCP connected: ${this.config.name}`);
      
      sendLogToRenderer('\n========================================');
      sendLogToRenderer(`✅ Test SUCCESSFUL (${Date.now() - startTime}ms)`);
      sendLogToRenderer('========================================\n');
      
    } catch (error: any) {
      sendLogToRenderer('\n❌ [EXCEPTION] Connection failed with exception!', 'error');
      sendLogToRenderer(`   Error type: ${error.name}`, 'error');
      sendLogToRenderer(`   Error message: ${error.message}`, 'error');
      if (error.cause) {
        sendLogToRenderer(`   Error cause: ${error.cause}`, 'error');
      }
      if (error.stack) {
        sendLogToRenderer(`   Stack trace:`, 'error');
        error.stack.split('\n').slice(0, 5).forEach((line: string) => {
          sendLogToRenderer(`      ${line}`, 'error');
        });
      }
      
      logger.error(`❌ HTTP MCP connection failed: ${this.config.name}`, error);
      
      sendLogToRenderer('\n========================================');
      sendLogToRenderer(`❌ Test FAILED (${Date.now() - startTime}ms)`, 'error');
      sendLogToRenderer('========================================\n');
      
      throw error;
    }
  }
  
  async getTools(): Promise<any[]> {
    console.log(`\n========================================`);
    console.log(`🔧 [HTTPMCPClient] getTools() 被调用`);
    console.log(`   Server: ${this.config.name}`);
    console.log(`   URL: ${this.config.url}`);
    console.log(`   Session ID: ${this.sessionId || 'Not initialized yet'}`);
    console.log(`========================================`);
    
    // 如果没有Session ID，先初始化
    if (!this.sessionId) {
      console.log(`   ⚠️ No session ID, initializing first...`);
      await this.initializeSession();
    }
    
    const controller = new AbortController();
    const timeout = 5000; // getTools应该很快返回，设置5秒超时
    const timeoutId = setTimeout(() => {
      console.error(`\n❌ [HTTPMCPClient] getTools TIMEOUT after ${timeout}ms`);
      console.error(`   This is unusual - getTools should return quickly!`);
      console.error(`   Possible issues:`);
      console.error(`   1. Network connectivity problem`);
      console.error(`   2. Server is hanging/not responding`);
      console.error(`   3. Request blocked by firewall/proxy`);
      controller.abort();
    }, timeout);
    
    try {
      // MCP标准：使用JSON-RPC格式
      const requestBody = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      };
      
      console.log(`\n📤 [REQUEST] Preparing tools/list request:`);
      console.log(`   Method: POST`);
      console.log(`   URL: ${this.config.url}`);
      console.log(`   Body:`, JSON.stringify(requestBody));
      
      // 构建headers，包含Session ID
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(this.config.headers || {})
      };
      
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }
      
      console.log(`   Headers:`);
      Object.entries(headers).forEach(([key, value]) => {
        if (key.toLowerCase() === 'authorization' && value.length > 30) {
          console.log(`      ${key}: ${value.substring(0, 30)}...`);
        } else {
          console.log(`      ${key}: ${value}`);
        }
      });
      
      console.log(`\n🚀 [SENDING] Sending request at ${new Date().toISOString()}...`);
      const startTime = Date.now();
      
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`\n📥 [RESPONSE] Received response after ${duration}ms`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Response headers:`);
      response.headers.forEach((value, key) => {
        console.log(`      ${key}: ${value}`);
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`\n❌ [ERROR] HTTP ${response.status}:`);
        console.error(`   ${errorText}`);
        throw new Error(`Failed to get tools: ${response.status} ${errorText}`);
      }
      
      const responseText = await response.text();
      console.log(`\n📋 [BODY] Response body (${responseText.length} bytes):`);
      if (responseText.length <= 1000) {
        console.log(responseText);
      } else {
        console.log(responseText.substring(0, 1000) + `\n... (${responseText.length - 1000} more bytes)`);
      }
      
      const data = JSON.parse(responseText);
      
      // MCP标准响应格式: { jsonrpc: "2.0", result: { tools: [...] }, id: 2 }
      const tools = data.result?.tools || data.tools || [];
      
      console.log(`\n✅ [SUCCESS] Got ${tools.length} tools from ${this.config.name}`);
      if (tools.length > 0) {
        console.log(`   Tools:`);
        tools.forEach((tool: any, index: number) => {
          console.log(`   ${index + 1}. ${tool.name} - ${tool.description || 'No description'}`);
        });
      }
      console.log(`========================================\n`);
      
      logger.info(`📦 Got ${tools.length} tools from ${this.config.name}`);
      return tools;
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`\n❌ [EXCEPTION] getTools failed:`);
      console.error(`   Error type: ${error.name}`);
      console.error(`   Error message: ${error.message}`);
      if (error.cause) {
        console.error(`   Cause: ${error.cause}`);
      }
      console.error(`========================================\n`);
      throw error;
    }
  }
  
  // 初始化会话，获取Session ID
  private async initializeSession(): Promise<void> {
    console.log(`🔄 [HTTPMCPClient] 初始化会话...`);
    
    const initBody = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lingxi', version: '0.1.0' }
      },
      id: 1
    };
    
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.headers || {})
      },
      body: JSON.stringify(initBody)
    });
    
    console.log(`   Initialize response: ${response.status}`);
    
    // 从响应头获取Session ID
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) {
      this.sessionId = sessionId;
      console.log(`   ✅ Got Session ID: ${sessionId}`);
      logger.info(`📋 MCP Session initialized: ${sessionId}`);
    } else {
      console.warn(`   ⚠️ No Mcp-Session-Id in response headers`);
      logger.warn(`⚠️ MCP server did not return Session ID`);
    }
    
    // 读取响应体（可能包含初始化信息）
    const responseText = await response.text();
    console.log(`   Response body: ${responseText.substring(0, 200)}`);
  }
  
  async callTool(name: string, args: any): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000);
    
    logger.info(`🔧 Calling MCP tool: ${this.config.name}/${name}`);
    
    const response = await fetch(`${this.config.url}/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.headers || {})
      },
      body: JSON.stringify({ name, arguments: args }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Tool call failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    logger.info(`✅ MCP tool completed: ${this.config.name}/${name}`);
    return result;
  }
  
  disconnect(): void {
    // HTTP无需disconnect
  }
}

// SSE客户端
class SSEMCPClient implements IMCPClient {
  private eventSource: EventSource | null = null;
  private tools: any[] = [];
  
  constructor(private config: MCPServerConfig) {}
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(this.config.url, {
          headers: this.config.headers
        });
        
        this.eventSource.onopen = () => {
          logger.info(`✅ SSE MCP connected: ${this.config.name}`);
          resolve();
        };
        
        this.eventSource.onerror = (error) => {
          logger.error(`❌ SSE MCP connection failed: ${this.config.name}`, error);
          reject(new Error('SSE connection failed'));
        };
        
        // 监听工具列表消息
        this.eventSource.addEventListener('tools', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            this.tools = data.tools || [];
            logger.info(`📦 Received ${this.tools.length} tools via SSE from ${this.config.name}`);
          } catch (error) {
            logger.error('Failed to parse SSE tools message:', error);
          }
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async getTools(): Promise<any[]> {
    // 如果SSE已经推送了工具列表，直接返回
    if (this.tools.length > 0) {
      return this.tools;
    }
    
    // 否则通过HTTP获取（SSE服务器通常也支持HTTP查询）
    try {
      const response = await fetch(`${this.config.url}/tools/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {})
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.tools = data.tools || [];
        logger.info(`📦 Got ${this.tools.length} tools from ${this.config.name} (HTTP fallback)`);
      }
    } catch (error) {
      logger.warn(`Could not fetch tools via HTTP from ${this.config.name}:`, error);
    }
    
    return this.tools;
  }
  
  async callTool(name: string, args: any): Promise<any> {
    // SSE通常是单向的，工具调用还是通过HTTP
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000);
    
    logger.info(`🔧 Calling MCP tool: ${this.config.name}/${name}`);
    
    const response = await fetch(`${this.config.url}/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.headers || {})
      },
      body: JSON.stringify({ name, arguments: args }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Tool call failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    logger.info(`✅ MCP tool completed: ${this.config.name}/${name}`);
    return result;
  }
  
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      logger.info(`🔌 Disconnected SSE: ${this.config.name}`);
    }
  }
}

// 工厂函数
export function createMCPClient(config: MCPServerConfig): IMCPClient {
  switch (config.type) {
    case 'http':
      return new HTTPMCPClient(config);
    case 'sse':
      return new SSEMCPClient(config);
    default:
      throw new Error(`Unknown MCP type: ${config.type}`);
  }
}

export { IMCPClient };
