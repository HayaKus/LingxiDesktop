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
  // 获取错误消息
  let message = '';
  
  if (error.response?.data?.error?.message) {
    message = error.response.data.error.message;
  } else if (error.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  
  // 特殊错误处理
  if (message.includes('模型参数') || message.includes('model')) {
    return 'API密钥无效或已过期，请点击右上角"设置"重新配置';
  }
  
  if (message.includes('not initialized')) {
    return '请先配置 API 密钥';
  }
  
  if (message.includes('401') || message.includes('Unauthorized')) {
    return 'API密钥无效，请检查配置';
  }
  
  if (message.includes('403') || message.includes('Forbidden')) {
    return 'API密钥权限不足，请检查配置';
  }
  
  if (message.includes('429') || message.includes('rate limit')) {
    return 'API调用频率超限，请稍后重试';
  }
  
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return 'API服务暂时不可用，请稍后重试';
  }
  
  // 返回原始消息或默认消息
  return message || '未知错误，请稍后重试';
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
