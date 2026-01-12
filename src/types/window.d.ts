interface Window {
  electronAPI: {
    captureScreen: () => Promise<string>;
    readClipboardImage: () => Promise<string | null>;
    getConfig: () => Promise<{ apiKey: string; knowledge?: string }>;
    saveConfig: (config: { apiKey?: string; knowledge?: string }) => Promise<boolean>;
    openChatWindow: () => void;
    closeChatWindow: () => void;
    moveWindow: (deltaX: number, deltaY: number) => void;
    showContextMenu: () => void;
  };
}
