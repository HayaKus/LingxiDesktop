# BUC 登录集成文档

> 桌面伙伴桌面应用的 BUC 登录功能使用指南

**创建时间**：2026-01-12  
**负责人**：哈雅（263321）

---

## 📋 概述

桌面伙伴已集成阿里内部 BUC 统一登录系统，用户首次启动应用时会自动打开浏览器进行登录，登录成功后可获取用户的工号、花名、邮箱等信息。

---

## 🔧 技术方案

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    桌面伙伴 Electron 应用                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. 启动应用                                              │
│     ↓                                                     │
│  2. 检查登录状态                                          │
│     ↓                                                     │
│  3. 未登录 → 启动本地 HTTP 服务器 (端口 8888)            │
│     ↓                                                     │
│  4. 打开系统浏览器访问 BUC 登录页                         │
│     URL: https://login-test.alibaba-inc.com/ssoLogin.htm │
│     ↓                                                     │
│  5. 用户在浏览器中登录                                    │
│     ↓                                                     │
│  6. BUC 重定向到本地回调地址                              │
│     URL: http://localhost:8888/callback?SSO_TOKEN=xxx    │
│     ↓                                                     │
│  7. 本地服务器接收 SSO_TOKEN                              │
│     ↓                                                     │
│  8. 使用 SSO_TOKEN 获取用户信息                           │
│     ↓                                                     │
│  9. 保存用户信息到本地                                    │
│     ↓                                                     │
│  10. 启动应用主窗口                                       │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 BUC 应用配置

### 应用信息

| 配置项 | 值 |
|--------|-----|
| 应用名 | taobao-vrobot |
| 显示名称 | 桌面伙伴AI |
| ClientKey | a2a91724-3847-4e1c-88fe-968298b3b7ff |
| AppCode | ccdb93ee885a4c17b3b0f4cdca4f7b48 |
| 日常环境 | https://login-test.alibaba-inc.com |
| 线上环境 | https://login.alibaba-inc.com |
| 回调地址 | http://localhost:8888/callback |

### 配置位置

BUC 配置在 `electron/bucAuth.ts` 文件中：

```typescript
private readonly config = {
  appName: 'taobao-vrobot',
  clientKey: 'a2a91724-3847-4e1c-88fe-968298b3b7ff',
  appCode: 'ccdb93ee885a4c17b3b0f4cdca4f7b48',
  // 日常环境
  ssoUrl: 'https://login-test.alibaba-inc.com',
  // 线上环境（需要时切换）
  // ssoUrl: 'https://login.alibaba-inc.com',
};
```

---

## 💻 代码实现

### 1. BUC 认证服务 (`electron/bucAuth.ts`)

核心功能：
- ✅ 启动本地 HTTP 服务器监听回调
- ✅ 打开系统浏览器进行登录
- ✅ 接收 SSO_TOKEN
- ✅ 获取用户信息
- ✅ 错误处理和超时控制

### 2. 主进程集成 (`electron/main.ts`)

```typescript
// 应用启动时检查登录状态
app.whenReady().then(async () => {
  try {
    const savedUser = store.get('userInfo');
    
    if (!savedUser) {
      // 未登录，启动 BUC 登录
      const userInfo = await bucAuth.login();
      store.set('userInfo', userInfo);
    }
    
    // 创建窗口
    createPetWindow();
  } catch (error) {
    console.error('登录失败:', error);
  }
});
```

### 3. IPC 接口

提供给渲染进程的接口：

```typescript
// 获取用户信息
const userInfo = await window.electronAPI.getUserInfo();

// 手动登录
const userInfo = await window.electronAPI.bucLogin();

// 退出登录
await window.electronAPI.bucLogout();
```

---

## 🚀 使用方式

### 首次启动

1. **启动应用**
   ```bash
   npm run electron:dev
   ```

2. **自动打开浏览器**
   - 应用会自动打开系统默认浏览器
   - 访问 BUC 登录页面

3. **登录**
   - 输入工号和密码
   - 或使用钉钉扫码登录

4. **登录成功**
   - 浏览器显示"登录成功"页面
   - 可以关闭浏览器
   - 返回应用

5. **应用启动**
   - 桌面右下角出现小狗图标
   - 登录信息已保存

### 后续启动

- 应用会自动读取保存的登录信息
- 无需重新登录
- 直接启动应用

### 手动重新登录

如果需要切换账号或重新登录：

```typescript
// 在渲染进程中调用
await window.electronAPI.bucLogout();  // 退出登录
await window.electronAPI.bucLogin();   // 重新登录
```

---

## 📊 用户信息

### 数据结构

```typescript
interface BucUserInfo {
  workid: string;      // 工号，如 "263321"
  name: string;        // 花名，如 "哈雅"
  email: string;       // 邮箱，如 "haya.lhw@alibaba-inc.com"
  cname?: string;      // 中文名，如 "林x伟"
  empId?: string;      // 员工ID
}
```

### 存储位置

用户信息保存在本地配置文件中：
```
~/Library/Application Support/lingxi/config.json
```

### 获取用户信息

```typescript
// 在渲染进程中
const userInfo = await window.electronAPI.getUserInfo();

if (userInfo) {
  console.log('工号:', userInfo.workid);
  console.log('花名:', userInfo.name);
  console.log('邮箱:', userInfo.email);
}
```

---

## 🔒 安全性

### 数据保护

1. **SSO_TOKEN**
   - 仅在登录过程中使用
   - 用完即销毁
   - 不持久化存储

2. **用户信息**
   - 本地加密存储
   - 仅保存基本信息
   - 不包含敏感数据

3. **回调服务器**
   - 仅在登录时启动
   - 登录完成后立即关闭
   - 5分钟超时自动关闭

### 权限控制

- 应用仅获取用户基本信息
- 不访问其他敏感数据
- 符合公司安全规范

---

## 🐛 故障排查

### 1. 浏览器未打开

**原因**：系统默认浏览器未设置

**解决**：
- 设置系统默认浏览器
- 或手动复制登录链接到浏览器

### 2. 回调失败

**原因**：端口 8888 被占用

**解决**：
```bash
# 查看端口占用
lsof -i :8888

# 关闭占用进程
kill -9 <PID>
```

### 3. 登录超时

**原因**：5分钟内未完成登录

**解决**：
- 重启应用
- 重新登录

### 4. 获取用户信息失败

**原因**：BUC API 调用失败

**解决**：
- 检查网络连接
- 查看控制台日志
- 开发阶段会使用模拟数据

### 5. 域名白名单错误

**错误信息**：跳转到未被信任的站点

**解决**：
1. 访问 BUC 管理后台
2. 在域名白名单中添加：`localhost:8888`
3. 保存配置

---

## 📝 开发调试

### 查看日志

```bash
# 应用日志
tail -f ~/Library/Logs/lingxi/main.log

# 或在代码中
import log from 'electron-log';
log.info('登录成功:', userInfo);
```

### 清除登录状态

```bash
# 删除配置文件
rm ~/Library/Application\ Support/lingxi/config.json

# 重启应用
```

### 模拟登录失败

在 `electron/bucAuth.ts` 中：

```typescript
// 模拟 API 失败
private async getUserInfo(ssoToken: string): Promise<BucUserInfo> {
  // 注释掉 API 调用
  // const response = await fetch(...);
  
  // 直接返回模拟数据
  return {
    workid: '263321',
    name: '哈雅',
    email: 'haya.lhw@alibaba-inc.com',
  };
}
```

---

## 🔄 环境切换

### 切换到线上环境

修改 `electron/bucAuth.ts`：

```typescript
private readonly config = {
  appName: 'taobao-vrobot',
  clientKey: 'a2a91724-3847-4e1c-88fe-968298b3b7ff',
  appCode: 'ccdb93ee885a4c17b3b0f4cdca4f7b48',
  // 日常环境
  // ssoUrl: 'https://login-test.alibaba-inc.com',
  // 线上环境
  ssoUrl: 'https://login.alibaba-inc.com',  // 取消注释
};
```

**注意**：
- 日常和线上是两套独立的 BUC 系统
- 需要分别在两个环境注册应用
- 配置信息可能不同

---

## 📚 相关文档

- [BUC 统一登录中心](https://login.alibaba-inc.com)
- [Midway BUC 登录文档](https://midway.alibaba-inc.com/docs/ali_extensions/buc-login/)
- [桌面伙伴技术方案](./TECHNICAL_DESIGN.md)

---

## ✅ 检查清单

在发布前确认：

- [ ] BUC 应用已在日常和线上环境注册
- [ ] 域名白名单已配置 `localhost:8888`
- [ ] 测试日常环境登录流程
- [ ] 测试线上环境登录流程
- [ ] 测试退出登录功能
- [ ] 测试重新登录功能
- [ ] 验证用户信息正确性
- [ ] 检查日志输出
- [ ] 测试错误处理

---

## 🤝 联系方式

如有问题，请联系：
- **负责人**：哈雅（263321）
- **邮箱**：haya.lhw@alibaba-inc.com

---

**最后更新**：2026-01-12
