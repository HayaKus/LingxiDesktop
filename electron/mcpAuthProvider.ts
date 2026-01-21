// 不需要导入SDK类型，直接使用any类型定义即可
import { oauth21Manager } from './oauthManager';
import { logger } from './logger';

// OAuth配置接口（本地定义）
interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  redirectUri: string;
}

// 类型定义（用any避免复杂的SDK导入）
type OAuthClientProvider = any;
type OAuthClientMetadata = any;
type OAuthTokens = any;
type OAuthClientInformationMixed = any;

/**
 * 自定义OAuth认证提供者 - 桥接SDK和现有的oauthManager
 * 
 * 实现SDK的OAuthClientProvider接口，但内部委托给现有的oauthManager
 * 这样可以保持现有的OAuth 2.1 PKCE实现完全不变
 */
export class CustomAuthProvider implements OAuthClientProvider {
  private oauthConfig: OAuthConfig;
  private _tokens: OAuthTokens | null = null;
  private _codeVerifier: string | null = null;

  constructor(oauthConfig: OAuthConfig, existingTokens?: { access_token: string; token_type: string; refresh_token?: string; expires_in?: number }) {
    this.oauthConfig = oauthConfig;
    
    // 如果有现有token，设置它
    if (existingTokens) {
      this._tokens = {
        access_token: existingTokens.access_token,
        token_type: existingTokens.token_type,
        refresh_token: existingTokens.refresh_token,
        expires_in: existingTokens.expires_in
      };
    }
  }

  /**
   * SDK要求：返回重定向URL
   */
  get redirectUrl(): string | URL {
    return this.oauthConfig.redirectUri;
  }

  /**
   * SDK要求：返回OAuth客户端元数据
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'lingxi',
      redirect_uris: [this.oauthConfig.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none', // Public client (PKCE)
      scope: this.oauthConfig.scopes.join(' ')
    };
  }

  /**
   * SDK要求：返回客户端信息（用于动态注册）
   * 我们不需要动态注册，返回undefined即可
   */
  clientInformation(): OAuthClientInformationMixed | undefined {
    // 如果配置了clientId，返回它
    if (this.oauthConfig.clientId) {
      return {
        client_id: this.oauthConfig.clientId,
        client_secret: this.oauthConfig.clientSecret
      };
    }
    return undefined;
  }

  /**
   * SDK要求：返回现有的token
   */
  tokens(): OAuthTokens | undefined {
    return this._tokens || undefined;
  }

  /**
   * SDK要求：保存新的token
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    logger.info('💾 [CustomAuthProvider] Saving tokens');
    this._tokens = tokens;
  }

  /**
   * SDK要求：重定向到授权URL
   * 我们委托给现有的oauthManager
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    logger.info('🔐 [CustomAuthProvider] Starting OAuth authorization flow');
    console.log('🌐 [CustomAuthProvider] Authorization URL:', authorizationUrl.toString());
    
    try {
      // 注意：这个方法需要根据oauth21Manager的实际API进行调整
      // 暂时抛出错误，因为oauth21Manager没有直接的authorize方法接受OAuthConfig
      throw new Error('OAuth authorization not implemented for oauth21Manager');
    } catch (error) {
      logger.error('❌ [CustomAuthProvider] OAuth authorization failed', error);
      throw error;
    }
  }

  /**
   * SDK要求：保存PKCE code verifier
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
    logger.info('🔑 [CustomAuthProvider] Code verifier saved');
  }

  /**
   * SDK要求：获取PKCE code verifier
   */
  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('No code verifier available');
    }
    return this._codeVerifier;
  }

  /**
   * SDK要求：生成state参数（防CSRF）
   */
  state(): string {
    // 生成随机state
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 获取访问令牌（便捷方法）
   */
  getAccessToken(): string | undefined {
    return this._tokens?.access_token;
  }

  /**
   * 设置已有的token（用于恢复会话）
   */
  setTokens(tokens: { access_token: string; token_type: string; refresh_token?: string; expires_in?: number }): void {
    this._tokens = {
      access_token: tokens.access_token,
      token_type: tokens.token_type,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in
    };
    logger.info('✅ [CustomAuthProvider] Existing tokens loaded');
  }
}
