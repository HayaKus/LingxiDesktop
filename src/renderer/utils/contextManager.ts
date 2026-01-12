import { Message } from '../../types';
import { estimateMessageTokens, estimateSystemTokens } from './tokenEstimator';

/**
 * 千问max模型配置
 */
const QWEN_MAX_CONFIG = {
  maxInput: 129024,      // 最大输入tokens
  maxOutput: 8192,       // 最大输出tokens
  targetRatio: 0.85,     // 目标窗口比例（85%）
  maxRequestBodyBytes: 5 * 1024 * 1024, // 最大请求体大小：5MB（API限制6MB，留1MB余量）
};

/**
 * 估算消息的请求体大小（字节）
 */
function estimateMessageBodySize(message: Message): number {
  let size = 0;
  
  // 文本大小（UTF-8编码，中文约3字节/字符）
  if (message.content) {
    size += message.content.length * 3;
  }
  
  // 图片大小（Base64编码后的大小）
  if (message.imageUrls && message.imageUrls.length > 0) {
    message.imageUrls.forEach(url => {
      // Base64字符串长度约等于原始字节数的4/3
      // data:image/jpeg;base64, 前缀约23字节
      const base64Length = url.length - 23;
      size += base64Length;
    });
  }
  
  // 粘贴板图片
  if (message.clipboardImageUrls && message.clipboardImageUrls.length > 0) {
    message.clipboardImageUrls.forEach(url => {
      const base64Length = url.length - 23;
      size += base64Length;
    });
  }
  
  return size;
}

/**
 * 移除消息中的图片（保留文字）
 */
function removeImagesFromMessage(message: Message): Message {
  return {
    ...message,
    imageUrls: undefined,
    clipboardImageUrls: undefined,
  };
}

/**
 * 上下文管理统计信息
 */
export interface ContextStats {
  originalCount: number;    // 原始消息数
  trimmedCount: number;     // 裁剪后消息数
  removedCount: number;     // 移除的消息数
  originalTokens: number;   // 原始总tokens
  trimmedTokens: number;    // 裁剪后tokens
  targetTokens: number;     // 目标tokens
  maxHistoryTokens: number; // 历史可用最大tokens
  imagesRemoved: number;    // 移除的图片数
}

/**
 * 智能上下文管理（优化策略：优先移除图片）
 * 
 * 核心逻辑：
 * 1. 动态计算可用空间（根据当前消息、背景知识等）
 * 2. 设置目标窗口为可用空间的85%
 * 3. 优先移除旧消息的图片（保留至少1张最新的图片）
 * 4. 如果还超限，再移除整条消息（从最早开始）
 * 
 * @param messages 历史消息列表
 * @param currentMessage 当前用户消息
 * @param knowledge 背景知识
 * @returns 裁剪后的消息列表和统计信息
 */
export function intelligentContextManagement(
  messages: Message[],
  currentMessage: Message,
  knowledge: string = ''
): {
  trimmedMessages: Message[];
  stats: ContextStats;
} {
  // ===== 第一步：动态计算可用空间 =====
  const systemTokens = estimateSystemTokens(knowledge);
  const currentTokens = estimateMessageTokens(currentMessage).total;
  
  // 可用于历史消息的最大tokens
  const maxHistoryTokens = QWEN_MAX_CONFIG.maxInput 
                         - QWEN_MAX_CONFIG.maxOutput 
                         - systemTokens 
                         - currentTokens;
  
  // ===== 第二步：设置目标窗口（85%） =====
  const targetTokens = Math.floor(maxHistoryTokens * QWEN_MAX_CONFIG.targetRatio);
  
  console.log('📊 Token分配计算：');
  console.log(`   最大输入：${QWEN_MAX_CONFIG.maxInput.toLocaleString()} tokens`);
  console.log(`   输出预留：${QWEN_MAX_CONFIG.maxOutput.toLocaleString()} tokens`);
  console.log(`   系统提示：${systemTokens.toLocaleString()} tokens`);
  console.log(`   当前消息：${currentTokens.toLocaleString()} tokens`);
  console.log(`   历史可用：${maxHistoryTokens.toLocaleString()} tokens`);
  console.log(`   目标窗口：${targetTokens.toLocaleString()} tokens (${QWEN_MAX_CONFIG.targetRatio * 100}%)`);
  
  // ===== 第三步：计算当前历史tokens和请求体大小 =====
  let originalTokens = 0;
  let originalBodySize = 0;
  
  for (const msg of messages) {
    originalTokens += estimateMessageTokens(msg).total;
    originalBodySize += estimateMessageBodySize(msg);
  }
  
  const systemBodySize = (knowledge ? knowledge.length * 3 : 0) + 1500;
  const currentBodySize = estimateMessageBodySize(currentMessage);
  const maxHistoryBodySize = QWEN_MAX_CONFIG.maxRequestBodyBytes - systemBodySize - currentBodySize;
  
  console.log(`   当前历史：${originalTokens.toLocaleString()} tokens (${messages.length} 条消息)`);
  console.log(`📦 请求体大小检查：`);
  console.log(`   最大请求体：${(QWEN_MAX_CONFIG.maxRequestBodyBytes / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   当前历史：${(originalBodySize / 1024 / 1024).toFixed(2)}MB`);
  
  // ===== 第四步：判断是否需要裁剪 =====
  const needTokenTrim = originalTokens > targetTokens;
  const needBodyTrim = originalBodySize > maxHistoryBodySize;
  
  if (!needTokenTrim && !needBodyTrim) {
    console.log('✅ 历史在限制内，无需裁剪');
    return {
      trimmedMessages: messages,
      stats: {
        originalCount: messages.length,
        trimmedCount: messages.length,
        removedCount: 0,
        originalTokens,
        trimmedTokens: originalTokens,
        targetTokens,
        maxHistoryTokens,
        imagesRemoved: 0,
      },
    };
  }
  
  console.log('⚠️ 历史超出限制，开始智能裁剪');
  
  // ===== 第五步：策略1 - 优先移除旧消息的图片（保留最新1条的图片） =====
  let processedMessages = [...messages];
  let imagesRemoved = 0;
  
  // 找到最后一条有图片的消息的索引
  let lastImageIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].imageUrls || messages[i].clipboardImageUrls) {
      lastImageIndex = i;
      break;
    }
  }
  
  // 移除除最后一条外的所有图片
  if (lastImageIndex >= 0) {
    processedMessages = messages.map((msg, index) => {
      if (index < lastImageIndex && (msg.imageUrls || msg.clipboardImageUrls)) {
        imagesRemoved++;
        return removeImagesFromMessage(msg);
      }
      return msg;
    });
    
    // 重新计算tokens和请求体大小
    let newTokens = 0;
    let newBodySize = 0;
    for (const msg of processedMessages) {
      newTokens += estimateMessageTokens(msg).total;
      newBodySize += estimateMessageBodySize(msg);
    }
    
    console.log(`📸 策略1：移除旧图片`);
    console.log(`   移除图片：${imagesRemoved} 张`);
    console.log(`   新Token：${newTokens.toLocaleString()} / ${targetTokens.toLocaleString()}`);
    console.log(`   新请求体：${(newBodySize / 1024 / 1024).toFixed(2)}MB / ${(maxHistoryBodySize / 1024 / 1024).toFixed(2)}MB`);
    
    // 检查是否满足限制
    if (newTokens <= targetTokens && newBodySize <= maxHistoryBodySize) {
      console.log('✅ 移除图片后满足限制');
      return {
        trimmedMessages: processedMessages,
        stats: {
          originalCount: messages.length,
          trimmedCount: messages.length,
          removedCount: 0,
          originalTokens,
          trimmedTokens: newTokens,
          targetTokens,
          maxHistoryTokens,
          imagesRemoved,
        },
      };
    }
  }
  
  // ===== 第六步：策略2 - 如果还超限，移除整条旧消息（从后往前累加） =====
  console.log(`📝 策略2：移除整条消息`);
  
  let accumulatedTokens = 0;
  let accumulatedBodySize = 0;
  const result: Message[] = [];
  
  // 从最新的消息开始往前累加
  for (let i = processedMessages.length - 1; i >= 0; i--) {
    const msg = processedMessages[i];
    const msgTokens = estimateMessageTokens(msg).total;
    const msgBodySize = estimateMessageBodySize(msg);
    
    // 检查是否超限
    if (accumulatedTokens + msgTokens > targetTokens || 
        accumulatedBodySize + msgBodySize > maxHistoryBodySize) {
      console.log(`   停止在第 ${i + 1} 条消息`);
      break;
    }
    
    accumulatedTokens += msgTokens;
    accumulatedBodySize += msgBodySize;
    result.unshift(msg);
  }
  
  const removedCount = messages.length - result.length;
  
  console.log('✅ 裁剪完成');
  console.log(`   保留：${result.length} / ${messages.length} 条消息`);
  console.log(`   移除：${removedCount} 条消息`);
  console.log(`   移除图片：${imagesRemoved} 张`);
  console.log(`   最终Token：${accumulatedTokens.toLocaleString()} / ${targetTokens.toLocaleString()}`);
  console.log(`   使用率：${((accumulatedTokens / targetTokens) * 100).toFixed(1)}%`);
  
  return {
    trimmedMessages: result,
    stats: {
      originalCount: messages.length,
      trimmedCount: result.length,
      removedCount,
      originalTokens,
      trimmedTokens: accumulatedTokens,
      targetTokens,
      maxHistoryTokens,
      imagesRemoved,
    },
  };
}
