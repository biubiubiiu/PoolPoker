# 🎱 PoolPoker · 球霸扑克

> 朋友线下打台球聚会神器 —— 基于 54 张扑克发牌与球号映射的实时 Web 对战应用！

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-brightgreen)](https://nodejs.org/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.0-emerald)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.4-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-v8.2-purple)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.3-sky)](https://tailwindcss.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.7-blue)](https://socket.io/)

---

## 🌟 项目亮点

- **🃏 54 张全副扑克牌库**：包含 52 张正牌（4种花色 × A\~K）+ 小王 🃏 + 大王 👑。
- **🎱 真实球号映射**：A\~K 自动对应 1\~13 号台球，大小王对应 14、15 号球；固定包含 8 号黑八。
- **🔢 4 位数字房间号**：快捷创建与数字键盘扫码/输入加入，极简零门槛。
- **⚡ 实时低延迟同步**：基于 WebSocket (Socket.IO)，销牌、罚牌与战况实时秒级广播。
- **💻 现代前端工程化**：使用 Vue 3 + TypeScript + Vite + Tailwind CSS 组件化架构开发。
- **🚀 快捷构建与运行**：自带 `config.yaml` 配置文件与一键构建启动脚本 `run.sh`。

---

## 🚀 快速启动

### 1. 一键构建与运行 (推荐)
直接运行根目录下的 `run.sh` 脚本，将自动完成依赖安装、前端打包与服务启动：
```bash
chmod +x run.sh
./run.sh
```

### 2. 手动构建与运行

```bash
# 1. 安装依赖
npm install

# 2. 构建前端 (Vite + TypeScript)
npm run build

# 3. 启动服务端
npm start
```

### 3. 本地开发模式
如需同时开启后端服务与前端 Vite 热重载调试：
```bash
npm run dev
```

### 4. 自动化 E2E 集成测试 (Playwright)
使用 Playwright 自动化测试完整的多人双窗口对局流程：
```bash
npm run test:e2e
```

启动完成后，用浏览器或手机访问控制台提示的地址（默认 `http://localhost:3000`）即可开始游戏！

---

## ⚙️ 配置文件说明 (`config.yaml`)

编辑 `config.yaml` 轻松修改服务端运行参数：

```yaml
# 应用名称与标题
app_name: "PoolPoker · 球霸扑克"

# 服务运行端口
port: 3000

# 游戏房间默认设置
room:
  default_cards_per_player: 5
  max_players: 8
```
