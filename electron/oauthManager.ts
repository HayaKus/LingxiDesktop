/**
 * MCP OAuth 2.1 Manager
 *
 * 实现MCP规范要求的OAuth 2.1授权流程:
 * - Authorization Server Discovery (RFC 9728 + RFC 8414)
 * - PKCE (OAuth 2.1必需)
 * - Resource Indicators (RFC 8707)
 * - Dynamic Client Registration (RFC 7591)
 *
 * @see https://spec.modelcontextprotocol.io/specification/2025-06-18/basic/authorization/
 */

import { BrowserWindow, shell } from 'electron';
import { randomBytes, createHash } from 'crypto';
import { logger } from './logger';
import * as http from 'http';
import { parse } from 'url';

// ==================== 类型定义 ====================

/**
 * Protected Resource Metadata (RFC 9728)
 * MCP服务器必须提供此元数据来指示授权服务器位置
 */
export interface ProtectedResourceMetadata {
  resource: string;  // MCP服务器的规范URI
  authorization_servers: string[];  // 授权服务器URI列表
  bearer_methods_supported?: string[];
  resource_signing_alg_values_supported?: string[];
}

/**
 * Authorization Server Metadata (RFC 8414)
 * 授权服务器必须提供此元数据
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;  // Dynamic Client Registration端点
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];  // PKCE支持
  [key: string]: any;
}

/**
 * OAuth客户端凭据
 * 可以通过Dynamic Client Registration自动获取，或手动配置
 */
export interface OAuthClientCredentials {
  clientId: string;
  clientSecret?: string;  // 公开客户端可选
}

/**
 * OAuth Token响应
 */
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;  // 通常是"Bearer"
  scope?: string;
}

// ==================== OAuth 2.1 Manager ====================

class OAuth21Manager {
  // 存储正在进行的授权流程
  private pendingAuths: Map<string, {
    codeVerifier: string;
    resolve: (tokens: OAuthTokens) => void;
    reject: (error: Error) => void;
    server?: http.Server;
  }> = new Map();

  // ==================== Step 1: 发现授权服务器 ====================

  /**
   * 从MCP服务器发现授权服务器配置
   *
   * 流程:
   * 1. 尝试连接MCP服务器(不带token)
   * 2. 解析401响应的WWW-Authenticate header
   * 3. 获取Protected Resource Metadata
   * 4. 获取Authorization Server Metadata
   *
   * @param mcpServerUrl MCP服务器URL
   * @returns 发现的授权服务器信息
   */
  async discoverAuthorizationServer(mcpServerUrl: string): Promise<{
    resourceUri: string;
    authServerMetadata: AuthorizationServerMetadata;
    protectedResourceMetadata: ProtectedResourceMetadata;
  }> {
    console.log('🔍 [OAuth21] Starting authorization server discovery...');
    console.log('   MCP Server:', mcpServerUrl);

    // 获取规范资源URI
    const resourceUri = this.getCanonicalResourceUri(mcpServerUrl);
    console.log('   Canonical Resource URI:', resourceUri);

    let resourceMetadataUrl: string | null = null;

    try {
      // Step 1.1: 尝试连接MCP服务器(不带token)
      console.log('🔗 [OAuth21] Attempting connection without token...');
      const response = await fetch(mcpServerUrl, {
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

      console.log('📡 [OAuth21] Response status:', response.status);

      // Step 1.2: 检查是否返回401 Unauthorized
      if (response.status === 401) {
        console.log('🔐 [OAuth21] 401 Unauthorized - OAuth required');

        // 解析WWW-Authenticate header
        const wwwAuth = response.headers.get('WWW-Authenticate');
        console.log('   WWW-Authenticate:', wwwAuth);

        if (wwwAuth) {
          const challenge = this.parseWWWAuthenticate(wwwAuth);
          if (challenge?.resource_metadata) {
            resourceMetadataUrl = challenge.resource_metadata;
            console.log('✅ [OAuth21] Found resource_metadata URL:', resourceMetadataUrl);
          }
        }
      } else if (response.ok) {
        // 服务器不需要认证
        throw new Error('MCP server does not require authentication');
      }
    } catch (error: any) {
      if (error.message === 'MCP server does not require authentication') {
        throw error;
      }
      // 网络错误或其他问题，继续尝试标准路径
      console.warn('⚠️ [OAuth21] Failed to connect:', error.message);
    }

    // Step 1.3: 如果没有从WWW-Authenticate获取到，使用标准路径
    if (!resourceMetadataUrl) {
      resourceMetadataUrl = new URL('/.well-known/oauth-protected-resource', resourceUri).toString();
      console.log('ℹ️ [OAuth21] Using standard path:', resourceMetadataUrl);
    }

    // Step 1.4: 获取Protected Resource Metadata
    console.log('📥 [OAuth21] Fetching Protected Resource Metadata...');
    const protectedResourceMetadata = await this.fetchProtectedResourceMetadata(resourceMetadataUrl);

    console.log('✅ [OAuth21] Protected Resource Metadata received');
    console.log('   Resource:', protectedResourceMetadata.resource);
    console.log('   Authorization Servers:', protectedResourceMetadata.authorization_servers.join(', '));

    // Step 1.5: 选择第一个授权服务器
    const authServerUri = protectedResourceMetadata.authorization_servers[0];
    if (!authServerUri) {
      throw new Error('No authorization server found in Protected Resource Metadata');
    }

    console.log('🎯 [OAuth21] Selected Authorization Server:', authServerUri);

    // Step 1.6: 获取Authorization Server Metadata
    console.log('📥 [OAuth21] Fetching Authorization Server Metadata...');
    const authServerMetadata = await this.fetchAuthorizationServerMetadata(authServerUri);

    console.log('✅ [OAuth21] Authorization Server Metadata received');
    console.log('   Issuer:', authServerMetadata.issuer);
    console.log('   Authorization Endpoint:', authServerMetadata.authorization_endpoint);
    console.log('   Token Endpoint:', authServerMetadata.token_endpoint);
    console.log('   Registration Endpoint:', authServerMetadata.registration_endpoint || 'N/A');
    console.log('   PKCE Support:', authServerMetadata.code_challenge_methods_supported?.join(', ') || 'Unknown');

    // 验证PKCE支持(OAuth 2.1必需)
    if (!authServerMetadata.code_challenge_methods_supported?.includes('S256')) {
      console.warn('⚠️ [OAuth21] Authorization server does not support PKCE S256!');
      throw new Error('Authorization server must support PKCE with S256 method (OAuth 2.1 requirement)');
    }

    return {
      resourceUri,
      authServerMetadata,
      protectedResourceMetadata
    };
  }

  /**
   * 获取Protected Resource Metadata (RFC 9728)
   */
  private async fetchProtectedResourceMetadata(url: string): Promise<ProtectedResourceMetadata> {
    try {
      console.log('🌐 [OAuth21] GET', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const metadata: ProtectedResourceMetadata = await response.json();

      // 验证必需字段
      if (!metadata.resource) {
        throw new Error('Protected Resource Metadata missing required field: resource');
      }
      if (!metadata.authorization_servers || metadata.authorization_servers.length === 0) {
        throw new Error('Protected Resource Metadata missing required field: authorization_servers');
      }

      return metadata;
    } catch (error: any) {
      logger.error('Failed to fetch Protected Resource Metadata:', error);
      throw new Error(`Failed to fetch Protected Resource Metadata: ${error.message}`);
    }
  }

  /**
   * 获取Authorization Server Metadata (RFC 8414)
   */
  private async fetchAuthorizationServerMetadata(issuerUrl: string): Promise<AuthorizationServerMetadata> {
    try {
      // 构建.well-known URL
      const wellKnownUrl = new URL('/.well-known/oauth-authorization-server', issuerUrl).toString();

      console.log('🌐 [OAuth21] GET', wellKnownUrl);
      const response = await fetch(wellKnownUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const metadata: AuthorizationServerMetadata = await response.json();

      // 验证必需字段
      if (!metadata.issuer) {
        throw new Error('Authorization Server Metadata missing required field: issuer');
      }
      if (!metadata.authorization_endpoint) {
        throw new Error('Authorization Server Metadata missing required field: authorization_endpoint');
      }
      if (!metadata.token_endpoint) {
        throw new Error('Authorization Server Metadata missing required field: token_endpoint');
      }

      return metadata;
    } catch (error: any) {
      logger.error('Failed to fetch Authorization Server Metadata:', error);
      throw new Error(`Failed to fetch Authorization Server Metadata: ${error.message}`);
    }
  }

  // ==================== Step 2: 动态客户端注册 (可选) ====================

  /**
   * 动态客户端注册 (RFC 7591)
   * 如果授权服务器支持，可以自动获取客户端凭据
   *
   * @param registrationEndpoint 注册端点URL
   * @param redirectUris 重定向URI列表
   * @returns 客户端凭据
   */
  async registerClient(
    registrationEndpoint: string,
    redirectUris: string[]
  ): Promise<OAuthClientCredentials> {
    console.log('📝 [OAuth21] Starting dynamic client registration...');
    console.log('   Registration Endpoint:', registrationEndpoint);
    console.log('   Redirect URIs:', redirectUris.join(', '));

    try {
      const response = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_name: 'IamDog MCP Client',
          redirect_uris: redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',  // 公开客户端
          application_type: 'native'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      console.log('✅ [OAuth21] Client registered successfully');
      console.log('   Client ID:', result.client_id);

      return {
        clientId: result.client_id,
        clientSecret: result.client_secret
      };
    } catch (error: any) {
      logger.error('Dynamic client registration failed:', error);
      throw new Error(`Dynamic client registration failed: ${error.message}`);
    }
  }

  // ==================== Step 3: PKCE授权码流程 ====================

  /**
   * 执行OAuth 2.1授权流程 (PKCE + Resource Indicators)
   *
   * @param authServerMetadata 授权服务器元数据
   * @param clientCredentials 客户端凭据
   * @param resourceUri MCP服务器的规范URI
   * @param scopes 权限范围
   * @param redirectUri 重定向URI
   * @returns OAuth tokens
   */
  async authorize(
    authServerMetadata: AuthorizationServerMetadata,
    clientCredentials: OAuthClientCredentials,
    resourceUri: string,
    scopes: string[],
    redirectUri: string
  ): Promise<OAuthTokens> {
    console.log('🔐 [OAuth21] Starting PKCE authorization flow...');
    console.log('   Auth Endpoint:', authServerMetadata.authorization_endpoint);
    console.log('   Token Endpoint:', authServerMetadata.token_endpoint);
    console.log('   Client ID:', clientCredentials.clientId);
    console.log('   Resource URI:', resourceUri);
    console.log('   Scopes:', scopes.join(', '));
    console.log('   Redirect URI:', redirectUri);

    // 判断是否使用localhost回调
    const isLocalhostCallback = redirectUri.startsWith('http://localhost');

    if (isLocalhostCallback) {
      return this.authorizeWithLocalhost(
        authServerMetadata,
        clientCredentials,
        resourceUri,
        scopes,
        redirectUri
      );
    } else {
      return this.authorizeWithBrowser(
        authServerMetadata,
        clientCredentials,
        resourceUri,
        scopes,
        redirectUri
      );
    }
  }

  /**
   * 使用本地HTTP服务器接收回调 (localhost方式)
   */
  private async authorizeWithLocalhost(
    authServerMetadata: AuthorizationServerMetadata,
    clientCredentials: OAuthClientCredentials,
    resourceUri: string,
    scopes: string[],
    redirectUri: string
  ): Promise<OAuthTokens> {
    console.log('🔐 [OAuth21] Using localhost HTTP server for callback');

    return new Promise(async (resolve, reject) => {
      try {
        // 生成PKCE参数
        const state = this.generateState();
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        // 解析redirect_uri获取端口和路径
        const redirectUrl = new URL(redirectUri);
        const port = parseInt(redirectUrl.port);
        const callbackPath = redirectUrl.pathname;

        console.log(`   Starting HTTP server on port ${port}`);

        // 创建HTTP服务器
        const server = http.createServer(async (req, res) => {
          const { pathname, query } = parse(req.url || '', true);

          if (pathname === callbackPath) {
            const code = query.code as string;
            const error = query.error as string;
            const returnedState = query.state as string;

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h1>授权失败</h1><p>' + error + '</p>');
              server.close();
              reject(new Error(`授权失败: ${error}`));
              return;
            }

            // 验证state
            if (returnedState !== state) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h1>授权失败</h1><p>State验证失败</p>');
              server.close();
              reject(new Error('State验证失败'));
              return;
            }

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h1>授权成功！</h1><p>您可以关闭此页面返回应用</p>');

              console.log('✅ [OAuth21] Authorization code received via localhost');

              // 关闭服务器
              server.close();

              try {
                // 换取token
                const tokens = await this.exchangeCodeForToken(
                  code,
                  codeVerifier,
                  authServerMetadata.token_endpoint,
                  clientCredentials,
                  resourceUri,
                  redirectUri
                );
                resolve(tokens);
              } catch (err) {
                reject(err);
              }
            }
          }
        });

        // 监听端口
        server.listen(port, () => {
          console.log(`✅ [OAuth21] HTTP server started on port ${port}`);

          // 构建授权URL
          const authUrl = new URL(authServerMetadata.authorization_endpoint);
          authUrl.searchParams.set('client_id', clientCredentials.clientId);
          authUrl.searchParams.set('redirect_uri', redirectUri);
          authUrl.searchParams.set('response_type', 'code');
          authUrl.searchParams.set('code_challenge', codeChallenge);
          authUrl.searchParams.set('code_challenge_method', 'S256');
          authUrl.searchParams.set('scope', scopes.join(' '));
          authUrl.searchParams.set('state', state);
          // RFC 8707 - Resource Indicators (必需!)
          authUrl.searchParams.set('resource', resourceUri);

          console.log('🌐 [OAuth21] Opening browser for authorization...');

          // 打开系统浏览器
          shell.openExternal(authUrl.toString());
        });

        // 超时处理
        setTimeout(() => {
          server.close();
          reject(new Error('授权超时'));
        }, 5 * 60 * 1000);

        // 保存server引用
        this.pendingAuths.set(state, { codeVerifier, resolve, reject, server });

      } catch (error) {
        console.error('❌ [OAuth21] Authorization failed:', error);
        reject(error);
      }
    });
  }

  /**
   * 使用浏览器窗口监听redirect (自定义协议方式)
   */
  private async authorizeWithBrowser(
    authServerMetadata: AuthorizationServerMetadata,
    clientCredentials: OAuthClientCredentials,
    resourceUri: string,
    scopes: string[],
    redirectUri: string
  ): Promise<OAuthTokens> {
    console.log('🔐 [OAuth21] Using browser window for callback');

    return new Promise(async (resolve, reject) => {
      try {
        // 生成PKCE参数
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const state = this.generateState();

        // 保存授权流程信息
        this.pendingAuths.set(state, { codeVerifier, resolve, reject });

        // 构建授权URL
        const authUrl = new URL(authServerMetadata.authorization_endpoint);
        authUrl.searchParams.set('client_id', clientCredentials.clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('scope', scopes.join(' '));
        authUrl.searchParams.set('state', state);
        // RFC 8707 - Resource Indicators (必需!)
        authUrl.searchParams.set('resource', resourceUri);

        console.log('🌐 [OAuth21] Opening authorization window...');

        // 打开授权窗口
        const authWindow = new BrowserWindow({
          width: 800,
          height: 900,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          },
          title: '授权登录',
          autoHideMenuBar: true
        });

        authWindow.loadURL(authUrl.toString());

        // 监听URL变化
        authWindow.webContents.on('will-redirect', async (event, url) => {
          await this.handleCallback(
            url,
            redirectUri,
            state,
            authWindow,
            authServerMetadata.token_endpoint,
            clientCredentials,
            resourceUri
          );
        });

        authWindow.webContents.on('did-navigate', async (event, url) => {
          await this.handleCallback(
            url,
            redirectUri,
            state,
            authWindow,
            authServerMetadata.token_endpoint,
            clientCredentials,
            resourceUri
          );
        });

        // 监听窗口关闭
        authWindow.on('closed', () => {
          const pending = this.pendingAuths.get(state);
          if (pending) {
            console.log('❌ [OAuth21] Authorization window closed by user');
            pending.reject(new Error('用户取消了授权'));
            this.pendingAuths.delete(state);
          }
        });

        // 超时处理
        setTimeout(() => {
          const pending = this.pendingAuths.get(state);
          if (pending) {
            console.log('⏱️ [OAuth21] Authorization timeout');
            pending.reject(new Error('授权超时'));
            this.pendingAuths.delete(state);
            if (!authWindow.isDestroyed()) {
              authWindow.close();
            }
          }
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error('❌ [OAuth21] Authorization failed:', error);
        reject(error);
      }
    });
  }

  /**
   * 处理OAuth回调
   */
  private async handleCallback(
    url: string,
    redirectUri: string,
    state: string,
    authWindow: BrowserWindow,
    tokenEndpoint: string,
    clientCredentials: OAuthClientCredentials,
    resourceUri: string
  ) {
    try {
      const urlObj = new URL(url);

      // 检查是否是回调URL
      if (!url.startsWith(redirectUri)) {
        return;
      }

      console.log('✅ [OAuth21] Callback received');

      const pending = this.pendingAuths.get(state);
      if (!pending) {
        console.error('❌ [OAuth21] No pending authorization found for state');
        return;
      }

      // 检查错误
      const error = urlObj.searchParams.get('error');
      if (error) {
        const errorDesc = urlObj.searchParams.get('error_description') || error;
        console.error('❌ [OAuth21] Authorization error:', errorDesc);
        pending.reject(new Error(`授权失败: ${errorDesc}`));
        this.pendingAuths.delete(state);
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        return;
      }

      // 获取authorization code
      const code = urlObj.searchParams.get('code');
      const returnedState = urlObj.searchParams.get('state');

      if (!code) {
        console.error('❌ [OAuth21] No authorization code in callback');
        pending.reject(new Error('授权失败: 未收到授权码'));
        this.pendingAuths.delete(state);
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        return;
      }

      // 验证state
      if (returnedState !== state) {
        console.error('❌ [OAuth21] State mismatch');
        pending.reject(new Error('授权失败: State验证失败'));
        this.pendingAuths.delete(state);
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        return;
      }

      console.log('🔑 [OAuth21] Authorization code received, exchanging for token...');

      // 用code换取access token
      const tokens = await this.exchangeCodeForToken(
        code,
        pending.codeVerifier,
        tokenEndpoint,
        clientCredentials,
        resourceUri,
        redirectUri
      );

      console.log('✅ [OAuth21] Access token received');

      // 清理并关闭
      this.pendingAuths.delete(state);
      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }

      pending.resolve(tokens);

    } catch (error: any) {
      console.error('❌ [OAuth21] Callback handling failed:', error);
      const pending = this.pendingAuths.get(state);
      if (pending) {
        pending.reject(error);
        this.pendingAuths.delete(state);
      }
    }
  }

  /**
   * 用authorization code换取access token
   */
  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    tokenEndpoint: string,
    clientCredentials: OAuthClientCredentials,
    resourceUri: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    console.log('🔄 [OAuth21] Exchanging code for token...');
    console.log('   Token Endpoint:', tokenEndpoint);

    // 构建表单数据
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', clientCredentials.clientId);
    params.append('code_verifier', codeVerifier);
    // RFC 8707 - Resource Indicators (必需!)
    params.append('resource', resourceUri);

    // 如果有client_secret，添加到请求中
    if (clientCredentials.clientSecret) {
      params.append('client_secret', clientCredentials.clientSecret);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    console.log('📡 [OAuth21] Token response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [OAuth21] Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokens: OAuthTokens = await response.json();
    console.log('✅ [OAuth21] Tokens received');
    console.log('   Token type:', tokens.token_type);
    console.log('   Expires in:', tokens.expires_in || 'unknown');
    console.log('   Has refresh token:', !!tokens.refresh_token);

    return tokens;
  }

  /**
   * 刷新access token
   */
  async refreshToken(
    refreshToken: string,
    tokenEndpoint: string,
    clientCredentials: OAuthClientCredentials,
    resourceUri: string
  ): Promise<OAuthTokens> {
    console.log('🔄 [OAuth21] Refreshing access token...');

    // 构建表单数据
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientCredentials.clientId);
    // RFC 8707 - Resource Indicators (必需!)
    params.append('resource', resourceUri);

    if (clientCredentials.clientSecret) {
      params.append('client_secret', clientCredentials.clientSecret);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [OAuth21] Token refresh failed:', errorText);
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const tokens: OAuthTokens = await response.json();
    console.log('✅ [OAuth21] Token refreshed successfully');
    return tokens;
  }

  // ==================== 辅助函数 ====================

  /**
   * 解析WWW-Authenticate header (RFC 9728)
   */
  private parseWWWAuthenticate(header: string): {
    scheme: string;
    realm?: string;
    error?: string;
    error_description?: string;
    resource_metadata?: string;
  } | null {
    try {
      const parts = header.trim().split(/\s+/, 2);
      if (parts.length < 1) return null;

      const scheme = parts[0];
      if (scheme.toLowerCase() !== 'bearer') return null;

      const challenge: any = { scheme };

      if (parts.length > 1) {
        const params = parts[1];
        const paramRegex = /(\w+)="([^"]*)"/g;
        let match;

        while ((match = paramRegex.exec(params)) !== null) {
          const key = match[1];
          const value = match[2];

          if (key === 'realm') challenge.realm = value;
          else if (key === 'error') challenge.error = value;
          else if (key === 'error_description') challenge.error_description = value;
          else if (key === 'resource_metadata') challenge.resource_metadata = value;
        }
      }

      return challenge;
    } catch (error) {
      logger.error('Failed to parse WWW-Authenticate header:', error);
      return null;
    }
  }

  /**
   * 获取规范资源URI (RFC 8707)
   */
  private getCanonicalResourceUri(mcpServerUrl: string): string {
    try {
      const url = new URL(mcpServerUrl);

      // 规范化: 小写scheme和host
      let canonical = url.protocol.toLowerCase() + '//' + url.hostname.toLowerCase();

      // 添加非默认端口
      if (url.port) {
        const defaultPort = url.protocol === 'https:' ? '443' : '80';
        if (url.port !== defaultPort) {
          canonical += ':' + url.port;
        }
      }

      // 添加路径(如果有且不是只有/)
      if (url.pathname && url.pathname !== '/') {
        canonical += url.pathname.replace(/\/$/, '');
      }

      return canonical;
    } catch (error) {
      logger.error('Failed to parse MCP server URL:', error);
      throw new Error(`Invalid MCP server URL: ${mcpServerUrl}`);
    }
  }

  /**
   * 生成PKCE code_verifier
   */
  private generateCodeVerifier(): string {
    return randomBytes(64)
      .toString('base64url')
      .slice(0, 128);
  }

  /**
   * 生成PKCE code_challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const hash = createHash('sha256');
    hash.update(verifier);
    return hash.digest('base64url');
  }

  /**
   * 生成state参数(防CSRF)
   */
  private generateState(): string {
    return randomBytes(32).toString('base64url');
  }
}

export const oauth21Manager = new OAuth21Manager();
