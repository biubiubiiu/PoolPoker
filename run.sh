#!/usr/bin/env bash

# =========================================================
# 台球扑克卡牌助手 Web App - 快速一键构建与运行脚本
# =========================================================

set -e

echo "🎱 正在初始化台球扑克卡牌 Web 应用..."

# 1. 尝试加载 nvm 环境并切换 Node.js 版本
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
fi

if command -v nvm &> /dev/null && [ -f .nvmrc ]; then
    echo "🔄 检测到 .nvmrc，切换 Node.js 版本..."
    nvm use || nvm install
fi

# 2. 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js，请先安装 Node.js (推荐 v24+)"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ 检测到 Node.js 环境: $NODE_VERSION"

# 3. 检查并启用 pnpm 环境
if ! command -v pnpm &> /dev/null; then
    echo "⚠️ 未检测到 pnpm，尝试启用 corepack..."
    corepack enable 2>/dev/null || true
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 未找到 pnpm 包管理器，请先安装 pnpm (例如: npm install -g pnpm)"
    exit 1
fi

PNPM_VERSION=$(pnpm -v)
echo "✅ 检测到 pnpm 环境: $PNPM_VERSION"

# 4. 安装项目依赖
echo "📦 正在安装 pnpm 依赖包..."
pnpm install

# 5. 前端编译打包 (Vite + TypeScript + Vue 3)
echo "🏗️ 正在构建前端工程 (pnpm run build)..."
pnpm run build

# 6. 读取 config.yaml 端口号
YAML_PORT=$(grep -E '^\s*port:' config.yaml 2>/dev/null | awk '{print $2}' | tr -d '\r\n')
PORT=${PORT:-${YAML_PORT:-3000}}

# 7. 获取本机 IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "你的服务器IP")

echo ""
echo "========================================================="
echo "🎉 台球扑克卡牌 Web App 构建成功，准备启动！"
echo "📄 监听端口: $PORT (定义于 config.yaml)"
echo "🌐 本地访问地址:  http://localhost:$PORT"
echo "📱 局域网/手机访问: http://${LOCAL_IP}:$PORT"
echo "========================================================="
echo ""
echo "🚀 正在启动后台服务 (pnpm exec tsx server/index.ts)..."

exec pnpm exec tsx server/index.ts
