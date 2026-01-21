# IamDog → Lingxi 完全替换方案

## 📌 替换概览

将项目从 "IamDog" 完全迁移到 "Lingxi"（灵析）品牌名称。

### 替换映射关系

| 原名称 | 新名称 | 说明 |
|--------|--------|------|
| IamDog | Lingxi | 英文品牌名（大驼峰） |
| iamdog | lingxi | 小写形式（用于文件名、包名） |
| IAMDOG | LINGXI | 全大写形式 |
| com.iamdog.app | com.lingxi.app | Bundle ID |
| HayaKus/IamDog | HayaKus/Lingxi | GitHub 仓库名 |
| homebrew-iamdog | homebrew-lingxi | Homebrew Tap 名 |
| iamdog.rb | lingxi.rb | Cask 文件名 |

---

## 🎯 替换步骤（按优先级）

### 第一阶段：核心配置文件

#### 1. electron-builder.json
```json
// 修改前
"appId": "com.iamdog.app"

// 修改后
"appId": "com.lingxi.app"
```

#### 2. package.json
- `name`: "iamdog" → "lingxi"
- 相关描述和关键词

#### 3. homebrew/iamdog.rb
- **文件需要重命名**: `iamdog.rb` → `lingxi.rb`
- cask 名称: "iamdog" → "lingxi"
- 所有内部引用的 IamDog → Lingxi

---

### 第二阶段：源代码文件

#### 4. electron/oauthManager.ts
```typescript
// 修改前
client_name: 'IamDog MCP Client'

// 修改后
client_name: 'Lingxi MCP Client'
```

#### 5. electron/updateManager.ts
```typescript
// 修改前
'https://raw.githubusercontent.com/HayaKus/IamDog/master/version.json'

// 修改后
'https://raw.githubusercontent.com/HayaKus/Lingxi/master/version.json'
```

---

### 第三阶段：文档文件

需要修改的主要文档：
- README.md
- docs/*.md (所有文档)
- 特别注意：
  - GitHub 链接 URL
  - Homebrew 安装命令
  - 仓库引用

---

### 第四阶段：Git 仓库

#### 方案 A：创建新仓库（推荐）
1. 在 GitHub 创建新仓库 `HayaKus/Lingxi`
2. 在 GitLab 创建新仓库 `haya.lhw/Lingxi`
3. 添加新的 remote：
   ```bash
   git remote add github-new https://github.com/HayaKus/Lingxi.git
   git remote add origin-new git@gitlab.alibaba-inc.com:haya.lhw/Lingxi.git
   ```

#### 方案 B：重命名现有仓库
- GitHub: Settings → Repository name → 改为 "Lingxi"
- GitLab: Settings → General → Advanced → Rename repository

---

### 第五阶段：外部资源

#### Homebrew Tap 仓库
1. 创建新的 Tap 仓库: `homebrew-lingxi`
2. 或重命名现有仓库: `homebrew-iamdog` → `homebrew-lingxi`

#### GitHub Releases
- 未来的 release 使用新的仓库地址
- 历史 release 可以保留或迁移

---

## ⚠️ 重要注意事项

### 1. Bundle ID 变更影响
修改 `com.iamdog.app` → `com.lingxi.app` 后：
- macOS 会将其视为**全新应用**
- 用户数据位置变更：
  - 旧：`~/Library/Application Support/com.iamdog.app/`
  - 新：`~/Library/Application Support/com.lingxi.app/`
- Preferences 位置变更：
  - 旧：`~/Library/Preferences/com.iamdog.app.plist`
  - 新：`~/Library/Preferences/com.lingxi.app.plist`

**解决方案**：可能需要添加数据迁移逻辑

### 2. Homebrew 安装命令变更
```bash
# 旧命令
brew tap HayaKus/iamdog
brew install --cask iamdog

# 新命令
brew tap HayaKus/lingxi
brew install --cask lingxi
```

### 3. 现有用户升级路径
需要在文档中说明：
- 旧版本 (iamdog) 如何卸载
- 新版本 (lingxi) 如何安装
- 数据如何迁移（如果需要）

### 4. 版本号建议
建议从一个新的主版本号开始，如：
- 旧：v0.1.7 (IamDog)
- 新：v1.0.0 (Lingxi) 或 v0.2.0

---

## 🔧 执行顺序建议

### 顺序 1：准备工作
1. ✅ 创建此替换方案文档
2. ⬜ 备份当前代码（创建 tag: `v0.1.7-iamdog-final`）
3. ⬜ 创建新的 Git 分支：`feature/rename-to-lingxi`

### 顺序 2：代码修改
1. ⬜ 修改配置文件（electron-builder.json, package.json）
2. ⬜ 修改源代码中的引用
3. ⬜ 重命名 Homebrew 文件
4. ⬜ 修改所有文档
5. ⬜ 测试编译和打包

### 顺序 3：仓库迁移
1. ⬜ 创建新的 GitHub 仓库 `Lingxi`
2. ⬜ 创建新的 GitLab 仓库 `Lingxi`
3. ⬜ 推送代码到新仓库
4. ⬜ 创建新的 Homebrew Tap: `homebrew-lingxi`

### 顺序 4：发布和通知
1. ⬜ 发布新版本到新仓库
2. ⬜ 更新 Homebrew Tap
3. ⬜ 在旧仓库添加迁移说明
4. ⬜ 通知现有用户

---

## 📝 文件替换清单

### 需要内容替换的文件（共约 50+ 个）
- ✅ electron-builder.json
- ✅ package.json
- ✅ README.md
- ✅ homebrew/iamdog.rb → lingxi.rb
- ✅ electron/oauthManager.ts
- ✅ electron/updateManager.ts
- ✅ version.json
- ✅ docs/ 下所有 .md 文件
- ✅ scripts/ 下的脚本文件

### 需要文件名重命名
- homebrew/iamdog.rb → homebrew/lingxi.rb

### 可以忽略的文件
- .git/ 目录（由 Git 自动处理）
- node_modules/
- dist/ 和 release/ （重新编译生成）
- .ai-code-tracker/ （日志文件）

---

## 🚀 自动化脚本建议

可以编写一个脚本批量替换，但需要注意：
1. **不要**替换 `.git/` 目录
2. **不要**替换 `node_modules/`
3. **不要**替换已编译的 `dist/` 和 `release/`
4. **谨慎**处理二进制文件

---

## ✅ 验证清单

替换完成后需要验证：
- [ ] 应用能正常编译打包
- [ ] Bundle ID 已更新
- [ ] 应用名称显示为 "灵析" 或 "Lingxi"
- [ ] OAuth 客户端名称已更新
- [ ] 更新检查 URL 指向新仓库
- [ ] Homebrew 安装命令可用
- [ ] 所有文档链接正确
- [ ] GitHub/GitLab 仓库可访问

---

## 📅 预计工时

- 代码和配置修改：2-3 小时
- 仓库迁移和设置：1-2 小时
- 测试和验证：1-2 小时
- 文档更新和发布：1 小时

**总计：5-8 小时**

---

## 🔗 相关链接

- 当前 GitHub: https://github.com/HayaKus/IamDog
- 当前 GitLab: git@gitlab.alibaba-inc.com:haya.lhw/IamDog.git
- 当前 Homebrew Tap: https://github.com/HayaKus/homebrew-iamdog

*新链接将在仓库创建后更新*
