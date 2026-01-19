# AI 命令集成 - 完整方案详解

## 目标

实现像 Claude Code 和 Cline 一样的自动命令执行功能，让 AI 能够主动执行命令并获取结果，无需用户手动复制粘贴。

---

## 方案对比

### 当前实现（简化方案）

**工作流程：**
```
用户: "帮我看看 package.json 的内容"
    ↓
AI: "让我帮你查看，请执行：cat package.json"
    ↓
用户: 手动执行命令
    ↓
用户: 复制输出并粘贴给 AI
    ↓
AI: "我看到了 package.json 的内容..."
```

**优点：**
- ✅ 实现简单
- ✅ 不需要修改 API 调用逻辑
- ✅ AI 知道可以使用命令

**缺点：**
- ❌ 需要用户手动操作
- ❌ 体验不流畅
- ❌ 不是真正的自动化

---

### 完整方案（OpenAI Function Calling）

**工作流程：**
```
用户: "帮我看看 package.json 的内容"
    ↓
AI: [调用工具] read_file({ path: "package.json" })
    ↓
系统: 自动执行 cat package.json
    ↓
系统: 将结果返回给 AI
    ↓
AI: "我看到了 package.json 的内容，这是一个..."
```

**优点：**
- ✅ 完全自动化
- ✅ 用户体验好
- ✅ 符合 OpenAI 标准
- ✅ 可以多轮调用

**缺点：**
- ⚠️ 实现复杂
- ⚠️ 需要处理工具调用循环
- ⚠️ 代码改动较大

---

## 完整方案技术细节

### 1. OpenAI Function Calling 原理

#### 1.1 工具定义

```typescript
const tools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取文件的完整内容",
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
  }
];
```

#### 1.2 API 调用

```typescript
const response = await openai.chat.completions.create({
  model: "qwen-vl-max-latest",
  messages: [
    { role: "system", content: "你是一个助手..." },
    { role: "user", content: "帮我看看 package.json" }
  ],
  tools: tools,           // ← 添加工具定义
  tool_choice: "auto"     // ← 让 AI 自动决定是否使用工具
});
```

#### 1.3 AI 响应（可能包含工具调用）

```typescript
{
  choices: [{
    message: {
      role: "assistant",
      content: null,  // ← 没有文本内容
      tool_calls: [{  // ← 有工具调用
        id: "call_abc123",
        type: "function",
        function: {
          name: "read_file",
          arguments: '{"path": "package.json"}'
        }
      }]
    }
  }]
}
```

#### 1.4 执行工具并返回结果

```typescript
// 1. 执行工具
const result = await executeReadFile("package.json");

// 2. 将结果添加到消息历史
messages.push({
  role: "tool",
  tool_call_id: "call_abc123",
  content: result  // ← 文件内容
});

// 3. 继续 AI 请求（带上工具调用结果）
const response2 = await openai.chat.completions.create({
  model: "qwen-vl-max-latest",
  messages: messages,  // ← 包含工具调用结果
  tools: tools
});
```

#### 1.5 AI 最终响应

```typescript
{
  choices: [{
    message: {
      role: "assistant",
      content: "我看到了 package.json 的内容，这是一个 Electron 应用..."
    }
  }]
}
```

---

### 2. 完整实现步骤

#### 步骤 1：修改 API 调用（添加 tools 参数）

```typescript
// electron/sessionManager.ts

async startAIRequest(sessionId: string, messages: SessionMessage[], ...) {
  // ... 现有代码 ...
  
  // 添加 tools 参数
  const stream = await this.client.chat.completions.create({
    model: 'qwen-vl-max-latest',
    messages: chatMessages,
    stream: true,
    tools: AI_TOOLS,        // ← 添加工具定义
    tool_choice: "auto"     // ← 让 AI 自动决定
  });
  
  // ... 处理响应 ...
}
```

#### 步骤 2：处理流式响应中的工具调用

```typescript
// 流式响应可能包含工具调用
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  
  // 检查是否有工具调用
  if (delta.tool_calls) {
    // 收集工具调用（可能分多个 chunk）
    if (!currentToolCalls) {
      currentToolCalls = [];
    }
    
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
        currentToolCalls[index].function.arguments += 
          toolCallDelta.function.arguments;
      }
    }
  } else if (delta.content) {
    // 正常的文本回复
    session.currentResponse += delta.content;
    this.notifyWindows(sessionId, {
      type: 'chunk',
      content: session.currentResponse
    });
  }
}
```

#### 步骤 3：执行工具调用

```typescript
// 流结束后，检查是否有工具调用
if (currentToolCalls && currentToolCalls.length > 0) {
  logger.info(`🔧 AI requested ${currentToolCalls.length} tool calls`);
  
  // 执行所有工具调用
  for (const toolCall of currentToolCalls) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);
    
    logger.info(`🔧 Executing tool: ${functionName}`, args);
    
    // 通知用户正在执行工具
    this.notifyWindows(sessionId, {
      type: 'tool-call',
      toolName: functionName,
      args: args
    });
    
    // 执行工具
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
      case 'search_files':
        result = await this.executeSearchFiles(args.pattern, args.path, args.recursive);
        break;
      default:
        result = `Unknown tool: ${functionName}`;
    }
    
    logger.info(`✅ Tool executed: ${functionName}`);
    
    // 将工具调用结果添加到消息历史
    session.messages.push({
      id: `tool-${Date.now()}`,
      role: 'assistant',
      content: '', // 工具调用没有文本内容
      tool_calls: [toolCall],
      timestamp: Date.now()
    });
    
    session.messages.push({
      id: `tool-result-${Date.now()}`,
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result,
      timestamp: Date.now()
    });
  }
  
  // 继续 AI 请求（带上工具调用结果）
  await this.continueAIRequest(sessionId);
}
```

#### 步骤 4：继续 AI 请求

```typescript
private async continueAIRequest(sessionId: string) {
  const session = this.sessions.get(sessionId);
  if (!session || !this.client) return;
  
  logger.info(`🔄 Continuing AI request with tool results`);
  
  // 构建消息（包含工具调用结果）
  const chatMessages = [
    {
      role: 'system',
      content: this.systemPrompt
    },
    ...session.messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.content
        };
      } else if (msg.tool_calls) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls
        };
      } else {
        return {
          role: msg.role,
          content: msg.content
        };
      }
    })
  ];
  
  // 重新调用 API
  const stream = await this.client.chat.completions.create({
    model: 'qwen-vl-max-latest',
    messages: chatMessages,
    stream: true,
    tools: AI_TOOLS,
    tool_choice: "auto"
  });
  
  // 处理响应（可能又有工具调用）
  // ... 重复步骤 2-4 ...
}
```

---

### 3. 类型定义更新

```typescript
// electron/sessionManager.ts

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';  // ← 添加 'tool'
  content: string | any[];
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
```

---

### 4. UI 显示工具调用

```typescript
// src/renderer/components/MessageItem.tsx

// 显示工具调用
{message.tool_calls && (
  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
    <div className="flex items-center gap-2 text-sm text-blue-700 font-medium mb-2">
      <span>🔧</span>
      <span>执行了 {message.tool_calls.length} 个工具调用</span>
    </div>
    <details className="text-xs">
      <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
        查看详情
      </summary>
      <div className="mt-2 space-y-2">
        {message.tool_calls.map((call, i) => {
          const args = JSON.parse(call.function.arguments);
          return (
            <div key={i} className="p-2 bg-white rounded border border-blue-100">
              <div className="font-semibold text-blue-700">
                {call.function.name}
              </div>
              <pre className="mt-1 text-gray-600 overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </details>
  </div>
)}

// 显示工具调用结果
{message.role === 'tool' && (
  <div className="p-3 bg-gray-50 border border-gray-200 rounded">
    <div className="text-xs text-gray-500 mb-1">工具执行结果：</div>
    <pre className="text-sm text-gray-700 overflow-x-auto whitespace-pre-wrap">
      {message.content}
    </pre>
  </div>
)}
```

---

### 5. 完整工作流程示例

#### 示例 1：读取文件

```
用户: "帮我看看 package.json 的内容"

→ AI 请求 1:
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: "帮我看看 package.json 的内容" }
  ]
  tools: [read_file, list_directory, ...]

← AI 响应 1:
  tool_calls: [{
    id: "call_123",
    function: {
      name: "read_file",
      arguments: '{"path": "package.json"}'
    }
  }]

→ 执行工具:
  result = executeReadFile("package.json")
  // 返回文件内容

→ AI 请求 2:
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: "帮我看看 package.json 的内容" },
    { role: "assistant", tool_calls: [...] },
    { role: "tool", tool_call_id: "call_123", content: "文件内容..." }
  ]

← AI 响应 2:
  content: "我看到了 package.json 的内容，这是一个 Electron 应用..."
```

#### 示例 2：多轮工具调用

```
用户: "找出所有 .ts 文件，然后读取 main.ts 的内容"

→ AI 请求 1:
  messages: [{ role: "user", content: "..." }]

← AI 响应 1:
  tool_calls: [{
    function: { name: "execute_command", arguments: '{"command": "find . -name *.ts"}' }
  }]

→ 执行工具 1:
  result = "main.ts\npreload.ts\n..."

→ AI 请求 2:
  messages: [..., { role: "tool", content: "main.ts\npreload.ts\n..." }]

← AI 响应 2:
  tool_calls: [{
    function: { name: "read_file", arguments: '{"path": "main.ts"}' }
  }]

→ 执行工具 2:
  result = "import { app } from 'electron'..."

→ AI 请求 3:
  messages: [..., { role: "tool", content: "import { app }..." }]

← AI 响应 3:
  content: "我找到了以下 .ts 文件：main.ts, preload.ts...
           main.ts 的内容是..."
```

---

## 实现难点

### 1. 流式响应中的工具调用

**问题：** 工具调用可能分散在多个 chunk 中

**解决：** 需要累积工具调用信息

```typescript
// 工具调用可能这样返回：
chunk 1: { tool_calls: [{ index: 0, id: "call_123" }] }
chunk 2: { tool_calls: [{ index: 0, function: { name: "read_file" } }] }
chunk 3: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] }
chunk 4: { tool_calls: [{ index: 0, function: { arguments: ' "package.json"}' } }] }
```

### 2. 工具调用循环

**问题：** AI 可能连续调用多个工具

**解决：** 递归处理，直到 AI 不再调用工具

```typescript
async function processAIResponse(sessionId) {
  const response = await callAI();
  
  if (response.tool_calls) {
    // 执行工具
    await executeTools(response.tool_calls);
    // 继续请求
    await processAIResponse(sessionId);  // ← 递归
  } else {
    // 完成
    return response.content;
  }
}
```

### 3. 错误处理

**问题：** 工具执行可能失败

**解决：** 将错误信息返回给 AI

```typescript
try {
  result = await executeReadFile(path);
} catch (error) {
  result = `Error reading file: ${error.message}`;
}

// AI 会看到错误信息，可能会尝试其他方法
```

---

## 预计工作量

### 代码修改

1. **electron/sessionManager.ts** - 约 200 行
   - 修改 `startAIRequest` 方法
   - 添加工具调用处理逻辑
   - 添加 `continueAIRequest` 方法
   - 处理流式响应中的工具调用

2. **src/renderer/components/MessageItem.tsx** - 约 50 行
   - 显示工具调用
   - 显示工具调用结果

3. **src/types/window.d.ts** - 约 20 行
   - 更新类型定义

### 测试工作

1. 单个工具调用测试
2. 多轮工具调用测试
3. 错误处理测试
4. UI 显示测试

### 总计

- **代码量：** 约 300 行
- **工作时间：** 约 3-4 小时
- **测试时间：** 约 1-2 小时

---

## 总结

### 简化方案 vs 完整方案

| 特性 | 简化方案 | 完整方案 |
|------|---------|---------|
| 实现难度 | ⭐ 简单 | ⭐⭐⭐⭐ 复杂 |
| 用户体验 | ⭐⭐ 需要手动操作 | ⭐⭐⭐⭐⭐ 完全自动 |
| 代码改动 | ⭐ 很小 | ⭐⭐⭐⭐ 较大 |
| 工作时间 | 30 分钟 | 4-6 小时 |
| 符合标准 | ❌ 非标准 | ✅ OpenAI 标准 |
| 多轮调用 | ❌ 不支持 | ✅ 支持 |

### 建议

1. **如果时间紧张**：使用简化方案，快速上线
2. **如果追求体验**：实现完整方案，提供最佳体验
3. **渐进式实现**：先用简化方案，后续升级到完整方案

---

**文档创建时间**：2026年1月19日 下午4:08  
**作者**：哈雅 (263321)
