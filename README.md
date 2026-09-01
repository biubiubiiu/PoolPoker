# 🎱 PoolPoker · 球霸扑克

> 朋友线下打台球聚会神器 —— 基于 54 张扑克牌发牌与台球球号映射的跨端实时对战应用。

🌐 **语言 / Language**: **简体中文** | [English](README_EN.md)

[![Node.js](https://img.shields.io/badge/Node.js-v24-brightgreen?logo=nodedotjs)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v11-orange?logo=pnpm)](https://pnpm.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.0-emerald?logo=vuedotjs)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri)](https://tauri.app/)
[![Android](https://img.shields.io/badge/Android-App-green?logo=android)](https://developer.android.com/)
[![iOS](https://img.shields.io/badge/iOS-App-black?logo=apple)](https://developer.apple.com/)
[![Wear OS](https://img.shields.io/badge/Wear%20OS-Compose-green?logo=wearos)](https://developer.android.com/wear)

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [系统架构](#系统架构)
- [环境准备](#环境准备)
- [快速上手](#快速上手)
  - [1. 快捷启动脚本](#1-快捷启动脚本)
  - [2. 本地开发模式](#2-本地开发模式)
  - [3. 生产构建与运行](#3-生产构建与运行)
  - [4. 移动端与 Wear OS 编译打包](#4-移动端与-wear-os-编译打包)
- [测试与代码质量](#测试与代码质量)
- [配置说明](#配置说明)
- [相关文档](#相关文档)

---

## 项目简介

**PoolPoker (球霸扑克)** 是一款专为线下台球聚会设计的卡牌对战与计分应用。

游戏规则融合了扑克发牌与台球球号映射机制：全副 54 张扑克牌发给玩家，其中 A~K 精确映射为 1~13 号台球，大小王映射为 14、15 号台球（必含 8 号黑八）。玩家通过 4 位数字房间号快捷建房与加入，在打台球进球后打出对应扑克牌清空手牌，首位打光所有有效卡牌的玩家获胜。

应用采用全端同步设计，支持 Web 浏览器、iOS/Android 移动端应用以及 Wear OS 智能手表实时联动。

---

## 核心特性

- 🃏 **扑克与球号映射**：全副 54 张扑克牌（52 张正牌 + 大小王）对应 1~15 号台球及黑八。
- 🔢 **4 位数字快捷建房**：极简房间号，零门槛建房与加入。
- ⚡ **多端实时低延迟同步**：基于 Socket.IO 实时同步消牌、罚牌与局势。
- 📱⌚ **全端跨平台支持**：支持 Web 浏览器、iOS/Android App（基于 Tauri v2 封装）及 Wear OS 手表原生应用（Jetpack Compose）。
- 🔒 **状态无缝重连**：持久化身份凭证，刷新页面或重启 App 后自动恢复手牌与房间状态。

---

## 系统架构

应用采用前端多端展示 + 后端单点领域逻辑控制的全栈架构：

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                              客户端 (Clients)                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  ┌───────────┐  │
│  │ Vue 3 Web    │   │ iOS App      │   │ Android App  │  │ Wear OS   │  │
│  │ (Browser)    │   │ (Tauri v2)   │   │ (Tauri v2)   │  │ App       │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  └─────┬─────┘  │
└─────────┼──────────────────┼──────────────────┼────────────────┼────────┘
          │                  │                  │                │
          └──────────────────┴────────┬─────────┴────────────────┘
                                      │ WebSocket / DataLayer
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            后端服务 (Server)                            │
│                     server/socketHandlers.ts                            │
│                                     │                                   │
│           ┌─────────────────────────┼─────────────────────────┐         │
│           ▼                         ▼                         ▼         │
│   gameEngine.ts               pokerDeck.ts              roomManager.ts  │
│ (领域规则与胜负判定)         (洗牌与发牌逻辑)         (房间状态管理与私钥广播) │
└─────────────────────────────────────────────────────────────────────────┘
```

### 技术栈一览

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **Web 前端** | Vue 3 + TypeScript + Vite + Tailwind CSS | 组件化响应式 UI 界面 |
| **移动端容器** | Tauri v2 | 封装 iOS/Android 原生 Application |
| **手表端应用** | Kotlin + Jetpack Compose for Wear OS | 独立 Wear OS 智能手表原生应用 |
| **后端服务** | Node.js + Express + Socket.IO | 内存状态房间管理与领域服务 |
| **质量保障** | Vitest + Playwright + Biome | 单元测试、端到端集成测试与代码风格检查 |

---

## 环境准备

在开始开发或构建前，请确保开发环境满足以下要求：

- **Node.js**: `>= 24.0.0` (推荐使用 `nvm` 管理)
- **pnpm**: `>= 10.0.0` (推荐通过 `corepack enable` 或 `npm i -g pnpm` 安装)
- **Android 开发环境 (可选)**: JDK 17+ 与 Android SDK (用于编译 `:app` 与 `:wear-app`)
- **iOS 开发环境 (可选)**: macOS 系统与 Xcode 15+ (用于编译 iOS App)
- **Rust 工具链 (可选)**: Cargo & Rust (用于 Tauri CLI 编译)

---

## 快速上手

### 1. 快捷启动脚本

运行根目录下的 `run.sh` 脚本，将自动初始化环境、安装依赖、构建前端并启动服务端：

```bash
chmod +x run.sh
./run.sh
```

启动完成后，打开浏览器访问 `http://localhost:3000` 即可开始体验。

### 2. 本地开发模式

同时开启后端服务 (端口 `3000`) 与前端 Vite 开发服务器 (端口 `5173`)，支持热重载 (HMR)：

```bash
# 切换至推荐 Node.js 版本并安装依赖
nvm use
pnpm install

# 启动前后端并行开发服务
pnpm run dev
```

如需单独运行前后端服务：
- 后端服务：`pnpm run dev:backend`
- 前端服务：`pnpm run dev:frontend`

### 3. 生产构建与运行

编译前端静态资源并以生产模式启动 Express/Socket.IO 服务：

```bash
# 构建前端 (Vue 3 + TypeScript)
pnpm run build

# 启动生产服务端
pnpm start
```

### 4. 移动端与 Wear OS 编译打包

项目使用 Tauri v2 将 Web 前端封装为 Android 与 iOS 移动应用：

#### Android 打包 (`android/`)
```bash
# 编译生成 Debug 测试 APK
npm run tauri:android

# 编译生成 Release 正式 APK (包含 R8 代码混淆与签名)
npm run tauri:android:build
```
> 💡 打包生成的 Release APK 位于 `android/app/build/outputs/apk/release/app-release.apk`。亦可在 Android Studio 中直接打开 `android/` 目录进行多模块联合调试。

#### iOS 打包与调试 (`apple/`)
```bash
# 启动 iOS 模拟器/真机调试模式
npm run tauri:ios

# 构建 iOS 生产安装包
npm run tauri:ios:build
```

---

## 测试与代码质量

项目遵循严格的代码测试与规范校验流程：

### 单元测试 (Vitest)
运行服务端领域逻辑、房间状态派生与计分规则的单元测试：
```bash
pnpm run test:unit         # 运行单次全量测试
pnpm run test:unit:watch   # 开发模式 (监视文件变动)
```

### 自动化 E2E 集成测试 (Playwright)
自动化模拟多浏览器窗口房间对局与实时交互：
```bash
pnpm run test:e2e
```

### 代码风格与规范校验 (Biome)
```bash
pnpm run lint              # 检查代码规范与类型错误
pnpm run format            # 自动格式化代码
```

---

## 配置说明

### `config.yaml`
服务端运行时主配置文件：
```yaml
app_name: "PoolPoker · 球霸扑克"
port: 3000                  # 服务运行端口

room:
  default_cards_per_player: 5 # 玩家默认发牌数
  max_players: 8             # 房间最大人数限制
  disconnect_timeout_ms: 3600000 # 玩家掉线超时清理时间 (毫秒)
```

### `ball_configs.json`
定义台球色彩主题与渐变样式（支持 `default` 标准色与 `xingpai` 星牌配色）：
```json
{
  "themes": {
    "default": {
      "balls": {
        "1": ["#FFFF00", "#E6E600", "#999900"],
        "8": ["#333333", "#1A1A1A", "#000000"]
      }
    }
  }
}
```

### `android/gradle.properties.local`
用于配置 Android / Wear OS 原生端运行环境（默认已被 `.gitignore` 忽略）：
```properties
POOLPOKER_SERVER_URL=http://192.168.1.100:3000
POOLPOKER_WATCH_PLAYER_NAME=手表玩家
```

---

## 相关文档

- 📖 **[系统设计与架构全景文档](docs/overview.md)**：包含完整的数据流图、数据模型契约与状态流转规则。
- 📱 **[Android & Tauri 移动端架构文档](docs/android_tauri_architecture.md)**：包含 Android 多模块配置、DataLayer 通信与 Tauri v2 构架。
- ⌚ **[Wear OS 手表原生应用架构文档](docs/wear_app_architecture.md)**：包含 Compose for Wear OS 布局结构与手势导航规范。
- 📝 **[版本演进与实现日志](docs/implement_log.md)**：记录项目各阶段的设计决策与修改履历。
