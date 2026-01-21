/**
 * 主进程入口
 * 应用启动和生命周期管理
 */
import { app, BrowserWindow, globalShortcut } from 'electron';
import log from 'electron-log';
import { WindowManager } from './windowManager';
import { ClipboardMonitor } from './clipboardMonitor';
import { ConfigManager } from './configManager';
import { IpcHandlers } from './ipcHandlers';
import { AutoSaveManager } from './autoSaveManager';
import { sessionManager } from './sessionManager';
import { loadSessions } from './sessionStorage';
import { mcpManager } from './mcpManager';

// 配置日志
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 创建管理器实例
const windowManager = new WindowManager();
const clipboardMonitor = new ClipboardMonitor();
const configManager = new ConfigManager();
const ipcHandlers = new IpcHandlers(windowManager, clipboardMonitor, configManager);
const autoSaveManager = new AutoSaveManager();

// 导出 configManager 供其他模块使用
export { configManager };

// 快捷键重新注册函数
export function reregisterShortcut(newShortcut: string): boolean {
  try {
    // 注销所有快捷键
    globalShortcut.unregisterAll();
    
    // 注册新快捷键
    const ret = globalShortcut.register(newShortcut, () => {
      log.info('Global shortcut triggered:', newShortcut);
      windowManager.createChatWindow();
    });
    
    if (ret) {
      log.info('✅ Global shortcut re-registered:', newShortcut);
      return true;
    } else {
      log.error('❌ Global shortcut re-registration failed:', newShortcut);
      return false;
    }
  } catch (error) {
    log.error('❌ Error re-registering shortcut:', error);
    return false;
  }
}

// 注册Deep Link协议（用于OAuth回调）
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('lingxi', process.execPath, [process.argv[1]]);
  }
} else {
  app.setAsDefaultProtocolClient('lingxi');
}

// 处理Deep Link（macOS）
app.on('open-url', (event, url) => {
  event.preventDefault();
  log.info('📡 Deep Link received:', url);
  // URL会被oauthManager处理
});

// 处理Deep Link（Windows/Linux）
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Windows/Linux下，Deep Link会作为命令行参数传入
    const url = commandLine.find(arg => arg.startsWith('lingxi://'));
    if (url) {
      log.info('📡 Deep Link received:', url);
    }
  });
}

/**
 * 应用启动
 */
app.whenReady().then(async () => {
  try {
    // 1. 初始化配置和认证
    await configManager.initializeBucAuth();
    
    // 2. 初始化会话管理器
    try {
      const apiKey = await configManager.getApiKey();
      await sessionManager.initialize(apiKey);
      log.info('✅ SessionManager initialized with API Key');
      
      // 加载历史会话
      try {
        const historySessions = await loadSessions();
        sessionManager.loadSessions(historySessions);
        log.info(`✅ Loaded ${historySessions.length} sessions from disk`);
      } catch (error) {
        log.error('❌ Failed to load sessions:', error);
      }
    } catch (error) {
      log.error('❌ Failed to initialize SessionManager:', error);
      log.warn('⚠️ SessionManager not initialized, please configure API Key in settings');
    }
    
    // 3. 加载MCP服务器
    try {
      const Store = require('electron-store');
      const store = new Store();
      const mcpServers = store.get('mcpServers', []);
      if (mcpServers.length > 0) {
        await mcpManager.loadServers(mcpServers);
        log.info(`✅ Loaded ${mcpServers.length} MCP servers`);
      } else {
        log.info('ℹ️ No MCP servers configured');
      }
    } catch (error) {
      log.error('❌ Failed to load MCP servers:', error);
    }
    
    // 4. 注册 IPC 处理函数
    ipcHandlers.registerAll();
    log.info('✅ IPC handlers registered');
    
    // 5. 启动剪贴板监听
    clipboardMonitor.start();
    
    // 6. 启动自动保存
    autoSaveManager.start();
    
    // 7. 创建宠物窗口
    windowManager.createPetWindow();

    // 8. 注册全局快捷键（从配置读取）
    const shortcut = configManager.getConfig().shortcut || 'CommandOrControl+Shift+A';
    const ret = globalShortcut.register(shortcut, () => {
      log.info('Global shortcut triggered:', shortcut);
      windowManager.createChatWindow();
    });

    if (!ret) {
      log.error('Global shortcut registration failed:', shortcut);
    } else {
      log.info('✅ Global shortcut registered:', shortcut);
    }

    // 9. macOS 激活事件
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createPetWindow();
      }
    });
    
    log.info('✅ Application started successfully');
  } catch (error) {
    log.error('❌ Application startup failed:', error);
  }
});

/**
 * 所有窗口关闭时退出（macOS 除外）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用退出前清理
 */
app.on('will-quit', async () => {
  try {
    // 1. 注销全局快捷键
    globalShortcut.unregisterAll();
    
    // 2. 停止自动保存
    autoSaveManager.stop();
    
    // 3. 保存所有会话
    await autoSaveManager.saveNow();
    
    // 4. 停止剪贴板监听
    clipboardMonitor.stop();
    
    log.info('✅ Application shutdown complete');
  } catch (error) {
    log.error('❌ Shutdown cleanup failed:', error);
  }
});

log.info('🚀 Electron app started');
