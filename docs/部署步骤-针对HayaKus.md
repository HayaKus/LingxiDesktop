# 部署步骤 - 专属指南

你的 GitHub 仓库: https://github.com/HayaKus/IamDog ✅

## ✅ 已完成配置

我已经帮你配置好了:
- ✅ `electron/updateManager.ts` - 已设置为你的 GitHub 地址
- ✅ `version.json` - 已设置正确的下载链接

## 🚀 现在只需3步

### 第1步: 推送代码到 GitHub (1分钟)

```bash
cd /Users/haya/Code/IamDog

# 添加 GitHub 远程仓库
git remote add github https://github.com/HayaKus/IamDog.git

# 推送代码 (你的分支是 master)
git push github master
```

### 第2步: 提交配置文件 (1分钟)

```bash
# 提交刚才修改的配置
git add electron/updateManager.ts version.json
git commit -m "配置 GitHub 更新服务器"
git push github master
```

### 第3步: 构建并发布 (10分钟)

```bash
# 1. 更新版本号到 0.1.1
npm version 0.1.1

# 2. 构建应用
npm run electron:build

# 构建完成后,安装包在 release 目录
# macOS: release/灵析-0.1.1.dmg
```

**然后在 GitHub 发布:**

1. 访问: https://github.com/HayaKus/IamDog/releases/new

2. 填写信息:
   - **Tag version**: `v0.1.1`
   - **Release title**: `v0.1.1 - 首次发布`
   - **Description**:
     ```markdown
     ## 🎉 首次发布
     
     ### 新功能
     - ✨ 应用内检测更新功能
     - ✨ 支持版本对比和更新提示
     - ✨ 改进用户界面
     
     ### 下载
     - macOS: lingxi-0.1.1.dmg
     ```

3. **上传安装包**:
   - 点击 "Attach binaries"
   - 上传 `release/灵析-0.1.1.dmg`
   - 重命名为: `lingxi-0.1.1.dmg`

4. **点击 "Publish release"**

## ✅ 完成!

### 验证

1. **检查 version.json 是否可访问**:
   在浏览器打开: https://raw.githubusercontent.com/HayaKus/IamDog/master/version.json
   应该能看到 JSON 内容

2. **测试更新功能**:
   ```bash
   npm run electron:dev
   # 打开应用 → 设置 → 检测更新
   ```

3. **检查 Release 页面**:
   访问: https://github.com/HayaKus/IamDog/releases
   应该能看到 v0.1.1

## 🎯 重要链接

- **你的仓库**: https://github.com/HayaKus/IamDog
- **Releases**: https://github.com/HayaKus/IamDog/releases
- **version.json**: https://raw.githubusercontent.com/HayaKus/IamDog/master/version.json

## 📝 以后发布新版本

```bash
# 1. 更新版本号
npm version 0.1.5

# 2. 构建
npm run electron:build

# 3. 更新 version.json
# 修改 version: "0.1.2"
# 修改 downloadUrl 中的版本号

# 4. 提交
git add package.json version.json
git commit -m "发布 v0.1.5"
git push github master

# 5. 在 GitHub 创建新的 Release (v0.1.2)
# 6. 上传新的安装包
```

## 💡 小提示

### 如果推送失败

```bash
# 方法1: 使用 HTTPS (需要 GitHub Token)
git remote set-url github https://ghp_你的token@github.com/HayaKus/IamDog.git

# 方法2: 使用 SSH (推荐)
git remote set-url github git@github.com:HayaKus/IamDog.git
```

### 查看当前分支

```bash
git branch
# 如果显示 * main,就用 main
# 如果显示 * master,就用 master
```

## 🎉 全部配置完成!

现在你有:
- ✅ 代码托管在 GitHub (https://github.com/HayaKus/IamDog)
- ✅ 免费的更新服务器
- ✅ 用户无需账号即可下载更新
- ✅ 全球 CDN 加速

需要帮助随时找我! 🚀
