import OpenAI from 'openai';
import { BrowserWindow } from 'electron';
import { logger } from './logger';
import { reportConversation } from './analytics';
import { getAllTools } from './aiTools';
import { commandExecutor } from './commandExecutor';
import { CommandSecurity } from './commandSecurity';
import { mcpManager } from './mcpManager';

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';  // ← 添加 'tool'
  content: string | any[] | null;  // ← 允许 null（工具调用时可能没有 content）
  imageUrls?: string[];
  clipboardImageUrls?: string[];
  timestamp: number;
  
  // 工具调用相关
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;  // 工具调用结果的 ID
}

export interface Session {
  id: string;
  name: string;
  messages: SessionMessage[];
  status: 'idle' | 'running' | 'completed' | 'error';
  currentResponse: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
  userMessage?: string; // 用于上报的用户消息
  imageCount?: number; // 用于上报的图片数量
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private client: OpenAI | null = null;
  private systemPrompt: string = '';
  private knowledge: string = '';
  private cancelFlags: Map<string, boolean> = new Map(); // 取消标志
  
  // 模型降级队列：从高级到低级
  private readonly MODEL_FALLBACK_QUEUE = [
    'qwen-vl-max-latest',
    'qwen-vl-max',
    'Qwen-VL',
    'qwen3-vl-plus',
    'qwen-vl-max-inc',
    'qwen-vl-plus-inc'
  ];

  async initialize(apiKey: string, knowledge?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://idealab.alibaba-inc.com/api/openai/v1',
    });
    this.knowledge = knowledge || '';
    
    // 构建系统提示词
    this.systemPrompt = `你是一个桌面AI助手，以可爱的小狗形象出现。

**重要提示：你现在拥有MCP (Model Context Protocol) 能力！**

你可以通过MCP工具访问外部服务和资源，例如：
- 文件系统操作（读写文件、列出目录等）
- 数据库查询
- API调用
- 更多扩展功能

当你收到工具列表时，请积极使用这些工具来帮助用户完成任务。

你的能力：
1. 理解用户屏幕上的内容（通过截图）
2. 理解用户粘贴板中的截图
3. 回答用户关于屏幕内容的问题
4. **访问用户的文件系统**（通过命令行工具）

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

**重要：文件系统访问**
当你需要查看文件内容、列出目录或执行命令时，你可以直接使用以下命令：

1. 查看文件内容：
   \`\`\`bash
   cat /path/to/file
   \`\`\`

2. 列出目录：
   \`\`\`bash
   ls -la /path/to/directory
   \`\`\`

3. 搜索文件：
   \`\`\`bash
   find /path -name "*.txt"
   \`\`\`

4. 搜索内容：
   \`\`\`bash
   grep -r "pattern" /path
   \`\`\`

**重要提示**：
- 当用户询问文件内容时，你应该主动使用 cat 命令查看
- 当用户询问项目结构时，你应该主动使用 ls 命令列出
- 不要让用户手动执行命令，你应该直接在回复中使用命令
- 命令会自动执行，结果会显示在你的回复中

**重要：建议回复格式**
当你需要建议用户回复某人或输出某段内容时，请严格按照以下格式输出：

建议回复："这里是具体的回复内容"

例如：
- 建议回复："好的，我会尽快处理"
- 建议回复："收到，谢谢提醒"
- 建议回复："明白了，我会注意的"

只有使用这个格式，系统才能自动将建议内容复制到用户的粘贴板中，方便用户直接粘贴使用。`;

    if (this.knowledge) {
      this.systemPrompt += `\n\n**背景知识**\n${this.knowledge}`;
    }

    logger.info('✅ SessionManager initialized');
  }

  // 创建新会话
  createSession(sessionId: string): Session {
    const session: Session = {
      id: sessionId,
      name: '新对话',
      messages: [],
      status: 'idle',
      currentResponse: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    logger.info(`📝 Created new session: ${sessionId}`);
    
    return session;
  }

  // 开始 AI 请求（支持工具调用）
  async startAIRequest(
    sessionId: string,
    messages: SessionMessage[],
    userMessage: string,
    imageCount: number
  ) {
    const session = this.sessions.get(sessionId);
    if (!session || !this.client) {
      logger.error(`❌ Session not found or client not initialized: ${sessionId}`);
      return;
    }

    // 更新会话状态
    session.status = 'running';
    session.messages = messages;
    session.currentResponse = '';
    session.updatedAt = Date.now();
    session.userMessage = userMessage;
    session.imageCount = imageCount;

    // 自动命名（使用第一条用户消息）
    if (session.name === '新对话' && userMessage) {
      session.name = userMessage.length > 20 
        ? userMessage.substring(0, 20) + '...' 
        : userMessage;
    }

    this.notifyWindows(sessionId, {
      type: 'status',
      status: 'running',
    });

    try {
      // 开始 AI 请求循环（支持工具调用）
      await this.processAIRequest(sessionId);

      // 完成
      session.status = 'completed';
      session.updatedAt = Date.now();

      logger.info(`✅ AI request completed for session: ${sessionId}`);

      // 通知完成
      this.notifyWindows(sessionId, {
        type: 'completed',
        response: session.currentResponse,
        usage: session.usage,
      });

      // 上报数据
      await this.reportSession(sessionId);

    } catch (error: any) {
      logger.error(`❌ AI request failed for session ${sessionId}:`, error);
      
      session.status = 'error';
      session.error = error.message;
      session.updatedAt = Date.now();

      this.notifyWindows(sessionId, {
        type: 'error',
        error: error.message,
      });
    } finally {
      // 确保无论如何都将状态设置为非running
      if (session.status === 'running') {
        session.status = 'completed';
        session.updatedAt = Date.now();
        
        // 如果还在running状态，说明processAIRequest没有正常完成
        // 发送completed通知确保前端UI更新
        this.notifyWindows(sessionId, {
          type: 'completed',
          response: session.currentResponse,
          usage: session.usage,
        });
        
        logger.warn(`⚠️ Session ${sessionId} was still running, forced to completed`);
      }
    }
  }

  /**
   * 带模型降级机制的 API 调用
   * 当请求模型失败时，自动降级到下一个更低级的模型
   * @param chatMessages 聊天消息
   * @param sessionId 会话ID
   * @param startModelIndex 起始模型索引（默认0，即最高级模型）
   */
  private async callAPIWithFallback(
    chatMessages: any[],
    sessionId: string,
    startModelIndex: number = 0
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    let lastError: Error | null = null;
    
    // 遍历模型队列，从startModelIndex开始
    for (let i = startModelIndex; i < this.MODEL_FALLBACK_QUEUE.length; i++) {
      const model = this.MODEL_FALLBACK_QUEUE[i];
      
      try {
        logger.info(`🚀 Trying model: ${model} (${i + 1}/${this.MODEL_FALLBACK_QUEUE.length})`);
        
        // 动态获取所有工具（本地 + MCP）
        console.log('🎯 [sessionManager] 准备调用 getAllTools()...');
        const allTools = await getAllTools();
        console.log(`📦 [sessionManager] getAllTools() 返回了 ${allTools.length} 个工具`);
        logger.info(`📦 Using ${allTools.length} tools (local + MCP)`);
        
        // 调用 API
        const stream = await this.client!.chat.completions.create({
          model: model,
          messages: chatMessages,
          stream: true,
          tools: allTools,
          tool_choice: 'auto'
        });
        
        // 检查流的第一个chunk是否包含错误
        // 需要先读取第一个chunk来验证
        const iterator = stream[Symbol.asyncIterator]();
        const firstResult = await iterator.next();
        
        if (firstResult.done) {
          throw new Error('Stream ended without any data');
        }
        
        const firstChunk = firstResult.value;
        
        // 检查第一个chunk是否包含错误信息
        const chunkStr = JSON.stringify(firstChunk);
        if (chunkStr.includes('error') || 
            chunkStr.includes('HTTP_STATUS') || 
            chunkStr.includes('TOO_MANY_REQUESTS') ||
            chunkStr.includes('Throttling') ||
            chunkStr.includes('AllocationQuota')) {
          logger.error(`❌ Error detected in stream response: ${chunkStr.substring(0, 300)}`);
          throw new Error(`API returned error: ${chunkStr.substring(0, 100)}`);
        }
        
        // 创建一个新的异步迭代器，包含第一个chunk和剩余的chunk
        const streamWrapper = (async function* () {
          // 先yield第一个chunk
          yield firstChunk;
          // 然后yield剩余的chunk
          for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
            yield chunk;
          }
        })();
        
        logger.info(`✅ API call successful with model: ${model}`);
        return streamWrapper;
        
      } catch (error: any) {
        lastError = error;
        logger.error(`❌ Model ${model} failed:`, error.message);
        
        // 如果还有更低级的模型，进行降级
        if (i < this.MODEL_FALLBACK_QUEUE.length - 1) {
          const nextModel = this.MODEL_FALLBACK_QUEUE[i + 1];
          const message = `✅ 模型 ${model} 请求失败，本轮对话自动切换到同级别模型：${nextModel}`;
          logger.warn(message);
          
          // 立即通知前端显示降级信息
          this.notifyWindows(sessionId, {
            type: 'model-downgrade',
            failedModel: model,
            currentModel: nextModel,
            modelIndex: i + 1,
            totalModels: this.MODEL_FALLBACK_QUEUE.length,
            message: message,
            error: error.message,
          });
          
          // 短暂延迟后尝试下一个模型
          logger.warn(`⏬ Will try next model in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // 所有模型都失败了
          logger.error(`❌ All ${this.MODEL_FALLBACK_QUEUE.length} models failed`);
          
          // 通知前端所有模型都失败
          this.notifyWindows(sessionId, {
            type: 'all-models-failed',
            error: error.message,
          });
          
          throw new Error(`所有${this.MODEL_FALLBACK_QUEUE.length}个模型都调用失败。最后错误: ${error.message}`);
        }
      }
    }
    
    throw lastError || new Error('No models available');
  }

  // 处理 AI 请求（支持工具调用循环）
  private async processAIRequest(sessionId: string, maxDepth: number = 5): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !this.client) {
      throw new Error('Session not found or client not initialized');
    }

    if (maxDepth <= 0) {
      logger.warn(`⚠️ Max tool call depth reached for session: ${sessionId}`);
      return;
    }

    // 构建消息
    const chatMessages: any[] = this.buildChatMessages(session);

    logger.info(`🚀 Processing AI request for session: ${sessionId} (depth: ${6 - maxDepth})`);
    logger.info(`   Messages: ${chatMessages.length}`);

    // 调用 API（带模型降级机制）
    const stream = await this.callAPIWithFallback(chatMessages, sessionId);

    // 处理流式响应
    let currentToolCalls: any[] = [];
    let hasContent = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // 处理工具调用
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;

          if (!currentToolCalls[index]) {
            currentToolCalls[index] = {
              id: toolCallDelta.id || '',
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: ''
              }
            };
          }

          // 累积参数
          if (toolCallDelta.function?.arguments) {
            currentToolCalls[index].function.arguments += toolCallDelta.function.arguments;
          }
        }
      }

      // 处理文本内容
      if (delta.content) {
        hasContent = true;
        session.currentResponse += delta.content;
        session.updatedAt = Date.now();

        // 通知窗口
        this.notifyWindows(sessionId, {
          type: 'chunk',
          content: session.currentResponse,
        });
      }

      // 提取 usage 信息
      if (chunk.usage) {
        session.usage = {
          prompt_tokens: chunk.usage.prompt_tokens || 0,
          completion_tokens: chunk.usage.completion_tokens || 0,
          total_tokens: chunk.usage.total_tokens || 0,
        };
      }
    }

    // 检查是否有工具调用
    if (currentToolCalls.length > 0) {
      logger.info(`🔧 AI requested ${currentToolCalls.length} tool calls`);

      // 添加 assistant 消息（包含工具调用）
      session.messages.push({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: session.currentResponse || null,
        tool_calls: currentToolCalls,
        timestamp: Date.now(),
      });

      // 执行工具调用
      await this.executeToolCalls(sessionId, currentToolCalls);

      // 递归继续 AI 请求
      await this.processAIRequest(sessionId, maxDepth - 1);
    } else if (hasContent) {
      // 没有工具调用，只有文本内容
      session.messages.push({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: session.currentResponse,
        timestamp: Date.now(),
      });
    }
  }

  // 构建聊天消息
  private buildChatMessages(session: Session): any[] {
    const messages: any[] = [
      {
        role: 'system',
        content: this.systemPrompt,
      }
    ];

    for (const msg of session.messages) {
      if (msg.role === 'tool') {
        // 工具调用结果
        messages.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.content,
        });
      } else if (msg.tool_calls) {
        // 包含工具调用的 assistant 消息
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        });
      } else {
        // 普通消息
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return messages;
  }

  // 执行工具调用
  private async executeToolCalls(sessionId: string, toolCalls: any[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      logger.info(`🔧 Executing tool: ${functionName}`, args);

      // 构建命令显示字符串
      let commandDisplay = '';
      switch (functionName) {
        case 'execute_command':
          commandDisplay = args.command;
          break;
        case 'read_file':
          commandDisplay = `cat "${args.path}"`;
          break;
        case 'list_directory':
          commandDisplay = args.recursive ? `ls -laR "${args.path}"` : `ls -la "${args.path}"`;
          break;
        case 'search_files':
          commandDisplay = `grep -r "${args.pattern}" "${args.path}"`;
          break;
        case 'find_file':
          commandDisplay = `find "${args.base_path || '~'}" -name "*${args.query}*"`;
          break;
        case 'smart_read':
          commandDisplay = `smart_read "${args.query}"`;
          break;
        default:
          commandDisplay = functionName;
      }

      // 通知前端：开始执行命令
      this.notifyWindows(sessionId, {
        type: 'tool-executing',
        toolCallId: toolCall.id,
        toolName: functionName,
        command: commandDisplay,
        args: args,
      });

      // 执行工具
      let result: string;
      let status: 'completed' | 'failed' = 'completed';
      try {
        // 处理带前缀的工具名
        let actualFunctionName = functionName;
        let isMCPTool = false;
        let isLocalTool = false;
        
        // 检查是否是MCP工具（mcp_开头）
        if (functionName.startsWith('mcp_')) {
          isMCPTool = true;
        }
        // 检查是否是本地工具（local_开头）
        else if (functionName.startsWith('local_')) {
          isLocalTool = true;
          actualFunctionName = functionName.substring(6); // 移除 "local_"
        }
        
        // 如果是MCP工具，直接调用mcpManager
        if (isMCPTool) {
          try {
            logger.info(`🔧 Routing to MCP tool: ${functionName}`);
            const mcpResult = await mcpManager.callTool(functionName, args);
            result = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult, null, 2);
          } catch (mcpError: any) {
            result = `MCP tool error: ${mcpError.message}`;
            status = 'failed';
            logger.error(`❌ MCP tool failed: ${functionName}`, mcpError);
          }
        }
        // 本地工具处理
        else {
          switch (actualFunctionName) {
            case 'find_file':
              result = await this.executeFindFile(args.query, args.file_type, args.base_path, args.max_results);
              break;
            case 'smart_read':
              result = await this.executeSmartRead(args.query, args.file_type, args.base_path);
              break;
            case 'read_file':
              result = await this.executeReadFile(args.path);
              break;
            case 'list_directory':
              result = await this.executeListDirectory(args.path, args.recursive);
              break;
            case 'execute_command':
              result = await this.executeCommand(args.command, args.cwd);
              break;
            case 'search_files':
              result = await this.executeSearchFiles(args.pattern, args.path, args.recursive);
              break;
            default:
              // 向后兼容：检查是否是旧格式的MCP工具（包含"__"但没有mcp_前缀）
              if (functionName.includes('__')) {
                try {
                  logger.info(`🔧 Routing to MCP tool (legacy format): ${functionName}`);
                  const mcpResult = await mcpManager.callTool(functionName, args);
                  result = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult, null, 2);
                } catch (mcpError: any) {
                  result = `MCP tool error: ${mcpError.message}`;
                  status = 'failed';
                  logger.error(`❌ MCP tool failed: ${functionName}`, mcpError);
                }
              } else {
                result = `Unknown tool: ${functionName}`;
                status = 'failed';
              }
              break;
          }
        }
      } catch (error: any) {
        result = `Error executing tool: ${error.message}`;
        status = 'failed';
        logger.error(`❌ Tool execution failed:`, error);
      }

      logger.info(`✅ Tool executed: ${functionName}`);

      // 通知前端：命令执行完成
      this.notifyWindows(sessionId, {
        type: 'tool-completed',
        toolCallId: toolCall.id,
        toolName: functionName,
        command: commandDisplay,
        result: result,
        status: status,
      });

      // 将工具调用结果添加到消息历史
      session.messages.push({
        id: `tool-result-${Date.now()}`,
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
        timestamp: Date.now(),
      });
    }
  }

  // 通知所有窗口
  private notifyWindows(sessionId: string, data: any) {
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('session-update', {
          sessionId,
          ...data,
        });
      }
    });
  }

  // 获取会话
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  // 获取所有会话
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // 取消会话
  cancelSession(sessionId: string): boolean {
    logger.info(`🛑 Cancelling session: ${sessionId}`);
    this.cancelFlags.set(sessionId, true);
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.updatedAt = Date.now();
    }
    
    return true;
  }
  
  // 删除会话
  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.cancelFlags.delete(sessionId);
      logger.info(`🗑️ Deleted session: ${sessionId}`);
    }
    return deleted;
  }

  // 上报会话数据
  private async reportSession(sessionId: string) {
    logger.info(`📊 开始上报会话数据: ${sessionId}`);
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`⚠️ Session not found for reporting: ${sessionId}`);
      return;
    }

    try {
      // 获取用户信息（从 electron-store）
      const Store = (await import('electron-store')).default;
      const store = new Store();
      const userInfo = store.get('userInfo') as any;

      if (!userInfo) {
        logger.warn('⚠️ No user info, skip reporting');
        return;
      }

      // 计算 token
      let tokens: number;
      if (session.usage) {
        tokens = session.usage.total_tokens;
        logger.info(`✅ Using actual token from API: ${tokens}`);
      } else {
        // 回退到估算
        const { calculateConversationTokens } = await import('./analytics');
        tokens = calculateConversationTokens(
          session.userMessage || '',
          session.currentResponse,
          session.imageCount || 0
        );
        logger.warn(`⚠️ API did not return token, using estimation: ${tokens}`);
      }

      // 上报
      const reportResult = await reportConversation({
        staffName: userInfo.name,
        staffId: userInfo.workid,
        traceId: sessionId,
        token: tokens,
      });

      logger.info(`✅ Session data reported: ${sessionId}`);
      
      // 通知渲染进程上报完成
      this.notifyWindows(sessionId, {
        type: 'reported',
        reportResult: reportResult,
      });
    } catch (error) {
      logger.error(`❌ Failed to report session ${sessionId}:`, error);
      
      // 即使失败也通知渲染进程
      this.notifyWindows(sessionId, {
        type: 'report-failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 加载会话（从持久化存储）
  loadSessions(sessions: Session[]) {
    sessions.forEach(session => {
      this.sessions.set(session.id, session);
    });
    logger.info(`📂 Loaded ${sessions.length} sessions from storage`);
  }

  // 清空所有会话
  clearAllSessions() {
    this.sessions.clear();
    logger.info('🗑️ Cleared all sessions');
  }

  // ========== 工具调用相关方法 ==========

  /**
   * 执行 read_file 工具
   */
  private async executeReadFile(path: string): Promise<string> {
    try {
      logger.info(`📖 Reading file: ${path}`);
      const result = await commandExecutor.execute(`cat "${path}"`);
      
      if (result.exitCode !== 0) {
        return `Error reading file: ${result.stderr || 'Unknown error'}`;
      }
      
      return result.stdout || '';
    } catch (error: any) {
      logger.error(`❌ Failed to read file ${path}:`, error);
      return `Error reading file: ${error.message}`;
    }
  }

  /**
   * 执行 list_directory 工具
   */
  private async executeListDirectory(path: string, recursive: boolean = false): Promise<string> {
    try {
      logger.info(`📂 Listing directory: ${path} (recursive: ${recursive})`);
      const cmd = recursive ? `ls -laR "${path}"` : `ls -la "${path}"`;
      const result = await commandExecutor.execute(cmd);
      
      if (result.exitCode !== 0) {
        return `Error listing directory: ${result.stderr || 'Unknown error'}`;
      }
      
      return result.stdout || '';
    } catch (error: any) {
      logger.error(`❌ Failed to list directory ${path}:`, error);
      return `Error listing directory: ${error.message}`;
    }
  }

  /**
   * 执行 execute_command 工具
   */
  private async executeCommand(command: string, cwd?: string): Promise<string> {
    try {
      logger.info(`⚡ Executing command: ${command}`);
      
      // 安全检查
      const security = CommandSecurity.checkCommand(command);
      if (!security.safe) {
        logger.warn(`🚫 Command rejected: ${command}`);
        return `Command rejected for security reasons: ${security.reason}`;
      }
      
      const result = await commandExecutor.execute(command, { cwd });
      
      if (result.exitCode !== 0) {
        return `Command failed (exit code ${result.exitCode}):\n${result.stderr || result.stdout}`;
      }
      
      return result.stdout || result.stderr || 'Command executed successfully (no output)';
    } catch (error: any) {
      logger.error(`❌ Failed to execute command ${command}:`, error);
      return `Error executing command: ${error.message}`;
    }
  }

  /**
   * 执行 search_files 工具
   */
  private async executeSearchFiles(pattern: string, path: string, recursive: boolean = true): Promise<string> {
    try {
      logger.info(`🔍 Searching files: pattern="${pattern}" path="${path}"`);
      const recursiveFlag = recursive ? '-r' : '';
      const cmd = `grep ${recursiveFlag} -n "${pattern}" "${path}" 2>/dev/null || echo "No matches found"`;
      const result = await commandExecutor.execute(cmd);
      
      return result.stdout || result.stderr || 'No matches found';
    } catch (error: any) {
      logger.error(`❌ Failed to search files:`, error);
      return `Error searching files: ${error.message}`;
    }
  }

  /**
   * 执行 find_file 工具
   */
  private async executeFindFile(query: string, fileType?: string, basePath?: string, maxResults?: number): Promise<string> {
    try {
      logger.info(`🔍 Finding files: query="${query}", type="${fileType || 'all'}"`);
      const files = await commandExecutor.findFile(query, fileType, basePath, maxResults);
      
      if (files.length === 0) {
        return `未找到匹配的文件。\n\n搜索条件：\n- 关键词：${query}\n- 文件类型：${fileType || '所有类型'}\n- 搜索路径：${basePath || '~/Code'}`;
      }
      
      const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');
      return `找到 ${files.length} 个匹配的文件：\n\n${fileList}`;
    } catch (error: any) {
      logger.error(`❌ Failed to find files:`, error);
      return `Error finding files: ${error.message}`;
    }
  }

  /**
   * 执行 smart_read 工具
   */
  private async executeSmartRead(query: string, fileType?: string, basePath?: string): Promise<string> {
    try {
      logger.info(`📖 Smart reading: query="${query}"`);
      const result = await commandExecutor.smartRead(query, fileType, basePath);
      return result.data;
    } catch (error: any) {
      logger.error(`❌ Failed to smart read:`, error);
      return `Error smart reading: ${error.message}`;
    }
  }
}

export const sessionManager = new SessionManager();
