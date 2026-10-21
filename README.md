# 🎱 PoolPoker · 球霸扑克

> 朋友线下台球聚会神器 —— 基于 54 张扑克牌发牌与台球球号映射的全平台实时对战与计分应用。

🌐 **语言 / Language**: **简体中文** | [English](README_EN.md)

[![Node.js](https://img.shields.io/badge/Node.js-v24-brightgreen?logo=nodedotjs)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v12-orange?logo=pnpm)](https://pnpm.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.5-emerald?logo=vuedotjs)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri)](https://tauri.app/)
[![Android](https://img.shields.io/badge/Android-App-green?logo=android)](https://developer.android.com/)
[![iOS](https://img.shields.io/badge/iOS-App-black?logo=apple)](https://developer.apple.com/)
[![Wear OS](https://img.shields.io/badge/Wear%20OS-Compose-green?logo=wearos)](https://developer.android.com/wear)
[![watchOS](https://img.shields.io/badge/watchOS-SwiftUI-black?logo=apple)](https://developer.apple.com/watchos/)
[![BLE Mesh](https://img.shields.io/badge/Offline-BLE%20Multiplayer-0082FC?logo=bluetooth)](docs/ble_offline_architecture.md)

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [系统架构与技术栈](#系统架构与技术栈)
- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [本地开发与服务端运行](#本地开发与服务端运行)
  - [移动端与智能手表构建](#移动端与智能手表构建)
- [代码质量与测试](#代码质量与测试)
- [配置与 3D 资产维护](#配置与-3d-资产维护)
- [架构与专题文档](#架构与专题文档)

---

## 项目简介

**PoolPoker（球霸扑克）** 是一款专为线下台球聚会设计的跨端多人卡牌对战应用。

游戏将整副 **54 张扑克牌**与 **1~15 号台球**建立映射：
- **A ~ K** 对应 **1 ~ 13 号球**（必含 8 号黑八）
- **小王** 对应 **14 号球**，**大王** 对应 **15 号球**

每位玩家开局抽取指定张数手牌（默认 5 张）。台球桌上每打进一颗球，持有对应球号扑克牌的玩家即可消去该牌；若球号已被他人或开球/意外打进，手牌自动置灰标记为“免打”。**率先清空手中全部有效卡牌的玩家获胜**，系统自动按剩余手牌同点数倍乘规则计算本局胜负积分与下一局击球顺序。

---

## 核心特性

- 🃏 **完整球牌规则引擎**：支持开局发牌、销牌、免打置灰、犯规罚抽牌、开球进球、意外进球、裁判代记、整步快照悔球（Undo）以及同点数倍乘积分结算。
- 📡 **在线 / 离线蓝牙双模联机**：
  - **在线服务器模式**：通过 4 位数字房间号或 300 米内地理位置“面对面发现”秒级建房入房，基于 Socket.IO 毫秒级同步。
  - **无服务器蓝牙面对面模式（Offline BLE）**：在无网/弱网的地下球房，多部 iOS/Android 手机可通过低功耗蓝牙（BLE GATT 星型拓扑）直接面对面联机，房主手机内置纯 TypeScript 权威引擎（`LocalHostEngine`），零服务器依赖。
- 🎱 **3D 沉浸式球台与经典双视图**：
  - **v2 沉浸式 3D 视图**：基于 Three.js 渲染 Blender 精模六袋球台，支持高光台球、袋口入袋动画与扇形拟真手牌。
  - **v1 经典 2D 视图**：紧凑直观的球盘面板与全局实况日志，一键无感切换。
- 📱⌚ **全端原生覆盖**：
  - **桌面与移动 Web**：响应式布局，适配 iOS 灵动岛/安全区与防深色反色保护。
  - **iOS & Android 原生客户端**：基于 Tauri v2 封装，集成原生蓝牙栈与系统对话框。
  - **Wear OS & Apple Watch 智能手表端**：提供 Jetpack Compose（Wear OS）与 SwiftUI（watchOS 10+）独立原生应用，抬腕即可看牌、记球与罚牌。
- 🔒 **跨端单一事实来源（SSOT）与安全重连**：基于 Draft-07 JSON Schema 自动生成 TypeScript、Kotlin 与 Swift 数据模型；持久化 `userId` 与 `sessionToken`，刷新或断线重连后自动恢复私有手牌。

---

## 系统架构与技术栈

PoolPoker 同时支持 **云端 Socket.IO 中心化同步** 与 **端侧 BLE 面对面无服务器直连** 两种运行拓扑：

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                                多端客户端矩阵                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Web 浏览器   │  │ Android App  │  │   iOS App    │  │ Wear OS / watchOS │  │
│  │ (Vue 3 SPA)  │  │  (Tauri v2)  │  │  (Tauri v2)  │  │  原生智能手表客户端  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘  │
└─────────┼─────────────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                 │                    │
          ▼                 ▼                 ▼                    ▼
  [模式 A: 在线服务器模式 (WebSocket / HTTP Long-Polling / Watch Companion)]
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Node.js 权威服务端 (server/)                                                   │
│  socketHandlers.ts ──► gameRoomService.ts ──► gameEngine / gameState / deck   │
│  roomManager.ts (按玩家身份裁剪私有手牌 + 多 Socket 会话广播)                    │
└───────────────────────────────────────────────────────────────────────────────┘

  [模式 B: 离线蓝牙面对面模式 (Serverless BLE Mesh - 仅需手机蓝牙)]
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ 虚拟传输层 BleTransport (src/services/bleTransport.ts)                         │
│  ├─ 房主手机 (Peripheral): LocalHostEngine (纯 TS 本地权威引擎) + GATT Server   │
│  └─ 客机手机 (Central):    二进制帧编解码 + 动态 MTU 分片重组 + GATT Client      │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 技术栈一览

| 层级 | 技术选型 | 职责说明 |
| :--- | :--- | :--- |
| **前端与 3D 视图** | Vue 3 + TypeScript + Vite + Tailwind CSS + Three.js | 响应式 UI、v1/v2 双视图、3D 球台渲染与组合式业务逻辑 |
| **跨端移动容器** | Tauri v2 + Rust (`src-tauri/`) | 封装 Android/iOS 原生应用，提供 JNI / Swift C-ABI 蓝牙与手表桥接 |
| **Android & Wear OS** | Kotlin + Jetpack Compose for Wear OS (`android/`) | `:app` 手机宿主、`:wear-app` 手表端、`:shared-models` 共享协议层 |
| **iOS & Apple Watch** | Swift + SwiftUI + CoreBluetooth (`apple/`) | iOS 宿主桥接与 `poolpoker_watchOS` 原生手表应用 |
| **在线服务端** | Node.js + Express + Socket.IO (`server/`) | 内存态房间生命周期、安全洗牌、状态快照回退与企微机器人推送 |
| **契约与质量保障** | JSON Schema (`quicktype`) + Vitest + Playwright + Biome | 跨语言模型自动生成、单元测试、E2E 测试与代码规范门禁 |

### 仓库目录结构

```text
PoolPoker/
├── android/                 # Android Gradle 多模块工程 (:app, :wear-app, :phone-companion, :shared-models)
├── apple/                   # iOS (Tauri) 与 Apple Watch (WatchApp/) Xcode 工程及 Swift 桥接源码
├── assets/models/           # Blender 3D 球台源文件 (billiards_table.blend, Git LFS 托管)
├── docs/                    # 架构设计、协议规范、构建流水线与演进日志文档
├── e2e/                     # Playwright 端到端集成测试
├── public/                  # 静态资源与运行时 3D 球台模型 (models/billiards_table.glb)
├── scripts/                 # 跨端模型代码生成 (codegen-models.mjs) 与移动端构建流水线脚本
├── server/                  # Node.js + Socket.IO 在线服务端与核心领域规则引擎
├── shared/                  # 跨端共享层：JSON Schema (SSOT)、生成模型与二进制 BLE 协议编解码
├── src/                     # Vue 3 前端源码 (components, composables, services, styles)
└── src-tauri/               # Tauri v2 Rust 核心层 (Android JNI / iOS C-ABI BLE 与手表通信插件)
```

---

## 快速开始

### 环境要求

- **Node.js**: `>= 24.0.0`（根目录含 `.nvmrc`，推荐使用 `nvm use`）
- **pnpm**: `>= 12.6.0`（移动构建流水线依赖 pnpm 任务图特性）
- **可选原生工具链**：
  - **Rust**: `cargo` & `rustup`（用于编译 `src-tauri`）
  - **Android / Wear OS**: JDK 17+、Android SDK & NDK
  - **iOS / watchOS**: macOS + Xcode 15+

### 本地开发与服务端运行

```bash
# 1. 切换 Node 版本并安装依赖
nvm use
pnpm install

# 2. 启动前后端热重载开发服务 (前端 http://localhost:5173 -> 代理后端 :3000)
pnpm run dev
```

常用单端命令：
- 仅启动后端（Watch 模式）：`pnpm run dev:backend`
- 仅启动前端（Vite HMR）：`pnpm run dev:frontend`
- 生产构建并启动服务：`pnpm start`（等价于 `pnpm run build && tsx server/index.ts`）
- 一键脚本启动：`./run.sh`

### 移动端与智能手表构建

项目提供统一的 `pnpm pipeline` 任务编排器（自动执行 JSON Schema 模型生成、漂移检查、测试与原生打包）：

```bash
# Android Debug / Release APK 构建
pnpm pipeline android-debug --full
pnpm pipeline android-release --full

# iOS Debug / Release 构建與模拟器实时调试
pnpm exec tauri ios dev
pnpm pipeline ios-debug --full
pnpm pipeline ios-release --full
```

> 更多流水线参数（如 `--dry-run`）与并发锁说明请参阅 [移动端构建编排文档](docs/mobile_build_pipeline.md)。

---

## 代码质量与测试

提交前 Git Hooks（Husky）会自动运行类型检查与 Biome 代码规范检查：

```bash
pnpm run codegen:models   # 从 shared/schemas/*.json 生成 TS / Kotlin / Swift 模型
pnpm run codegen:check    # 校验生成的跨端模型与 JSON Schema 是否一致
pnpm run test:unit        # 运行 Vitest 单元测试 (服务端领域逻辑 + 蓝牙协议 + 本地引擎)
pnpm run test:e2e         # 运行 Playwright 多窗口端到端测试
pnpm run lint             # 运行 Biome 静态检查
pnpm run format           # 运行 Biome 代码格式化
```

---

## 配置与 3D 资产维护

1. **服务端配置 (`config.yaml`)**：
   - 配置监听端口（默认 `3000`）、默认发牌张数（`default_cards_per_player: 5`）、房间人数上限（`max_players: 8`）及全员离线自动解散超时（`disconnect_timeout_ms: 3600000`）。
2. **Android / Wear OS 本地开发配置 (`android/gradle.properties.local`)**：
   - 被 Git 忽略，可配置 `POOLPOKER_SERVER_URL` 与 `POOLPOKER_WATCH_PLAYER_NAME` 注入 `BuildConfig`。
3. **3D 球台模型资产 (`assets/models/billiards_table.blend` → `public/models/billiards_table.glb`)**：
   - `.blend` 源文件由 Git LFS 跟踪（克隆后首次修改前请执行 `git lfs install --local --skip-repo`）。导出 GLB 时须保留六个 `PocketTarget_*` 锚点对象以驱动进球动画，详见 [3D 球台模型管线文档](docs/table_asset_pipeline.md)。

---

## 架构与专题文档

| 文档 | 内容概述 |
| :--- | :--- |
| 📖 **[系统架构与实现全景 (`docs/overview.md`)](docs/overview.md)** | 核心玩法规则、双模数据流、前后端模块职责、安全裁剪与状态回退机制 |
| 蓝牙 **[BLE 面对面离线联机架构 (`docs/ble_offline_architecture.md`)](docs/ble_offline_architecture.md)** | 无服务器 BLE 星型拓扑、`LocalHostEngine`、GATT UUID、二进制帧格式与动态 MTU 分片状态机 |
| 📍 **[附近房间定位发现 (`docs/nearby_room_discovery.md`)](docs/nearby_room_discovery.md)** | 在线模式下基于地理位置的面对面建房发现、精度收敛策略与隐私边界 |
| 📱 **[Android & Tauri 架构 (`docs/android_tauri_architecture.md`)](docs/android_tauri_architecture.md)** | Android 多模块 Gradle 工程、Tauri v2 容器集成与 Wear OS DataLayer 同步 |
| ⌚ **[Wear OS 原生手表端架构 (`docs/wear_app_architecture.md`)](docs/wear_app_architecture.md)** | Jetpack Compose for Wear OS 模块划分、直连恢复与侧滑返回导航规范 |
| 🍎 **[Apple Watch 原生手表端架构 (`docs/apple_watch_architecture.md`)](docs/apple_watch_architecture.md)** | watchOS 10+ SwiftUI 客户端、Engine.IO 长轮询、WCSession 桥接与多语言 |
| 🛠️ **[移动端构建流水线 (`docs/mobile_build_pipeline.md`)](docs/mobile_build_pipeline.md)** | Android / iOS 自动化构建任务图、前置检查与并发控制 |
| 🎱 **[3D 球台资产管线 (`docs/table_asset_pipeline.md`)](docs/table_asset_pipeline.md)** | Blender 源文件规范、GLB 导出要求与袋口锚点校验 |
| 📝 **[演进与实现日志 (`docs/implement_log.md`)](docs/implement_log.md)** | 按迭代轮次记录的架构决策、问题排查与演进历史 |
