#!/bin/bash
# webhook-deploy.sh
# 收到 POST 请求后，在独立目录和 tmux 会话中部署 v1.0:3000 与 master:3001

# ─── 配置 ─────────────────────────────────────────────────
PORT=9999
TMUX_SESSION="PollPoker"
PREVIEW_SESSION="PollPoker-preview"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"   # 默认为脚本所在目录，可手动修改
TMUX_SOCKET="default"                       # tmux socket 名称（tmux -L 的值）
# 显式锚定 tmux server：保证 webhook 后台进程与交互式 shell 连到同一个 server
TMUX_BIN="$(command -v tmux)"
# ──────────────────────────────────────────────────────────

# tmux 包装函数：固定 socket，避免后台进程因环境差异连到不同的 server
tm() {
    "$TMUX_BIN" -L "$TMUX_SOCKET" "$@"
}

# 内部调用：带 --deploy 参数时执行部署逻辑
if [[ "$1" == "--deploy" ]]; then
    LOG_FILE="$APP_DIR/deploy.log"
    exec >> "$LOG_FILE" 2>&1

    echo ""
    echo "=== 部署开始 $(date '+%Y-%m-%d %H:%M:%S') ==="
    echo "环境：USER=$USER HOME=$HOME TMUX_BIN=$TMUX_BIN SOCKET=$TMUX_SOCKET"

    if [[ -z "$TMUX_BIN" ]]; then
        echo "错误：找不到 tmux 可执行文件（PATH=$PATH）"; exit 1
    fi

    cd "$APP_DIR" || { echo "错误：无法进入目录 $APP_DIR"; exit 1; }

    # 0. 加载 nvm 环境 (若存在)
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        . "$HOME/.nvm/nvm.sh"
    elif [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
    fi

    # 1. 只更新引用，不切换脚本所在目录的分支（它可能已处于 v1.0 detached HEAD）
    git fetch origin tag v1.0 || exit 1
    git fetch origin +refs/heads/master:refs/remotes/origin/master || exit 1

    deploy_version() {
        local ref="$1" dir="$2" session="$3" app_port="$4" revision command
        revision=$(git rev-parse "$ref^{commit}") || return 1
        # 两个目录仅供部署使用，各自保留独立的依赖和构建产物。
        if [[ ! -d "$dir" ]]; then
            git clone --no-checkout "$APP_DIR" "$dir" || return 1
        fi
        git -C "$dir" fetch "$APP_DIR" "$revision" || return 1

        # 2. 沿用原来的 Ctrl+C + run.sh 重启方式
        if tm has-session -t "=$session" 2>/dev/null; then
            tm send-keys -t "=$session:" C-c || return 1
            sleep 1
        else
            tm new-session -d -s "$session" -c "$dir" || return 1
            sleep 1
        fi

        # 清除上次由脚本写入的端口，避免影响下一次 checkout。
        if git -C "$dir" ls-files --error-unmatch config.yaml >/dev/null 2>&1; then
            git -C "$dir" restore --source=HEAD --worktree -- config.yaml || return 1
        fi
        git -C "$dir" checkout --detach "$revision" || return 1
        # 后端实际读取 config.yaml，单独设置 PORT 环境变量并不会改变监听端口。
        python3 - "$dir/config.yaml" "$app_port" <<'CONFIG'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
text, count = re.subn(r'^port:.*$', 'port: ' + sys.argv[2], text, flags=re.MULTILINE)
path.write_text(text if count else 'port: ' + sys.argv[2] + '\n' + text)
CONFIG
        [[ $? -eq 0 ]] || return 1

        # 3. 正确引用目录名，且不让 Webhook 的 PORT=9999 传给游戏进程。
        printf -v command 'cd %q && PORT=%q bash ./run.sh' "$dir" "$app_port"
        tm send-keys -t "=$session:" -l "$command" || return 1
        tm send-keys -t "=$session:" ENTER || return 1
        echo "已启动部署：$ref → $session，端口 $app_port"
    }

    deploy_version refs/tags/v1.0 "$APP_DIR-v1.0" "$TMUX_SESSION" 3000 || exit 1
    deploy_version refs/remotes/origin/master "$APP_DIR-preview" "$PREVIEW_SESSION" 3001 || exit 1

    echo "=== 已发送两版启动命令 $(date '+%Y-%m-%d %H:%M:%S') ==="
    exit 0
fi

# ─── 主流程：启动 HTTP Webhook 监听服务器 ─────────────────
SCRIPT_PATH="$(realpath "$0")"
export PORT APP_DIR TMUX_SESSION TMUX_SOCKET SCRIPT_PATH HOME

echo "Webhook 服务器启动中..."
echo "  项目目录：$APP_DIR"
echo "  Tmux 会话：$TMUX_SESSION"
echo "  监听端口：$PORT"
echo ""
echo "  触发方式：curl -X POST http://<服务器IP>:$PORT/deploy"
echo ""

python3 - << 'PYTHON'
import os, subprocess, threading, sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

class DeployHandler(BaseHTTPRequestHandler):
    # 设置单次连接超时时间（10秒），防止公网扫描器/死连接卡死服务
    timeout = 10

    def do_POST(self):
        try:
            # 1. 消耗 Request Body，避免 TCP socket 残留数据导致 RST
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                self.rfile.read(content_length)

            # 2. 返回 200 响应
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(b'{"status":"deploying"}')
            self.wfile.flush()

            # 3. 异步启动部署，并加 5 分钟超时防护，防止 git fetch 卡死
            env = os.environ.copy()
            def run_deploy():
                try:
                    subprocess.run(
                        ['bash', env['SCRIPT_PATH'], '--deploy'],
                        env=env,
                        timeout=300  # 最多等待 5 分钟
                    )
                except subprocess.TimeoutExpired:
                    sys.stderr.write("[ERROR] 部署超时 (300s)\n")
                except Exception as e:
                    sys.stderr.write(f"[ERROR] 部署异常: {e}\n")

            threading.Thread(target=run_deploy, daemon=True).start()
        except Exception as e:
            sys.stderr.write(f"[ERROR] do_POST 处理失败: {e}\n")

    def do_GET(self):
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        except Exception:
            pass

    def log_message(self, fmt, *args):
        # 捕获 stdout 异常，防止终端断开时 BrokenPipeError 崩溃
        try:
            sys.stdout.write(f"[{self.log_date_time_string()}] {fmt % args}\n")
            sys.stdout.flush()
        except Exception:
            pass

port = int(os.environ['PORT'])
# 使用 ThreadingHTTPServer 支持多线程并发
server = ThreadingHTTPServer(('0.0.0.0', port), DeployHandler)
print(f'监听 0.0.0.0:{port} (多线程模式)', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('Webhook 服务器已停止。')
PYTHON
