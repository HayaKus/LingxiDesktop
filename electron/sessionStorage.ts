/**
 * 会话持久化存储
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from './sessionManager';
import { logger } from './logger';

const SESSIONS_FILE = path.join(app.getPath('userData'), 'sessions.json');

/**
 * 保存所有会话到本地
 */
export async function saveSessions(sessions: Session[]): Promise<void> {
  try {
    const data = JSON.stringify(sessions, null, 2);
    await fs.promises.writeFile(SESSIONS_FILE, data, 'utf-8');
    logger.info(`💾 Saved ${sessions.length} sessions to disk`);
  } catch (error) {
    logger.error('❌ Failed to save sessions:', error);
    throw error;
  }
}

/**
 * 从本地加载所有会话
 */
export async function loadSessions(): Promise<Session[]> {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      logger.info('📂 No sessions file found, starting fresh');
      return [];
    }

    const data = await fs.promises.readFile(SESSIONS_FILE, 'utf-8');
    const sessions = JSON.parse(data) as Session[];
    logger.info(`📂 Loaded ${sessions.length} sessions from disk`);
    return sessions;
  } catch (error) {
    logger.error('❌ Failed to load sessions:', error);
    return [];
  }
}

/**
 * 清空所有会话
 */
export async function clearSessions(): Promise<void> {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      await fs.promises.unlink(SESSIONS_FILE);
      logger.info('🗑️ Cleared sessions file');
    }
  } catch (error) {
    logger.error('❌ Failed to clear sessions:', error);
    throw error;
  }
}
