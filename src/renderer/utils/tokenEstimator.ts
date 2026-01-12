import { Message } from '../../types';

/**
 * Token估算结果
 */
export interface TokenEstimate {
  text: number;
  images: number;
  total: number;
}

/**
 * 估算文本的token数量
 * 中文：约1.3字符/token（保守估计）
 * 英文：约4字符/token
 * 混合文本：使用1.5作为平均值
 */
function estimateTextTokens(text: string): number {
  if (!text) return 0;
  
  // 简单估算：使用1.5字符/token作为平均值
  return Math.ceil(text.length / 1.5);
}

/**
 * 估算消息的token数量
 * @param message 消息对象
 * @returns Token估算结果
 */
export function estimateMessageTokens(message: Message): TokenEstimate {
  let textTokens = 0;
  let imageTokens = 0;
  
  // 文字token估算
  if (message.content) {
    textTokens = estimateTextTokens(message.content);
  }
  
  // 图片token估算（qwen-vl-max约1500 tokens/张）
  if (message.imageUrls && message.imageUrls.length > 0) {
    imageTokens = message.imageUrls.length * 1500;
  }
  
  // 粘贴板图片
  if (message.clipboardImageUrls && message.clipboardImageUrls.length > 0) {
    imageTokens += message.clipboardImageUrls.length * 1500;
  }
  
  return {
    text: textTokens,
    images: imageTokens,
    total: textTokens + imageTokens,
  };
}

/**
 * 估算系统提示词和背景知识的tokens
 */
export function estimateSystemTokens(knowledge: string): number {
  const SYSTEM_PROMPT_BASE = 500; // 基础系统提示词约500 tokens
  const knowledgeTokens = knowledge ? estimateTextTokens(knowledge) : 0;
  return SYSTEM_PROMPT_BASE + knowledgeTokens;
}

/**
 * 计算消息列表的总tokens
 */
export function calculateTotalTokens(messages: Message[]): TokenEstimate {
  return messages.reduce(
    (acc, msg) => {
      const estimate = estimateMessageTokens(msg);
      return {
        text: acc.text + estimate.text,
        images: acc.images + estimate.images,
        total: acc.total + estimate.total,
      };
    },
    { text: 0, images: 0, total: 0 }
  );
}
