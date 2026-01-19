/**
 * 窗口管理器
 * 负责创建和管理应用的所有窗口
 */
import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import log from 'electron-log';

const isDev = !app.isPackaged;

export class WindowManager {
  private petWindow: BrowserWindow | null = null;
  private chatWindow: BrowserWindow | null = null;

  /**
   * 创建宠物窗口
   */
  createPetWindow(): BrowserWindow {
    // 获取屏幕尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // 计算右下角位置（留出一些边距）
    const windowWidth = 120;
    const windowHeight = 120;
    const margin = 20;
    const x = screenWidth - windowWidth - margin;
    const y = screenHeight - windowHeight - margin;

    this.petWindow = new BrowserWindow({
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
      this.petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.petWindow.setAlwaysOnTop(true, 'floating');
    }

    // 加载宠物窗口内容
    if (isDev) {
      this.petWindow.loadURL('http://localhost:5173/pet.html');
    } else {
      this.petWindow.loadFile(path.join(__dirname, '../renderer/pet.html'));
    }

    this.petWindow.on('closed', () => {
      this.petWindow = null;
    });

    log.info('Pet window created');
    return this.petWindow;
  }

  /**
   * 创建对话窗口（如果已打开则关闭）
   */
  createChatWindow(): BrowserWindow | null {
    if (this.chatWindow) {
      this.chatWindow.close();
      return null;
    }

    // 计算对话窗口位置（在宠物窗口上方）
    let x = 100;
    let y = 100;
    
    if (this.petWindow) {
      const [petX, petY] = this.petWindow.getPosition();
      const [petWidth, petHeight] = this.petWindow.getSize();
      
      const chatWidth = 400;
      const chatHeight = 600;
      const margin = 10;
      
      // 对话窗口出现在宠物图标上方，水平居中
      x = petX + (petWidth - chatWidth) / 2;
      y = petY - chatHeight - margin;
      
      // 确保不超出屏幕边界
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

    this.chatWindow = new BrowserWindow({
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
      this.chatWindow.loadURL('http://localhost:5173');
    } else {
      this.chatWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this.chatWindow.once('ready-to-show', () => {
      this.chatWindow?.show();
    });

    this.chatWindow.on('closed', () => {
      this.chatWindow = null;
    });

    log.info('Chat window created');
    return this.chatWindow;
  }

  /**
   * 关闭对话窗口
   */
  closeChatWindow(): void {
    if (this.chatWindow) {
      this.chatWindow.close();
    }
  }

  /**
   * 移动宠物窗口
   */
  movePetWindow(deltaX: number, deltaY: number): void {
    if (this.petWindow) {
      const [x, y] = this.petWindow.getPosition();
      this.petWindow.setPosition(x + deltaX, y + deltaY);
    }
  }

  /**
   * 获取宠物窗口
   */
  getPetWindow(): BrowserWindow | null {
    return this.petWindow;
  }

  /**
   * 获取对话窗口
   */
  getChatWindow(): BrowserWindow | null {
    return this.chatWindow;
  }
}
