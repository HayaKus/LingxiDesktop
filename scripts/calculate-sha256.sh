#!/bin/bash

# 计算 DMG 文件的 SHA256 值
# 用法: ./scripts/calculate-sha256.sh <DMG文件路径>

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查参数
if [ -z "$1" ]; then
  echo -e "${RED}错误: 缺少 DMG 文件路径${NC}"
  echo ""
  echo "用法: $0 <DMG文件路径>"
  echo ""
  echo "示例:"
  echo "  $0 release/灵析-0.1.5.dmg"
  echo "  $0 ~/Downloads/lingxi-0.1.5.dmg"
  echo ""
  exit 1
fi

DMG_FILE="$1"

# 检查文件是否存在
if [ ! -f "$DMG_FILE" ]; then
  echo -e "${RED}错误: 文件不存在: $DMG_FILE${NC}"
  exit 1
fi

echo -e "${YELLOW}正在计算 SHA256...${NC}"
echo ""
echo "📦 文件: $DMG_FILE"
echo "📏 大小: $(du -h "$DMG_FILE" | cut -f1)"
echo ""

# 计算 SHA256
SHA256=$(shasum -a 256 "$DMG_FILE" | cut -d ' ' -f1)

echo -e "${GREEN}✅ SHA256 计算完成${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}$SHA256${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 使用方法："
echo ""
echo "1. 复制上面的 SHA256 值"
echo ""
echo "2. 在 homebrew/iamdog.rb 中替换："
echo "   sha256 \"$SHA256\""
echo ""
echo "3. 或使用更新脚本："
echo "   ./scripts/update-homebrew-tap.sh 0.1.5 $SHA256"
echo ""

# 将 SHA256 复制到剪贴板（如果可能）
if command -v pbcopy &> /dev/null; then
  echo "$SHA256" | pbcopy
  echo -e "${GREEN}✅ SHA256 已复制到剪贴板${NC}"
  echo ""
fi
