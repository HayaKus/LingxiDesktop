# 快速开始 - GitHub 方案

## 🎯 3 个主要步骤

### 1️⃣ 创建 GitHub 仓库并推送代码 (5分钟)

```bash
# 在 GitHub 网站创建公开仓库后,运行:
git remote add github https://github.com/你的用户名/IamDog.git
git push github main
```

### 2️⃣ 修改配置 (2分钟)

**修改 `electron/updateManager.ts` 第31行:**
```typescript
this.updateUrl = updateUrl || 'https://raw.githubusercontent.com/你的用户名/IamDog/main/version.json';
```

**修改 `version.json` 第4行:**
```json
"downloadUrl": "https://github.com/你的用户名/IamDog/releases/download/v0.1.1/lingxi-0.1.1.dmg",
```

**提交:**
```bash
git add electron/updateManager.ts version.json
git commit -m "配置 GitHub 更新服务器"
git push github main
```

### 3️⃣ 发布第一个版本 (10分钟)

```bash
# 1. 更新版本号
npm version 0.1.1

# 2. 构建
npm run electron:build

# 3. 在 GitHub 创建 Release (v0.1.1)
# 4. 上传 release/桌面伙伴-0.1.1.dmg (重命名为 lingxi-0.1.1.dmg)
# 5. 发布!
```

## ✅ 完成!

现在用户可以:
1. 打开应用设置
2. 点击"检测更新"
3. 看到新版本并下载

---

## 📚 详细文档

- **完整步骤**: 查看 `docs/GitHub部署步骤.md`
- **配置说明**: 查看 `docs/如何配置更新功能.md`
- **用户指南**: 查看 `docs/用户更新流程说明.md`

---

## 🔗 快速链接

### 需要做的事情

1. **创建 GitHub 仓库**
   - https://github.com/new
   - Repository name: `IamDog`
   - Public ✅

2. **修改两个文件**
   - `electron/updateManager.ts` (第31行)
   - `version.json` (第4行)
   - 把 `YOUR_GITHUB_USERNAME` 替换为你的用户名

3. **发布 Release**
   - https://github.com/你的用户名/IamDog/releases/new
   - Tag: `v0.1.1`
   - 上传安装包

### 验证清单

- [ ] 在浏览器能访问: `https://raw.githubusercontent.com/你的用户名/IamDog/main/version.json`
- [ ] 在浏览器能访问: `https://github.com/你的用户名/IamDog/releases`
- [ ] 运行 `npm run electron:dev`,点击"检测更新"能看到结果

---

## 💡 小提示

- **GitHub 用户名在哪?** 登录 GitHub 后,右上角头像 → Settings → 左侧看到 Username
- **分支名是 main 还是 master?** 运行 `git branch` 查看当前分支名
- **如何重命名文件?** macOS: 在 Finder 选中文件,按 Enter 键

---

## 🎉 完成后

你就有了一个完整的更新系统:
- ✅ 代码开源在 GitHub
- ✅ 免费的 CDN 和存储
- ✅ 用户无需账号即可更新
- ✅ 完全自动化的版本检测

**需要帮助?** 查看 `docs/GitHub部署步骤.md` 获取详细说明!
