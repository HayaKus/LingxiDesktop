import OpenAI from 'openai';
import { ChatMessage } from '../../types';
import { logger } from './logger';

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
  ): AsyncGenerator<string, { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }, unknown> {
    if (!this.client) {
      throw new Error('AI Service not initialized. Please set API key first.');
    }

    try {
      // 获取可用的MCP工具
      const mcpTools = await this.getMCPTools();
      
      // 构建系统提示词
      let systemPrompt = SYSTEM_PROMPT;
      if (knowledge && knowledge.trim()) {
        systemPrompt += `\n\n**背景知识**\n${knowledge.trim()}`;
      }
      
      // 添加MCP工具信息
      if (mcpTools.length > 0) {
        systemPrompt += `\n\n**可用的MCP工具**\n你可以使用以下工具来帮助用户：\n\n`;
        mcpTools.forEach(tool => {
          systemPrompt += `- **${tool.name}**: ${tool.description}\n`;
          if (tool.inputSchema) {
            systemPrompt += `  参数: ${JSON.stringify(tool.inputSchema)}\n`;
          }
        });
        systemPrompt += `\n要使用工具，请在回复中明确说明你想使用哪个工具以及参数。\n`;
      }

      // 添加系统提示词
      const fullMessages: ChatMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ];

      logger.info('🚀 准备发送API请求');
      logger.info(`   消息数量：${fullMessages.length} 条`);
      logger.info(`   模型：qwen-vl-max-latest`);
      
      // 详细日志：每条消息的大小
      fullMessages.forEach((msg, index) => {
        const contentStr = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        const size = contentStr.length;
        logger.info(`   消息${index + 1} [${msg.role}]: ${size} 字符`);
      });

      const stream = await this.client.chat.completions.create({
        model: 'qwen-vl-max-latest',
        messages: fullMessages as any,
        stream: true,
      });

      logger.info('✅ API请求成功，开始接收流式响应');

      let chunkCount = 0;
      let totalContent = 0;
      let usageInfo: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
      const startTime = Date.now();
      
      try {
        for await (const chunk of stream) {
          chunkCount++;
          
          // 📊 记录完整的 chunk 数据结构（前3个chunk）
          if (chunkCount <= 3) {
            logger.info(`📦 Chunk ${chunkCount} 完整数据:`, JSON.stringify(chunk, null, 2));
          }
          
          // 📊 检查是否有 usage 信息
          if (chunk.usage) {
            logger.info('💰 发现 usage 信息:', JSON.stringify(chunk.usage, null, 2));
            usageInfo = {
              prompt_tokens: chunk.usage.prompt_tokens || 0,
              completion_tokens: chunk.usage.completion_tokens || 0,
              total_tokens: chunk.usage.total_tokens || 0,
            };
          }
          
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            totalContent += content.length;
            yield content;
          }
          
          // 每100个chunk记录一次进度
          if (chunkCount % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            logger.info(`📊 流式响应进度：已接收 ${chunkCount} 个chunk，${totalContent} 字符，耗时 ${elapsed}s`);
          }
        }
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`✅ 流式响应接收完成：共 ${chunkCount} 个chunk，${totalContent} 字符，耗时 ${elapsed}s`);
        
        // 返回 usage 信息
        return { usage: usageInfo };
      } catch (streamError: any) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.error('❌ 流式响应中断：', {
          errorType: streamError.constructor?.name || 'Unknown',
          errorMessage: streamError.message || 'No message',
          errorStack: streamError.stack,
          chunkCount,
          totalContent,
          elapsed: `${elapsed}s`,
          // 尝试获取更多错误信息
          cause: streamError.cause,
          code: streamError.code,
          errno: streamError.errno,
          syscall: streamError.syscall,
        });
        throw streamError;
      }
    } catch (error: any) {
      logger.error('❌ AI Service 错误详情：', {
        errorType: error.constructor.name,
        errorMessage: error.message,
        httpStatus: error.response?.status,
        responseData: error.response?.data,
        errorCode: error.code,
        errorTypeField: error.type,
        fullError: error,
      });
      
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.client !== null;
  }
  
  // 获取所有已启用的MCP服务器的工具列表
  private async getMCPTools(): Promise<Array<{
    name: string;
    description: string;
    inputSchema?: any;
    server: string;
  }>> {
    try {
      // 获取所有MCP服务器
      const servers = await window.electronAPI.mcpGetServers();
      
      const allTools: Array<{
        name: string;
        description: string;
        inputSchema?: any;
        server: string;
      }> = [];
      
      // 获取每个已启用服务器的工具
      for (const server of servers) {
        if (!server.enabled) continue;
        
        // 检查服务器状态
        const status = await window.electronAPI.mcpGetStatus(server.id);
        if (status !== 'connected') {
          logger.warn(`MCP服务器 ${server.name} 未连接，跳过`);
          continue;
        }
        
        try {
          logger.info(`📡 正在获取 MCP 服务器 ${server.name} 的工具...`);
          const tools = await window.electronAPI.mcpGetTools(server.id);
          
          // 添加服务器名称到工具
          const toolsWithServer = tools.map((t: any) => ({
            name: t.name,
            description: t.description || t.name,
            inputSchema: t.inputSchema,
            server: server.name
          }));
          
          allTools.push(...toolsWithServer);
          logger.info(`✅ 从 ${server.name} 获取到 ${tools.length} 个工具`);
        } catch (error) {
          logger.warn(`获取MCP服务器 ${server.name} 的工具失败:`, error);
        }
      }
      
      logger.info(`📋 共找到 ${allTools.length} 个MCP工具`);
      return allTools;
    } catch (error) {
      logger.error('获取MCP工具失败:', error);
      return [];
    }
  }
}

// 单例实例
export const aiService = new AIService();
