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

// 截图请求 - 智能截取当前窗口
ipcMain.handle('capture-screen', async () => {
  try {
    const { desktopCapturer, screen } = require('electron');
    
    // 获取导盲犬窗口的位置
    let petPosition = null;
    if (petWindow) {
      const [x, y] = petWindow.getPosition();
      const [width, height] = petWindow.getSize();
      petPosition = {
        x: x + width / 2,  // 导盲犬中心点
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
    
    // 如果有导盲犬位置信息，尝试找到它下方的窗口
    if (petPosition) {
      // 过滤掉导盲犬自己的窗口和对话窗口
      const windowSources = sources.filter(source => {
        const name = source.name.toLowerCase();
        const isOwnWindow = name.includes('iamdog') || 
                           name.includes('导盲犬') ||
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
      
      // 选择第一个非导盲犬窗口（通常是用户正在使用的窗口）
      if (windowSources.length > 0) {
        const targetWindow = windowSources[0];
        log.info(`Selected window: ${targetWindow.name}`);
        
        try {
          const screenshot = targetWindow.thumbnail.toPNG();
          const base64 = screenshot.toString('base64');
          log.info(`Window screenshot size: ${base64.length} bytes`);
          
          // 如果截图大小为0，说明没有权限或截图失败
          if (base64.length === 0) {
            log.error('Window screenshot is empty - Screen Recording permission required');
            throw new Error('需要授予"屏幕录制"权限才能截取窗口。\n请前往：系统偏好设置 → 安全性与隐私 → 隐私 → 屏幕录制，勾选 Electron');
          }
          
          return `data:image/png;base64,${base64}`;
        } catch (error) {
          log.error(`Failed to capture window ${targetWindow.name}:`, error);
          throw error;
        }
      }
    }
    
    // Fallback: 使用屏幕截图
    log.info('Fallback to screen capture');
    const screenSource = sources.find(s => s.id.startsWith('screen:')) || sources[0];
    const screenshot = screenSource.thumbnail.toPNG();
    const base64 = screenshot.toString('base64');
    
    return `data:image/png;base64,${base64}`;
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
