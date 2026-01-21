# GitHub 部署步骤 - 完整指南

## 🎯 目标

将应用代码发布到 GitHub,并使用 GitHub Releases 作为更新服务器。

## 📋 完整步骤

### 第一步: 在 GitHub 创建仓库

1. **登录 GitHub**
   - 访问: https://github.com
   - 使用你的 GitHub 账号登录(如果没有,需要先注册)

2. **创建新仓库**
   - 点击右上角 "+" → "New repository"
   - 填写信息:
     - Repository name: `IamDog` (或你喜欢的名字)
     - Description: `灵析 - 具备屏幕感知能力的桌面AI助手`
     - 选择: **Public** (公开仓库,用户才能下载)
     - 不要勾选 "Initialize this repository with a README"
   - 点击 "Create repository"

3. **记录仓库地址**
   ```
   https://github.com/你的用户名/IamDog
   ```

### 第二步: 推送代码到 GitHub

1. **添加 GitHub 远程仓库**
   ```bash
   cd /Users/haya/Code/IamDog
   
   # 添加 GitHub 远程仓库(保留原来的 GitLab)
   git remote add github https://github.com/你的用户名/IamDog.git
   
   # 查看远程仓库
   git remote -v
   # 应该看到:
   # origin    git@gitlab.alibaba-inc.com:haya.lhw/IamDog.git (内网)
   # github    https://github.com/你的用户名/IamDog.git (外网)
   ```

2. **推送代码**
   ```bash
   # 推送到 GitHub
   git push github main
   
   # 如果分支名是 master,则:
   # git push github master
   ```

### 第三步: 修改代码配置

1. **修改 updateManager.ts**
   
   打开 `electron/updateManager.ts`,找到第 29 行,修改为:
   ```typescript
   this.updateUrl = updateUrl || 'https://raw.githubusercontent.com/你的用户名/IamDog/main/version.json';
   ```
   
   **例如**: 如果你的 GitHub 用户名是 `zhangsan`,则改为:
   ```typescript
   this.updateUrl = updateUrl || 'https://raw.githubusercontent.com/zhangsan/IamDog/main/version.json';
   ```

2. **修改 version.json**
   
   打开根目录的 `version.json`,修改 `downloadUrl`:
   ```json
   {
     "version": "0.1.1",
     "releaseDate": "2026-01-21",
     "downloadUrl": "https://github.com/你的用户名/IamDog/releases/download/v0.1.1/lingxi-0.1.1.dmg",
     "changeLog": [
       "新增: 应用内检测更新功能"
     ]
   }
   ```

3. **提交并推送**
   ```bash
   git add electron/updateManager.ts version.json
   git commit -m "配置 GitHub 更新服务器"
   git push github main
   ```

### 第四步: 构建应用

```bash
# 确保版本号正确
cat package.json | grep version
# 应该显示: "version": "0.1.0"

# 更新到 0.1.1 (为了测试更新功能)
npm version 0.1.1

# 构建应用
npm run electron:build

# 构建完成后,安装包在 release 目录:
# release/灵析-0.1.1.dmg (macOS)
# release/灵析-0.1.1.exe (Windows)
```

### 第五步: 发布到 GitHub Releases

1. **访问 GitHub 仓库页面**
   ```
   https://github.com/你的用户名/IamDog
   ```

2. **创建 Release**
   - 点击右侧 "Releases" → "Create a new release"
   - 填写信息:
     - Tag version: `v0.1.1` (必须以 v 开头)
     - Release title: `v0.1.1 - 首次发布`
     - Description:
       ```
       ## 更新内容
       - 新增: 应用内检测更新功能
       - 新增: 支持版本对比和更新提示
       - 优化: 改进用户界面
       
       ## 下载
       请下载对应系统的安装包:
       - macOS: lingxi-0.1.1.dmg
       - Windows: lingxi-0.1.1.exe
       ```

3. **上传安装包**
   - 点击 "Attach binaries by dropping them here or selecting them"
   - 上传 `release/灵析-0.1.1.dmg` (重命名为 `lingxi-0.1.1.dmg`)
   - 如果有 Windows 版本,也一起上传

4. **发布**
   - 点击 "Publish release"

5. **复制下载链接**
   - 发布后,点击安装包,复制下载链接
   - 应该是这个格式:
     ```
     https://github.com/你的用户名/IamDog/releases/download/v0.1.1/lingxi-0.1.1.dmg
     ```

6. **更新 version.json**
   - 确认 `version.json` 中的 `downloadUrl` 是正确的
   - 如果不对,修改后重新提交:
     ```bash
     git add version.json
     git commit -m "更新下载链接"
     git push github main
     ```

### 第六步: 测试更新功能

1. **安装当前版本**
   ```bash
   # 构建当前版本 (0.1.0)
   git checkout HEAD~1  # 回到上一个版本
   npm run electron:build
   # 安装这个版本到系统
   ```

2. **测试检测更新**
   - 打开已安装的应用 (版本 0.1.0)
   - 点击右上角 "⚙️ 更多" → 设置
   - 找到 "🔄 检测更新" 区域
   - 点击 "检测更新" 按钮

3. **验证结果**
   - 应该显示: "🎉 发现新版本 v0.1.1"
   - 显示更新日志
   - 点击 "立即下载" 应该跳转到 GitHub Releases 页面

### 第七步: 以后发布新版本

每次发布新版本时:

```bash
# 1. 更新版本号
npm version 0.1.2  # 或 0.2.0, 1.0.0 等

# 2. 构建
npm run electron:build

# 3. 更新 version.json
# 修改 version 和 downloadUrl

# 4. 提交
git add package.json version.json
git commit -m "发布 v0.1.2"
git push github main

# 5. 在 GitHub 创建新的 Release
# 6. 上传新的安装包
```

## ✅ 检查清单

发布前确认:

- [ ] GitHub 仓库已创建并设置为 Public
- [ ] 代码已推送到 GitHub
- [ ] `updateManager.ts` 中的 URL 已修改为你的 GitHub 地址
- [ ] `version.json` 中的 downloadUrl 正确
- [ ] 应用已构建
- [ ] GitHub Release 已创建
- [ ] 安装包已上传
- [ ] 下载链接可用(在浏览器中测试)
- [ ] 版本号正确 (version.json > package.json)

## 🎯 重要提示

### 关于分支名

如果你的 GitHub 仓库默认分支是 `master` 而不是 `main`,需要修改:

```typescript
// electron/updateManager.ts
this.updateUrl = 'https://raw.githubusercontent.com/你的用户名/IamDog/master/version.json';
//                                                                         ^^^^^^
//                                                                      改为 master
```

### 关于用户体验

1. **用户不需要 GitHub 账号**
   - GitHub Public Repository 的 Releases 可以匿名下载
   - 用户只需点击按钮即可

2. **国内访问速度**
   - GitHub 在国内访问较慢,但可以接受
   - 如果需要更快速度,可以考虑使用 OSS + GitHub 双线路

3. **费用**
   - GitHub Public Repository 完全免费
   - 无流量限制
   - 无存储限制

## 📞 遇到问题?

### 推送失败?
```bash
# 如果提示需要认证,配置 GitHub Token:
git remote set-url github https://你的Token@github.com/你的用户名/IamDog.git
```

### 无法访问 GitHub?
```bash
# 可以设置代理:
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy https://127.0.0.1:7890
```

### 检测更新失败?
1. 确认 version.json 在 GitHub 上可访问
2. 在浏览器打开: `https://raw.githubusercontent.com/你的用户名/IamDog/main/version.json`
3. 应该能看到 JSON 内容

---

## 🎉 完成!

配置完成后,你就有了:
- ✅ 代码托管在 GitHub (公开)
- ✅ 应用更新服务(免费)
- ✅ 用户可以方便地检测和下载更新

需要帮助随时联系我! 🚀

**作者**: 哈雅 (263321)  
**日期**: 2026-01-21
