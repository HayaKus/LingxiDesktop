# 灵析 (LingxiDesktop)

具备屏幕感知能力的桌面AI助手

## 🚀 快速开始

### 通过 Homebrew 安装（推荐）

```bash
# 添加 Tap
brew tap HayaKus/homebrew-lingxidesktop

# 安装
brew install --cask lingxidesktop
```

### 手动下载安装

从 [GitHub Releases](https://github.com/HayaKus/LingxiDesktop/releases) 下载最新版本的 DMG 文件。

## 🔄 更新

### Homebrew 用户

```bash
# 更新 Homebrew
brew update

# 升级到最新版本
brew upgrade --cask lingxidesktop
```

### 手动安装用户

应用内置了自动更新检测功能，会提示您下载最新版本。

## 📖 文档

- [Homebrew 安装指南](docs/Homebrew安装指南.md) - 使用 Homebrew 安装和管理
- [Homebrew 发布指南](docs/Homebrew发布指南.md) - 开发者发布流程
- [应用升级操作步骤](docs/应用升级操作步骤.md) - 完整的发布流程
- [常见问题-DMG损坏](docs/常见问题-DMG损坏.md) - 解决 macOS 安全提示

## ⚠️ 首次启动提示

如果遇到"已损坏"或无法打开的提示，请执行：

```bash
xattr -cr /Applications/灵析.app
```

或在系统设置中允许运行：
`系统设置 -> 隐私与安全性 -> 允许从以下位置下载的App`

## 🛠️ 开发

### 环境要求

- Node.js 20+
- npm 或 yarn

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式
npm run electron:dev

# 构建
npm run electron:build
```

### 发布流程

查看 [应用升级操作步骤](docs/应用升级操作步骤.md) 了解完整的发布流程。

## 📦 项目结构

```
LingxiDesktop/
├── electron/           # Electron 主进程
├── src/               # 渲染进程
│   ├── renderer/      # React 组件
│   └── types/         # TypeScript 类型定义
├── docs/              # 文档
├── homebrew/          # Homebrew Cask 配置
├── scripts/           # 自动化脚本
└── build/             # 构建配置
```

## 🔗 相关链接

- **GitHub 仓库**: https://github.com/HayaKus/LingxiDesktop
- **Releases**: https://github.com/HayaKus/LingxiDesktop/releases
- **Homebrew Tap**: https://github.com/HayaKus/homebrew-LingxiDesktop
- **问题反馈**: https://github.com/HayaKus/LingxiDesktop/issues

## 📝 许可证

ISC

## 👤 作者

哈雅 (263321)

---

Made with ❤️ by 哈雅
