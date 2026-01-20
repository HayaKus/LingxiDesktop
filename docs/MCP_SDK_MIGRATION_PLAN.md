# MCP SDK 迁移方案

## 概述

将当前基于HTTP手动实现的MCP客户端改造为使用官方 `@modelcontextprotocol/sdk` 的标准实现，同时保持现有的OAuth 2.1鉴权机制不变。

## 当前实现分析

### 现有架构
```
mcpManager (管理多个MCP服务器)
  ↓
mcpClient (HTTP/SSE客户端工厂)
  ↓
HTTPMCPClient / SSEMCPClient (手动实现的客户端)
  ↓
oauthManager (OAuth 2.1授权管理)
```

### 现有流程
1. **发现阶段**: 手动发送未授权请求 → 解析 WWW-Authenticate → 获取资源元数据 (RFC 9728) → 获取授权服务器元数据 (RFC 8414)
2. **授权阶段**: 使用 `oauthManager` 完成 OAuth 2.1 PKCE 流程
3. **通信阶段**: 使用 fetch 手动发送 JSON-RPC 请求

### 问题
- 手动实现JSON-RPC协议，容易出错
- 没有利用SDK的标准化功能（重连、会话管理、通知处理等）
- 维护成本高

## 目标架构

### 新架构
```
mcpManager (管理多个MCP服务器)
  ↓
SDK Client (官方客户端)
  ↓
StreamableHTTPClientTransport (官方传输层)
  ↓
CustomAuthProvider (适配器，桥接到现有 oauthManager)
```

### 核心变化
1. **使用 SDK 的 `Client` 类**替代手动实现的 `HTTPMCPClient`
2. **使用 SDK 的 `StreamableHTTPClientTransport`** 替代手动 fetch
3. **创建自定义 `AuthProvider`** 适配器，桥接到现有的 `oauthManager`
4. **保持 `oauthManager` 不变**，复用所有 OAuth 逻辑

## 详细设计

### 1. 新增依赖（已安装）
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "zod": "latest"
  }
}
```

### 2. 创建 CustomAuthProvider

**文件**: `electron/mcpAuthProvider.ts`

```typescript
import { OAuthClientProvider, OAuthClientMetadata } from '@modelcontextprotocol/sdk';
import { oauthManager, OAuthConfig } from './oauthManager';

/**
 * 自定义认证提供者 - 桥接SDK和现有的oauthManager
 * 
 * 实现SDK的OAuthClientProvider接口，但内部委托给现有的oauthManager
 * 这样可以保持现有的OAuth实现不变
 */
export class CustomAuthProvider implements OAuthClientProvider {
  private oauthConfig: OAuthConfig;
  private tokens: { access_token: string; token_type: string } | null = null;

  constructor(oauthConfig: OAuthConfig) {
    this.oauthConfig = oauthConfig;
  }

  /**
   * SDK调用此方法获取OAuth客户端元数据
   */
  async getClientMetadata(): Promise<OAuthClientMetadata> {
    return {
      client_name: 'lingxi',
      redirect_uris: [this.oauthConfig.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none' // Public client
    };
  }

  /**
   * SDK调用此方法启动OAuth授权流程
   * 我们委托给现有的oauthManager
   */
  async authorize(authorizationUrl: URL): Promise<void> {
    console.log('🔐 [CustomAuthProvider] Starting OAuth flow...');
    
    // 使用现有的oauthManager进行授权
    const tokens = await oauthManager.authorize(this.oauthConfig);
    
    this.tokens = {
      access_token: tokens.access_token,
      token_type: tokens.token_type
    };
    
    console.log('✅ [CustomAuthProvider] OAuth completed');
  }

  /**
   * SDK调用此方法获取访问令牌
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('No access token available');
    }
    
    // 检查token是否过期，如需要则刷新
    // 这里可以添加token过期检查逻辑
    
    return this.tokens.access_token;
  }

  /**
   * 设置已有的token（用于恢复会话）
   */
  setTokens(tokens: { access_token: string; token_type: string }): void {
    this.tokens = tokens;
  }
}
```

### 3. 重构 mcpClient.ts

**主要变化**:
- 移除 `HTTPMCPClient` 和 `SSEMCPClient` 的手动实现
- 使用 SDK 的 `Client` 和 `StreamableHTTPClientTransport`
- 创建适配器类包装 SDK 客户端

```typescript
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk';
import { CustomAuthProvider } from './mcpAuthProvider';
import { oauthManager } from './oauthManager';

export interface MCPServerConfig {
  // ... 保持不变
}

export interface IMCPClient {
  connect(): Promise<void>;
  disconnect(): void;
  getTools(): Promise<any[]>;
  callTool(name: string, args: any): Promise<any>;
}

/**
 * SDK客户端适配器
 * 包装SDK的Client，实现IMCPClient接口
 */
class SDKMCPClient implements IMCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  
  constructor(private config: MCPServerConfig) {}
  
  async connect(): Promise<void> {
    console.log('🔌 [SDK] Connecting to:', this.config.name);
    
    // 1. 创建Client实例
    this.client = new Client(
      {
        name: 'lingxi',
        version: '0.1.0'
      },
      { capabilities: {} }
    );
    
    // 2. 如果需要OAuth，创建自定义AuthProvider
    let authProvider = undefined;
    if (this.config.oauth) {
      // 如果已有token，先设置token
      if (this.config.tokens?.access_token) {
        console.log('✅ [SDK] Using existing token');
        authProvider = new CustomAuthProvider(this.config.oauth);
        authProvider.setTokens({
          access_token: this.config.tokens.access_token,
          token_type: this.config.tokens.token_type
        });
      } else {
        // 没有token，需要授权
        console.log('🔐 [SDK] No token, starting OAuth...');
        authProvider = new CustomAuthProvider(this.config.oauth);
        
        // 注意：这里不需要手动调用authorize
        // SDK会在connect时自动触发OAuth流程
      }
    }
    
    // 3. 创建Transport
    this.transport = new StreamableHTTPClientTransport(
      new URL(this.config.url),
      {
        authProvider,
        sessionId: this.config.sessionId // 如果有会话ID
      }
    );
    
    // 4. 连接（SDK会自动处理OAuth流程）
    try {
      await this.client.connect(this.transport);
      
      // 保存会话ID
      if (this.transport.sessionId) {
        this.config.sessionId = this.transport.sessionId;
      }
      
      console.log('✅ [SDK] Connected successfully');
    } catch (error) {
      console.error('❌ [SDK] Connection failed:', error);
      throw error;
    }
  }
  
  async getTools(): Promise<any[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    
    console.log('🔧 [SDK] Fetching tools...');
    
    const result = await this.client.request(
      {
        method: 'tools/list',
        params: {}
      },
      ListToolsResultSchema
    );
    
    console.log(`✅ [SDK] Got ${result.tools.length} tools`);
    return result.tools;
  }
  
  async callTool(name: string, args: any): Promise<any> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    
    console.log(`🔧 [SDK] Calling tool: ${name}`);
    
    const result = await this.client.request(
      {
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      },
      CallToolResultSchema
    );
    
    console.log('✅ [SDK] Tool call completed');
    return result;
  }
  
  disconnect(): void {
    if (this.transport) {
      this.transport.close();
      this.client = null;
      this.transport = null;
      console.log('🔌 [SDK] Disconnected');
    }
  }
}

// 工厂函数
export function createMCPClient(config: MCPServerConfig): IMCPClient {
  // 暂时只支持HTTP类型
  if (config.type === 'http') {
    return new SDKMCPClient(config);
  } else if (config.type === 'sse') {
    throw new Error('SSE type not yet migrated to SDK');
  }
  throw new Error(`Unknown MCP type: ${config.type}`);
}
```

### 4. mcpManager.ts 改动（最小化）

```typescript
// 主要改动：
// 1. MCPServerConfig 添加 sessionId 字段
// 2. 保存tokens时同时保存sessionId

export interface MCPServerConfig {
  // ... 现有字段
  sessionId?: string; // 新增：SDK会话ID
}
```

### 5. oauthManager.ts - 保持不变

**无需改动**，继续作为OAuth授权的核心实现。

## 实施步骤

### Phase 1: 准备工作 ✅
- [x] 安装依赖 `@modelcontextprotocol/sdk` 和 `zod`
- [x] 分析现有代码
- [x] 设计方案

### Phase 2: 实现核心组件
- [ ] 创建 `electron/mcpAuthProvider.ts`
- [ ] 重构 `electron/mcpClient.ts`
- [ ] 更新 `MCPServerConfig` 类型定义

### Phase 3: 测试与验证
- [ ] 单元测试：连接、获取工具、调用工具
- [ ] OAuth流程测试
- [ ] Token刷新测试
- [ ] 会话恢复测试

### Phase 4: 清理
- [ ] 删除旧的手动实现代码
- [ ] 更新文档
- [ ] 性能对比

## 优势

### 使用SDK的好处
1. **标准化**: 完全符合MCP规范
2. **自动化**: SDK自动处理JSON-RPC、会话管理、错误处理
3. **可靠性**: 官方维护，bug修复及时
4. **功能完整**: 支持通知、资源、提示等完整功能
5. **类型安全**: 完整的TypeScript类型支持

### 保持OAuth的好处
1. **零改动**: 现有的OAuth实现无需修改
2. **已验证**: OAuth流程已经过充分测试
3. **灵活性**: 可以根据需求自定义授权逻辑

## 风险与缓解

### 风险1: SDK与现有OAuth集成问题
**缓解**: CustomAuthProvider作为适配器层，隔离变化

### 风险2: SDK版本兼容性
**缓解**: 锁定SDK版本，定期升级测试

### 风险3: 迁移过程中的功能回归
**缓解**: 
- 保留旧代码作为备份
- 分阶段迁移（先HTTP，后SSE）
- 充分测试

## 时间估算

- Phase 1: 已完成
- Phase 2: 2-3小时
- Phase 3: 2-3小时
- Phase 4: 1小时

**总计**: 约5-7小时

## 后续优化

1. **迁移SSE客户端**: 使用SDK的SSE Transport
2. **通知处理**: 利用SDK的通知机制
3. **资源和提示**: 实现MCP的其他能力
4. **错误重试**: 使用SDK的自动重连机制

## 参考资料

- MCP SDK文档: `/Users/haya/Code/typescript-sdk/README.md`
- OAuth示例: `/Users/haya/Code/typescript-sdk/examples/client/src/simpleOAuthClient.ts`
- Streamable HTTP示例: `/Users/haya/Code/typescript-sdk/examples/client/src/simpleStreamableHttp.ts`
