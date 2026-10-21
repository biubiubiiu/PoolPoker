# PoolPoker（球霸扑克）系统架构与工程全景 (`docs/overview.md`)

本文档是 PoolPoker 项目的权威架构总览，涵盖核心领域规则、在线/离线双模数据流、跨端单一事实来源（SSOT）契约、各层模块职责以及关键工程不变量。

---

## 目录

1. [项目定位与核心规则](#1-项目定位与核心规则)
2. [全平台双模系统架构](#2-全平台双模系统架构)
   - [2.1 模式 A：在线服务器实时同步架构](#21-模式-a在线服务器实时同步架构)
   - [2.2 模式 B：无服务器 BLE 面对面离线联机架构](#22-模式-b无服务器-ble-面对面离线联机架构)
   - [2.3 跨端单一事实来源 (JSON Schema SSOT)](#23-跨端单一事实来源-json-schema-ssot)
   - [2.4 核心安全与工程不变量](#24-核心安全与工程不变量)
3. [仓库目录结构](#3-仓库目录结构)
4. [领域模型与服务端模块详解](#4-领域模型与服务端模块详解)
   - [4.1 牌库与加密安全洗牌 (`server/pokerDeck.ts`)](#41-牌库与加密安全洗牌-serverpokerdekts)
   - [4.2 游戏规则与积分引擎 (`server/gameEngine.ts`)](#42-游戏规则与积分引擎-servergameenginets)
   - [4.3 进行态快照栈与悔球回退 (`server/gameState.ts`)](#43-进行态快照栈与悔球回退-servergamestatets)
   - [4.4 牌局命令边界与生命周期服务 (`server/services/`)](#44-牌局命令边界与生命周期服务-serverservices)
   - [4.5 房间注册表、状态裁剪与会话路由 (`server/roomManager.ts` & `socketHandlers.ts`)](#45-房间注册表状态裁剪与会话路由-serverroommanagerts--sockethandlersts)
   - [4.6 附近房间定位发现 (`server/roomDiscovery.ts`)](#46-附近房间定位发现-serverroomdiscoveryts)
   - [4.7 企业微信机器人结算推送 (`server/wecomWebhook.ts`)](#47-企业微信机器人结算推送-serverwecomwebhookts)
5. [前端与多端客户端架构](#5-前端与多端客户端架构)
   - [5.1 组合式业务状态层 (`src/composables/`)](#51-组合式业务状态层-srccomposables)
   - [5.2 双版本对局视图体系（v1 经典 2D vs v2 沉浸式 3D）](#52-双版本对局视图体系v1-经典-2d-vs-v2-沉浸式-3d)
   - [5.3 离线蓝牙面对面传输层 (`src/services/`)](#53-离线蓝牙面对面传输层-srcservices)
   - [5.4 智能手表原生端（Wear OS & Apple Watch）](#54-智能手表原生端wear-os--apple-watch)
6. [构建流水线、测试与工程规范](#6-构建流水线测试与工程规范)
7. [专题架构文档索引](#7-专题架构文档索引)

---

## 1. 项目定位与核心规则

**PoolPoker（球霸扑克）** 面向线下台球聚会场景，将一副 **54 张扑克牌**与 **1~15 号台球**建立映射：
- **A ~ K** → **1 ~ 13 号球**（固定包含 8 号黑八）
- **小王 (`JOKER-S`)** → **14 号球**
- **大王 (`JOKER-B`)** → **15 号球**

### 对局生命周期与规则要点

1. **建房与入房**：支持 4 位数字房间码（`1000~9999`）、在线地理位置面对面发现（300 米内）或离线蓝牙扫描桌台加入，单房最多支持 8 名玩家。
2. **开局与击球顺序 (`computeTurnOrder`)**：
   - 首局随机洗牌决定击球顺序；
   - 后续局保留上一局在场玩家并补入新玩家 → 顺序反转 → 上一局获胜者轮转至首位开球。
3. **进球销牌与全局免打判定 (`getPocketedBallNumbers`)**：
   - 全局“已落袋球号集合”等于：`accidentalBalls`（意外进球） $\cup$ `breakBalls`（开球进球） $\cup$ 所有玩家的 `pocketedCards`（已消手牌）。
   - 玩家手中若有球号已落袋的卡牌，界面将其置灰标为“已进球·无需打出”（免打牌），既提示无需再打，又不向他人暴露底牌。
   - **获胜条件 (`checkGameWinners`)**：当某位玩家手中“尚未落袋的有效手牌”数量归零时立即获胜（支持一球触发多人同时获胜）。
4. **积分结算 (`calculateHandScore`)**：
   - 输家按手中未进球的剩余有效牌扣分：大小王基础分 `1` 分，其余牌基础分 `2` 分；同点数（`rank`）卡牌触发倍乘（$n$ 张同点数牌得分 = $\text{基础分之和} \times n$）。
   - 赢家平分所有输家扣除的总分，除不尽的余数归属触发本局结束的击球获胜者。

---

## 2. 全平台双模系统架构

### 2.1 模式 A：在线服务器实时同步架构

```text
浏览器 / Tauri App (Vue 3) / Wear OS (:wear-app) / Apple Watch (poolpoker_watchOS)
        │
        ├─ Socket.IO (WebSocket / Engine.IO Long-Polling) & Watch Companion Bridge
        ▼
server/socketHandlers.ts (会话鉴权、生命周期事件、广播触发)
        │
        ▼
server/services/gameRoomService.ts & roomLifecycleService.ts (命令边界)
        │
        ├─► gameEngine.ts (胜负判定 / 积分结算 / 击球顺序)
        ├─► gameState.ts  (gameHistory 快照栈记录与撤回)
        └─► pokerDeck.ts  (54 张牌库构建与 CSPRNG 洗牌)
        │
        ▼
server/roomManager.ts (按 userId 裁剪私有手牌 + 多 Socket 会话广播 room_updated)
```

### 2.2 模式 B：无服务器 BLE 面对面离线联机架构

在无网络环境下，应用通过 `useSocket.ts` 的 `toggleBleOfflineMode(true)` 切换至 `BleTransport`（虚拟 Socket 适配器）：

```text
房主与客机 Vue 业务层 (useGameRoom.ts —— 零业务代码改动)
        │
        ▼
src/services/bleTransport.ts (模拟 Socket.IO 接口)
  ├─ 房主模式 (Host):
  │    ├─ LocalHostEngine (直接复用 gameEngine / pokerDeck / gameRoomService 权威逻辑)
  │    ├─ 本机视图: getDirectClientRoom() 零拷贝无损直通
  │    └─ 客机推送: encodeBleRoomState() 脱敏二进制帧 -> GATT Notification 按 peerId 单播
  └─ 客机模式 (Guest):
       ├─ BleScanner (扫描解析广播包 + 12s TTL 过期淘汰)
       └─ BleChunkReassembler (动态 MTU 分片重组 -> decodeBleRoomState)
        │
        ▼
src-tauri/src/ble_mesh.rs (Rust Tauri Commands & Events)
  ├─ Android JNI  ──► BleMeshManager.kt (BluetoothLeAdvertiser / GattServer / BluetoothGatt)
  └─ iOS C-ABI    ──► BleMeshBridge.swift (CBPeripheralManager / CBCentralManager)
```

> 完整的蓝牙 GATT UUID、二进制帧字节布局与握手时序见 [BLE 面对面离线联机架构文档](ble_offline_architecture.md)。

### 2.3 跨端单一事实来源 (JSON Schema SSOT)

- `shared/schemas/` 下的 Draft-07 JSON Schema（`card.schema.json`、`room.schema.json`、`wear.schema.json`、`discovery.schema.json`）是跨平台在线 Wire Models 的唯一事实来源。
- 执行 `pnpm run codegen:models`（底层基于 `quicktype-core`）一键生成三端模型：
  - **TypeScript**: `shared/types/generated/wire-models.ts`
  - **Kotlin**: `android/shared-models/src/main/java/com/poolpoker/shared/generated/WireModels.kt`
  - **Swift**: `apple/Shared/Generated/WireModels.swift`
- 二进制 BLE 协议则由 `shared/types/bleProtocol.ts` 作为单一事实来源，原生层仅负责字节透传与按连接 MTU 动态切片。

### 2.4 核心安全与工程不变量

1. **双形态房间模型与私牌防泄露裁剪**：
   - `ServerRoom` 保存服务端内部敏感字段（`deck`、`accidentalBalls`、`gameHistory`、每位玩家的 `sessionToken` 与底牌 `cards`）。
   - `Room` 是下发给客户端的脱敏视图：`getClientRoomState`（在线）与 `getLocalBleState` / `getDirectClientRoom`（离线）严格保证未打出的 `cards` **仅下发给玩家本人**（或对局进入 `finished` 结算态后全员亮牌），而 `pocketedCards`（已消除牌）与 `cardCount`（手牌张数）全员公开。
2. **多设备同账号多 Socket 广播**：
   - `roomManager.ts` 维护 `socketIndex`（`socketId → { roomCode, userId }`），允许同一 `userId` 同时挂载手机端与智能手表端 Socket，并同时收到包含本人底牌的定制化 `room_updated`。
3. **会话令牌防劫持 (`sessionToken`)**：
   - 玩家建房或入房时签发 `crypto.randomUUID()` 作为 `sessionToken`；断线重连 `rejoin_room` 必须匹配该令牌，被房主踢出（`kick_player`）后旧令牌立即失效。
4. **纯加密安全随机数 (CSPRNG)**：
   - 服务端使用 `node:crypto`（`randomInt`、`randomUUID`），前端离线引擎使用 Web Crypto API（`shared/utils/crypto.ts` 的 `crypto.getRandomValues`），严禁使用 `Math.random()`。
5. **单调递增修订号 (`revision`) 与场景事件 (`sceneEvent`)**：
   - 每次有效牌局变更使 `room.revision` 自增，并生成携带动作类型与球号的 `sceneEvent`。前端据此判断事件连续性（`shouldAnimateRoomChange`），避免重连或切回前台时重播过期动画，并在撤回操作时通过 `expectedRevision` 防止并发冲突。

---

## 3. 仓库目录结构

```text
PoolPoker/
├── android/                        # Android 与 Wear OS Gradle 多模块工程
│   ├── app/                        # Tauri Android 手机端宿主 (:app, 含 BleMeshManager & Wear 插件)
│   ├── phone-companion/            # 手机端 Wearable DataLayer 伴侣服务 (:phone-companion)
│   ├── shared-models/              # 跨模块共享模型与常量 (:shared-models)
│   └── wear-app/                   # Wear OS 手表独立原生应用 (:wear-app, Jetpack Compose)
├── apple/                          # iOS 与 Apple Watch 原生工程 (XcodeGen project.yml 管理)
│   ├── Shared/Generated/           # 自动生成的 Swift WireModels
│   ├── Sources/poolpoker/          # iOS 原生插件桥接 (BleMeshBridge.swift, WatchSyncBridge.swift)
│   └── WatchApp/                   # watchOS 10+ 原生应用源码 (SwiftUI + Engine.IO 客户端)
├── assets/models/                  # Blender 3D 球台可编辑源文件 (billiards_table.blend, Git LFS)
├── docs/                           # 架构设计、协议规范与演进日志文档库
├── e2e/                            # Playwright 端到端测试 (poolpoker.spec.ts)
├── public/                         # 静态资源、球台 GLB 模型 (models/billiards_table.glb) 与企微配置页
├── scripts/                        # 模型生成 (codegen-models.mjs) 与移动端构建编排 (mobile-pipeline.mjs)
├── server/                         # Node.js + Express + Socket.IO 后端服务
│   ├── __tests__/                  # 服务端与协议层 Vitest 单元测试
│   ├── services/                   # 牌局命令边界 (gameRoomService.ts) 与房间生命周期服务
│   ├── config.ts                   # config.yaml 加载器
│   ├── gameEngine.ts               # 核心规则引擎 (胜负判定、积分计算、击球顺序)
│   ├── gameState.ts                # 进行态快照栈 (snapshot / restore / record / undo)
│   ├── index.ts                    # Express HTTP API (/api/rooms/:code) 与 Socket.IO 入口
│   ├── pokerDeck.ts                # 54 张扑克牌构建与 Fisher-Yates CSPRNG 洗牌
│   ├── roomDiscovery.ts            # 在线模式地理位置附近房间匹配服务
│   ├── roomManager.ts              # 内存房间表、Socket 会话索引、脱敏裁剪与单播分发
│   ├── socketHandlers.ts           # Socket.IO 事件路由层
│   └── wecomWebhook.ts             # 企业微信机器人战报推送
├── shared/                         # 前后端与跨平台共享层
│   ├── schemas/                    # Draft-07 JSON Schemas (card, room, wear, discovery)
│   ├── types/                      # TS 类型定义、protocol.ts 常量与 bleProtocol.ts 二进制编解码
│   └── utils/                      # 同构 CSPRNG 随机工具 (crypto.ts)
├── src/                            # Vue 3 前端应用
│   ├── __tests__/                  # 前端服务与组合式函数 Vitest 单元测试
│   ├── components/                 # 公共组件及 v1 (2D 经典) / v2 (3D 沉浸式) 对局视图组件
│   ├── composables/                # 响应式业务层 (useGameRoom, useSocket, useNearbyRooms 等)
│   ├── services/                   # 离线蓝牙引擎与传输层 (localHostEngine, bleTransport, bleScanner)
│   ├── styles/                     # 全局样式、iOS 安全区适配与球牌防反色规则 (main.css)
│   └── utils/                      # 原生弹窗桥接等工具函数
└── src-tauri/                      # Tauri v2 Rust 宿主与跨端插件 (ble_mesh.rs, lib.rs)
```

---

## 4. 领域模型与服务端模块详解

### 4.1 牌库与加密安全洗牌 (`server/pokerDeck.ts`)

- `create54PokerDeck()`：生成标准 54 张牌库（4 花色 $\times$ A~K 对应 `ballNumber: 1..13`，小王对应 `14` 灰色，大王对应 `15` 金色，ID 为 `c_1..c_54`）。
- `shuffle()`：基于 CSPRNG 的 Fisher-Yates 洗牌算法，返回全新牌组。

### 4.2 游戏规则与积分引擎 (`server/gameEngine.ts`)

- `getPocketedBallNumbers(room)`：汇总 `accidentalBalls`、`breakBalls` 及所有玩家的 `pocketedCards`，升序返回全局已落袋球号列表。
- `checkGameWinners(room)`：筛选手中未落袋卡牌数为 0 的玩家。
- `calculateHandScore(cards, pocketedBallNumbers)`：计算输家未消手牌罚分（大小王 1 分、其余 2 分，同点数 $n$ 张倍乘 $n$）。
- `handleGameFinished(room, triggerUserId)`：更新胜场、记录 `lastRoundScores` 与总分，并异步调用 `sendRoundResultToWecom` 推送企微战报。

### 4.3 进行态快照栈与悔球回退 (`server/gameState.ts`)

- 将牌局进行态抽象为 `GameState`（包含玩家手牌/已消牌/积分、牌堆 `deck`、`accidentalBalls`、`breakBalls`、`winners`、`turnOrder`、`roundCount` 等，不含聊天/实况日志 `logs`）。
- 每局 `start_game` 发牌完毕后调用 `recordGameStep` 压入初始基线快照；每次销牌、罚牌、开球进球、意外进球、裁判代记后压入新快照。
- `retract_ball` 调用 `undoGameStep` 弹出栈顶并恢复至上一步状态（当栈内仅剩发牌基线时不再回退），同时追加一条悔球审计日志。

### 4.4 牌局命令边界与生命周期服务 (`server/services/`)

- `gameRoomService.ts` (`applyGameRoomCommand`)：统一封装牌局内所有状态变更命令（`start_game`、`pocket_ball`、`draw_penalty`、`accidental_pocket`、`break_pocket`、`referee_pocket_ball`、`referee_draw_penalty`、`retract_ball`、`restart_game`）。在线服务端与前端离线 `LocalHostEngine` 共同复用该命令边界。
- `roomLifecycleService.ts`：管理在线房间的创建、加入、重连、踢人、退房以及全员离线超时自动清理定时器。

### 4.5 房间注册表、状态裁剪与会话路由 (`server/roomManager.ts` & `socketHandlers.ts`)

- `roomManager.ts` 管理内存房间表 `rooms` 与 `socketIndex`，提供 `getClientRoomState(room, currentUserId)` 执行底牌脱敏裁剪，并通过 `broadcastRoomState` 向房间内每个连接单播对应视角的状态。
- `socketHandlers.ts` 绑定 Socket.IO 事件，校验 `sessionToken` 与房主权限，并将业务指令转发至服务层。

### 4.6 附近房间定位发现 (`server/roomDiscovery.ts`)

- 在线模式下，支持玩家在大厅开启短期高精度定位，发现 300 米内处于 `waiting` 状态的房间。位置信息仅保存在服务端短期内存（60 秒自动过期），绝不写入公开 `Room` 快照。详见 [附近房间定位发现文档](nearby_room_discovery.md)。

### 4.7 企业微信机器人结算推送 (`server/wecomWebhook.ts`)

- 支持通过 `/enter_robot` 页面或 `/api/robot-url` 接口在运行时配置企业微信 Webhook 链接；每局结算后自动发送包含各玩家本局得分变化与累计总分的战报消息。

---

## 5. 前端与多端客户端架构

### 5.1 组合式业务状态层 (`src/composables/`)

- `usePlayerProfile.ts`：管理持久化 `userId` 与玩家昵称（`localStorage`）。
- `useSocket.ts`：管理在线 Socket.IO 实例与离线 `BleTransport` 实例的生命周期及模式切换（`toggleBleOfflineMode`）。
- `useGameRoom.ts`：核心业务编排层。维护响应式 `room` 状态、乐观待确认状态（`pendingAction`）、3D 场景演出队列（`shouldAnimateRoomChange`）、页面切回前台时的 HTTP 快照极速同步（`/api/rooms/:code`，离线模式下自动跳过）以及智能手表凭证同步。
- `useNearbyRooms.ts`：统一编排在线 GPS 附近房间发现与离线 BLE 附近桌台扫描。
- `useUiPreferences.ts` & `useBallAppearance.ts`：管理 v1/v2 视图切换、音效/触觉开关及台球外观主题（星牌等）。

### 5.2 双版本对局视图体系（v1 经典 2D vs v2 沉浸式 3D）

- **v1 经典版 (`src/components/v1/`)**：由 `BilliardsTable.vue`（2D 球盘、击球顺序、玩家进度列表）、`PokerCard.vue`（2D 卡牌与免打遮罩）和 `GameLogs.vue` 组成。
- **v2 沉浸式 3D 版 (`src/components/v2/`)**：
  - `ThreeBilliardsArena.vue`：使用 Three.js 加载 `public/models/billiards_table.glb`（支持大厅闲时预加载与内存缓存），读取模型内六个 `PocketTarget_*` 锚点驱动台球落袋动画，并将 3D 球体位置实时投影为可无障碍点击的 DOM 球号热区；在后台或静止时自动停帧以节省电量，WebGL 不可用时优雅降级为平面球桌。
  - `HandDeckFan.vue` & `PokerCardProp.vue`：拟真弧形扇面手牌，支持抬牌、出牌与免打转化过渡动画。
  - `GameMinimalHud.vue`、`TableOpponentSeats.vue` 与 `GameControlDrawer.vue`：提供环绕式对手席位、代记对象快速切换与抽屉式规则/日志面板。

### 5.3 离线蓝牙面对面传输层 (`src/services/`)

- `localHostEngine.ts` (`LocalHostEngine`)：运行在房主前端内存中的权威游戏引擎，管理客机 `peerId ↔ userId` 席位映射、满员/开局拒连判定以及状态广播。
- `bleTransport.ts` (`BleTransport`)：实现 Socket.IO 兼容接口，处理 `CLIENT_JOIN` 20 字节分片握手、`LEAVE_ACK` 退房确认闭环及断线重连。
- `bleScanner.ts` (`BleScanner`)：监听原生蓝牙扫描事件，维护附近蓝牙桌台列表并执行 12 秒 TTL 过期清理。

### 5.4 智能手表原生端（Wear OS & Apple Watch）

- **Wear OS (`android/wear-app/`)**：基于 Jetpack Compose for Wear OS 构建的单 Activity 架构，支持手机 DataLayer 凭证同步与独立 Wi-Fi/LTE Socket.IO 直连，所有二级弹窗严格遵循 `SwipeToDismissBox` 侧滑返回规范。详见 [Wear OS 架构文档](wear_app_architecture.md)。
- **Apple Watch (`apple/WatchApp/`)**：基于 watchOS 10+ SwiftUI 构建，支持通过 `WCSession` 接收 iPhone 同步的房间凭证，并使用原生 `URLSession` Engine.IO HTTP 长轮询直连服务器完成看牌、销牌与裁判记球。详见 [Apple Watch 架构文档](apple_watch_architecture.md)。

---

## 6. 构建流水线、测试与工程规范

- **跨端模型同步**：修改 `shared/schemas/*.json` 后必须运行 `pnpm run codegen:models`，CI 与移动端流水线通过 `pnpm run codegen:check` 强制校验无漂移。
- **移动端统一流水线 (`scripts/mobile-pipeline.mjs`)**：通过 `pnpm pipeline <android-debug|android-release|ios-debug|ios-release> --full` 串联前置检查、代码生成、单元测试、前端构建与 Tauri/Gradle/Xcode 打包，并使用 `poolpoker-native` 互斥锁防止并发污染 `dist/`。详见 [移动端构建编排文档](mobile_build_pipeline.md)。
- **测试体系**：
  - **单元测试 (`pnpm run test:unit`)**：基于 Vitest，覆盖服务端规则引擎、房间管理、状态回退、发现服务、BLE 二进制协议编解码与分片重组、`LocalHostEngine`、`BleTransport` 及前端状态逻辑。
  - **端到端测试 (`pnpm run test:e2e`)**：基于 Playwright（`e2e/poolpoker.spec.ts`），验证多窗口实时建房、发牌、销牌、罚牌、悔球与结算全流程。
- **代码门禁**：Husky `pre-commit` 自动执行 `vue-tsc --noEmit` 与 `lint-staged`（Biome 格式化与静态检查），`commit-msg` 通过 `commitlint` 强制校验 Conventional Commits 规范。

---

## 7. 专题架构文档索引

| 专题文档 | 核心内容 |
| :--- | :--- |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 本地开发环境准备、常用命令速查、跨端模型生成、测试门禁与 PR 贡献指南 |
| [ble_offline_architecture.md](ble_offline_architecture.md) | 无服务器 BLE 面对面联机架构、GATT UUID、二进制帧格式、动态 MTU 分片与连接状态机 |
| [nearby_room_discovery.md](nearby_room_discovery.md) | 在线模式地理位置附近房间发现、定位精度收敛策略、生命周期与隐私安全设计 |
| [android_tauri_architecture.md](android_tauri_architecture.md) | Android Gradle 多模块架构、Tauri v2 APK 打包、权限配置与 Wear OS DataLayer 桥接 |
| [wear_app_architecture.md](wear_app_architecture.md) | Wear OS 原生手表端模块划分、会话直连恢复与 `SwipeToDismissBox` 手势导航规范 |
| [apple_watch_architecture.md](apple_watch_architecture.md) | Apple Watch 原生架构、Engine.IO 长轮询、WatchConnectivity 桥接与 String Catalog 国际化 |
| [mobile_build_pipeline.md](mobile_build_pipeline.md) | `pnpm pipeline` 移动端构建任务编排、前置环境检查与并发锁机制 |
| [table_asset_pipeline.md](table_asset_pipeline.md) | Blender 3D 球台源文件维护、GLB 导出规范、`PocketTarget_*` 锚点与 Git LFS 流程 |
| [implement_log.md](implement_log.md) | 项目按轮次演进的详细工程决策、架构审查与问题修复记录 |
