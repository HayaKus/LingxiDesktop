# 应用更新功能使用文档

## 📋 功能概述

应用已集成"检测更新"功能,用户可以通过设置界面检测是否有新版本可用,并一键下载安装。

## 🎯 核心功能

### 1. 版本检测
- 自动对比当前版本与远程最新版本
- 支持语义化版本号(Semantic Versioning)
- 智能版本号比较算法

### 2. 更新提示
- 清晰的更新状态显示
- 详细的更新日志展示
- 一键跳转下载页面

### 3. 灵活配置
- 支持自定义更新服务器地址
- 支持多种托管方式(GitHub、OSS、自建服务器等)

## 📁 文件结构

```
IamDog/
├── electron/
│   ├── updateManager.ts          # 更新管理器(主进程)
│   └── ipcHandlers.ts             # IPC 处理函数
├── src/
│   ├── renderer/
│   │   └── components/
│   │       └── CheckForUpdates.tsx  # 更新检测UI组件
│   └── types/
│       └── window.d.ts            # 类型定义
└── version.json                   # 版本信息文件(示例)
```

## 🚀 使用方法

### 用户使用

1. **打开设置**
   - 点击应用右上角的 "⚙️ 更多" 按钮

2. **检测更新**
   - 在设置页面找到 "🔄 检测更新" 区域
   - 点击 "检测更新" 按钮

3. **查看结果**
   - 如果有新版本,会显示版本号、发布日期和更新日志
   - 点击 "立即下载" 按钮跳转到下载页面
   - 如果已是最新版本,会显示提示信息

### 开发者配置

#### 1. 设置更新服务器地址

默认情况下,更新检测会从以下地址获取版本信息:
```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/version.json
```

你可以通过以下方式修改:

**方式一: 修改代码**
```typescript
// electron/updateManager.ts
constructor(updateUrl?: string) {
  this.updateUrl = updateUrl || 'https://your-server.com/version.json';
}
```

**方式二: 运行时设置**
```typescript
// 在渲染进程中调用
await window.electronAPI.updateSetUrl('https://your-server.com/version.json');
```

#### 2. 准备 version.json 文件

在你的服务器或仓库中创建 `version.json` 文件:

```json
{
  "version": "0.2.0",
  "releaseDate": "2026-01-21",
  "downloadUrl": "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v0.2.0/lingxi-0.2.0.dmg",
  "changeLog": [
    "新增: 应用内检测更新功能",
    "新增: 支持自定义更新服务器地址",
    "优化: 改进版本号比较算法",
    "修复: 若干已知问题"
  ],
  "minVersion": "0.1.0"
}
```

**字段说明:**
- `version`: 最新版本号(必填)
- `releaseDate`: 发布日期(必填)
- `downloadUrl`: 下载地址(必填)
- `changeLog`: 更新日志数组(必填)
- `minVersion`: 最低兼容版本(可选)

#### 3. 托管 version.json

**选项 A: GitHub**
1. 将 `version.json` 提交到仓库
2. 使用 Raw 地址: `https://raw.githubusercontent.com/用户名/仓库名/分支名/version.json`

**选项 B: 阿里云 OSS**
1. 上传 `version.json` 到 OSS
2. 设置公共读权限
3. 使用 OSS 地址: `https://your-bucket.oss-region.aliyuncs.com/version.json`

**选项 C: 自建服务器**
1. 部署 `version.json` 到服务器
2. 配置 CORS 允许跨域访问
3. 使用服务器地址: `https://your-domain.com/api/version.json`

## 🔧 API 接口

### 主进程 API

```typescript
import { updateManager } from './updateManager';

// 检测更新
const result = await updateManager.checkForUpdates();

// 获取当前版本
const version = updateManager.getCurrentVersion();

// 设置更新服务器地址
updateManager.setUpdateUrl('https://your-server.com/version.json');
```

### 渲染进程 API

```typescript
// 检测更新
const result = await window.electronAPI.updateCheck();
console.log(result);
// {
//   hasUpdate: true,
//   currentVersion: "0.1.0",
//   latestVersion: "0.2.0",
//   versionInfo: { ... }
// }

// 获取当前版本
const version = await window.electronAPI.updateGetVersion();
console.log(version); // "0.1.0"

// 设置更新服务器地址
await window.electronAPI.updateSetUrl('https://your-server.com/version.json');
```

## 📝 版本号规范

推荐使用语义化版本号(Semantic Versioning):

```
主版本号.次版本号.修订号

例如: 0.1.0, 1.0.0, 1.2.3
```

**规则:**
- 主版本号: 不兼容的 API 修改
- 次版本号: 向下兼容的功能新增
- 修订号: 向下兼容的问题修正

## 🎨 UI 组件

`CheckForUpdates` 组件提供以下状态:

1. **初始状态**: 显示提示信息
2. **检测中**: 显示加载动画
3. **有更新**: 显示新版本信息和下载按钮
4. **已是最新**: 显示确认信息
5. **检测失败**: 显示错误信息

## 🔒 安全性

- 仅支持 HTTPS 连接(除非本地测试)
- 不会自动下载或安装,需用户确认
- 版本信息仅用于对比,不执行任何代码

## 🐛 常见问题

### Q: 检测更新失败,显示网络错误?
**A:** 检查以下几点:
1. 更新服务器地址是否正确
2. version.json 文件是否可访问
3. 网络连接是否正常
4. 是否配置了 CORS

### Q: 如何在本地测试?
**A:** 
```typescript
// 1. 启动本地服务器托管 version.json
// 2. 设置本地地址
await window.electronAPI.updateSetUrl('http://localhost:3000/version.json');
// 3. 测试检测更新
```

### Q: 可以自动更新吗?
**A:** 当前版本仅支持检测和跳转下载,不支持自动更新。如需自动更新功能,可以集成 `electron-updater` 库。

## 📦 发布流程

建议的版本发布流程:

1. **更新版本号**
   ```bash
   # package.json
   npm version patch  # 0.1.0 -> 0.1.1
   npm version minor  # 0.1.1 -> 0.2.0
   npm version major  # 0.2.0 -> 1.0.0
   ```

2. **构建应用**
   ```bash
   npm run electron:build
   ```

3. **上传安装包**
   - 上传到 GitHub Releases
   - 或上传到 OSS
   - 或上传到自建服务器

4. **更新 version.json**
   ```json
   {
     "version": "新版本号",
     "releaseDate": "发布日期",
     "downloadUrl": "安装包下载地址",
     "changeLog": ["更新内容"]
   }
   ```

5. **部署 version.json**
   - 提交到仓库
   - 或上传到服务器

## 🔮 未来优化

- [ ] 支持增量更新
- [ ] 支持后台自动检测
- [ ] 支持更新通知
- [ ] 支持版本回滚
- [ ] 集成 electron-updater

## 📞 技术支持

如有问题,请通过以下方式联系:
- 提交 Issue
- 发送邮件
- 内部工作群

---

最后更新: 2026-01-21
版本: 1.0.0
