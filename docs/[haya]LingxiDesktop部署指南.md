# LingxiDesktop 完整部署指南

> 从零开始部署到 GitHub + Homebrew

## ✅ 前提条件

你已经创建了以下仓库：
- ✅ GitHub 仓库：`https://github.com/HayaKus/LingxiDesktop`
- ✅ Homebrew Tap：`https://github.com/HayaKus/homebrew-LingxiDesktop`
- ✅ GitLab 仓库：`git@gitlab.alibaba-inc.com:haya.lhw/LingxiDesktop.git`

## 📋 已完成的配置

### 1. Git 远程仓库配置
```bash
# 已配置的 remote
origin: git@gitlab.alibaba-inc.com:haya.lhw/LingxiDesktop.git
github: https://github.com/HayaKus/LingxiDesktop.git
```

### 2. 代码中的 URL 更新
- ✅ `electron/updateManager.ts` - 更新检查 URL 指向新仓库
- ✅ `version.json` - 下载地址指向新仓库
- ✅ `homebrew/lingxidesktop.rb` - 新的 Homebrew Cask 文件
- ✅ `README.md` - 所有文档链接已更新
- ✅ `scripts/update-homebrew-tap.sh` - 脚本已更新
- ✅ `scripts/calculate-sha256.sh` - 脚本已更新

---

## 🚀 部署步骤

### 第一步：推送代码到 GitHub

```bash
cd /Users/haya/Code/LingxiDesktop

# 提交所有更改
git add .
git commit -m "chore: 迁移到 LingxiDesktop 仓库"

# 推送到 GitLab（origin）
git push origin master

# 推送到 GitHub
git push github master

# 如果 GitHub 是 main 分支，需要先创建
git push github master:main
```

### 第二步：构建并发布到 GitHub Releases

#### 2.1 构建应用
```bash
cd /Users/haya/Code/LingxiDesktop

# 安装依赖（如果还没有）
npm install

# 构建应用
npm run electron:build
```

构建完成后，DMG 文件会在 `release/` 目录中。

#### 2.2 创建 GitHub Release
1. 访问：https://github.com/HayaKus/LingxiDesktop/releases/new
2. 填写信息：
   - **Tag**: `v0.1.7`
   - **Release title**: `v0.1.7 - LingxiDesktop 首个版本`
   - **Description**: 
     ```markdown
     ## 🎉 LingxiDesktop v0.1.7
     
     桌面伙伴 - 具备屏幕感知能力的桌面AI助手
     
     ### ✨ 特性
     - 屏幕感知能力
     - MCP 协议支持
     - 多会话管理
     - 自动更新检测
     
     ### 📦 安装方式
     
     #### Homebrew（推荐）
     ```bash
     brew tap HayaKus/homebrew-lingxidesktop
     brew install --cask lingxidesktop
     ```
     
     #### 手动安装
     下载下方的 DMG 文件，双击安装
     ```
3. **上传文件**：将 `release/lingxi-0.1.7.dmg` 拖拽到上传区
4. **发布**：点击 "Publish release"

### 第三步：配置 Homebrew Tap

#### 3.1 克隆 Homebrew Tap 仓库
```bash
cd ~/Code
git clone https://github.com/HayaKus/homebrew-LingxiDesktop.git
cd homebrew-LingxiDesktop

# 创建 Casks 目录
mkdir -p Casks

# 复制 Cask 文件
cp /Users/haya/Code/LingxiDesktop/homebrew/lingxidesktop.rb Casks/

# 提交并推送
git add .
git commit -m "feat: 添加 lingxidesktop cask v0.1.7"
git push origin main
```

#### 3.2 创建 README（可选但推荐）
在 `homebrew-LingxiDesktop` 仓库中创建 `README.md`：

```markdown
# LingxiDesktop Homebrew Tap

桌面伙伴的 Homebrew 安装源

## 安装

\`\`\`bash
brew tap HayaKus/homebrew-lingxidesktop
brew install --cask lingxidesktop
\`\`\`

## 更新

\`\`\`bash
brew update
brew upgrade --cask lingxidesktop
\`\`\`

## 卸载

\`\`\`bash
brew uninstall --cask lingxidesktop
\`\`\`

## 链接

- [主仓库](https://github.com/HayaKus/LingxiDesktop)
- [问题反馈](https://github.com/HayaKus/LingxiDesktop/issues)
```

---

## 🧪 测试安装

### 测试 Homebrew 安装
```bash
# 添加 Tap
brew tap HayaKus/homebrew-lingxidesktop

# 查看 Cask 信息
brew info --cask lingxidesktop

# 安装
brew install --cask lingxidesktop

# 验证
ls -la /Applications/桌面伙伴.app
```

### 测试更新检测
1. 启动应用
2. 在应用中点击"检查更新"
3. 应该能正确连接到：
   `https://raw.githubusercontent.com/HayaKus/LingxiDesktop/master/version.json`

---

## 🔄 后续版本发布流程

### 1. 更新版本号
编辑 `package.json` 和 `version.json`：
```json
// package.json
"version": "0.1.8"

// version.json
{
  "version": "0.1.8",
  "releaseDate": "2026-01-22",
  "downloadUrl": "https://github.com/HayaKus/LingxiDesktop/releases/download/v0.1.8/lingxi-0.1.8.dmg",
  "changeLog": [
    "新功能: xxx",
    "修复: xxx"
  ]
}
```

### 2. 构建和发布
```bash
# 构建
npm run electron:build

# 提交代码
git add .
git commit -m "chore: bump version to 0.1.8"
git push origin master
git push github master

# 发布到 GitHub Releases
# 访问 https://github.com/HayaKus/LingxiDesktop/releases/new
# 创建 v0.1.8 release 并上传 DMG
```

### 3. 更新 Homebrew Tap
```bash
cd /Users/haya/Code/LingxiDesktop

# 使用自动化脚本（推荐）
./scripts/update-homebrew-tap.sh 0.1.8

# 或手动更新
cd ~/Code/homebrew-LingxiDesktop
# 编辑 Casks/lingxidesktop.rb，更新版本号
git add .
git commit -m "Update to version 0.1.8"
git push origin main
```

---

## 📊 仓库结构

### 主仓库（LingxiDesktop）
```
LingxiDesktop/
├── electron/          # 主进程代码
├── src/               # 渲染进程代码
├── homebrew/          
│   └── lingxidesktop.rb   # Cask 模板
├── scripts/           # 自动化脚本
├── docs/              # 文档
├── version.json       # 版本信息（GitHub Raw）
└── package.json       # 项目配置
```

### Homebrew Tap 仓库
```
homebrew-LingxiDesktop/
├── Casks/
│   └── lingxidesktop.rb   # 实际的 Cask 文件
└── README.md
```

---

## 🔗 重要链接

### 主仓库
- **GitHub**: https://github.com/HayaKus/LingxiDesktop
- **GitLab**: https://gitlab.alibaba-inc.com/haya.lhw/LingxiDesktop
- **Releases**: https://github.com/HayaKus/LingxiDesktop/releases
- **version.json**: https://raw.githubusercontent.com/HayaKus/LingxiDesktop/master/version.json

### Homebrew
- **Tap 仓库**: https://github.com/HayaKus/homebrew-LingxiDesktop
- **Cask 文件**: https://github.com/HayaKus/homebrew-LingxiDesktop/blob/main/Casks/lingxidesktop.rb

### 安装命令
```bash
brew tap HayaKus/homebrew-lingxidesktop
brew install --cask lingxidesktop
```

---

## ✅ 验证清单

部署完成后检查：

### 代码层面
- [ ] 所有代码已推送到 GitHub 和 GitLab
- [ ] `version.json` 在 GitHub 上可访问
- [ ] `electron/updateManager.ts` URL 正确

### GitHub Releases
- [ ] Release v0.1.7 已创建
- [ ] DMG 文件已上传
- [ ] Release 说明完整

### Homebrew
- [ ] Tap 仓库已创建并配置
- [ ] Cask 文件已添加
- [ ] `brew tap` 命令可用
- [ ] `brew install` 命令可用
- [ ] `brew info` 显示正确信息

### 功能测试
- [ ] 应用可以正常安装
- [ ] 应用可以正常启动
- [ ] 更新检测功能正常
- [ ] 通过 Homebrew 可以升级

---

## 🆘 常见问题

### Q: GitHub Release 的 DMG 文件下载 404
A: 确保 Release 已经发布（不是 Draft），且文件上传成功

### Q: version.json 访问不到
A: 确保文件已提交到 master 分支，GitHub Raw 地址使用 `master` 而不是 `main`

### Q: Homebrew 安装失败
A: 检查 Cask 文件中的 URL 是否正确，确保 GitHub Release 已发布

### Q: 应用显示"已损坏"
A: 执行 `xattr -cr /Applications/桌面伙伴.app`

---

## 📞 支持

- **问题反馈**: https://github.com/HayaKus/LingxiDesktop/issues
- **开发者**: 哈雅（263321）

---

**祝部署顺利！🎉**
