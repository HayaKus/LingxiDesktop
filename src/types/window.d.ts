interface UserInfo {
  workid: string;
  name: string;
  email: string;
  cname?: string;
  empId?: string;
  accountId?: number;
}

interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
  imageUrls?: string[];
  clipboardImageUrls?: string[];
  timestamp: number;
}

interface Session {
  id: string;
  name: string;
  messages: SessionMessage[];
  status: 'idle' | 'running' | 'completed' | 'error';
  currentResponse: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
  userMessage?: string;
  imageCount?: number;
}

interface Window {
  electronAPI: {
    captureScreen: () => Promise<string>;
    readClipboardImage: () => Promise<string | null>;
    getConfig: () => Promise<{ apiKey: string; knowledge?: string; shortcut?: string; userInfo?: UserInfo }>;
    saveConfig: (config: { apiKey?: string; knowledge?: string; shortcut?: string; userInfo?: UserInfo }) => Promise<boolean>;
    getUserInfo: () => Promise<UserInfo | null>;
    bucLogin: () => Promise<UserInfo>;
    bucLogout: () => Promise<boolean>;
    openChatWindow: () => void;
    closeChatWindow: () => void;
    moveWindow: (deltaX: number, deltaY: number) => void;
    showContextMenu: () => void;
    writeLog: (message: string) => Promise<void>;
    
    // 会话管理 API
    sessionCreate: () => Promise<Session>;
    sessionStartAI: (sessionId: string, messages: SessionMessage[], userMessage: string, imageCount: number) => Promise<boolean>;
    sessionCancel: (sessionId: string) => Promise<boolean>;
    sessionGet: (sessionId: string) => Promise<Session | undefined>;
    sessionGetAll: () => Promise<Session[]>;
    sessionDelete: (sessionId: string) => Promise<boolean>;
    onSessionUpdate: (callback: (data: any) => void) => void;
    offSessionUpdate: (callback: (data: any) => void) => void;

    // 命令执行
    commandExecute: (command: string, options?: any) => Promise<any>;
    commandExecuteStream: (executionId: string, command: string, args: string[], options?: any) => Promise<any>;
    commandCancel: (executionId: string) => Promise<boolean>;
    commandCheckSecurity: (command: string) => Promise<any>;
    commandGetRunning: () => Promise<string[]>;
    onCommandStdout: (callback: (executionId: string, data: string) => void) => void;
    onCommandStderr: (callback: (executionId: string, data: string) => void) => void;
    offCommandStdout: (callback: any) => void;
    offCommandStderr: (callback: any) => void;
    
    // MCP服务器管理
    mcpGetServers: () => Promise<any[]>;
    mcpAddServer: (config: any) => Promise<boolean>;
    mcpRemoveServer: (serverId: string) => Promise<boolean>;
    mcpTestConnection: (config: any) => Promise<{ success: boolean; error?: string }>;
    mcpGetStatus: (serverId: string) => Promise<'connected' | 'disconnected'>;
    onMcpLog: (callback: (data: { message: string; level: 'log' | 'error' | 'warn'; timestamp: string }) => void) => void;
    offMcpLog: (callback: any) => void;
    mcpGetTools: (serverId: string) => Promise<any[]>;
    mcpGetAllTools: () => Promise<any[]>;
    mcpCallTool: (toolName: string, args: any) => Promise<any>;
    
    // 更新检测
    updateCheck: () => Promise<UpdateCheckResult>;
    updateGetVersion: () => Promise<string>;
    updateSetUrl: (url: string) => Promise<boolean>;
  }
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  versionInfo?: {
    version: string;
    releaseDate: string;
    downloadUrl: string;
    changeLog: string[];
    minVersion?: string;
  };
  error?: string;
}
