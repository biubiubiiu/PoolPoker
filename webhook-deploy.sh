#!/bin/bash
# webhook-deploy.sh
# 收到 POST 请求后，执行 git pull，然后在 tmux 里重启 npm 服务

# ─── 配置 ─────────────────────────────────────────────────
PORT=3000
TMUX_SESSION="app"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"   # 默认为脚本所在目录，可手动修改
# ──────────────────────────────────────────────────────────

# 内部调用：带 --deploy 参数时执行部署逻辑
if [[ "$1" == "--deploy" ]]; then
    LOG_FILE="$APP_DIR/deploy.log"
    exec >> "$LOG_FILE" 2>&1

    echo ""
    echo "=== 部署开始 $(date '+%Y-%m-%d %H:%M:%S') ==="

    cd "$APP_DIR" || { echo "错误：无法进入目录 $APP_DIR"; exit 1; }

    # 1. 拉取最新代码
    echo "[1/3] git pull ..."
    git pull || { echo "错误：git pull 失败"; exit 1; }

    # 2. 检查 tmux 会话是否存在
    echo "[2/3] 重启 tmux 会话 '$TMUX_SESSION' 中的进程 ..."
    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        # 会话已存在，发送 Ctrl+C 中断当前进程
        tmux send-keys -t "$TMUX_SESSION" C-c ""
        sleep 1
    else
        # 会话不存在，新建一个后台会话
        tmux new-session -d -s "$TMUX_SESSION"
    fi

    # 3. 在 tmux 会话里执行 npm install && npm start，服务常驻后台
    echo "[3/3] npm install && npm start ..."
    tmux send-keys -t "$TMUX_SESSION" "cd $APP_DIR && npm install && npm start" ENTER

    echo "=== 部署完成 $(date '+%Y-%m-%d %H:%M:%S') ==="
    exit 0
fi

# ─── 主流程：启动 HTTP Webhook 监听服务器 ─────────────────
SCRIPT_PATH="$(realpath "$0")"
export PORT APP_DIR TMUX_SESSION SCRIPT_PATH

echo "Webhook 服务器启动中..."
echo "  项目目录：$APP_DIR"
echo "  Tmux 会话：$TMUX_SESSION"
echo "  监听端口：$PORT"
echo ""
echo "  触发方式：curl -X POST http://<服务器IP>:$PORT/deploy"
echo ""

python3 - << 'PYTHON'
import os, subprocess, threading, sys
from http.server import HTTPServer, BaseHTTPRequestHandler

class DeployHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 立即返回 200，部署在后台线程执行
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"deploying"}')
        env = os.environ.copy()
        threading.Thread(
            target=lambda: subprocess.run(
                ['bash', env['SCRIPT_PATH'], '--deploy'],
                env=env
            ),
            daemon=True
        ).start()

    def do_GET(self):
        # 健康检查接口
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, fmt, *args):
        sys.stdout.write(f"[{self.log_date_time_string()}] {fmt % args}\n")
        sys.stdout.flush()

port = int(os.environ['PORT'])
server = HTTPServer(('0.0.0.0', port), DeployHandler)
print(f'监听 0.0.0.0:{port}', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('Webhook 服务器已停止。')
PYTHON
