import { Message, ChatMessage } from '../../types';

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 将消息转换为 ChatMessage 格式
 */
export function convertToChatMessage(message: Message): ChatMessage {
  // 支持多图片（优先使用 imageUrls）
  const images = message.imageUrls || (message.imageUrl ? [message.imageUrl] : []);
  
  if (images.length > 0) {
    const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: message.content },
    ];
    
    // 添加所有图片
    images.forEach(url => {
      content.push({
        type: 'image_url',
        image_url: { url },
      });
    });
    
    return {
      role: message.role as 'user' | 'assistant' | 'system',
      content,
    };
  }

  return {
    role: message.role as 'user' | 'assistant' | 'system',
    content: message.content,
  };
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * 截断长文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * 验证 API Key 格式
 */
export function validateApiKey(apiKey: string): boolean {
  return apiKey.trim().length > 0;
}

/**
 * 格式化错误消息
 */
export function formatError(error: any): string {
  if (error.response?.data?.error?.message) {
    return error.response.data.error.message;
  }
  if (error.message) {
    return error.message;
  }
  return '未知错误，请稍后重试';
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
