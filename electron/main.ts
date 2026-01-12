import { app, BrowserWindow, globalShortcut, ipcMain, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import Store from 'electron-store';
import { BucAuthService, BucUserInfo } from './bucAuth';

// 配置日志
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 应用日志文件路径
const appLogPath = path.join(app.getPath('userData'), 'app.log');
log.info(`Application log path: ${appLogPath}`);

// 配置存储
interface StoreSchema {
  apiKey: string;
  model: string;
  shortcut: string;
  userInfo?: BucUserInfo;
}

const store = new Store<StoreSchema>({
  defaults: {
    apiKey: '',
    model: 'qwen-vl-max-latest',
    shortcut: 'CommandOrControl+Shift+A',
  },
});

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

// 剪贴板历史管理
interface ClipboardImage {
  dataUrl: string;
  timestamp: number;
  timerId: NodeJS.Timeout;
}

let clipboardImageHistory: ClipboardImage[] = [];
const IMAGE_LIFETIME = 30000; // 30秒

// 添加图片到历史（带压缩）
function addClipboardImage(dataUrl: string) {
  // 检查是否已存在（避免重复）
  const exists = clipboardImageHistory.some(item => item.dataUrl === dataUrl);
  if (exists) {
    log.info('Image already in history, skipping');
    return;
  }

  // 创建定时器，30秒后自动删除
  const timerId = setTimeout(() => {
    removeClipboardImage(dataUrl);
  }, IMAGE_LIFETIME);

  // 添加到历史
  const image: ClipboardImage = {
    dataUrl,
    timestamp: Date.now(),
    timerId,
  };
  
  clipboardImageHistory.push(image);
  log.info(`Clipboard image added. Total: ${clipboardImageHistory.length}, will expire in 30s`);
}

// 压缩图片（与截图使用相同的压缩策略）
function compressImage(base64: string): string {
  try {
    const { nativeImage } = require('electron');
    
    // 从base64创建图片
    const buffer = Buffer.from(base64, 'base64');
    const image = nativeImage.createFromBuffer(buffer);
    
    const originalSize = image.getSize();
    log.info(`Original clipboard image size: ${originalSize.width}x${originalSize.height}, ${base64.length} bytes`);
    
    // 缩放到50%
    const newWidth = Math.floor(originalSize.width * 0.5);
    const newHeight = Math.floor(originalSize.height * 0.5);
    const resized = image.resize({ width: newWidth, height: newHeight });
    
    // 转换为JPEG格式，质量80%
    const jpeg = resized.toJPEG(80);
    const compressedBase64 = jpeg.toString('base64');
    
    log.info(`Compressed clipboard image to: ${newWidth}x${newHeight}, ${compressedBase64.length} bytes (${(compressedBase64.length / 1024 / 1024).toFixed(2)}MB)`);
    
    return `data:image/jpeg;base64,${compressedBase64}`;
  } catch (error) {
    log.error('Image compression failed:', error);
    // 压缩失败则返回原图
    return `data:image/png;base64,${base64}`;
  }
}

// 删除图片
function removeClipboardImage(dataUrl: string) {
  const index = clipboardImageHistory.findIndex(item => item.dataUrl === dataUrl);
  if (index !== -1) {
    const image = clipboardImageHistory[index];
    clearTimeout(image.timerId);
    clipboardImageHistory.splice(index, 1);
    log.info(`Clipboard image removed. Remaining: ${clipboardImageHistory.length}`);
  }
}

// 获取所有有效的历史图片
function getClipboardHistory(): string[] {
  return clipboardImageHistory.map(item => item.dataUrl);
}

// 清空历史
function clearClipboardHistory() {
  clipboardImageHistory.forEach(item => clearTimeout(item.timerId));
  clipboardImageHistory = [];
  log.info('Clipboard history cleared');
}

// 剪贴板监听器
let clipboardMonitorInterval: NodeJS.Timeout | null = null;
let lastClipboardImageHash: string | null = null;

// 启动剪贴板监听（使用定时检查方式）
function startClipboardMonitor() {
  try {
    // 每1000ms检查一次剪贴板（降低频率，减少CPU占用）
    clipboardMonitorInterval = setInterval(() => {
      try {
        const image = clipboard.readImage();
        
        if (!image.isEmpty()) {
          const png = image.toPNG();
          const base64 = png.toString('base64');
          
          // 使用hash来检测是否是新图片（避免重复添加）
          const hash = base64.substring(0, 100); // 使用前100个字符作为简单hash
          
          if (hash !== lastClipboardImageHash) {
            lastClipboardImageHash = hash;
            
            log.info(`📋 New clipboard image detected, original size: ${base64.length} bytes`);
            
            // 压缩图片后再添加到历史
            const compressedDataUrl = compressImage(base64);
            addClipboardImage(compressedDataUrl);
          }
        }
      } catch (error) {
        // 静默处理错误，避免日志刷屏
      }
    }, 1000);
    
    log.info('✅ Clipboard monitor started (polling every 1000ms)');
  } catch (error) {
    log.error('❌ Failed to start clipboard monitor:', error);
  }
}

// 停止剪贴板监听
function stopClipboardMonitor() {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
  }
  clearClipboardHistory();
  lastClipboardImageHash = null;
  log.info('Clipboard monitor stopped');
}

// 创建宠物窗口
function createPetWindow() {
  // 获取屏幕尺寸
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // 计算右下角位置（留出一些边距）
  const windowWidth = 120;
  const windowHeight = 120;
  const margin = 20;
  const x = screenWidth - windowWidth - margin;
  const y = screenHeight - windowHeight - margin;

  petWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 设置窗口在所有工作区可见（macOS）
  if (process.platform === 'darwin') {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    petWindow.setAlwaysOnTop(true, 'floating');
  }

  // 加载宠物窗口内容
  if (isDev) {
    petWindow.loadURL('http://localhost:5173/pet.html');
  } else {
    petWindow.loadFile(path.join(__dirname, '../renderer/pet.html'));
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });

  log.info('Pet window created');
}

// 创建对话窗口（如果已打开则关闭）
function createChatWindow() {
  if (chatWindow) {
    chatWindow.close();
    return;
  }

  // 计算对话窗口位置（在宠物窗口上方）
  let x = 100;
  let y = 100;
  
  if (petWindow) {
    const [petX, petY] = petWindow.getPosition();
    const [petWidth, petHeight] = petWindow.getSize();
    
    const chatWidth = 400;
    const chatHeight = 600;
    const margin = 10;
    
    // 对话窗口出现在宠物图标上方，水平居中
    x = petX + (petWidth - chatWidth) / 2;
    y = petY - chatHeight - margin;
    
    // 确保不超出屏幕边界
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // 水平方向边界检查
    if (x < 0) x = 10;
    if (x + chatWidth > screenWidth) x = screenWidth - chatWidth - 10;
    
    // 垂直方向边界检查（如果上方空间不够，就放在下方）
    if (y < 0) {
      y = petY + petHeight + margin;
    }
  }

  chatWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: x,
    y: y,
    minWidth: 350,
    minHeight: 400,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 加载对话窗口内容
  if (isDev) {
    chatWindow.loadURL('http://localhost:5173');
  } else {
    chatWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  chatWindow.once('ready-to-show', () => {
    chatWindow?.show();
  });

  chatWindow.on('closed', () => {
    chatWindow = null;
  });

  log.info('Chat window created');
}

// BUC 认证服务
const bucAuth = new BucAuthService();

// 应用启动
app.whenReady().then(async () => {
  try {
    // 检查是否已登录
    const savedUser = store.get('userInfo') as BucUserInfo | undefined;
    
    if (!savedUser) {
      log.info('🔐 未检测到登录信息，启动 BUC 登录流程...');
      
      // 启动 BUC 登录
      const userInfo = await bucAuth.login();
      
      // 保存用户信息
      store.set('userInfo', userInfo);
      log.info('✅ 用户信息已保存:', userInfo);
    } else {
      log.info('✅ 检测到已登录用户:', savedUser);
    }
  } catch (error) {
    log.error('❌ BUC 登录失败:', error);
    // 登录失败也继续启动应用（开发阶段）
  }
  
  // 启动剪贴板监听
  startClipboardMonitor();
  
  createPetWindow();

  // 注册全局快捷键 Cmd+Shift+0
  const ret = globalShortcut.register('CommandOrControl+Shift+0', () => {
    log.info('Global shortcut triggered');
    createChatWindow();
  });

  if (!ret) {
    log.error('Global shortcut registration failed');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

// 创建右键菜单
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

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC 事件处理
ipcMain.on('open-chat-window', () => {
  createChatWindow();
});

ipcMain.on('close-chat-window', () => {
  if (chatWindow) {
    chatWindow.close();
  }
});

// 移动宠物窗口
ipcMain.on('move-pet-window', (event, deltaX, deltaY) => {
  if (petWindow) {
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + deltaX, y + deltaY);
  }
});

// 截图请求 - 智能截取当前窗口
ipcMain.handle('capture-screen', async () => {
  try {
    const { desktopCapturer, screen, nativeImage } = require('electron');
    
    // 获取灵析窗口的位置
    let petPosition = null;
    if (petWindow) {
      const [x, y] = petWindow.getPosition();
      const [width, height] = petWindow.getSize();
      petPosition = {
        x: x + width / 2,  // 灵析中心点
        y: y + height / 2,
      };
      log.info(`Pet window position: (${petPosition.x}, ${petPosition.y})`);
    }
    
    // 获取所有窗口和屏幕源
    // 注意：对于窗口截图，需要使用更大的尺寸才能获取到内容
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 3840, height: 2160 },  // 使用4K分辨率确保能截取到内容
      fetchWindowIcons: false,  // 不需要窗口图标
    });

    if (sources.length === 0) {
      throw new Error('No screen source available');
    }

    log.info(`Found ${sources.length} sources`);
    
    let screenshot = null;
    
    // 如果有灵析位置信息，尝试找到它下方的窗口
    if (petPosition) {
      // 过滤掉灵析自己的窗口和对话窗口
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
      
      // 记录所有候选窗口
      windowSources.forEach((source, index) => {
        log.info(`Window ${index + 1}: ${source.name} (${source.id})`);
      });
      
      // 选择第一个非灵析窗口（通常是用户正在使用的窗口）
      if (windowSources.length > 0) {
        const targetWindow = windowSources[0];
        log.info(`Selected window: ${targetWindow.name}`);
        
        try {
          screenshot = targetWindow.thumbnail;
          const pngSize = screenshot.toPNG().length;
          log.info(`Original window screenshot size: ${pngSize} bytes`);
          
          // 如果截图大小为0，说明没有权限或截图失败
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
    
    // 压缩图片：缩放到50% + JPEG 80%质量
    const originalSize = screenshot.getSize();
    log.info(`Original size: ${originalSize.width}x${originalSize.height}`);
    
    // 缩放到50%
    const newWidth = Math.floor(originalSize.width * 0.5);
    const newHeight = Math.floor(originalSize.height * 0.5);
    const resized = screenshot.resize({ width: newWidth, height: newHeight });
    log.info(`Resized to: ${newWidth}x${newHeight}`);
    
    // 转换为JPEG格式，质量80%
    const jpeg = resized.toJPEG(80);
    const base64 = jpeg.toString('base64');
    log.info(`Compressed screenshot size: ${base64.length} bytes (${(base64.length / 1024 / 1024).toFixed(2)}MB)`);
    
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    log.error('Screenshot failed:', error);
    throw error;
  }
});

// 读取剪贴板图片（返回历史中的所有图片）
ipcMain.handle('read-clipboard-image', async () => {
  try {
    // 返回历史中的所有图片
    const history = getClipboardHistory();
    log.info(`Returning ${history.length} clipboard images from history`);
    return history;
  } catch (error) {
    log.error('Read clipboard failed:', error);
    throw error;
  }
});

// 获取配置
ipcMain.handle('get-config', async () => {
  try {
    return store.store;
  } catch (error) {
    log.error('Get config failed:', error);
    throw error;
  }
});

// 保存配置
ipcMain.handle('save-config', async (event, config) => {
  try {
    store.set(config);
    log.info('Config saved:', config);
    return true;
  } catch (error) {
    log.error('Save config failed:', error);
    throw error;
  }
});

// 写入应用日志（异步，避免阻塞）
ipcMain.handle('write-log', async (event, message) => {
  try {
    // 使用异步写入，避免阻塞主线程
    await fs.promises.appendFile(appLogPath, message, 'utf8');
  } catch (error) {
    log.error('Write log failed:', error);
  }
});

// 获取用户信息
ipcMain.handle('get-user-info', async () => {
  try {
    const userInfo = store.get('userInfo') as BucUserInfo | undefined;
    return userInfo || null;
  } catch (error) {
    log.error('Get user info failed:', error);
    return null;
  }
});

// 重新登录
ipcMain.handle('buc-login', async () => {
  try {
    log.info('🔐 手动触发 BUC 登录...');
    const userInfo = await bucAuth.login();
    store.set('userInfo', userInfo);
    log.info('✅ 登录成功:', userInfo);
    return userInfo;
  } catch (error) {
    log.error('❌ 登录失败:', error);
    throw error;
  }
});

// 退出登录
ipcMain.handle('buc-logout', async () => {
  try {
    log.info('👋 退出登录');
    store.delete('userInfo');
    bucAuth.cleanup();
    return true;
  } catch (error) {
    log.error('Logout failed:', error);
    throw error;
  }
});

log.info('Electron app started');
