/**
 * 命令安全管理器
 * 
 * 职责：
 * 1. 命令白名单检查
 * 2. 危险命令检测
 * 3. 参数验证
 * 4. 权限检查
 */

export interface SecurityCheckResult {
  safe: boolean;
  level: 'safe' | 'warning' | 'danger';
  reason?: string;
  needsConfirm: boolean;
}

export class CommandSecurity {
  // 安全命令白名单（基础命令）
  private static SAFE_COMMANDS = new Set([
    // 文件操作
    'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc',
    'mkdir', 'touch', 'cp', 'mv', 'echo', 'pwd',
    
    // 开发工具
    'npm', 'yarn', 'pnpm', 'node', 'python', 'python3',
    'git', 'code', 'vim', 'nano',
    
    // 构建工具
    'make', 'cmake', 'cargo', 'go', 'javac', 'java',
    
    // 系统信息
    'whoami', 'date', 'uname', 'which', 'env',
  ]);
  
  // 危险命令模式
  private static DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\/(?!Users|home)/,  // 删除根目录（排除用户目录）
    /sudo\s+/,                        // 需要管理员权限
    /chmod\s+777/,                    // 修改权限为 777
    />\s*\/dev\//,                    // 重定向到设备
    /mkfs/,                           // 格式化文件系统
    /dd\s+if=/,                       // 磁盘操作
    /:\(\)\{.*\}:/,                   // Fork 炸弹
    /curl.*\|\s*sh/,                  // 下载并执行脚本
    /wget.*\|\s*sh/,                  // 下载并执行脚本
    /eval\s+/,                        // eval 命令
    /exec\s+/,                        // exec 命令
  ];
  
  // 需要确认的命令模式
  private static CONFIRM_PATTERNS = [
    /rm\s+-r/,                        // 递归删除
    /rm\s+.*\*/,                      // 通配符删除
    /npm\s+install\s+-g/,             // 全局安装
    /pip\s+install/,                  // Python 包安装
    /brew\s+install/,                 // Homebrew 安装
    /apt-get\s+install/,              // APT 安装
    /yum\s+install/,                  // YUM 安装
  ];
  
  /**
   * 检查命令是否安全
   */
  static checkCommand(command: string): SecurityCheckResult {
    // 提取命令名称
    const commandName = command.trim().split(/\s+/)[0];
    
    // 检查危险模式
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          safe: false,
          level: 'danger',
          reason: `检测到危险命令模式，此命令可能会对系统造成严重损害`,
          needsConfirm: true,
        };
      }
    }
    
    // 检查需要确认的模式
    for (const pattern of this.CONFIRM_PATTERNS) {
      if (pattern.test(command)) {
        return {
          safe: true,
          level: 'warning',
          reason: `此命令可能会修改系统文件或安装软件，请确认`,
          needsConfirm: true,
        };
      }
    }
    
    // 检查白名单
    if (this.SAFE_COMMANDS.has(commandName)) {
      return {
        safe: true,
        level: 'safe',
        needsConfirm: false,
      };
    }
    
    // 未知命令，需要确认
    return {
      safe: true,
      level: 'warning',
      reason: `未知命令：${commandName}，请确认是否执行`,
      needsConfirm: true,
    };
  }
  
  /**
   * 解析命令（分离命令和参数）
   */
  static parseCommand(command: string): {
    command: string;
    args: string[];
  } {
    const parts = command.trim().split(/\s+/);
    return {
      command: parts[0],
      args: parts.slice(1),
    };
  }
  
  /**
   * 验证输入（检查危险字符）
   */
  static validateInput(input: string): boolean {
    // 检查危险字符
    const dangerousChars = /[;&|`$()]/;
    return !dangerousChars.test(input);
  }
}
