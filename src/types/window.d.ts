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
  };
}
