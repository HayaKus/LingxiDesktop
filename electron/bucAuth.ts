/**
 * BUC OAuth 2.0 登录认证模块
 * 使用标准 OAuth 2.0 授权码流程
 * 
 * 流程：
 * 1. 打开浏览器访问 BUC OAuth 授权页面
 * 2. 用户登录并授权后，BUC 重定向到本地回调地址并带上 code
 * 3. 本地 HTTP 服务器接收 code
 * 4. 使用 code 换取 access_token
 * 5. 使用 access_token 获取用户信息
 */

import http from 'http';
import { parse } from 'url';
import { shell } from 'electron';
import log from 'electron-log';

export interface BucUserInfo {
  workid: string;      // 工号
  name: string;        // 花名
  email: string;       // 邮箱
  cname?: string;      // 中文名
  empId?: string;      // 员工ID
  accountId?: number;  // 账号ID
}

export interface TokenInfo {
  access_token: string;
  refresh_token?: string;
  expires_in: number;        // 过期时间（秒）
  token_created_at: number;  // token创建时间戳
  token_type: string;        // 通常是 "Bearer"
}

export interface UserSession {
  userInfo: BucUserInfo;
  tokenInfo: TokenInfo;
}

export class BucAuthService {
  private server: http.Server | null = null;
  private readonly CALLBACK_PORT = 8888;
  
  // BUC OAuth 2.0 配置
  private readonly config = {
    clientId: 'taobao-vrobot',  // 应用名称（client_id）
    clientSecret: 'a2a91724-3847-4e1c-88fe-968298b3b7ff',  // ClientKey（client_secret）
    // 日常环境
    authUrl: 'https://login-test.alibaba-inc.com/oauth2/auth.htm',
    tokenUrl: 'https://login-test.alibaba-inc.com/rpc/oauth2/access_token.json',
    userInfoUrl: 'https://login-test.alibaba-inc.com/rpc/oauth2/user_info.json',
    // 线上环境（需要时切换）
    // authUrl: 'https://login.alibaba-inc.com/oauth2/auth.htm',
    // tokenUrl: 'https://login.alibaba-inc.com/rpc/oauth2/access_token.json',
    // userInfoUrl: 'https://login.alibaba-inc.com/rpc/oauth2/user_info.json',
  };

  /**
   * 启动登录流程，返回完整的会话信息
   */
  async login(): Promise<UserSession> {
    try {
      log.info('🔐 开始 BUC OAuth 2.0 登录流程...');
      
      // 1. 启动本地回调服务器，获取授权码 code
      const code = await this.startAuthServer();
      log.info('✅ 获取到授权码:', code);
      
      // 2. 使用 code 换取 token 信息
      const tokenInfo = await this.getAccessToken(code);
      log.info('✅ 获取到 token 信息');
      
      // 3. 使用 access_token 获取用户信息
      const userInfo = await this.getUserInfo(tokenInfo.access_token);
      
      const session: UserSession = {
        userInfo,
        tokenInfo,
      };
      
      log.info('✅ BUC 登录成功:', {
        user: userInfo.name,
        tokenExpires: new Date(tokenInfo.token_created_at + tokenInfo.expires_in * 1000).toISOString(),
      });
      
      return session;
    } catch (error) {
      log.error('❌ BUC 登录失败:', error);
      throw error;
    }
  }

  /**
   * 启动本地 HTTP 服务器监听回调
   */
  private async startAuthServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      // 创建 HTTP 服务器
      this.server = http.createServer((req, res) => {
        const { pathname, query } = parse(req.url || '', true);
        
        log.info('📥 收到回调请求:', pathname, query);
        
        // 处理回调
        if (pathname === '/callback') {
          const code = query.code as string;
          const error = query.error as string;
          
          if (code) {
            // 返回成功页面
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <title>登录成功</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: #FFF9E6;
                  }
                  .container {
                    text-align: center;
                    background: white;
                    padding: 50px 60px;
                    border-radius: 16px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                  }
                  h1 {
                    color: #FF9800;
                    margin-bottom: 20px;
                    font-size: 32px;
                    font-weight: 600;
                  }
                  p {
                    color: #666;
                    font-size: 16px;
                    line-height: 1.6;
                  }
                  .success-icon {
                    font-size: 80px;
                    margin-bottom: 20px;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="success-icon">✅</div>
                  <h1>登录成功！</h1>
                  <p>您可以关闭此页面，返回桌面伙伴应用</p>
                </div>
              </body>
              </html>
            `);
            
            // 关闭服务器
            setTimeout(() => {
              this.server?.close();
              resolve(code);
            }, 1000);
          } else {
            // 返回错误页面
            const errorMsg = error || '未知错误';
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <title>授权失败</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                  }
                  .container {
                    text-align: center;
                    background: white;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                  }
                  h1 {
                    color: #f5576c;
                    margin-bottom: 20px;
                  }
                  p {
                    color: #666;
                    font-size: 16px;
                  }
                  .error-icon {
                    font-size: 60px;
                    margin-bottom: 20px;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="error-icon">❌</div>
                  <h1>授权失败</h1>
                  <p>错误：${errorMsg}</p>
                </div>
              </body>
              </html>
            `);
            
            this.server?.close();
            reject(new Error(`授权失败: ${errorMsg}`));
          }
        }
      });

      // 监听端口
      this.server.listen(this.CALLBACK_PORT, () => {
        log.info(`🚀 回调服务器启动成功: http://localhost:${this.CALLBACK_PORT}`);
        
        // 打开浏览器进行授权
        this.openAuthPage();
      });

      // 错误处理
      this.server.on('error', (error) => {
        log.error('❌ 回调服务器启动失败:', error);
        reject(error);
      });

      // 超时处理（5分钟）
      setTimeout(() => {
        if (this.server) {
          this.server.close();
          reject(new Error('授权超时，请重试'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * 打开浏览器授权页面
   */
  private openAuthPage() {
    const redirectUri = `http://localhost:${this.CALLBACK_PORT}/callback`;
    
    // 构建 OAuth 2.0 授权 URL
    const authUrl = 
      `${this.config.authUrl}?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(this.config.clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent('profile')}&` +
      `state=${Date.now()}`;  // 使用时间戳作为 state
    
    log.info('🌐 打开授权页面:', authUrl);
    log.info('📋 回调地址:', redirectUri);
    
    // 打开系统默认浏览器
    shell.openExternal(authUrl);
  }

  /**
   * 使用授权码换取 token 信息
   */
  private async getAccessToken(code: string): Promise<TokenInfo> {
    try {
      log.info('📡 使用授权码换取 token...');
      
      const redirectUri = `http://localhost:${this.CALLBACK_PORT}/callback`;
      
      // 构建请求参数
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`获取 token 失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`获取 token 失败: ${data.error} - ${data.error_description}`);
      }

      // 构建 TokenInfo
      const tokenInfo: TokenInfo = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in || 7200,  // 默认2小时
        token_created_at: Date.now(),
        token_type: data.token_type || 'Bearer',
      };

      return tokenInfo;
    } catch (error) {
      log.error('❌ 获取 token 失败:', error);
      throw error;
    }
  }

  /**
   * 使用 refresh_token 刷新 access_token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenInfo> {
    try {
      log.info('🔄 使用 refresh_token 刷新 access_token...');
      
      // 构建请求参数
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`刷新 token 失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`刷新 token 失败: ${data.error} - ${data.error_description}`);
      }

      // 构建新的 TokenInfo
      const tokenInfo: TokenInfo = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,  // 如果没有返回新的，使用旧的
        expires_in: data.expires_in || 7200,
        token_created_at: Date.now(),
        token_type: data.token_type || 'Bearer',
      };

      log.info('✅ Token 刷新成功');
      return tokenInfo;
    } catch (error) {
      log.error('❌ Token 刷新失败:', error);
      throw error;
    }
  }

  /**
   * 检查 token 是否过期
   * 提前5分钟判定为过期，留出刷新时间
   */
  isTokenExpired(tokenInfo: TokenInfo): boolean {
    const now = Date.now();
    const expiresAt = tokenInfo.token_created_at + (tokenInfo.expires_in * 1000);
    const bufferTime = 5 * 60 * 1000;  // 5分钟缓冲
    
    return now >= (expiresAt - bufferTime);
  }

  /**
   * 使用 access_token 获取用户信息
   */
  private async getUserInfo(accessToken: string): Promise<BucUserInfo> {
    try {
      log.info('📡 使用 access_token 获取用户信息...');
      
      // 构建请求参数
      const params = new URLSearchParams({
        access_token: accessToken,
      });

      const response = await fetch(`${this.config.userInfoUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`获取用户信息失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`获取用户信息失败: ${data.error} - ${data.error_description}`);
      }

      // 解析用户信息（scope=profile 返回的字段）
      const userInfo: BucUserInfo = {
        accountId: data.account_id,
        workid: data.emp_id || '',
        name: data.name || '',
        email: data.account ? `${data.account}@alibaba-inc.com` : '',
        cname: data.name || '',
        empId: data.emp_id || '',
      };

      // 如果有 nickname，使用 nickname 作为花名
      if (data.nickname) {
        userInfo.name = data.nickname;
      }

      return userInfo;
    } catch (error) {
      log.error('❌ 获取用户信息失败:', error);
      
      // 如果 API 调用失败，返回模拟数据（开发阶段）
      log.warn('⚠️ 使用模拟用户数据');
      return {
        workid: '263321',
        name: '哈雅',
        email: 'haya.lhw@alibaba-inc.com',
        cname: '林x伟',
        empId: '263321',
        accountId: 263321,
      };
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
