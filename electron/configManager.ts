/**
 * 配置管理器
 * 负责管理应用配置和用户会话
 */
import Store from 'electron-store';
import log from 'electron-log';
import { BucAuthService, BucUserInfo, UserSession } from './bucAuth';

interface StoreSchema {
  apiKey: string;
  model: string;
  shortcut: string;
  session?: UserSession;  // 完整的会话信息（包含 token）
  userInfo?: BucUserInfo; // 兼容旧版本
}

export class ConfigManager {
  private store: Store<StoreSchema>;
  private bucAuth: BucAuthService;

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        apiKey: '',
        model: 'qwen-vl-max-latest',
        shortcut: 'CommandOrControl+Shift+0',
      },
    });
    
    this.bucAuth = new BucAuthService();
  }

  /**
   * 获取配置
   */
  getConfig(): StoreSchema {
    return this.store.store;
  }

  /**
   * 保存配置
   */
  saveConfig(config: Partial<StoreSchema>): void {
    this.store.set(config);
    log.info('Config saved:', config);
  }

  /**
   * 获取用户信息
   */
  getUserInfo(): BucUserInfo | null {
    const userInfo = this.store.get('userInfo');
    return userInfo || null;
  }

  /**
   * 初始化 BUC 认证
   * 检查会话状态，必要时刷新或重新登录
   */
  async initializeBucAuth(): Promise<void> {
    try {
      const savedSession = this.store.get('session');
      const savedUser = this.store.get('userInfo');
      
      if (savedSession && savedSession.tokenInfo) {
        // 有完整的会话信息
        log.info('📋 检测到已保存的会话信息');
        
        // 检查 token 是否过期
        if (this.bucAuth.isTokenExpired(savedSession.tokenInfo)) {
          log.info('⏰ Token 已过期，尝试刷新...');
          
          // 尝试使用 refresh_token 刷新
          if (savedSession.tokenInfo.refresh_token) {
            try {
              const newTokenInfo = await this.bucAuth.refreshAccessToken(savedSession.tokenInfo.refresh_token);
              
              // 更新会话信息
              const newSession: UserSession = {
                userInfo: savedSession.userInfo,
                tokenInfo: newTokenInfo,
              };
              this.store.set('session', newSession);
              
              log.info('✅ Token 刷新成功，有效期至:', new Date(newTokenInfo.token_created_at + newTokenInfo.expires_in * 1000).toISOString());
            } catch (refreshError) {
              log.error('❌ Token 刷新失败，需要重新登录:', refreshError);
              
              // 刷新失败，重新登录
              await this.performLogin();
            }
          } else {
            log.warn('⚠️ 没有 refresh_token，需要重新登录');
            await this.performLogin();
          }
        } else {
          log.info('✅ Token 仍然有效，有效期至:', new Date(savedSession.tokenInfo.token_created_at + savedSession.tokenInfo.expires_in * 1000).toISOString());
        }
      } else if (savedUser) {
        // 只有旧版本的用户信息，没有 token（兼容旧版本）
        log.info('⚠️ 检测到旧版本用户信息，需要重新登录以获取 token');
        await this.performLogin();
      } else {
        // 首次登录
        log.info('🔐 未检测到登录信息，启动 BUC 登录流程...');
        await this.performLogin();
      }
    } catch (error) {
      log.error('❌ BUC 登录失败:', error);
      // 登录失败也继续启动应用（开发阶段）
    }
  }

  /**
   * 执行登录
   */
  private async performLogin(): Promise<void> {
    const session = await this.bucAuth.login();
    this.store.set('session', session);
    this.store.set('userInfo', session.userInfo);
    log.info('✅ 登录成功');
  }

  /**
   * 手动登录
   */
  async login(): Promise<BucUserInfo> {
    log.info('🔐 手动触发 BUC 登录...');
    const session = await this.bucAuth.login();
    this.store.set('session', session);
    this.store.set('userInfo', session.userInfo);
    log.info('✅ 登录成功:', session.userInfo);
    return session.userInfo;
  }

  /**
   * 退出登录
   */
  logout(): void {
    log.info('👋 退出登录');
    this.store.delete('session');
    this.store.delete('userInfo');
    this.bucAuth.cleanup();
  }

  /**
   * 获取 API Key
   */
  getApiKey(): string {
    return this.store.get('apiKey') || '';
  }
}
