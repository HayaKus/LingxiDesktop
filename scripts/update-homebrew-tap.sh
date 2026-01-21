#!/bin/bash

# 更新 Homebrew Tap 的脚本
# 用法: ./scripts/update-homebrew-tap.sh <版本号> [SHA256]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查参数
if [ -z "$1" ]; then
  echo -e "${RED}错误: 缺少版本号参数${NC}"
  echo ""
  echo "用法: $0 <版本号> [SHA256]"
  echo ""
  echo "示例:"
  echo "  $0 0.1.6                    # 不验证 SHA256"
  echo "  $0 0.1.6 a1b2c3d4...        # 验证 SHA256"
  echo ""
  exit 1
fi

VERSION=$1
SHA256=${2:-":no_check"}

# Tap 仓库路径（需要修改为实际路径）
TAP_REPO="$HOME/Code/homebrew-LingxiDesktop"

echo -e "${YELLOW}正在更新 Homebrew Tap 到版本 $VERSION...${NC}"
echo ""

# 检查 Tap 仓库是否存在
if [ ! -d "$TAP_REPO" ]; then
  echo -e "${RED}错误: Tap 仓库不存在: $TAP_REPO${NC}"
  echo ""
  echo "请先创建 Tap 仓库："
  echo "  1. 在 GitHub 创建仓库: homebrew-LingxiDesktop"
  echo "  2. 克隆到本地: git clone https://github.com/HayaKus/homebrew-LingxiDesktop.git $TAP_REPO"
  echo "  3. 创建目录: mkdir -p $TAP_REPO/Casks"
  echo "  4. 复制 Cask 文件: cp homebrew/lingxidesktop.rb $TAP_REPO/Casks/"
  echo ""
  exit 1
fi

# 检查 Cask 文件是否存在
if [ ! -f "$TAP_REPO/Casks/lingxidesktop.rb" ]; then
  echo -e "${RED}错误: Cask 文件不存在: $TAP_REPO/Casks/lingxidesktop.rb${NC}"
  echo ""
  echo "请先复制 Cask 文件："
  echo "  cp homebrew/lingxidesktop.rb $TAP_REPO/Casks/"
  echo ""
  exit 1
fi

# 进入 Tap 仓库
cd "$TAP_REPO"

echo "📦 Tap 仓库: $TAP_REPO"
echo "🔢 版本号: $VERSION"
if [ "$SHA256" != ":no_check" ]; then
  echo "🔐 SHA256: $SHA256"
else
  echo "⚠️  SHA256: 跳过验证（开发模式）"
fi
echo ""

# 确保是最新的
echo "🔄 拉取最新代码..."
git pull origin main || git pull origin master

# 备份原文件
cp Casks/lingxidesktop.rb Casks/lingxidesktop.rb.backup

# 更新 Cask 文件
echo "✏️  更新 Cask 文件..."
if [ "$SHA256" = ":no_check" ]; then
  # 只更新版本号
  sed -i '' "s/version \".*\"/version \"$VERSION\"/" Casks/lingxidesktop.rb
else
  # 更新版本号和 SHA256
  sed -i '' "s/version \".*\"/version \"$VERSION\"/" Casks/lingxidesktop.rb
  sed -i '' "s/sha256 .*/sha256 \"$SHA256\"/" Casks/lingxidesktop.rb
fi

# 显示变更
echo ""
echo "📝 文件变更："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git diff Casks/lingxidesktop.rb || true
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 询问是否继续
read -p "是否提交并推送这些更改？(y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}已取消。恢复原文件...${NC}"
  mv Casks/lingxidesktop.rb.backup Casks/lingxidesktop.rb
  exit 0
fi

# 删除备份
rm Casks/lingxidesktop.rb.backup

# 提交并推送
echo ""
echo "📤 提交并推送..."
git add Casks/lingxidesktop.rb
git commit -m "Update to version $VERSION"
git push origin main || git push origin master

echo ""
echo -e "${GREEN}✅ Homebrew Tap 已成功更新到版本 $VERSION${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "用户现在可以通过以下命令更新："
echo ""
echo -e "  ${GREEN}brew update${NC}"
echo -e "  ${GREEN}brew upgrade --cask lingxidesktop${NC}"
echo ""
echo "或首次安装："
echo ""
echo -e "  ${GREEN}brew tap HayaKus/homebrew-lingxidesktop${NC}"
echo -e "  ${GREEN}brew install --cask lingxidesktop${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 完成！"
