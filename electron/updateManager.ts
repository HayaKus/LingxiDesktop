/**
 * 更新管理器
 * 负责检测应用更新
 */
import log from 'electron-log';
import { app } from 'electron';
import https from 'https';
import http from 'http';

export interface VersionInfo {
  version: string;
  releaseDate: string;
  downloadUrl: string;
  changeLog: string[];
  minVersion?: string; // 最低兼容版本
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  versionInfo?: VersionInfo;
  error?: string;
}

export class UpdateManager {
  private updateUrl: string;

  constructor(updateUrl?: string) {
    // 默认使用 GitHub Raw 地址,你可以替换为自己的服务器
    this.updateUrl = updateUrl || 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/version.json';
  }

  /**
   * 设置更新服务器地址
   */
  setUpdateUrl(url: string) {
    this.updateUrl = url;
    log.info('✅ Update URL set to:', url);
  }

  /**
   * 获取当前应用版本
   */
  getCurrentVersion(): string {
    return app.getVersion();
  }

  /**
   * 比较版本号
   * @returns 1: v1 > v2, -1: v1 < v2, 0: v1 === v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    const maxLength = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    
    return 0;
  }

  /**
   * 从远程获取版本信息
   */
  private async fetchVersionInfo(): Promise<VersionInfo> {
    return new Promise((resolve, reject) => {
      const isHttps = this.updateUrl.startsWith('https://');
      const client = isHttps ? https : http;
      
      log.info('🔍 Checking for updates from:', this.updateUrl);
      
      client.get(this.updateUrl, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
              return;
            }
            
            const versionInfo = JSON.parse(data) as VersionInfo;
            log.info('✅ Version info fetched:', versionInfo.version);
            resolve(versionInfo);
          } catch (error) {
            reject(new Error('Failed to parse version info: ' + error));
          }
        });
      }).on('error', (error) => {
        reject(new Error('Network error: ' + error.message));
      });
    });
  }

  /**
   * 检测更新
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = this.getCurrentVersion();
    
    try {
      const versionInfo = await this.fetchVersionInfo();
      const latestVersion = versionInfo.version;
      
      const comparison = this.compareVersions(latestVersion, currentVersion);
      const hasUpdate = comparison > 0;
      
      if (hasUpdate) {
        log.info('🎉 New version available:', latestVersion, '(current:', currentVersion + ')');
      } else {
        log.info('✅ Already on the latest version:', currentVersion);
      }
      
      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        versionInfo,
      };
    } catch (error) {
      log.error('❌ Failed to check for updates:', error);
      return {
        hasUpdate: false,
        currentVersion,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 静默检测更新(应用启动时)
   */
  async silentCheckForUpdates(): Promise<UpdateCheckResult> {
    log.info('🔍 Silently checking for updates...');
    return this.checkForUpdates();
  }
}

// 导出单例
export const updateManager = new UpdateManager();
