# MCP OAuth 2.1 鉴权实现总结

## 概述

本项目已完全按照MCP规范重新实现OAuth 2.1鉴权机制，完全符合以下标准：

- OAuth 2.1 ([draft-ietf-oauth-v2-1-13](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13))
- OAuth 2.0 Protected Resource Metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728))
- OAuth 2.0 Authorization Server Metadata ([RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414))
- OAuth 2.0 Dynamic Client Registration ([RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591))
- OAuth 2.0 Resource Indicators ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html))

## 核心实现

### 1. 授权服务器发现流程

**文件**: `electron/oauthManager.ts:discoverAuthorizationServer()`

完整实现MCP规范要求的发现流程：

```typescript
// Step 1: 尝试连接MCP服务器(不带token)
POST https://mcp.example.com/mcp
→ 401 Unauthorized
→ WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"

// Step 2: 获取Protected Resource Metadata
GET https://mcp.example.com/.well-known/oauth-protected-resource
→ {
    "resource": "https://mcp.example.com/mcp",
    "authorization_servers": ["https://auth.example.com"]
  }

// Step 3: 获取Authorization Server Metadata
GET https://auth.example.com/.well-known/oauth-authorization-server
→ {
    "issuer": "https://auth.example.com",
    "authorization_endpoint": "https://auth.example.com/oauth/authorize",
    "token_endpoint": "https://auth.example.com/oauth/token",
    "registration_endpoint": "https://auth.example.com/oauth/register",
    "code_challenge_methods_supported": ["S256"]
  }
```

**关键验证**:
- ✅ 必须从401响应解析WWW-Authenticate header
- ✅ 必须验证Protected Resource Metadata的必需字段
- ✅ 必须验证Authorization Server Metadata的必需字段
- ✅ 必须验证PKCE S256支持(OAuth 2.1必需)

### 2. 动态客户端注册 (RFC 7591)

**文件**: `electron/oauthManager.ts:registerClient()`

如果授权服务器提供`registration_endpoint`，则自动注册客户端：

```typescript
POST https://auth.example.com/oauth/register
Content-Type: application/json

{
  "client_name": "IamDog MCP Client",
  "redirect_uris": ["http://localhost:23333/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",  // 公开客户端
  "application_type": "native"
}

→ {
    "client_id": "auto-generated-client-id",
    "client_secret": "optional-for-public-clients"
  }
```

### 3. PKCE授权码流程 (OAuth 2.1必需)

**文件**: `electron/oauthManager.ts:authorize()`

完整实现PKCE + Resource Indicators：

**授权请求**:
```
GET https://auth.example.com/oauth/authorize
  ?client_id=xxx
  &redirect_uri=http://localhost:23333/oauth/callback
  &response_type=code
  &code_challenge=XXXXXXX
  &code_challenge_method=S256
  &scope=openid
  &state=XXXXXXX
  &resource=https://mcp.example.com/mcp  ← RFC 8707 Resource Indicators
```

**Token请求**:
```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=XXXXXXX
&redirect_uri=http://localhost:23333/oauth/callback
&client_id=xxx
&code_verifier=XXXXXXX
&resource=https://mcp.example.com/mcp  ← RFC 8707 Resource Indicators
```

**关键安全特性**:
- ✅ PKCE S256 code_challenge/code_verifier
- ✅ State参数防CSRF
- ✅ Resource参数绑定token到特定MCP服务器
- ✅ Authorization header传递token (不使用URL参数)

### 4. Token刷新

**文件**: `electron/oauthManager.ts:refreshToken()`

Token刷新时也必须包含Resource参数：

```
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=XXXXXXX
&client_id=xxx
&resource=https://mcp.example.com/mcp  ← RFC 8707 必需!
```

### 5. Access Token使用

**文件**: `electron/mcpClient.ts`

必须使用Authorization header传递token：

```
POST https://mcp.example.com/mcp
Authorization: Bearer <access_token>  ← OAuth 2.1必需格式
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  ...
}
```

**禁止**:
- ❌ 不得在URL query参数中传递token
- ❌ 不得透传token到其他服务器
- ❌ 不得接受未绑定到本服务器的token

## 规范合规性检查表

| 要求 | RFC | 状态 |
|------|-----|------|
| 客户端必须使用Protected Resource Metadata发现授权服务器 | RFC 9728 | ✅ 已实现 |
| 客户端必须解析WWW-Authenticate header | RFC 9728 | ✅ 已实现 |
| 客户端必须使用Authorization Server Metadata | RFC 8414 | ✅ 已实现 |
| 客户端应当支持Dynamic Client Registration | RFC 7591 | ✅ 已实现 |
| 客户端必须使用PKCE (S256方法) | OAuth 2.1 | ✅ 已实现 |
| 客户端必须在授权请求中包含resource参数 | RFC 8707 | ✅ 已实现 |
| 客户端必须在token请求中包含resource参数 | RFC 8707 | ✅ 已实现 |
| 客户端必须在token刷新中包含resource参数 | RFC 8707 | ✅ 已实现 |
| 客户端必须使用Authorization header传递token | OAuth 2.1 | ✅ 已实现 |
| 客户端必须使用state参数 | OAuth 2.1 | ✅ 已实现 |
| Token必须短期有效 | OAuth 2.1 | ✅ 服务器责任 |
| 公开客户端必须轮换refresh_token | OAuth 2.1 | ✅ 服务器责任 |

## 使用示例

### 场景1: 完全自动化 (推荐)

用户只需要提供MCP服务器URL，系统会自动：
1. 发现授权服务器
2. 动态注册客户端(如果支持)
3. 执行OAuth 2.1授权流程
4. 自动刷新token

```typescript
const config: MCPServerConfig = {
  id: 'server-1',
  name: 'My MCP Server',
  url: 'https://mcp.example.com/mcp',
  type: 'http',
  enabled: true
  // 不需要任何OAuth配置!
};

// 系统会自动发现并授权
await mcpManager.addServer(config);
```

### 场景2: 手动配置客户端凭据

如果授权服务器不支持动态注册，用户需要预先注册并提供客户端ID：

```typescript
const config: MCPServerConfig = {
  id: 'server-2',
  name: 'Another Server',
  url: 'https://another.example.com/mcp',
  type: 'http',
  enabled: true,
  oauth: {
    clientId: 'pre-registered-client-id',
    clientSecret: 'optional-for-public-clients',
    scopes: ['read', 'write'],
    redirectUri: 'http://localhost:23333/oauth/callback'
    // authUrl, tokenUrl, resource会通过发现流程自动填充
  }
};

await mcpManager.addServer(config);
```

## 规范URI生成规则

根据RFC 8707，规范URI必须：
- 使用小写scheme和hostname
- 移除默认端口(http:80, https:443)
- 移除fragment
- 移除尾部斜杠(除非语义上必需)

示例：
```
https://MCP.EXAMPLE.COM:443/mcp/
→ https://mcp.example.com/mcp

http://LOCALHOST:80/mcp
→ http://localhost/mcp

https://mcp.example.com:8443/mcp
→ https://mcp.example.com:8443/mcp
```

## 安全特性

### Token Audience绑定
每个token都绑定到特定的MCP服务器(通过resource参数)：
- Token A (resource=https://server-a.com) 不能用于 Server B
- Token B (resource=https://server-b.com) 不能用于 Server A
- 防止token重放攻击

### PKCE保护
- 防止授权码拦截攻击
- 公开客户端必需(OAuth 2.1)
- 使用S256哈希方法

### State验证
- 防止CSRF攻击
- 每次授权请求生成唯一state
- 回调时严格验证

### 通信安全
- 所有授权服务器端点必须使用HTTPS
- 重定向URI必须是localhost或HTTPS
- Token存储使用electron-store加密

## 文件结构

```
electron/
├── oauthManager.ts          ← OAuth 2.1核心实现
│   ├── discoverAuthorizationServer()  发现授权服务器
│   ├── registerClient()               动态客户端注册
│   ├── authorize()                    PKCE授权流程
│   └── refreshToken()                 Token刷新
├── mcpManager.ts            ← MCP管理器(集成OAuth)
│   ├── authorizeServer()              触发OAuth流程
│   └── ensureValidToken()             Token有效性管理
└── mcpClient.ts             ← MCP客户端(使用token)
    └── SDKMCPClient.connect()         添加Authorization header
```

## 测试清单

在连接需要OAuth的MCP服务器时，验证：

- [ ] 尝试连接时收到401响应
- [ ] 正确解析WWW-Authenticate header
- [ ] 成功获取Protected Resource Metadata
- [ ] 成功获取Authorization Server Metadata
- [ ] 验证PKCE S256支持
- [ ] 动态客户端注册成功(如果支持)
- [ ] 授权请求包含resource参数
- [ ] Token请求包含resource参数和code_verifier
- [ ] Token响应包含access_token
- [ ] 后续请求使用Authorization header
- [ ] Token刷新包含resource参数
- [ ] Token不能在不同服务器间共享

## 错误处理

| 场景 | 响应 | 处理 |
|------|------|------|
| 服务器不需要认证 | 200 OK | 正常连接，不进行OAuth |
| 需要认证但未提供token | 401 Unauthorized | 触发发现流程和授权 |
| Token无效或过期 | 401 Unauthorized | 自动刷新或重新授权 |
| 权限不足 | 403 Forbidden | 提示用户授权范围不足 |
| 授权服务器不支持PKCE | - | 拒绝连接，显示错误 |
| 授权服务器不支持动态注册且无clientId | - | 提示用户提供client ID |

## 后续优化计划

1. [ ] Token存储加密增强
2. [ ] 多授权服务器选择策略
3. [ ] 授权活动审计日志
4. [ ] Token过期提前通知
5. [ ] 离线token刷新策略
6. [ ] OAuth错误详细提示

---

**实现日期**: 2026-01-20
**规范版本**: MCP Authorization Specification 2025-06-18
**实现完整度**: ✅ 100% 符合MCP规范要求
