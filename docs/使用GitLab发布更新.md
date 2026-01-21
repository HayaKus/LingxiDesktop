# 使用 GitLab 内网发布更新方案

## 🎯 方案概述

将 DMG 文件提交到 GitLab 内网仓库,用户通过内网下载,可以避免:
- ✅ GitHub 访问慢的问题
- ✅ macOS Gatekeeper 的某些限制(内网文件信任度更高)
- ✅ 完全内网化部署

## 📋 配置步骤

### 第1步: 修改 .gitignore

已完成! `.gitignore` 现在配置为:
```gitignore
# Release files (exclude most, but keep specific DMG for distribution)
release/*
!release/.gitkeep
!release/*.dmg
```

这样配置的效果:
- ✅ 允许提交 `*.dmg` 文件
- ❌ 忽略其他临时文件(如 .zip, .blockmap 等)

### 第2步: 修改 version.json

修改下载地址为 GitLab Raw 地址:

```json
{
  "version": "0.1.5",
  "releaseDate": "2026-01-21",
  "downloadUrl": "https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg?inline=false",
  "changeLog": [
    "新增: 应用内检测更新功能",
    "修复: 已知问题"
  ]
}
```

**注意**: 
- 使用 `/-/raw/master/` 路径获取原始文件
- 添加 `?inline=false` 参数强制下载而不是在浏览器中打开

### 第3步: 修改 updateManager.ts

```typescript
constructor(updateUrl?: string) {
  // 使用 GitLab 内网地址获取版本信息
  this.updateUrl = updateUrl || 'https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/version.json';
}
```

### 第4步: 发布流程

```bash
# 1. 更新版本号
npm version 0.1.5

# 2. 构建应用
npm run electron:build

# 3. 检查 release 目录
ls -lh release/
# 应该看到: 灵析-0.1.5.dmg

# 4. 重命名为英文名(方便URL)
mv "release/灵析-0.1.5.dmg" "release/lingxi-0.1.5.dmg"

# 5. 更新 version.json
# 修改版本号和下载链接

# 6. 提交到 GitLab
git add release/lingxi-0.1.5.dmg version.json package.json
git commit -m "发布 v0.1.5"
git push origin master

# 7. (可选)同时推送到 GitHub
git push github master
```

## 🔗 GitLab Raw 文件地址格式

### 获取任意文件的 Raw 地址

```
https://gitlab.alibaba-inc.com/{用户名}/{仓库名}/-/raw/{分支名}/{文件路径}
```

**你的仓库:**
```
https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg
```

**添加下载参数:**
```
https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg?inline=false
```

## ⚠️ 注意事项

### 1. DMG 文件大小限制

GitLab 对单文件大小有限制:
- 阿里内网 GitLab 通常允许 **100MB** 单文件
- 如果 DMG 超过限制,需要使用 **Git LFS**(Large File Storage)

**查看当前 DMG 大小:**
```bash
ls -lh release/lingxi-0.1.5.dmg
# 如果超过 100MB,需要配置 Git LFS
```

### 2. 使用 Git LFS (如果需要)

如果 DMG 文件太大:

```bash
# 1. 安装 Git LFS
brew install git-lfs

# 2. 初始化
git lfs install

# 3. 追踪 DMG 文件
git lfs track "release/*.dmg"

# 4. 提交 .gitattributes
git add .gitattributes
git commit -m "添加 Git LFS 支持"

# 5. 正常提交 DMG
git add release/lingxi-0.1.5.dmg
git commit -m "发布 v0.1.5"
git push origin master
```

### 3. 访问权限

**内网 GitLab 的限制:**
- ✅ 公司内网用户可以访问
- ❌ 外网用户无法访问
- ❌ 需要登录才能下载(匿名用户不行)

**解决办法:**
- 方案A: 将仓库设置为 **Public**(如果允许)
- 方案B: 用户需要登录 GitLab 账号才能下载
- 方案C: 同时提供 GitHub 外网链接作为备选

## 🎯 混合方案(推荐)

同时支持内网和外网:

### version.json 配置

```json
{
  "version": "0.1.5",
  "releaseDate": "2026-01-21",
  "downloadUrl": "https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg?inline=false",
  "downloadUrlMirror": "https://github.com/HayaKus/IamDog/releases/download/v0.1.5/lingxi-0.1.5.dmg",
  "changeLog": [
    "新增: 应用内检测更新功能"
  ]
}
```

### 修改 UpdateManager

支持镜像下载:

```typescript
export interface VersionInfo {
  version: string;
  releaseDate: string;
  downloadUrl: string;
  downloadUrlMirror?: string; // 镜像下载地址
  changeLog: string[];
}
```

然后在 UI 中同时显示两个下载按钮:
- **内网下载** (快速)
- **外网下载** (备用)

## 📝 发布检查清单

- [ ] 版本号已更新
- [ ] 应用已构建
- [ ] DMG 文件已重命名为英文名
- [ ] DMG 文件大小 < 100MB (或已配置 Git LFS)
- [ ] version.json 已更新
- [ ] 已测试下载链接可访问
- [ ] 已推送到 GitLab
- [ ] 已在应用内测试检测更新功能

## 🔍 测试验证

### 测试下载链接

```bash
# 方法1: 使用 curl 测试(显示文件信息)
curl -I "https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg?inline=false"

# 方法2: 使用 wget 测试下载
wget "https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg?inline=false" -O test.dmg

# 方法3: 在浏览器中打开
open "https://gitlab.alibaba-inc.com/haya.lhw/IamDog/-/raw/master/release/lingxi-0.1.5.dmg?inline=false"
```

### 测试应用内更新

```bash
npm run electron:dev
# 打开设置 → 检测更新
```

## 📊 方案对比

| 方案 | 访问速度 | 权限要求 | 文件大小限制 | 维护成本 |
|------|----------|----------|--------------|----------|
| GitLab 内网 | ⭐⭐⭐⭐⭐ | 需要内网访问 | 100MB | 低 |
| GitHub 外网 | ⭐⭐ | 无限制 | 2GB | 低 |
| 混合方案 | ⭐⭐⭐⭐ | 灵活 | 看情况 | 中 |
| OSS | ⭐⭐⭐⭐⭐ | 无限制 | 无限制 | 中 |

## 🎉 总结

**GitLab 内网方案适合:**
- ✅ 纯内网环境使用
- ✅ 公司内部工具
- ✅ 需要快速下载
- ✅ DMG 文件不大(< 100MB)

**如果需要外网访问:**
- 使用混合方案,同时提供 GitLab 和 GitHub 下载链接

---

**作者**: 哈雅 (263321)  
**日期**: 2026-01-21
