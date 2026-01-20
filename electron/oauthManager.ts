import { BrowserWindow, shell } from 'electron';
import { randomBytes, createHash } from 'crypto';
import { logger } from './logger';

export interface OAuthConfig {
  authUrl: string;      // 授权端点
  tokenUrl: string;     // Token端点
  clientId: string;     // 客户端ID
  clientSecret?: string; // 客户端密钥（可选，公开客户端不需要）
  scopes: string[];     // 权限范围
  redirectUri: string;  // 重定向URI
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

class OAuthManager {
  // 存储正在进行的授权流程
  private pendingAuths: Map<string, {
    codeVerifier: string;
    resolve: (tokens: OAuthTokens) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // 生成PKCE code_verifier
  private generateCodeVerifier(): string {
    return randomBytes(64)
      .toString('base64url')
      .slice(0, 128);
  }

  // 生成PKCE code_challenge
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const hash = createHash('sha256');
    hash.update(verifier);
    return hash.digest('base64url');
  }

  // 生成state参数（防CSRF）
  private generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * 发起OAuth 2.1授权流程（使用PKCE）
   */
  async authorize(config: OAuthConfig): Promise<OAuthTokens> {
    console.log('🔐 [OAuth] Starting authorization flow...');
    console.log('   Auth URL:', config.authUrl);
    console.log('   Client ID:', config.clientId);
    console.log('   Scopes:', config.scopes.join(', '));

    return new Promise(async (resolve, reject) => {
      try {
        // 1. 生成PKCE参数
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const state = this.generateState();

        console.log('   Code Challenge:', codeChallenge.substring(0, 20) + '...');
        console.log('   State:', state.substring(0, 20) + '...');

        // 保存授权流程信息
        this.pendingAuths.set(state, { codeVerifier, resolve, reject });

        // 2. 构建授权URL
        const authUrl = new URL(config.authUrl);
        authUrl.searchParams.set('client_id', config.clientId);
        authUrl.searchParams.set('redirect_uri', config.redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('scope', config.scopes.join(' '));
        authUrl.searchParams.set('state', state);

        console.log('🌐 [OAuth] Opening authorization window...');
        console.log('   URL:', authUrl.toString());

        // 3. 打开授权窗口
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

        // 4. 监听URL变化（捕获重定向）
        authWindow.webContents.on('will-redirect', async (event, url) => {
          console.log('🔄 [OAuth] Redirect detected:', url);
          await this.handleCallback(url, config, state, authWindow);
        });

        // 也监听导航完成（有些授权服务器使用这种方式）
        authWindow.webContents.on('did-navigate', async (event, url) => {
          console.log('🔄 [OAuth] Navigation detected:', url);
          await this.handleCallback(url, config, state, authWindow);
        });

        // 监听窗口关闭
        authWindow.on('closed', () => {
          const pending = this.pendingAuths.get(state);
          if (pending) {
            console.log('❌ [OAuth] Authorization window closed by user');
            pending.reject(new Error('用户取消了授权'));
            this.pendingAuths.delete(state);
          }
        });

        // 超时处理（5分钟）
        setTimeout(() => {
          const pending = this.pendingAuths.get(state);
          if (pending) {
            console.log('⏱️ [OAuth] Authorization timeout');
            pending.reject(new Error('授权超时'));
            this.pendingAuths.delete(state);
            if (!authWindow.isDestroyed()) {
              authWindow.close();
            }
          }
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error('❌ [OAuth] Authorization failed:', error);
        reject(error);
      }
    });
  }

  /**
   * 处理OAuth回调
   */
  private async handleCallback(
    url: string,
    config: OAuthConfig,
    state: string,
    authWindow: BrowserWindow
  ) {
    try {
      const urlObj = new URL(url);
      
      // 检查是否是回调URL
      if (!url.startsWith(config.redirectUri)) {
        return;
      }

      console.log('✅ [OAuth] Callback received');
      
      const pending = this.pendingAuths.get(state);
      if (!pending) {
        console.error('❌ [OAuth] No pending authorization found for state:', state);
        return;
      }

      // 检查错误
      const error = urlObj.searchParams.get('error');
      if (error) {
        const errorDesc = urlObj.searchParams.get('error_description') || error;
        console.error('❌ [OAuth] Authorization error:', errorDesc);
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
        console.error('❌ [OAuth] No authorization code in callback');
        pending.reject(new Error('授权失败: 未收到授权码'));
        this.pendingAuths.delete(state);
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        return;
      }

      // 验证state（防CSRF）
      if (returnedState !== state) {
        console.error('❌ [OAuth] State mismatch');
        pending.reject(new Error('授权失败: State验证失败'));
        this.pendingAuths.delete(state);
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        return;
      }

      console.log('🔑 [OAuth] Authorization code received, exchanging for token...');

      // 关闭授权窗口
      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }

      // 5. 用code换取access token
      const tokens = await this.exchangeCodeForToken(
        code,
        pending.codeVerifier,
        config
      );

      console.log('✅ [OAuth] Access token received');
      console.log('   Token type:', tokens.token_type);
      console.log('   Expires in:', tokens.expires_in || 'unknown');
      console.log('   Has refresh token:', !!tokens.refresh_token);

      pending.resolve(tokens);
      this.pendingAuths.delete(state);

    } catch (error: any) {
      console.error('❌ [OAuth] Callback handling failed:', error);
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
    config: OAuthConfig
  ): Promise<OAuthTokens> {
    console.log('🔄 [OAuth] Exchanging code for token...');
    console.log('   Token URL:', config.tokenUrl);

    const body: any = {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier
    };

    // 如果有client_secret，添加到请求中
    if (config.clientSecret) {
      body.client_secret = config.clientSecret;
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('📡 [OAuth] Token response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [OAuth] Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokens: OAuthTokens = await response.json();
    return tokens;
  }

  /**
   * 刷新access token
   */
  async refreshToken(
    refreshToken: string,
    config: OAuthConfig
  ): Promise<OAuthTokens> {
    console.log('🔄 [OAuth] Refreshing access token...');

    const body: any = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId
    };

    if (config.clientSecret) {
      body.client_secret = config.clientSecret;
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [OAuth] Token refresh failed:', errorText);
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const tokens: OAuthTokens = await response.json();
    console.log('✅ [OAuth] Token refreshed successfully');
    return tokens;
  }
}

export const oauthManager = new OAuthManager();
