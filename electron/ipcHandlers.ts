/**
 * IPC 处理器
 * 统一管理所有 IPC 通信处理
 */
import { ipcMain, desktopCapturer, screen, nativeImage, app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import { WindowManager } from './windowManager';
import { ClipboardMonitor } from './clipboardMonitor';
import { ConfigManager } from './configManager';
import { sessionManager } from './sessionManager';
import { commandExecutor } from './commandExecutor';
import { CommandSecurity } from './commandSecurity';
import { mcpManager } from './mcpManager';
import { reregisterShortcut } from './main';
import type { CommandOptions } from './commandExecutor';
import type { MCPServerConfig } from './mcpClient';

// 应用日志文件路径
const appLogPath = path.join(app.getPath('userData'), 'app.log');

export class IpcHandlers {
  constructor(
    private windowManager: WindowManager,
    private clipboardMonitor: ClipboardMonitor,
    private configManager: ConfigManager
  ) {}

  /**
   * 注册所有 IPC 处理函数
   */
  registerAll(): void {
    this.registerWindowHandlers();
    this.registerScreenshotHandlers();
    this.registerConfigHandlers();
    this.registerAuthHandlers();
    this.registerSessionHandlers();
    this.registerCommandHandlers();
    this.registerMCPHandlers();
    this.registerLogHandlers();
  }

  /**
   * 窗口相关处理
   */
  private registerWindowHandlers(): void {
    ipcMain.on('open-chat-window', () => {
      this.windowManager.createChatWindow();
    });

    ipcMain.on('close-chat-window', () => {
      this.windowManager.closeChatWindow();
    });

    ipcMain.on('move-pet-window', (event, deltaX, deltaY) => {
      this.windowManager.movePetWindow(deltaX, deltaY);
    });

    ipcMain.on('show-context-menu', () => {
      const { Menu } = require('electron');
      const menu = Menu.buildFromTemplate([
        {
          label: '退出',
          click: () => {
            app.quit();
          }
        }
      ]);
      menu.popup();
    });
  }

  /**
   * 截图相关处理
   */
  private registerScreenshotHandlers(): void {
    // 截图请求 - 智能截取当前窗口
    ipcMain.handle('capture-screen', async () => {
      try {
        // 获取灵析窗口的位置
        let petPosition = null;
        const petWindow = this.windowManager.getPetWindow();
        if (petWindow) {
          const [x, y] = petWindow.getPosition();
          const [width, height] = petWindow.getSize();
          petPosition = {
            x: x + width / 2,
            y: y + height / 2,
          };
          log.info(`Pet window position: (${petPosition.x}, ${petPosition.y})`);
        }
        
        // 获取所有窗口和屏幕源
        const sources = await desktopCapturer.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 3840, height: 2160 },
          fetchWindowIcons: false,
        });

        if (sources.length === 0) {
          throw new Error('No screen source available');
        }

        log.info(`Found ${sources.length} sources`);
        
        let screenshot = null;
        
        // 如果有灵析位置信息，尝试找到它下方的窗口
        if (petPosition) {
          const windowSources = sources.filter(source => {
            const name = source.name.toLowerCase();
            const isOwnWindow = name.includes('lingxi') || 
                               name.includes('灵析') ||
                               name.includes('electron');
            
            if (isOwnWindow) {
              log.info(`Filtered out own window: ${source.name}`);
            }
            
            return !isOwnWindow && source.id.startsWith('window:');
          });
          
          log.info(`Found ${windowSources.length} candidate windows`);
          
          if (windowSources.length > 0) {
            const targetWindow = windowSources[0];
            log.info(`Selected window: ${targetWindow.name}`);
            
            try {
              screenshot = targetWindow.thumbnail;
              const pngSize = screenshot.toPNG().length;
              log.info(`Original window screenshot size: ${pngSize} bytes`);
              
              if (pngSize === 0) {
                log.error('Window screenshot is empty - Screen Recording permission required');
                throw new Error('需要授予"屏幕录制"权限才能截取窗口。\n请前往：系统偏好设置 → 安全性与隐私 → 隐私 → 屏幕录制，勾选 Electron');
              }
            } catch (error) {
              log.error(`Failed to capture window ${targetWindow.name}:`, error);
              throw error;
            }
          }
        }
        
        // Fallback: 使用屏幕截图
        if (!screenshot) {
          log.info('Fallback to screen capture');
          const screenSource = sources.find(s => s.id.startsWith('screen:')) || sources[0];
          screenshot = screenSource.thumbnail;
        }
        
        // 压缩图片
        const originalSize = screenshot.getSize();
        log.info(`Original size: ${originalSize.width}x${originalSize.height}`);
        
        const newWidth = Math.floor(originalSize.width * 0.5);
        const newHeight = Math.floor(originalSize.height * 0.5);
        const resized = screenshot.resize({ width: newWidth, height: newHeight });
        
        const jpeg = resized.toJPEG(80);
        const base64 = jpeg.toString('base64');
        log.info(`Compressed screenshot size: ${base64.length} bytes (${(base64.length / 1024 / 1024).toFixed(2)}MB)`);
        
        return `data:image/jpeg;base64,${base64}`;
      } catch (error) {
        log.error('Screenshot failed:', error);
        throw error;
      }
    });

    // 读取剪贴板图片
    ipcMain.handle('read-clipboard-image', async () => {
      try {
        const history = this.clipboardMonitor.getClipboardHistory();
        log.info(`Returning ${history.length} clipboard images from history`);
        return history;
      } catch (error) {
        log.error('Read clipboard failed:', error);
        throw error;
      }
    });
  }

  /**
   * 配置相关处理
   */
  private registerConfigHandlers(): void {
    ipcMain.handle('get-config', async () => {
      try {
        return this.configManager.getConfig();
      } catch (error) {
        log.error('Get config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('save-config', async (event, config) => {
      try {
        this.configManager.saveConfig(config);
        
        // 重新初始化 SessionManager（使用新的 API KEY）
        if (config.apiKey) {
          sessionManager.initialize(config.apiKey, config.knowledge);
          log.info('✅ SessionManager re-initialized with new API KEY');
        }
        
        // 重新注册快捷键（如果快捷键有变化）
        if (config.shortcut) {
          const success = reregisterShortcut(config.shortcut);
          if (success) {
            log.info('✅ Global shortcut re-registered:', config.shortcut);
          } else {
            log.error('❌ Failed to re-register shortcut:', config.shortcut);
          }
        }
        
        return true;
      } catch (error) {
        log.error('Save config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('get-user-info', async () => {
      try {
        return this.configManager.getUserInfo();
      } catch (error) {
        log.error('Get user info failed:', error);
        return null;
      }
    });
  }

  /**
   * 认证相关处理
   */
  private registerAuthHandlers(): void {
    ipcMain.handle('buc-login', async () => {
      try {
        return await this.configManager.login();
      } catch (error) {
        log.error('Login failed:', error);
        throw error;
      }
    });

    ipcMain.handle('buc-logout', async () => {
      try {
        this.configManager.logout();
        return true;
      } catch (error) {
        log.error('Logout failed:', error);
        throw error;
      }
    });
  }

  /**
   * 会话管理相关处理
   */
  private registerSessionHandlers(): void {
    ipcMain.handle('session:create', async () => {
      try {
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const session = sessionManager.createSession(sessionId);
        log.info(`Session created: ${session.id}`);
        return session;
      } catch (error) {
        log.error('Create session failed:', error);
        throw error;
      }
    });

    ipcMain.handle('session:start-ai', async (event, sessionId: string, messages: any[], userMessage: string, imageCount: number) => {
      try {
        await sessionManager.startAIRequest(sessionId, messages, userMessage, imageCount);
        log.info(`AI request started for session: ${sessionId}`);
        return true;
      } catch (error) {
        log.error('Start AI request failed:', error);
        throw error;
      }
    });

    ipcMain.handle('session:cancel', async (event, sessionId: string) => {
      try {
        const cancelled = sessionManager.cancelSession(sessionId);
        log.info(`Session ${sessionId} ${cancelled ? 'cancelled' : 'not found'}`);
        return cancelled;
      } catch (error) {
        log.error('Cancel session failed:', error);
        throw error;
      }
    });

    ipcMain.handle('session:get', async (event, sessionId: string) => {
      try {
        return sessionManager.getSession(sessionId);
      } catch (error) {
        log.error('Get session failed:', error);
        throw error;
      }
    });

    ipcMain.handle('session:get-all', async () => {
      try {
        return sessionManager.getAllSessions();
      } catch (error) {
        log.error('Get all sessions failed:', error);
        throw error;
      }
    });

    ipcMain.handle('session:delete', async (event, sessionId: string) => {
      try {
        sessionManager.deleteSession(sessionId);
        log.info(`Session deleted: ${sessionId}`);
        return true;
      } catch (error) {
        log.error('Delete session failed:', error);
        throw error;
      }
    });
  }

  /**
   * 命令执行相关处理
   */
  private registerCommandHandlers(): void {
    ipcMain.handle('command:execute', async (event, command: string, options?: CommandOptions) => {
      try {
        const security = CommandSecurity.checkCommand(command);
        if (!security.safe) {
          throw new Error(security.reason || '危险命令被拦截');
        }
        
        log.info(`📝 Executing command: ${command}`);
        const result = await commandExecutor.execute(command, options);
        log.info(`✅ Command completed with exit code: ${result.exitCode}`);
        
        return result;
      } catch (error) {
        log.error('❌ Command execution failed:', error);
        throw error;
      }
    });

    ipcMain.handle('command:execute-stream', async (event, executionId: string, command: string, args: string[], options?: CommandOptions) => {
      try {
        const fullCommand = `${command} ${args.join(' ')}`;
        const security = CommandSecurity.checkCommand(fullCommand);
        if (!security.safe) {
          throw new Error(security.reason || '危险命令被拦截');
        }
        
        log.info(`📝 Executing stream command: ${fullCommand}`);
        
        const stdoutHandler = (id: string, data: string) => {
          if (id === executionId) {
            event.sender.send('command:stdout', executionId, data);
          }
        };
        
        const stderrHandler = (id: string, data: string) => {
          if (id === executionId) {
            event.sender.send('command:stderr', executionId, data);
          }
        };
        
        commandExecutor.on('stdout', stdoutHandler);
        commandExecutor.on('stderr', stderrHandler);
        
        try {
          const result = await commandExecutor.executeStream(executionId, command, args, options);
          log.info(`✅ Stream command completed with exit code: ${result.exitCode}`);
          return result;
        } finally {
          commandExecutor.off('stdout', stdoutHandler);
          commandExecutor.off('stderr', stderrHandler);
        }
      } catch (error) {
        log.error('❌ Stream command execution failed:', error);
        throw error;
      }
    });

    ipcMain.handle('command:cancel', async (event, executionId: string) => {
      try {
        const cancelled = commandExecutor.cancel(executionId);
        log.info(`Command ${executionId} ${cancelled ? 'cancelled' : 'not found'}`);
        return cancelled;
      } catch (error) {
        log.error('❌ Command cancellation failed:', error);
        throw error;
      }
    });

    ipcMain.handle('command:check-security', async (event, command: string) => {
      try {
        return CommandSecurity.checkCommand(command);
      } catch (error) {
        log.error('❌ Security check failed:', error);
        throw error;
      }
    });

    ipcMain.handle('command:get-running', async () => {
      try {
        return commandExecutor.getRunningCommands();
      } catch (error) {
        log.error('❌ Get running commands failed:', error);
        throw error;
      }
    });

    // 新增：查找文件
    ipcMain.handle('command:find-file', async (event, query: string, fileType?: string, basePath?: string, maxResults?: number) => {
      try {
        log.info(`🔍 Finding files: query="${query}", type="${fileType || 'all'}"`);
        const files = await commandExecutor.findFile(query, fileType, basePath, maxResults);
        log.info(`✅ Found ${files.length} files`);
        return files;
      } catch (error) {
        log.error('❌ Find file failed:', error);
        throw error;
      }
    });

    // 新增：智能读取文件
    ipcMain.handle('command:smart-read', async (event, query: string, fileType?: string, basePath?: string) => {
      try {
        log.info(`📖 Smart reading: query="${query}"`);
        const result = await commandExecutor.smartRead(query, fileType, basePath);
        log.info(`✅ Smart read completed: type=${result.type}`);
        return result;
      } catch (error) {
        log.error('❌ Smart read failed:', error);
        throw error;
      }
    });
  }

  /**
   * MCP服务器相关处理
   */
  private registerMCPHandlers(): void {
    // 获取所有MCP服务器
    ipcMain.handle('mcp:get-servers', async () => {
      try {
        const servers = mcpManager.getServers();
        log.info(`📡 Retrieved ${servers.length} MCP servers`);
        return servers;
      } catch (error) {
        log.error('❌ Get MCP servers failed:', error);
        throw error;
      }
    });

    // 添加MCP服务器
    ipcMain.handle('mcp:add-server', async (event, config: MCPServerConfig) => {
      try {
        log.info(`📡 Adding MCP server: ${config.name} (${config.type})`);
        
        await mcpManager.addServer(config);
        
        // 保存到配置
        this.saveMCPServers();
        
        log.info(`✅ MCP server added: ${config.name}`);
        return true;
      } catch (error) {
        log.error('❌ Add MCP server failed:', error);
        throw error;
      }
    });

    // 删除MCP服务器
    ipcMain.handle('mcp:remove-server', async (event, serverId: string) => {
      try {
        log.info(`🗑️ Removing MCP server: ${serverId}`);
        mcpManager.removeServer(serverId);
        
        // 保存到配置
        this.saveMCPServers();
        
        log.info(`✅ MCP server removed: ${serverId}`);
        return true;
      } catch (error) {
        log.error('❌ Remove MCP server failed:', error);
        throw error;
      }
    });

    // 测试MCP服务器连接
    ipcMain.handle('mcp:test-connection', async (event, config: MCPServerConfig) => {
      try {
        log.info(`🔌 Testing MCP connection: ${config.name}`);
        const result = await mcpManager.testConnection(config);
        log.info(`${result.success ? '✅' : '❌'} Connection test result: ${config.name}`);
        return result;
      } catch (error) {
        log.error('❌ Connection test failed:', error);
        throw error;
      }
    });

    // 获取MCP服务器状态
    ipcMain.handle('mcp:get-status', async (event, serverId: string) => {
      try {
        const status = mcpManager.getServerStatus(serverId);
        return status;
      } catch (error) {
        log.error('❌ Get server status failed:', error);
        throw error;
      }
    });

    // 获取单个服务器的工具列表
    ipcMain.handle('mcp:get-tools', async (event, serverId: string) => {
      try {
        log.info(`📦 Getting tools for server: ${serverId}`);
        const tools = await mcpManager.getToolsForServer(serverId);
        log.info(`✅ Got ${tools.length} tools from ${serverId}`);
        return tools;
      } catch (error) {
        log.error('❌ Get tools failed:', error);
        throw error;
      }
    });

    // 获取所有服务器的工具（OpenAI格式）
    ipcMain.handle('mcp:get-all-tools', async () => {
      try {
        log.info(`📦 Getting all MCP tools...`);
        const tools = await mcpManager.getAllTools();
        log.info(`✅ Got ${tools.length} total tools`);
        return tools;
      } catch (error) {
        log.error('❌ Get all tools failed:', error);
        throw error;
      }
    });

    // 调用MCP工具
    ipcMain.handle('mcp:call-tool', async (event, toolName: string, args: any) => {
      try {
        log.info(`🔧 Calling MCP tool: ${toolName}`);
        const result = await mcpManager.callTool(toolName, args);
        log.info(`✅ MCP tool call completed: ${toolName}`);
        return result;
      } catch (error) {
        log.error('❌ Call tool failed:', error);
        throw error;
      }
    });
  }

  /**
   * 保存MCP服务器配置到electron-store
   */
  private saveMCPServers(): void {
    try {
      const servers = mcpManager.getServers();
      const Store = require('electron-store');
      const store = new Store();
      store.set('mcpServers', servers);
      log.info(`💾 Saved ${servers.length} MCP servers to config`);
    } catch (error) {
      log.error('❌ Failed to save MCP servers:', error);
    }
  }

  /**
   * 日志相关处理
   */
  private registerLogHandlers(): void {
    ipcMain.handle('write-log', async (event, message) => {
      try {
        await fs.promises.appendFile(appLogPath, message, 'utf8');
      } catch (error) {
        log.error('Write log failed:', error);
      }
    });
  }
}
