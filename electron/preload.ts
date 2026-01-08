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
});

// 类型声明
export interface ElectronAPI {
  openChatWindow: () => void;
  closeChatWindow: () => void;
  captureScreen: () => Promise<string>;
  readClipboardImage: () => Promise<string | null>;
  getConfig: () => Promise<any>;
  saveConfig: (config: any) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
