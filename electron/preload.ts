import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 打开对话窗口
  openChatWindow: () => {
    ipcRenderer.send('open-chat-window');
  },

  // 关闭对话窗口
  closeChatWindow: () => {
    ipcRenderer.send('close-chat-window');
  },

  // 截取屏幕
  captureScreen: async (): Promise<string> => {
    return await ipcRenderer.invoke('capture-screen');
  },

  // 读取剪贴板图片
  readClipboardImage: async (): Promise<string | null> => {
    return await ipcRenderer.invoke('read-clipboard-image');
  },

  // 获取配置
  getConfig: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-config');
  },

  // 保存配置
  saveConfig: async (config: any): Promise<void> => {
    return await ipcRenderer.invoke('save-config', config);
  },

  // 移动窗口
  moveWindow: (deltaX: number, deltaY: number) => {
    ipcRenderer.send('move-pet-window', deltaX, deltaY);
  },

  // 显示右键菜单
  showContextMenu: () => {
    ipcRenderer.send('show-context-menu');
  },

  // 写入日志
  writeLog: async (message: string): Promise<void> => {
    return await ipcRenderer.invoke('write-log', message);
  },

  // 获取用户信息
  getUserInfo: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-user-info');
  },

  // BUC 登录
  bucLogin: async (): Promise<any> => {
    return await ipcRenderer.invoke('buc-login');
  },

  // BUC 退出登录
  bucLogout: async (): Promise<boolean> => {
    return await ipcRenderer.invoke('buc-logout');
  },
});

// 用户信息接口
export interface BucUserInfo {
  workid: string;
  name: string;
  email: string;
  cname?: string;
  empId?: string;
}

// 类型声明
export interface ElectronAPI {
  openChatWindow: () => void;
  closeChatWindow: () => void;
  captureScreen: () => Promise<string>;
  readClipboardImage: () => Promise<string | null>;
  getConfig: () => Promise<any>;
  saveConfig: (config: any) => Promise<void>;
  moveWindow: (deltaX: number, deltaY: number) => void;
  showContextMenu: () => void;
  writeLog: (message: string) => Promise<void>;
  getUserInfo: () => Promise<BucUserInfo | null>;
  bucLogin: () => Promise<BucUserInfo>;
  bucLogout: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
