# 导盲犬 (Guide Dog) - 运行指南

> 桌面AI助手 - 具备屏幕感知能力

## 📋 系统要求

- **操作系统**: macOS 10.15+
- **Node.js**: v23.11.0 (已验证)
- **权限**: 屏幕录制权限、粘贴板访问权限

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API 密钥

首次运行时，应用会提示你输入 IdeaLab API 密钥。

**获取 API 密钥**：
- 访问 IdeaLab 平台：https://idealab.alibaba-inc.com
- 登录后获取你的 API 密钥

### 3. 开发模式运行

```bash
npm run electron:dev
```

这会同时启动：
- Vite 开发服务器 (http://localhost:5173)
- Electron 应用

### 4. 构建生产版本

```bash
# 构建应用
npm run build

# 打包 macOS 应用
npm run electron:build
```

打包后的应用位于 `release/` 目录。

## 🎮 使用方法

### 启动应用

1. 运行应用后，会在桌面右下角看到一个小狗图标 🐕
2. 点击小狗图标或按 `Cmd+Shift+A` 打开对话窗口

### 基本操作

**发送消息**：
1. 在输入框输入你的问题
2. 可选：勾选"包含当前截图"让 AI 看到你的屏幕
3. 可选：勾选"粘贴板截图"使用剪贴板中的图片
4. 点击"发送"或按 `Enter` 键

**快捷键**：
- `Cmd+Shift+A`: 打开/聚焦对话窗口
- `Enter`: 发送消息
- `Shift+Enter`: 换行

**其他功能**：
- 点击 AI 回答下方的"📋 复制"按钮复制内容
- 点击"🗑️ 清空"清除所有对话历史
- 点击"⚙️ 设置"修改 API 密钥

## 🔧 配置说明

### 配置文件位置

```
~/Library/Application Support/GuideD og/config.json
```

### 配置项

```json
{
  "apiKey": "your-idealab-api-key",
  "model": "qwen-vl-max-latest",
  "shortcut": "CommandOrControl+Shift+A"
}
```

### 日志文件位置

```
~/Library/Logs/GuideD og/
```

## 🐛 常见问题

### 1. 截图功能不工作

**问题**: 点击"包含当前截图"后提示权限错误

**解决方案**:
1. 打开"系统偏好设置" > "安全性与隐私" > "隐私"
2. 选择"屏幕录制"
3. 勾选"导盲犬"应用
4. 重启应用

### 2. 粘贴板读取失败

**问题**: 提示"剪贴板中没有图片"

**解决方案**:
1. 确保剪贴板中有图片（截图或复制的图片）
2. 在 macOS 中，使用 `Cmd+Shift+4` 截图会自动复制到剪贴板
3. 或使用 `Cmd+C` 复制图片

### 3. API 调用失败

**问题**: 发送消息后提示 API 错误

**可能原因**:
- API 密钥无效或过期
- 网络连接问题
- IdeaLab 服务暂时不可用

**解决方案**:
1. 检查 API 密钥是否正确
2. 检查网络连接
3. 查看日志文件获取详细错误信息

### 4. 应用无法启动

**问题**: 双击应用图标后没有反应

**解决方案**:
1. 检查是否已安装 Node.js v23.11.0
2. 删除 `node_modules` 文件夹，重新运行 `npm install`
3. 查看控制台日志：`npm run electron:dev`

## 📝 开发说明

### 项目结构

```
IamDog/
├── electron/           # Electron 主进程
│   ├── main.ts        # 主进程入口
│   └── preload.ts     # Preload 脚本
├── src/
│   ├── renderer/      # React 渲染进程
│   │   ├── components/  # UI 组件
│   │   ├── store/       # 状态管理
│   │   ├── utils/       # 工具函数
│   │   ├── styles/      # 样式文件
│   │   ├── App.tsx      # 主应用组件
│   │   └── main.tsx     # 渲染进程入口
│   └── types/         # TypeScript 类型定义
├── public/            # 静态资源
│   └── pet.html       # 宠物窗口 HTML
├── materials/         # 素材文件
│   └── image/
│       └── icon_dog.png  # 小狗图标
└── docs/              # 文档
```

### 技术栈

- **框架**: Electron 28+
- **UI**: React 18 + TypeScript + Tailwind CSS
- **AI 服务**: IdeaLab (OpenAI SDK)
- **状态管理**: Zustand
- **Markdown**: react-markdown + react-syntax-highlighter
- **构建工具**: Vite

### 开发命令

```bash
# 开发模式
npm run dev              # 仅启动 Vite 开发服务器
npm run electron:dev     # 启动完整应用（推荐）

# 构建
npm run build            # 构建渲染进程
npm run electron:build   # 打包应用

# 代码检查
npm run type-check       # TypeScript 类型检查
npm run lint             # ESLint 检查
npm run format           # Prettier 格式化
```

## 🔐 隐私说明

- ✅ 截图按需生成，用完即删
- ✅ 对话历史不持久化（关闭窗口即清空）
- ✅ API 密钥本地加密存储
- ✅ 用户完全控制数据流
- ✅ 不做主动监控
- ✅ 不上传任何数据到第三方

## 📞 支持

- **负责人**: 哈雅（263321）
- **项目地址**: git@gitlab.alibaba-inc.com:haya.lhw/IamDog.git
- **文档**: 查看 `docs/` 目录

## 📄 许可证

内部项目，仅供公司内部使用。

---

**最后更新**: 2026-01-08
