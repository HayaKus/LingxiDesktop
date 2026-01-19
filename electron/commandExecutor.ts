/**
 * 命令执行器
 * 
 * 职责：
 * 1. 执行命令
 * 2. 流式输出
 * 3. 错误处理
 * 4. 超时控制
 * 5. 进程管理
 */
import { spawn, exec, ChildProcess } from 'child_process';
import { logger } from './logger';
import { EventEmitter } from 'events';

/**
 * 命令执行结果
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

/**
 * 命令执行选项
 */
export interface CommandOptions {
  cwd?: string;                    // 工作目录
  env?: Record<string, string>;    // 环境变量
  timeout?: number;                // 超时时间（毫秒）
  shell?: boolean;                 // 是否使用 shell
  maxBuffer?: number;              // 最大缓冲区大小
}

/**
 * 命令执行器类
 */
export class CommandExecutor extends EventEmitter {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  
  /**
   * 执行命令（简单模式）
   * 适用于：快速执行、不需要实时输出的命令
   */
  async execute(
    command: string,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    
    logger.info(`📝 Executing command: ${command}`);
    
    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: options.cwd || process.cwd(),
          env: { ...process.env, ...options.env },
          timeout: options.timeout || 30000,
          maxBuffer: options.maxBuffer || 10 * 1024 * 1024, // 10MB
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;
          
          const result: CommandResult = {
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: error ? (error.code || 1) : 0,
            duration,
          };
          
          if (error) {
            logger.warn(`⚠️ Command failed with exit code ${result.exitCode}`);
          } else {
            logger.info(`✅ Command completed successfully in ${duration}ms`);
          }
          
          resolve(result);
        }
      );
    });
  }
  
  /**
   * 执行命令（流式模式）
   * 适用于：长时间运行、需要实时输出的命令
   */
  async executeStream(
    executionId: string,
    command: string,
    args: string[],
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    
    logger.info(`📝 Executing stream command: ${command} ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        shell: options.shell !== false,
      });
      
      // 保存进程引用（用于取消）
      this.runningProcesses.set(executionId, child);
      
      // 监听标准输出
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // 实时发送输出
        this.emit('stdout', executionId, output);
      });
      
      // 监听错误输出
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // 实时发送错误
        this.emit('stderr', executionId, output);
      });
      
      // 监听进程退出
      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        this.runningProcesses.delete(executionId);
        
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: code || 0,
          duration,
        };
        
        if (code === 0) {
          logger.info(`✅ Stream command completed successfully in ${duration}ms`);
        } else {
          logger.warn(`⚠️ Stream command failed with exit code ${code}`);
        }
        
        resolve(result);
      });
      
      // 监听错误
      child.on('error', (error) => {
        const duration = Date.now() - startTime;
        this.runningProcesses.delete(executionId);
        
        logger.error(`❌ Stream command error:`, error);
        
        reject({
          stdout,
          stderr: stderr + '\n' + error.message,
          exitCode: 1,
          duration,
        });
      });
      
      // 超时处理
      if (options.timeout) {
        setTimeout(() => {
          if (this.runningProcesses.has(executionId)) {
            logger.warn(`⏰ Command timeout, killing process: ${executionId}`);
            child.kill('SIGTERM');
            
            // 如果 SIGTERM 不起作用，5秒后强制 SIGKILL
            setTimeout(() => {
              if (this.runningProcesses.has(executionId)) {
                child.kill('SIGKILL');
              }
            }, 5000);
          }
        }, options.timeout);
      }
    });
  }
  
  /**
   * 取消命令执行
   */
  cancel(executionId: string): boolean {
    const child = this.runningProcesses.get(executionId);
    if (child) {
      logger.info(`🛑 Cancelling command: ${executionId}`);
      child.kill('SIGTERM');
      
      // 5秒后强制 SIGKILL
      setTimeout(() => {
        if (this.runningProcesses.has(executionId)) {
          child.kill('SIGKILL');
        }
      }, 5000);
      
      return true;
    }
    return false;
  }
  
  /**
   * 获取正在运行的命令列表
   */
  getRunningCommands(): string[] {
    return Array.from(this.runningProcesses.keys());
  }
  
  /**
   * 查找文件
   * 根据文件名、类名或内容查找文件位置
   */
  async findFile(
    query: string,
    fileType?: string,
    basePath?: string,
    maxResults: number = 10
  ): Promise<string[]> {
    const searchPath = basePath || '~/Code';
    const limit = Math.min(maxResults, 50); // 最大 50 个结果
    
    logger.info(`🔍 Finding files: query="${query}", type="${fileType || 'all'}", path="${searchPath}"`);
    
    try {
      // 构建查找命令
      let command: string;
      
      if (fileType) {
        // 有文件类型过滤
        command = `find ${searchPath} -name "*${fileType}" -type f 2>/dev/null | grep -i "${query}" | head -${limit}`;
      } else {
        // 无文件类型过滤
        command = `find ${searchPath} -type f 2>/dev/null | grep -i "${query}" | head -${limit}`;
      }
      
      const result = await this.execute(command, { timeout: 10000 });
      
      if (result.exitCode === 0 && result.stdout.trim()) {
        const files = result.stdout
          .trim()
          .split('\n')
          .filter(f => f.trim())
          .map(f => f.replace(/^~/, process.env.HOME || '~')); // 展开 ~
        
        logger.info(`✅ Found ${files.length} files`);
        return files;
      }
      
      logger.info(`ℹ️ No files found`);
      return [];
    } catch (error) {
      logger.error(`❌ Find file error:`, error);
      return [];
    }
  }
  
  /**
   * 智能读取文件
   * 先查找文件，如果只有一个则直接读取；如果有多个则返回列表
   */
  async smartRead(
    query: string,
    fileType?: string,
    basePath?: string
  ): Promise<{ type: 'content' | 'list'; data: string }> {
    logger.info(`📖 Smart reading: query="${query}", type="${fileType || 'all'}"`);
    
    try {
      // 1. 先查找文件
      const files = await this.findFile(query, fileType, basePath, 10);
      
      if (files.length === 0) {
        return {
          type: 'content',
          data: `❌ 未找到匹配的文件。\n\n搜索条件：\n- 关键词：${query}\n- 文件类型：${fileType || '所有类型'}\n- 搜索路径：${basePath || '~/Code'}\n\n建议：\n1. 检查文件名是否正确\n2. 尝试使用更短的关键词\n3. 检查文件是否在搜索路径下`
        };
      }
      
      if (files.length === 1) {
        // 2. 只有一个文件，直接读取
        const filePath = files[0];
        logger.info(`📄 Reading single file: ${filePath}`);
        
        const result = await this.execute(`cat "${filePath}"`, { timeout: 5000 });
        
        if (result.exitCode === 0) {
          const lineCount = result.stdout.split('\n').length;
          const sizeKB = (Buffer.byteLength(result.stdout, 'utf8') / 1024).toFixed(2);
          
          return {
            type: 'content',
            data: `📄 文件：${filePath}\n📊 大小：${sizeKB} KB，共 ${lineCount} 行\n\n${'='.repeat(80)}\n\n${result.stdout}`
          };
        } else {
          return {
            type: 'content',
            data: `❌ 读取文件失败：${filePath}\n\n错误信息：\n${result.stderr || '未知错误'}`
          };
        }
      }
      
      // 3. 多个文件，返回列表
      logger.info(`📋 Found ${files.length} files, returning list`);
      
      const fileList = files
        .map((f, i) => `${i + 1}. ${f}`)
        .join('\n');
      
      return {
        type: 'list',
        data: `🔍 找到 ${files.length} 个匹配的文件：\n\n${fileList}\n\n💡 提示：请告诉我你想查看哪个文件（可以说文件编号或完整路径），我会为你读取内容。`
      };
    } catch (error) {
      logger.error(`❌ Smart read error:`, error);
      return {
        type: 'content',
        data: `❌ 智能读取失败：${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
}

// 单例
export const commandExecutor = new CommandExecutor();
