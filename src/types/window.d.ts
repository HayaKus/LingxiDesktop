interface UserInfo {
  workid: string;
  name: string;
  email: string;
  cname?: string;
  empId?: string;
  accountId?: number;
}

interface Window {
  electronAPI: {
    captureScreen: () => Promise<string>;
    readClipboardImage: () => Promise<string | null>;
    getConfig: () => Promise<{ apiKey: string; knowledge?: string; userInfo?: UserInfo }>;
    saveConfig: (config: { apiKey?: string; knowledge?: string; userInfo?: UserInfo }) => Promise<boolean>;
    openChatWindow: () => void;
    closeChatWindow: () => void;
    moveWindow: (deltaX: number, deltaY: number) => void;
    showContextMenu: () => void;
    writeLog: (message: string) => Promise<void>;
  };
}
