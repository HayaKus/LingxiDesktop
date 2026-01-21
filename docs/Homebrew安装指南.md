# 🍺 Homebrew 安装指南

通过 Homebrew 可以更方便地安装和更新 IamDog（灵析）应用。

## 📥 安装步骤

### 1. 添加 Tap 仓库

```bash
brew tap HayaKus/iamdog
```

### 2. 安装应用

```bash
brew install --cask iamdog
```

## 🔄 更新应用

### 更新到最新版本

```bash
# 更新 Homebrew 和 Tap 仓库
brew update

# 升级 IamDog 到最新版本
brew upgrade --cask iamdog
```

### 检查可用更新

```bash
brew outdated --cask
```

## 🗑️ 卸载应用

### 普通卸载（保留配置）

```bash
brew uninstall --cask iamdog
```

### 完全卸载（删除所有数据）

```bash
brew uninstall --cask --zap iamdog
```

这将删除以下数据：
- `~/Library/Application Support/灵析`
- `~/Library/Application Support/lingxi`
- `~/Library/Preferences/com.alibaba.lingxi.plist`
- `~/Library/Preferences/com.iamdog.app.plist`
- `~/Library/Logs/灵析`
- 已保存的应用状态

## 🔍 其他命令

### 查看应用信息

```bash
brew info --cask iamdog
```

### 查看已安装的 Cask

```bash
brew list --cask
```

### 重新安装

```bash
brew reinstall --cask iamdog
```

## ⚠️ 常见问题

### 问题1: "已损坏"提示

如果安装后提示应用已损坏，请执行：

```bash
xattr -cr /Applications/灵析.app
```

### 问题2: 无法更新

如果无法更新，尝试：

```bash
# 清理缓存
brew cleanup

# 强制更新
brew upgrade --cask iamdog --force
```

### 问题3: Tap 找不到

确保已正确添加 Tap：

```bash
# 查看已添加的 Taps
brew tap

# 移除并重新添加
brew untap HayaKus/iamdog
brew tap HayaKus/iamdog
```

## 📋 版本管理

### 安装特定版本

Homebrew Cask 通常只支持最新版本，如需安装旧版本：

1. 访问 [GitHub Releases](https://github.com/HayaKus/IamDog/releases)
2. 手动下载对应版本的 DMG 文件
3. 双击安装

### 固定版本（防止自动更新）

```bash
brew pin iamdog
```

取消固定：

```bash
brew unpin iamdog
```

## 🚀 优势

使用 Homebrew 安装的优势：

- ✅ **一键安装**: 无需手动下载 DMG
- ✅ **自动更新**: `brew upgrade` 即可更新所有应用
- ✅ **版本管理**: 统一管理所有 Homebrew 安装的软件
- ✅ **干净卸载**: 支持完全清理应用数据
- ✅ **命令行操作**: 适合开发者和高级用户

## 🔗 相关链接

- **GitHub 仓库**: https://github.com/HayaKus/IamDog
- **Releases**: https://github.com/HayaKus/IamDog/releases
- **问题反馈**: https://github.com/HayaKus/IamDog/issues
- **Homebrew 官网**: https://brew.sh

## 💡 提示

- 建议定期运行 `brew update && brew upgrade` 保持所有软件最新
- 使用 `brew doctor` 诊断 Homebrew 问题
- 首次安装 Homebrew 需要先安装 Xcode Command Line Tools
