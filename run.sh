#!/usr/bin/env bash

# =========================================================
# 台球扑克卡牌助手 Web App - 快速一键构建与运行脚本
# =========================================================

set -e

echo "🎱 正在初始化台球扑克卡牌 Web 应用..."

# 1. 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js，请先安装 Node.js (推荐 v18+)"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ 检测到 Node.js 环境: $NODE_VERSION"

# 2. 安装项目依赖 (包含前端构建所需的 devDependencies)
echo "📦 正在安装 npm 依赖包..."
npm install

# 3. 前端编译打包 (Vite + TypeScript + Vue 3)
echo "🏗️ 正在构建前端工程 (npm run build)..."
npm run build

# 4. 读取 config.yaml 端口号
YAML_PORT=$(grep -E '^\s*port:' config.yaml 2>/dev/null | awk '{print $2}' | tr -d '\r\n')
PORT=${PORT:-${YAML_PORT:-3000}}

# 5. 获取本机 IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "你的服务器IP")

echo ""
echo "========================================================="
echo "🎉 台球扑克卡牌 Web App 构建成功，准备启动！"
echo "📄 监听端口: $PORT (定义于 config.yaml)"
echo "🌐 本地访问地址:  http://localhost:$PORT"
echo "📱 局域网/手机访问: http://${LOCAL_IP}:$PORT"
echo "========================================================="
echo ""
echo "🚀 正在启动后台服务 (node server.js)..."

exec node server.js
