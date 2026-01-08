import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import path from 'path';
import log from 'electron-log';
import Store from 'electron-store';

// 配置日志
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 配置存储
const store = new Store({
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
    petWindow.loadFile(path.join(__dirname, '../../public/pet.html'));
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });

  log.info('Pet window created');
}

// 创建对话窗口
function createChatWindow() {
  if (chatWindow) {
    chatWindow.focus();
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

// 应用启动
app.whenReady().then(() => {
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

// 截图请求
ipcMain.handle('capture-screen', async () => {
  try {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail.toPNG();
      const base64 = screenshot.toString('base64');
      return `data:image/png;base64,${base64}`;
    }

    throw new Error('No screen source available');
  } catch (error) {
    log.error('Screenshot failed:', error);
    throw error;
  }
});

// 读取剪贴板图片
ipcMain.handle('read-clipboard-image', async () => {
  try {
    const { clipboard, nativeImage } = require('electron');
    const image = clipboard.readImage();

    if (image.isEmpty()) {
      return null;
    }

    const png = image.toPNG();
    const base64 = png.toString('base64');
    return `data:image/png;base64,${base64}`;
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

log.info('Electron app started');
