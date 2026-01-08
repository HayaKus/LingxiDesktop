#!/bin/bash

# 导盲犬 (Guide Dog) 启动脚本
# 用法: ./start.sh

echo "🐕 启动导盲犬应用..."
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到 npm"
    echo "请先安装 npm"
    exit 1
fi

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
    echo ""
fi

# 启动应用
echo "🚀 正在启动应用..."
echo "   - Vite 开发服务器: http://localhost:5173"
echo "   - 小狗图标将出现在桌面"
echo "   - 点击小狗或按 Cmd+Shift+A 打开对话窗口"
echo ""
echo "💡 提示: 按 Ctrl+C 停止应用"
echo ""

npm run electron:dev
