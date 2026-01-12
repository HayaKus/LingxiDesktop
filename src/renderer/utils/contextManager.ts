import { Message } from '../../types';
import { estimateMessageTokens, estimateSystemTokens } from './tokenEstimator';

/**
 * 千问max模型配置
 */
const QWEN_MAX_CONFIG = {
  maxInput: 129024,      // 最大输入tokens
  maxOutput: 8192,       // 最大输出tokens
  targetRatio: 0.85,     // 目标窗口比例（85%）
};

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
}

/**
 * 智能上下文管理（组合方案）
 * 
 * 核心逻辑：
 * 1. 动态计算可用空间（根据当前消息、背景知识等）
 * 2. 设置目标窗口为可用空间的85%
 * 3. 基于token大小从后往前裁剪
 * 4. 完全动态，没有硬性的最小消息数限制
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
  
  // ===== 第三步：计算当前历史tokens =====
  let originalTokens = 0;
  const tokenCounts: number[] = [];
  
  for (const msg of messages) {
    const tokens = estimateMessageTokens(msg).total;
    tokenCounts.push(tokens);
    originalTokens += tokens;
  }
  
  console.log(`   当前历史：${originalTokens.toLocaleString()} tokens (${messages.length} 条消息)`);
  
  // ===== 第四步：判断是否需要裁剪 =====
  if (originalTokens <= targetTokens) {
    console.log('✅ 历史在目标窗口内，无需裁剪');
    console.log(`   使用率：${((originalTokens / targetTokens) * 100).toFixed(1)}%`);
    
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
      },
    };
  }
  
  // ===== 第五步：基于token裁剪（从后往前累加） =====
  console.log('⚠️ 历史超出目标窗口，开始裁剪');
  console.log(`   超出：${(originalTokens - targetTokens).toLocaleString()} tokens`);
  
  let accumulatedTokens = 0;
  const result: Message[] = [];
  
  // 从最新的消息开始往前累加
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = tokenCounts[i];
    
    // 如果加上这条消息会超过目标窗口，就停止
    if (accumulatedTokens + msgTokens > targetTokens) {
      console.log(`   停止在第 ${i + 1} 条消息（再加会超过目标窗口）`);
      break;
    }
    
    accumulatedTokens += msgTokens;
    result.unshift(messages[i]); // 添加到结果开头
  }
  
  const removedCount = messages.length - result.length;
  
  console.log('✅ 裁剪完成');
  console.log(`   保留：${result.length} / ${messages.length} 条消息`);
  console.log(`   移除：${removedCount} 条消息`);
  console.log(`   使用：${accumulatedTokens.toLocaleString()} / ${targetTokens.toLocaleString()} tokens`);
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
    },
  };
}
