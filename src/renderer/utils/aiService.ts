import OpenAI from 'openai';
import { ChatMessage } from '../../types';

const SYSTEM_PROMPT = `你是一个桌面AI助手，以可爱的小狗形象出现。

你的能力：
1. 理解用户屏幕上的内容（通过截图）
2. 理解用户粘贴板中的截图
3. 回答用户关于屏幕内容的问题

你的特点：
- 友好、专业、高效
- 回答简洁明了，避免冗长
- 对于技术问题，提供具体的解决方案
- 对于文档问题，提供清晰的总结

注意事项：
- 如果用户没有提供截图，礼貌地提醒
- 如果截图内容不清晰，说明你看到了什么
- 回答时使用 Markdown 格式
- 代码块要指定语言以便高亮

**重要：建议回复格式**
当你需要建议用户回复某人或输出某段内容时，请严格按照以下格式输出：

建议回复："这里是具体的回复内容"

例如：
- 建议回复："好的，我会尽快处理"
- 建议回复："收到，谢谢提醒"
- 建议回复："明白了，我会注意的"

只有使用这个格式，系统才能自动将建议内容复制到用户的粘贴板中，方便用户直接粘贴使用。`;

export class AIService {
  private client: OpenAI | null = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  initialize(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://idealab.alibaba-inc.com/api/openai/v1',
      dangerouslyAllowBrowser: true, // 在 Electron 中是安全的
    });
  }

  async *chat(
    messages: ChatMessage[],
    knowledge?: string,
    onError?: (error: Error) => void
  ): AsyncGenerator<string, void, unknown> {
    if (!this.client) {
      throw new Error('AI Service not initialized. Please set API key first.');
    }

    try {
      // 构建系统提示词
      let systemPrompt = SYSTEM_PROMPT;
      if (knowledge && knowledge.trim()) {
        systemPrompt += `\n\n**背景知识**\n${knowledge.trim()}`;
      }

      // 添加系统提示词
      const fullMessages: ChatMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ];

      const stream = await this.client.chat.completions.create({
        model: 'qwen-vl-max-latest',
        messages: fullMessages as any,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('AI Service error:', error);
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.client !== null;
  }
}

// 单例实例
export const aiService = new AIService();
