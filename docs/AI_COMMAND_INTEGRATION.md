# AI 命令集成设计

## 目标

让 AI 能够像 Claude Code 和 Cline 一样，在对话过程中主动执行命令来访问文件系统，而不需要用户手动执行命令并粘贴结果。

---

## 当前问题

用户提问："你可以控制命令行吗？不能通过命令行看到这个文件的全部内容吗？"

AI 回复："我目前无法直接控制命令行或执行系统命令，也无法实时访问你的文件系统。但我可以通过你提供的截图或粘贴的内容来分析代码。不过，如果你希望我看到某个文件的全部内容，你可以：
1. 复制文件内容并粘贴给我
2. 或者使用 cat、less 等命令查看文件内容后，把输出粘贴过来"

**问题**：虽然我们已经实现了命令执行功能，但 AI 无法主动使用它！

---

## 解决方案

### 方案 1：工具调用模式（推荐）

类似 Claude Code 的实现，让 AI 通过工具调用来执行命令。

#### 实现步骤

1. **定义工具（Tools）**
   ```typescript
   const tools = [
     {
       type: "function",
       function: {
         name: "execute_command",
         description: "执行系统命令来访问文件、列出目录等",
         parameters: {
           type: "object",
           properties: {
             command: {
               type: "string",
               description: "要执行的命令，如 'cat file.txt' 或 'ls -la'"
             },
             cwd: {
               type: "string",
               description: "工作目录（可选）"
             }
           },
           required: ["command"]
         }
       }
     },
     {
       type: "function",
       function: {
         name: "read_file",
         description: "读取文件内容",
         parameters: {
           type: "object",
           properties: {
             path: {
               type: "string",
               description: "文件路径"
             }
           },
           required: ["path"]
         }
       }
     },
     {
       type: "function",
       function: {
         name: "list_directory",
         description: "列出目录内容",
         parameters: {
           type: "object",
           properties: {
             path: {
               type: "string",
               description: "目录路径"
             }
           },
           required: ["path"]
         }
       }
     }
   ];
   ```

2. **修改 AI 请求**
   - 在调用 OpenAI API 时添加 `tools` 参数
   - 处理 AI 的工具调用请求
   - 执行命令并返回结果
   - 继续对话

3. **工作流程**
   ```
   用户: "帮我看看 package.json 的内容"
       ↓
   AI: [调用工具] read_file({ path: "package.json" })
       ↓
   系统: 执行 cat package.json
       ↓
   系统: 返回文件内容给 AI
       ↓
   AI: "我看到了 package.json 的内容，这是一个..."
   ```

#### 优点
- ✅ 符合 OpenAI 标准
- ✅ AI 可以主动访问文件
- ✅ 用户体验好
- ✅ 安全可控

#### 缺点
- ⚠️ 需要修改 AI 请求逻辑
- ⚠️ 需要处理工具调用循环

---

### 方案 2：System Prompt 引导（简单但不完美）

在 System Prompt 中告诉 AI 可以使用特殊语法来执行命令。

#### 实现

```typescript
const systemPrompt = `
你是一个智能助手，可以通过以下方式访问用户的文件系统：

当你需要查看文件内容时，使用：
<execute_command>cat /path/to/file</execute_command>

当你需要列出目录时，使用：
<execute_command>ls -la /path/to/dir</execute_command>

系统会自动执行这些命令并将结果返回给你。
`;
```

然后在渲染 AI 回复时，检测并执行这些命令。

#### 优点
- ✅ 实现简单
- ✅ 不需要修改 API 调用

#### 缺点
- ❌ 不是标准做法
- ❌ AI 可能不会正确使用
- ❌ 需要额外的解析逻辑

---

## 推荐实现：方案 1（工具调用）

### 详细实现步骤

#### 1. 创建工具定义文件

`src/renderer/utils/aiTools.ts`
```typescript
export const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取文件的完整内容。适用于查看代码文件、配置文件等。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的绝对路径或相对路径"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "列出目录中的文件和子目录。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "目录的绝对路径或相对路径"
          },
          recursive: {
            type: "boolean",
            description: "是否递归列出子目录（默认 false）"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "执行系统命令。注意：只能执行安全的命令，危险命令会被拦截。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的命令"
          },
          cwd: {
            type: "string",
            description: "工作目录（可选）"
          }
        },
        required: ["command"]
      }
    }
  }
];
```

#### 2. 修改 SessionManager

`electron/sessionManager.ts` - 添加工具调用处理

```typescript
async startAIRequest(sessionId: string, messages: any[], userMessage: string, imageCount: number) {
  // ... 现有代码 ...
  
  // 添加 tools 参数
  const stream = await openai.chat.completions.create({
    model: this.model,
    messages: apiMessages,
    stream: true,
    tools: AI_TOOLS, // ← 添加工具定义
    tool_choice: "auto" // ← 让 AI 自动决定是否使用工具
  });
  
  // 处理流式响应
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    
    // 检查是否有工具调用
    if (delta.tool_calls) {
      // 处理工具调用
      await this.handleToolCalls(sessionId, delta.tool_calls);
    } else if (delta.content) {
      // 正常的文本回复
      currentResponse += delta.content;
      this.broadcastUpdate(sessionId, 'chunk', delta.content);
    }
  }
}

private async handleToolCalls(sessionId: string, toolCalls: any[]) {
  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);
    
    let result: string;
    
    switch (functionName) {
      case 'read_file':
        result = await this.executeReadFile(args.path);
        break;
      case 'list_directory':
        result = await this.executeListDirectory(args.path, args.recursive);
        break;
      case 'execute_command':
        result = await this.executeCommand(args.command, args.cwd);
        break;
      default:
        result = `Unknown tool: ${functionName}`;
    }
    
    // 将工具调用结果添加到消息历史
    session.messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result
    });
    
    // 继续 AI 请求（带上工具调用结果）
    await this.continueAIRequest(sessionId);
  }
}

private async executeReadFile(path: string): Promise<string> {
  try {
    const result = await commandExecutor.execute(`cat "${path}"`);
    return result.stdout || result.stderr;
  } catch (error) {
    return `Error reading file: ${error.message}`;
  }
}

private async executeListDirectory(path: string, recursive: boolean = false): Promise<string> {
  try {
    const cmd = recursive ? `ls -laR "${path}"` : `ls -la "${path}"`;
    const result = await commandExecutor.execute(cmd);
    return result.stdout || result.stderr;
  } catch (error) {
    return `Error listing directory: ${error.message}`;
  }
}

private async executeCommand(command: string, cwd?: string): Promise<string> {
  try {
    // 安全检查
    const security = CommandSecurity.checkCommand(command);
    if (!security.safe) {
      return `Command rejected: ${security.reason}`;
    }
    
    const result = await commandExecutor.execute(command, { cwd });
    return result.stdout || result.stderr;
  } catch (error) {
    return `Error executing command: ${error.message}`;
  }
}
```

#### 3. 更新 UI 显示

在 MessageItem 中显示工具调用：

```typescript
// 如果消息包含工具调用，显示一个折叠的区域
{message.tool_calls && (
  <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
    <details>
      <summary className="cursor-pointer">
        🔧 执行了 {message.tool_calls.length} 个工具调用
      </summary>
      <div className="mt-2 space-y-2">
        {message.tool_calls.map((call, i) => (
          <div key={i} className="p-2 bg-white rounded">
            <div className="font-semibold">{call.function.name}</div>
            <pre className="text-xs mt-1">{call.function.arguments}</pre>
          </div>
        ))}
      </div>
    </details>
  </div>
)}
```

---

## 实现优先级

### 第一阶段（核心功能）
1. ✅ 定义工具（read_file, list_directory, execute_command）
2. ✅ 修改 SessionManager 支持工具调用
3. ✅ 实现工具执行逻辑
4. ✅ 处理工具调用循环

### 第二阶段（用户体验）
1. ✅ UI 显示工具调用过程
2. ✅ 添加工具调用日志
3. ✅ 错误处理和提示

### 第三阶段（优化）
1. ⏳ 工具调用缓存
2. ⏳ 更多工具（search_files, write_file 等）
3. ⏳ 工具调用权限控制

---

## 安全考虑

1. **命令白名单**
   - 只允许安全的命令
   - 危险命令自动拦截

2. **路径限制**
   - 限制访问范围
   - 防止访问敏感目录

3. **用户确认**
   - 危险操作需要用户确认
   - 显示将要执行的命令

---

## 参考

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Claude Code 实现](https://github.com/anthropics/anthropic-quickstarts)
- [Cline 实现](https://github.com/cline/cline)
