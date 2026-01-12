// 消息类型
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;  // 保留用于向后兼容
  imageUrls?: string[];  // 新增：支持多张图片
  screenshotImageUrls?: string[];  // 窗口截图（不显示给用户，但发送给AI）
  clipboardImageUrls?: string[];  // 粘贴板截图（显示给用户）
  timestamp: number;
}

// 对话上下文
export interface Conversation {
  messages: Message[];
  maxHistory: number;
}

// 应用配置
export interface AppConfig {
  apiKey: string;
  model: string;
  shortcut: string;
  petPosition?: {
    x: number;
    y: number;
  };
}

// AI 请求消息格式（OpenAI 兼容）
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

// AI 响应流
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

// 错误类型
export interface AppError {
  code: string;
  message: string;
  details?: any;
}
