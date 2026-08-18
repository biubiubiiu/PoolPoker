#!/usr/bin/env bash

# =========================================================
# 台球扑克卡牌助手 Web App - 快速一键部署脚本
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

# 2. 安装项目依赖
echo "📦 正在安装 npm 依赖包..."
npm install --production

# 3. 读取 config.yaml 端口号
YAML_PORT=$(grep -E '^\s*port:' config.yaml 2>/dev/null | awk '{print $2}' | tr -d '\r\n')
PORT=${PORT:-${YAML_PORT:-3000}}

echo ""
echo "🚀 依赖安装完成！准备启动服务 (读取配置端口: $PORT)..."

# 检查 PM2 是否可用
if command -v pm2 &> /dev/null; then
    echo "⚙️ 检测到 PM2，正在使用 PM2 守护进程启动..."
    pm2 stop billiards-app 2>/dev/null || true
    pm2 start server.js --name "billiards-app"
    pm2 save
    echo "✅ PM2 部署成功！管理命令: pm2 logs billiards-app"
else
    echo "💡 正在使用 nohup 后台启动服务..."
    PID=$(pgrep -f "node server.js" || true)
    if [ -n "$PID" ]; then
        echo "🔄 正在停止已运行的前服务 (PID: $PID)..."
        kill -9 $PID 2>/dev/null || true
    fi
    nohup node server.js > app.log 2>&1 &
    echo "✅ 服务已在后台成功挂起！日志记录于 app.log"
fi

# 4. 获取本机 IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "你的服务器IP")

echo ""
echo "========================================================="
echo "🎉 台球扑克卡牌 Web App 部署成功！"
echo "📄 监听端口: $PORT (定义于 config.yaml)"
echo "🌐 本地访问地址:  http://localhost:$PORT"
echo "📱 局域网/手机访问: http://${LOCAL_IP}:$PORT"
echo "========================================================="
