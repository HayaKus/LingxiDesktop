/**
 * 自动保存管理器
 * 负责定期保存会话数据
 */
import log from 'electron-log';
import { sessionManager } from './sessionManager';
import { saveSessions } from './sessionStorage';

export class AutoSaveManager {
  private saveInterval: NodeJS.Timeout | null = null;
  private readonly SAVE_INTERVAL = 30000; // 30秒

  /**
   * 启动自动保存
   */
  start(): void {
    this.saveInterval = setInterval(async () => {
      try {
        const sessions = sessionManager.getAllSessions();
        await saveSessions(sessions);
        log.info(`💾 Auto-saved ${sessions.length} sessions`);
      } catch (error) {
        log.error('❌ Auto-save failed:', error);
      }
    }, this.SAVE_INTERVAL);
    
    log.info('✅ Auto-save started (every 30s)');
  }

  /**
   * 停止自动保存
   */
  stop(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      log.info('Auto-save stopped');
    }
  }

  /**
   * 立即保存
   */
  async saveNow(): Promise<void> {
    try {
      const sessions = sessionManager.getAllSessions();
      await saveSessions(sessions);
      log.info(`💾 Saved ${sessions.length} sessions`);
    } catch (error) {
      log.error('❌ Save failed:', error);
      throw error;
    }
  }
}
