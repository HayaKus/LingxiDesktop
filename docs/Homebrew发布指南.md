# 🍺 Homebrew Tap 发布指南

本指南说明如何创建和维护 Homebrew Tap，让用户可以通过 `brew install` 安装你的应用。

## 📋 前置准备

### 1. 创建 Tap 仓库

在 GitHub 创建一个新仓库，命名规则为：`homebrew-<tap-name>`

例如：`homebrew-iamdog`

完整 URL: `https://github.com/HayaKus/homebrew-iamdog`

### 2. 仓库结构

```
homebrew-iamdog/
├── Casks/
│   └── iamdog.rb    # Cask 配置文件
└── README.md                  # 说明文档
```

## 🚀 设置步骤

### 第一步：创建 Tap 仓库

```bash
# 在 GitHub 创建仓库后，克隆到本地
git clone https://github.com/HayaKus/homebrew-iamdog.git
cd homebrew-iamdog

# 创建目录结构
mkdir Casks
```

### 第二步：复制 Cask 配置文件

将本项目中的 `homebrew/iamdog.rb` 复制到 Tap 仓库：

```bash
cp /path/to/IamDog/homebrew/iamdog.rb Casks/
```

### 第三步：创建 README

在 Tap 仓库中创建 `README.md`：

```markdown
# IamDog Homebrew Tap

桌面伙伴 - 具备屏幕感知能力的桌面AI助手

## 安装

\`\`\`bash
brew tap HayaKus/iamdog
brew install --cask iamdog
\`\`\`

## 更新

\`\`\`bash
brew update
brew upgrade --cask iamdog
\`\`\`

## 卸载

\`\`\`bash
brew uninstall --cask iamdog
\`\`\`

## 链接

- [主项目仓库](https://github.com/HayaKus/IamDog)
- [文档](https://github.com/HayaKus/IamDog/tree/master/docs)
- [问题反馈](https://github.com/HayaKus/IamDog/issues)
```

### 第四步：提交到 GitHub

```bash
cd homebrew-iamdog
git add .
git commit -m "Initial commit: Add iamdog cask"
git push origin main
```

## 🔄 发布新版本流程

### 完整的发布流程

每次发布新版本时，需要同时更新主项目和 Tap 仓库：

#### 1. 在主项目中发布新版本

```bash
cd /path/to/IamDog

# 更新版本号
npm version 0.1.6

# 构建应用
npm run electron:build

# 更新 version.json
# 修改 version: "0.1.6"
# 修改 downloadUrl 中的版本号和文件名

# 提交代码
git add package.json version.json
git commit -m "发布 v0.1.6"
git push github master

# 在 GitHub 创建 Release 并上传 DMG
# 上传时文件名格式：lingxi-0.1.6.dmg
```

#### 2. 计算 DMG 的 SHA256（推荐）

```bash
# 下载发布的 DMG 文件后
shasum -a 256 lingxi-0.1.6.dmg
```

复制输出的 SHA256 值。

#### 3. 更新 Tap 仓库

```bash
cd /path/to/homebrew-iamdog

# 编辑 Casks/iamdog.rb
# 更新以下内容：
# - version "0.1.6"
# - sha256 "实际的sha256值"
```

示例更新：

```ruby
cask "iamdog" do
  version "0.1.6"
  sha256 "a1b2c3d4e5f6..."  # 替换为实际计算的值

  url "https://github.com/HayaKus/IamDog/releases/download/v#{version}/lingxi-#{version}.dmg"
  # ... 其他配置保持不变
end
```

#### 4. 提交更新

```bash
git add Casks/iamdog.rb
git commit -m "Update to version 0.1.6"
git push origin main
```

#### 5. 测试安装

```bash
# 更新 Homebrew
brew update

# 测试安装
brew reinstall --cask iamdog

# 验证版本
brew info --cask iamdog
```

## 🔧 自动化脚本

可以创建脚本来简化发布流程：

### 脚本：`scripts/update-homebrew-tap.sh`

```bash
#!/bin/bash

# 更新 Homebrew Tap 的脚本

set -e

# 检查参数
if [ -z "$1" ]; then
  echo "用法: $0 <版本号> [SHA256]"
  echo "示例: $0 0.1.6 a1b2c3d4..."
  exit 1
fi

VERSION=$1
SHA256=${2:-":no_check"}

# Tap 仓库路径（需要修改为实际路径）
TAP_REPO="$HOME/Code/homebrew-iamdog"

if [ ! -d "$TAP_REPO" ]; then
  echo "错误: Tap 仓库不存在: $TAP_REPO"
  exit 1
fi

echo "正在更新 Homebrew Tap 到版本 $VERSION..."

# 进入 Tap 仓库
cd "$TAP_REPO"

# 确保是最新的
git pull origin main

# 更新 Cask 文件
if [ "$SHA256" = ":no_check" ]; then
  sed -i '' "s/version \".*\"/version \"$VERSION\"/" Casks/iamdog.rb
else
  sed -i '' "s/version \".*\"/version \"$VERSION\"/" Casks/iamdog.rb
  sed -i '' "s/sha256 .*/sha256 \"$SHA256\"/" Casks/iamdog.rb
fi

# 提交并推送
git add Casks/iamdog.rb
git commit -m "Update to version $VERSION"
git push origin main

echo "✅ Homebrew Tap 已更新到版本 $VERSION"
echo ""
echo "用户现在可以通过以下命令更新："
echo "  brew update"
echo "  brew upgrade --cask iamdog"
```

使用方法：

```bash
# 不验证 SHA256（开发阶段）
./scripts/update-homebrew-tap.sh 0.1.6

# 验证 SHA256（生产环境推荐）
./scripts/update-homebrew-tap.sh 0.1.6 a1b2c3d4e5f6...
```

## 📝 Cask 配置详解

### 基本字段

```ruby
cask "iamdog" do
  version "0.1.5"                    # 版本号
  sha256 :no_check                   # SHA256 校验（:no_check 跳过验证）
  
  url "https://github.com/..."       # 下载 URL
  name "IamDog"             # 英文名称
  name "桌面伙伴"                         # 中文名称
  desc "具备屏幕感知能力的桌面AI助手"  # 描述
  homepage "https://github.com/..."  # 主页
  
  app "桌面伙伴.app"                      # 安装的应用名
end
```

### 高级功能

#### 1. 自动版本检测（livecheck）

```ruby
livecheck do
  url "https://raw.githubusercontent.com/HayaKus/IamDog/master/version.json"
  strategy :json do |json|
    json["version"]
  end
end
```

#### 2. 清理配置（zap）

```ruby
zap trash: [
  "~/Library/Application Support/桌面伙伴",
  "~/Library/Preferences/com.alibaba.lingxi.plist",
  # 更多路径...
]
```

#### 3. 安装提示（caveats）

```ruby
caveats <<~EOS
  欢迎使用 IamDog！
  
  首次启动时可能需要执行：
    xattr -cr /Applications/桌面伙伴.app
EOS
```

## ✅ 测试清单

发布前的测试步骤：

- [ ] 主项目已成功构建并创建 Release
- [ ] DMG 文件可以从 GitHub 下载
- [ ] 已计算并更新 SHA256（如需要）
- [ ] Tap 仓库已更新版本号
- [ ] 已提交并推送到 GitHub
- [ ] 测试安装：`brew reinstall --cask iamdog`
- [ ] 验证应用可以正常启动
- [ ] 测试更新：`brew upgrade --cask iamdog`

## 🔍 故障排查

### 问题1: brew install 找不到 cask

**原因**: Tap 未正确添加或 cask 文件路径错误

**解决**:
```bash
# 检查 Tap
brew tap

# 重新添加
brew untap HayaKus/iamdog
brew tap HayaKus/iamdog

# 确认文件在 Casks/ 目录下
```

### 问题2: 下载失败或 SHA256 不匹配

**原因**: Release 中的文件名与 cask 中的不一致

**解决**:
- 检查 GitHub Release 中的文件名
- 确保格式为：`lingxi-版本号.dmg`
- 重新计算 SHA256 值

### 问题3: 安装后应用无法启动

**原因**: macOS 安全限制

**解决**:
在 caveats 中提供清除属性的命令：
```bash
xattr -cr /Applications/桌面伙伴.app
```

## 📚 参考资源

- [Homebrew Cask 文档](https://docs.brew.sh/Cask-Cookbook)
- [创建 Tap 指南](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)
- [Cask 语法参考](https://docs.brew.sh/Cask-Cookbook#stanza-reference)
- [版本检测策略](https://docs.brew.sh/Brew-Livecheck)

## 💡 最佳实践

1. **使用 SHA256 验证**: 生产环境建议使用真实的 SHA256 值
2. **版本号一致**: 确保主项目、version.json、Tap 的版本号一致
3. **测试后发布**: 在本地测试安装成功后再推送到 Tap 仓库
4. **文档完善**: 保持 README 和文档更新
5. **用户提示**: 通过 caveats 提供重要的安装说明

## 🎉 完成

现在用户可以通过以下命令安装你的应用：

```bash
brew tap HayaKus/iamdog
brew install --cask iamdog
```

祝发布顺利！🚀
