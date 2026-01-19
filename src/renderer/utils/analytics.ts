/**
 * 数据上报工具
 * 用于上报对话 token 使用情况
 */

import { logger } from './logger';

/**
 * 上报配置
 */
const REPORT_CONFIG = {
  url: 'https://tppwork.taobao.com/pre/recommend',
  appid: '55973',
  action: 'record',
};

/**
 * 上报数据接口
 */
export interface ReportData {
  staffName: string;  // 员工花名
  staffId: string;    // 员工工号
  traceId: string;    // 会话ID（Session ID）
  token: number;      // 本次完整对话消耗的token
}

/**
 * 生成 UUID（用于 Session ID）
 */
export function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 上报对话数据
 * @param data 上报数据
 */
export async function reportConversation(data: ReportData): Promise<void> {
  try {
    // 构建完整的 URL（添加字符集参数确保中文正确传输）
    const params = new URLSearchParams({
      appid: REPORT_CONFIG.appid,
      action: REPORT_CONFIG.action,
      staffName: data.staffName,
      staffId: data.staffId,
      traceId: data.traceId,
      token: data.token.toString(),
      _input_charset: 'utf-8',   // 输入字符集
      _output_charset: 'utf-8',  // 输出字符集
    });
    
    const url = `${REPORT_CONFIG.url}?${params.toString()}`;

    logger.info('📊 上报对话数据:', {
      staffName: data.staffName,
      staffId: data.staffId,
      traceId: data.traceId,
      token: data.token,
      url: url.toString(),
    });

    // 异步发送请求（不等待响应）
    fetch(url.toString(), {
      method: 'GET',
      mode: 'no-cors', // 跨域请求
    })
      .then(() => {
        logger.info('✅ 数据上报成功');
      })
      .catch((error) => {
        // 上报失败不影响用户使用，只记录日志
        logger.warn('⚠️ 数据上报失败（不影响使用）:', error);
      });
  } catch (error) {
    // 捕获所有错误，确保不影响用户使用
    logger.error('❌ 数据上报异常（不影响使用）:', error);
  }
}

/**
 * 计算单次完整对话的 token 消耗
 * @param userMessage 用户消息
 * @param assistantMessage 助手回复
 * @param imageCount 图片数量（可选）
 * @returns token 数量
 */
export function calculateConversationTokens(
  userMessage: string,
  assistantMessage: string,
  imageCount: number = 0
): number {
  // 文字 token 估算：1.5 字符/token
  const userTokens = Math.ceil(userMessage.length / 1.5);
  const assistantTokens = Math.ceil(assistantMessage.length / 1.5);
  
  // 图片 token 估算：每张图片约 765 tokens
  // 参考：https://platform.openai.com/docs/guides/vision
  // - 低分辨率模式：85 tokens
  // - 高分辨率模式：基础 85 + 每个 512x512 tile 170 tokens
  // - 平均一张图片约 765 tokens（假设 1024x1024 图片，4个tiles）
  const imageTokens = imageCount * 765;
  
  return userTokens + assistantTokens + imageTokens;
}
