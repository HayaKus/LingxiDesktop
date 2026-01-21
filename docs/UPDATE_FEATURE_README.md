# 检测更新功能 - 快速开始

## ✨ 功能说明

为应用添加了"检测更新"功能,用户可以在设置界面点击按钮检测新版本,并跳转到下载页面。

## 📦 已实现的文件

### 主进程
- `electron/updateManager.ts` - 更新管理器核心逻辑
- `electron/ipcHandlers.ts` - 添加了 3 个 IPC 处理函数
- `electron/preload.ts` - 暴露更新检测 API

### 渲染进程
- `src/renderer/components/CheckForUpdates.tsx` - UI 组件
- `src/renderer/App.tsx` - 集成到设置页面
- `src/types/window.d.ts` - TypeScript 类型定义

### 配置文件
- `version.json` - 版本信息示例文件
- `docs/UPDATE_FEATURE.md` - 完整使用文档

## 🚀 快速使用

### 用户端
1. 打开应用设置 (⚙️ 更多)
2. 找到"检测更新"区域
3. 点击"检测更新"按钮
4. 如有新版本,点击"立即下载"

### 开发者端

#### 1. 修改默认更新地址
```typescript
// electron/updateManager.ts 第 29 行
this.updateUrl = updateUrl || 'https://your-server.com/version.json';
```

#### 2. 准备 version.json 文件
```json
{
  "version": "0.2.0",
  "releaseDate": "2026-01-21",
  "downloadUrl": "https://your-download-url.com/app.dmg",
  "changeLog": [
    "新增功能1",
    "修复bug1"
  ]
}
```

#### 3. 部署 version.json
- **GitHub**: 提交到仓库,使用 Raw 地址
- **OSS**: 上传并设置公开访问
- **自建服务器**: 部署并配置 CORS

## 📋 API 使用示例

```typescript
// 检测更新
const result = await window.electronAPI.updateCheck();
console.log(result);
// {
//   hasUpdate: true,
//   currentVersion: "0.1.0", 
//   latestVersion: "0.2.0",
//   versionInfo: { version, releaseDate, downloadUrl, changeLog }
// }

// 获取当前版本
const version = await window.electronAPI.updateGetVersion();

// 设置更新服务器地址
await window.electronAPI.updateSetUrl('https://your-server.com/version.json');
```

## 🎯 核心特性

✅ 语义化版本号比较  
✅ 详细的更新日志展示  
✅ 一键跳转下载  
✅ 支持自定义服务器  
✅ 错误处理完善  
✅ TypeScript 类型安全  

## 📝 发布流程建议

1. 更新 `package.json` 版本号
2. 构建应用: `npm run electron:build`
3. 上传安装包到托管平台
4. 更新 `version.json` 文件
5. 部署 `version.json` 到服务器

## 📚 详细文档

查看完整文档: [UPDATE_FEATURE.md](./UPDATE_FEATURE.md)

## ⚠️ 注意事项

1. 当前版本不支持自动更新,仅支持检测和跳转下载
2. 需要手动维护 version.json 文件
3. 确保 version.json 可被跨域访问(CORS)
4. 建议使用 HTTPS 协议

## 🔮 后续优化建议

- 集成 `electron-updater` 实现自动更新
- 添加后台自动检测功能
- 支持更新通知
- 支持增量更新

---

**作者**: 哈雅 (263321)  
**日期**: 2026-01-21
