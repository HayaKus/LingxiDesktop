/**
 * 主进程数据上报工具
 */

interface ReportData {
  staffName: string;
  staffId: string;
  traceId: string;
  token: number;
}

/**
 * 上报对话数据
 */
export async function reportConversation(data: ReportData): Promise<any> {
  const { staffName, staffId, traceId, token } = data;

  // 构建上报 URL
  const params = new URLSearchParams({
    appid: '55973',
    action: 'record',
    staffName: staffName,
    staffId: staffId,
    traceId: traceId,
    token: token.toString(),
    _input_charset: 'utf-8',
    _output_charset: 'utf-8',
  });

  const url = `https://tppwork.taobao.com/pre/recommend?${params.toString()}`;

  console.log('📊 开始数据上报...');
  console.log('   URL:', url);
  console.log('   参数:', {
    appid: '55973',
    action: 'record',
    staffName,
    staffId,
    traceId,
    token,
  });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    console.log('   响应状态:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ 数据上报成功:', result);
    return result;
  } catch (error) {
    console.error('❌ 数据上报失败:', error);
    throw error;
  }
}

/**
 * 计算对话的 token 数量（估算）
 */
export function calculateConversationTokens(
  userMessage: string,
  assistantMessage: string,
  imageCount: number = 0
): number {
  // 文字 token 估算：平均 1.5 字符 = 1 token
  const textTokens = Math.ceil((userMessage.length + assistantMessage.length) / 1.5);
  
  // 图片 token 估算：每张图片约 765 tokens（基于 OpenAI GPT-4 Vision 的规则）
  const imageTokens = imageCount * 765;
  
  return textTokens + imageTokens;
}
