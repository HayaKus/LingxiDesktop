# 🍺 Homebrew 快速参考

## 用户命令

### 安装

```bash
brew tap HayaKus/iamdog
brew install --cask iamdog
```

### 更新

```bash
brew update
brew upgrade --cask iamdog
```

### 卸载

```bash
# 普通卸载
brew uninstall --cask iamdog

# 完全卸载（删除所有数据）
brew uninstall --cask --zap iamdog
```

### 其他

```bash
# 查看信息
brew info --cask iamdog

# 重新安装
brew reinstall --cask iamdog

# 检查过期应用
brew outdated --cask
```

## 开发者命令

### 创建 Tap 仓库

```bash
# 1. 在 GitHub 创建仓库: homebrew-iamdog
# 2. 克隆并设置
git clone https://github.com/HayaKus/homebrew-iamdog.git
cd homebrew-iamdog
mkdir Casks
cp /path/to/IamDog/homebrew/iamdog.rb Casks/
git add .
git commit -m "Initial commit"
git push origin main
```

### 发布新版本

```bash
# 1. 构建并发布到 GitHub
cd /path/to/IamDog
npm version 0.1.6
npm run electron:build
# 更新 version.json
git add package.json version.json
git commit -m "发布 v0.1.6"
git push github master
# 在 GitHub 创建 Release 并上传 DMG

# 2. 计算 SHA256
./scripts/calculate-sha256.sh release/桌面伙伴-0.1.6.dmg

# 3. 更新 Homebrew Tap
./scripts/update-homebrew-tap.sh 0.1.6 <SHA256值>
```

## 文件结构

```
IamDog/
├── homebrew/
│   └── iamdog.rb              # Cask 配置文件
├── scripts/
│   ├── calculate-sha256.sh    # SHA256 计算工具
│   └── update-homebrew-tap.sh # Tap 更新脚本
└── docs/
    ├── Homebrew安装指南.md     # 用户指南
    ├── Homebrew发布指南.md     # 开发者指南
    └── Homebrew快速参考.md     # 本文件

homebrew-iamdog/               # Tap 仓库
└── Casks/
    └── iamdog.rb             # 从 IamDog/homebrew/ 复制
```

## 重要链接

- **主仓库**: https://github.com/HayaKus/IamDog
- **Tap 仓库**: https://github.com/HayaKus/homebrew-iamdog
- **Releases**: https://github.com/HayaKus/IamDog/releases

## 常见问题

### 应用已损坏

```bash
xattr -cr /Applications/桌面伙伴.app
```

### Tap 找不到

```bash
brew untap HayaKus/iamdog
brew tap HayaKus/iamdog
```

### 更新失败

```bash
brew cleanup
brew upgrade --cask iamdog --force
```

## 详细文档

- 📖 [Homebrew 安装指南](./Homebrew安装指南.md) - 完整的用户使用文档
- 📖 [Homebrew 发布指南](./Homebrew发布指南.md) - 详细的发布流程说明
- 📖 [快速开始](./快速开始.md) - 应用安装入门
