/**
 * 日志工具
 * 将日志同时输出到控制台和文件
 */

// 日志级别
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// 日志条目
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // 最多保留1000条日志

  /**
   * 格式化时间戳
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 23);
  }

  /**
   * 添加日志条目
   */
  private addLog(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 同时输出到控制台
    const consoleMessage = `[${entry.timestamp}] [${level.toUpperCase()}] ${message}`;
    
    switch (level) {
      case 'error':
        console.error(consoleMessage, data || '');
        break;
      case 'warn':
        console.warn(consoleMessage, data || '');
        break;
      case 'debug':
        console.debug(consoleMessage, data || '');
        break;
      default:
        console.log(consoleMessage, data || '');
    }

    // 写入文件（通过IPC）
    this.writeToFile(entry);
  }

  /**
   * 写入日志文件
   */
  private async writeToFile(entry: LogEntry) {
    try {
      const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${
        entry.data ? '\n' + JSON.stringify(entry.data, null, 2) : ''
      }\n`;

      // 通过electron API写入日志
      if (window.electronAPI?.writeLog) {
        await window.electronAPI.writeLog(logLine);
      }
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  /**
   * 信息日志
   */
  info(message: string, data?: any) {
    this.addLog('info', message, data);
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: any) {
    this.addLog('warn', message, data);
  }

  /**
   * 错误日志
   */
  error(message: string, data?: any) {
    this.addLog('error', message, data);
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: any) {
    this.addLog('debug', message, data);
  }

  /**
   * 获取所有日志
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clear() {
    this.logs = [];
  }

  /**
   * 导出日志为文本
   */
  exportAsText(): string {
    return this.logs
      .map(entry => {
        const dataStr = entry.data ? '\n' + JSON.stringify(entry.data, null, 2) : '';
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
      })
      .join('\n');
  }
}

// 单例
export const logger = new Logger();
