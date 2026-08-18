# 🎱 PoolPoker · 球霸扑克

> 朋友线下打台球聚会神器 —— 基于 54 张扑克发牌与球号映射的实时 Web 对战应用！

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-brightgreen)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.7-blue)](https://socket.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.0-emerald)](https://vuejs.org/)

---

## 🌟 项目亮点

- **🃏 54 张全副扑克牌库**：包含 52 张正牌（4种花色 × A~K）+ 小王 🃏 + 大王 👑。
- **🎱 真实球号映射**：A~K 自动对应 1~13 号台球，大小王对应 14、15 号球；固定包含 8 号黑八。
- **🔢 4 位数字房间号**：快捷创建与数字键盘扫码/输入加入，极简零门槛。
- **⚡ 实时低延迟同步**：基于 WebSocket (Socket.IO)，销牌、罚牌与战况实时秒级广播。
- **🚀 快捷部署**：自带 `config.yaml` 配置文件与一键部署 Shell 脚本 `deploy.sh`。

---

## 🚀 快速启动

### 1. 克隆与安装依赖
```bash
# 启动项目
npm install
npm start
```

### 2. 使用部署脚本一键挂起
```bash
./deploy.sh
```

打开浏览器访问 `http://localhost:3000` 即可开始游戏！

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
