/**
 * 主进程日志工具 - 同时输出到控制台和文件
 * 支持日志轮转：
 * - app.log (当前日志，最大10MB)
 * - app.log.1 (上一个，最大10MB)
 * - app.log.2 (更早的，最大10MB)
 * 总共保留3个文件，最多30MB
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private logFilePath: string;
  private logStream: fs.WriteStream | null = null;
  private readonly MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_LOG_FILES = 3; // 保留3个日志文件
  
  constructor() {
    // 日志文件路径: ~/Library/Logs/灵析/app.log
    const logsDir = path.join(app.getPath('logs'));
    
    // 确保日志目录存在
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // 日志文件路径
    this.logFilePath = path.join(logsDir, 'app.log');
    
    // 检查日志文件大小，如果需要则轮转
    this.rotateLogsIfNeeded();
    
    // 创建写入流（追加模式）
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    
    // 启动时输出日志文件位置
    const startMessage = `\n${'='.repeat(80)}\n📝 灵析日志 - ${new Date().toLocaleString('zh-CN')}\n📂 日志文件: ${this.logFilePath}\n📊 日志限制: 最多${this.MAX_LOG_FILES}个文件，每个最大${this.MAX_LOG_SIZE / 1024 / 1024}MB\n${'='.repeat(80)}\n`;
    console.log(startMessage);
    this.logStream.write(startMessage);
  }
  
  // 检查并轮转日志文件
  private rotateLogsIfNeeded() {
    try {
      // 检查当前日志文件大小
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        
        if (stats.size >= this.MAX_LOG_SIZE) {
          console.log(`📦 日志文件超过${this.MAX_LOG_SIZE / 1024 / 1024}MB，开始轮转...`);
          
          // 删除最旧的日志文件
          const oldestLog = `${this.logFilePath}.${this.MAX_LOG_FILES - 1}`;
          if (fs.existsSync(oldestLog)) {
            fs.unlinkSync(oldestLog);
            console.log(`🗑️ 删除最旧日志: ${path.basename(oldestLog)}`);
          }
          
          // 移动现有日志文件
          for (let i = this.MAX_LOG_FILES - 2; i >= 1; i--) {
            const oldFile = `${this.logFilePath}.${i}`;
            const newFile = `${this.logFilePath}.${i + 1}`;
            if (fs.existsSync(oldFile)) {
              fs.renameSync(oldFile, newFile);
              console.log(`📝 移动日志: ${path.basename(oldFile)} → ${path.basename(newFile)}`);
            }
          }
          
          // 移动当前日志文件
          fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
          console.log(`📝 移动当前日志: app.log → app.log.1`);
          console.log(`✅ 日志轮转完成`);
        }
      }
    } catch (error) {
      console.error('❌ 日志轮转失败:', error);
    }
  }
  
  private log(level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // 输出到控制台
    switch (level) {
      case 'error':
        console.error(logMessage, data || '');
        break;
      case 'warn':
        console.warn(logMessage, data || '');
        break;
      case 'debug':
        console.debug(logMessage, data || '');
        break;
      default:
        console.log(logMessage, data || '');
    }
    
    // 写入到文件
    if (this.logStream) {
      let fileMessage = logMessage;
      if (data) {
        if (typeof data === 'object') {
          fileMessage += '\n' + JSON.stringify(data, null, 2);
        } else {
          fileMessage += ' ' + data;
        }
      }
      this.logStream.write(fileMessage + '\n');
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }
  
  // 获取日志文件路径
  getLogFilePath(): string {
    return this.logFilePath;
  }
  
  // 关闭日志流
  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

export const logger = new Logger();
