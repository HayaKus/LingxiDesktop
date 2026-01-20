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

  // ============ 会话管理 API ============
  
  // 创建新会话
  sessionCreate: async (): Promise<any> => {
    return await ipcRenderer.invoke('session:create');
  },

  // 开始 AI 请求
  sessionStartAI: async (sessionId: string, messages: any[], userMessage: string, imageCount: number): Promise<boolean> => {
    return await ipcRenderer.invoke('session:start-ai', sessionId, messages, userMessage, imageCount);
  },
  sessionCancel: async (sessionId: string): Promise<boolean> => {
    return await ipcRenderer.invoke('session:cancel', sessionId);
  },

  // 获取会话详情
  sessionGet: async (sessionId: string): Promise<any> => {
    return await ipcRenderer.invoke('session:get', sessionId);
  },

  // 获取所有会话
  sessionGetAll: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('session:get-all');
  },

  // 删除会话
  sessionDelete: async (sessionId: string): Promise<boolean> => {
    return await ipcRenderer.invoke('session:delete', sessionId);
  },

  // 监听会话更新
  onSessionUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('session-update', (event, data) => callback(data));
  },

  // 移除会话更新监听
  offSessionUpdate: (callback: (data: any) => void) => {
    ipcRenderer.removeListener('session-update', callback);
  },

  // ============ 命令执行 API ============
  
  // 执行命令（简单模式）
  commandExecute: async (command: string, options?: any): Promise<any> => {
    return await ipcRenderer.invoke('command:execute', command, options);
  },
  
  // 执行命令（流式模式）
  commandExecuteStream: async (executionId: string, command: string, args: string[], options?: any): Promise<any> => {
    return await ipcRenderer.invoke('command:execute-stream', executionId, command, args, options);
  },
  
  // 取消命令执行
  commandCancel: async (executionId: string): Promise<boolean> => {
    return await ipcRenderer.invoke('command:cancel', executionId);
  },
  
  // 检查命令安全性
  commandCheckSecurity: async (command: string): Promise<any> => {
    return await ipcRenderer.invoke('command:check-security', command);
  },
  
  // 获取正在运行的命令
  commandGetRunning: async (): Promise<string[]> => {
    return await ipcRenderer.invoke('command:get-running');
  },
  
  // 监听命令输出
  onCommandStdout: (callback: (executionId: string, data: string) => void) => {
    ipcRenderer.on('command:stdout', (event, executionId, data) => callback(executionId, data));
  },
  
  // 监听命令错误输出
  onCommandStderr: (callback: (executionId: string, data: string) => void) => {
    ipcRenderer.on('command:stderr', (event, executionId, data) => callback(executionId, data));
  },
  
  // 移除监听器
  offCommandStdout: (callback: any) => {
    ipcRenderer.removeListener('command:stdout', callback);
  },
  
  offCommandStderr: (callback: any) => {
    ipcRenderer.removeListener('command:stderr', callback);
  },

  // ============ MCP服务器管理 API ============
  
  // 获取所有MCP服务器
  mcpGetServers: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('mcp:get-servers');
  },
  
  // 添加MCP服务器
  mcpAddServer: async (config: any): Promise<boolean> => {
    return await ipcRenderer.invoke('mcp:add-server', config);
  },
  
  // 删除MCP服务器
  mcpRemoveServer: async (serverId: string): Promise<boolean> => {
    return await ipcRenderer.invoke('mcp:remove-server', serverId);
  },
  
  // 测试MCP连接
  mcpTestConnection: async (config: any): Promise<{ success: boolean; error?: string }> => {
    return await ipcRenderer.invoke('mcp:test-connection', config);
  },
  
  // 获取MCP服务器状态
  mcpGetStatus: async (serverId: string): Promise<'connected' | 'disconnected'> => {
    return await ipcRenderer.invoke('mcp:get-status', serverId);
  },
  
  // 监听MCP日志
  onMcpLog: (callback: (data: { message: string; level: 'log' | 'error' | 'warn'; timestamp: string }) => void) => {
    ipcRenderer.on('mcp:log', (event, data) => callback(data));
  },
  
  // 移除MCP日志监听
  offMcpLog: (callback: any) => {
    ipcRenderer.removeListener('mcp:log', callback);
  },
  
  // 获取单个服务器的工具列表
  mcpGetTools: async (serverId: string): Promise<any[]> => {
    return await ipcRenderer.invoke('mcp:get-tools', serverId);
  },
  
  // 获取所有服务器的工具（OpenAI格式）
  mcpGetAllTools: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('mcp:get-all-tools');
  },
  
  // 调用MCP工具
  mcpCallTool: async (toolName: string, args: any): Promise<any> => {
    return await ipcRenderer.invoke('mcp:call-tool', toolName, args);
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
  
  // 会话管理
  sessionCreate: () => Promise<any>;
  sessionStartAI: (sessionId: string, messages: any[], userMessage: string, imageCount: number) => Promise<boolean>;
  sessionGet: (sessionId: string) => Promise<any>;
  sessionGetAll: () => Promise<any[]>;
  sessionDelete: (sessionId: string) => Promise<boolean>;
  onSessionUpdate: (callback: (data: any) => void) => void;
  offSessionUpdate: (callback: (data: any) => void) => void;
  
  // MCP服务器管理
  mcpGetServers: () => Promise<any[]>;
  mcpAddServer: (config: any) => Promise<boolean>;
  mcpRemoveServer: (serverId: string) => Promise<boolean>;
  mcpTestConnection: (config: any) => Promise<{ success: boolean; error?: string }>;
  mcpGetStatus: (serverId: string) => Promise<'connected' | 'disconnected'>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
