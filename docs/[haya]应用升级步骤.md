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
git commit -m "发布 v0.1.7"
git push github master

# 在 GitHub 创建 Release 并上传 DMG
# 上传时文件名格式：lingxi-0.1.6.dmg
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
git commit -m "Update to version 0.1.7"
git push origin master
```

#### 5. 测试安装

```bash
brew tap HayaKus/iamdog

# 更新 Homebrew
brew update

# 测试安装
brew reinstall --cask iamdog

# 验证版本
brew info --cask iamdog
```

### 更新到最新版本

```bash
# 更新 Homebrew 和 Tap 仓库
brew update

# 升级 IamDog 到最新版本
brew upgrade --cask iamdog
```