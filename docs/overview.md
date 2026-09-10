# overview — PoolPoker 球霸扑克

## 需求概述

实现「朋友线下打台球聚会」场景的实时多人在线对战 Web 应用：以 54 张扑克牌发牌、牌面映射台球球号（A\~K → 1\~13 号、小王 → 14 号、大王 → 15 号，固定包含 8 号黑八），玩家通过 4 位数字房间号创建/加入房间，开局发牌后按「进球 → 点击对应卡牌销牌」的方式逐步消去手牌，率先清空全部有效手牌者获胜。应用覆盖完整对战生命周期：房间大厅（昵称/头像/球色配置/发牌数调节）、断线重连与暂离保护、击球顺序轮转、销牌/撤回上一步（快照栈逐步回退）、犯规罚抽牌、意外进球/误进无关球、开球进球（不归入任何玩家手牌）、裁判代记（进球/犯规）、多人联合胜利结算与累计胜负/积分统计、每局结算自动推送企业微信机器人（Webhook 链接运行时配置），以及 Playwright 端到端测试与一键构建部署脚本。前端经 Vue3 + TS + Vite 重构，后端从单文件 `server.js` 演进为 TypeScript 模块化 + Socket.IO 实时同步，前后端共享 `shared/types` 类型定义。

---

## 架构设计

### 数据流

```
浏览器 (Vue 组件) → composables (useGameRoom/useSocket) → protocol 常量 → Socket.IO emit 事件
        ↓
   socketHandlers (传输会话、鉴权上下文、广播调度)
        ↓
   gameRoomService (牌局命令边界：发牌 / 进球 / 犯规 / 撤回 / 重开)
        ↓
   gameEngine (胜负判定 / 积分结算 / 击球顺序)  ·  gameState (快照撤回)  ·  pokerDeck (牌库 + 洗牌)
        ↓
   roomManager (房间注册表 + Socket 会话索引 + 按玩家身份序列化广播)
        ↓
   room_updated 事件 → 各客户端 room 状态 → Vue 响应式渲染
```

- **前端**：Vue 3 + TypeScript + Vite + Tailwind CSS，业务逻辑收敛到三个 composable（`usePlayerProfile` / `useSocket` / `useGameRoom`），组件只做展示与事件转发。
- **后端**：Node.js + Express + Socket.IO（TypeScript，`tsx` 运行），房间状态全部保存在内存 `rooms: Record<string, ServerRoom>`。
- **共享层与 SSOT**：以 `shared/schemas/` 下的 Draft-07 JSON Schema (`card.schema.json` / `room.schema.json` / `wear.schema.json`) 作为跨端 Wire Models 的单一事实来源 (Single Source of Truth)。通过 `scripts/codegen-models.mjs` 自动生成 TypeScript 契约 (`shared/types/generated/wire-models.ts`) 与 Kotlin 契约 (`android/shared-models/.../generated/WireModels.kt`)。`shared/types/game.ts` 重新导出生成的 Wire Models 并隔离服务端内部模型 (`ServerRoom` / `GameState`)。`shared/types/protocol.ts` 集中维护事件与路径常量，`shared/types/socket.ts` 定义 Socket payload。
- **关键约束**：
  - 房间状态以 `ServerRoom`（服务端内部态，含 `deck`/`accidentalBalls` 等敏感字段）与 `Room`（下发客户端的裁剪态）两种形态存在；`getClientRoomState` 按「是否本人 / 房间是否 finished」裁剪未进球手牌 `cards`（防止泄露其他玩家手牌），而 `pocketedCards`（已消除卡牌）公开下发给所有玩家（在全局赛况显示「已消xxxx」）。
  - 撤回采用快照栈：`ServerRoom.gameHistory` 存每步操作后的 `GameState` 快照（深拷贝，不含日志），每步操作 `recordGameStep` push、撤回 `undoGameStep` pop 回退到上一步；每局 `start_game` 清空并播种发牌完成基线，历史只剩基线时撤回无效果；`gameHistory` 不下发客户端。
  - 准备界面踢人：`kick_player` 仅允许同房间的已认证房主在 `waiting` / `lobby` 状态移出其他玩家；清理目标全部 Socket 会话并发送 `room_kicked`，Web 与 Wear 直连端清空房间凭证和界面。被踢玩家不能使用旧凭证重连，仍可手动重新加入。`leave_room` 仅允许会话本人退出，不能代他人退房。
  - 身份校验：每个玩家持有 `sessionToken`（`crypto.randomUUID`），`rejoin_room` 重连必须校验 token，防止会话劫持。
  - 随机性统一用 `node:crypto` CSPRNG（洗牌 `crypto.randomInt`、房间码 `crypto.randomInt`、token `crypto.randomUUID`），不使用 `Math.random`。

### 目录结构

├── apple/                   # iOS 原生工程 (Tauri v2 iOS 打包与 Xcode 配置)
├── android/                 # Android 多模块工程 (:app / :wear-app / :shared-models)
├── src-tauri/               # Tauri v2 配置文件与 Rust 核心桥接层
├── server/                  # 后端 (TypeScript)
│   ├── index.ts             # Express + Socket.IO 启动、静态托管、/api 路由
│   ├── config.ts            # config.yaml 与 ball_configs.json 加载
│   ├── logger.ts            # socket 连接/断开日志（时间戳 + 用户名）
│   ├── pokerDeck.ts         # 54 张牌库 + CSPRNG 洗牌
│   ├── gameEngine.ts        # 胜负判定 / 积分结算 / 击球顺序
│   ├── gameState.ts         # 游戏进行态快照 / 记录 / 撤回（gameHistory 快照栈）
│   ├── gameRoomService.ts   # 牌局命令边界（发牌/进球/犯规/撤回/重开）
│   ├── roomManager.ts       # 房间注册表、Socket 会话索引、状态裁剪、广播
│   ├── wecomWebhook.ts      # 每局结算推送到企业微信机器人
│   ├── robotConfig.ts       # 机器人 Webhook 链接运行时配置（内存）
│   └── socketHandlers.ts    # 15 个 Socket 事件处理器
├── scripts/                 # 构建与代码生成脚本
│   └── codegen-models.mjs   # JSON Schema 自动生成 TS 与 Kotlin 模型脚本
├── shared/                  # 多端共享 Schema 与类型
│   ├── schemas/             # JSON Schema 单一事实来源 (card/room/wear.schema.json)
│   └── types/               # 前后端共享类型
│       ├── generated/       # 自动生成的 Wire Models (wire-models.ts)
│       ├── game.ts          # 导出 Wire Models 并定义 ServerRoom/GameState 领域模型
│       ├── protocol.ts      # Socket 事件 / Wear action / DataLayer path 协议常量
│       └── socket.ts        # 事件 payload 与 Client/Server 事件接口
├── src/                     # 前端 (Vue 3 + TS + Vite + 移动端/iOS 适配)
│   ├── composables/         # usePlayerProfile / useSocket / useGameRoom
│   ├── components/          # RoomLobby/BilliardsTable/PokerCard/VictoryModal 等
│   ├── utils/dialog.ts      # 跨平台原生弹窗封装 (@tauri-apps/plugin-dialog)
│   ├── App.vue              # 页面组装与弹窗编排
│   └── styles/main.css      # iOS Safe Area 留白避让 & 物理实体球牌防反色保护
├── public/enter_robot.html  # 机器人 Webhook 链接设置页面（独立于 SPA）
├── e2e/poolpoker.spec.ts    # Playwright 端到端测试
├── ball_configs.json        # 球色主题配置（default / xingpai）
├── config.yaml              # 端口与房间默认设置
├── run.sh / webhook-deploy.sh  # 一键构建运行 / Webhook 自动部署
└── vite.config.ts / tsconfig.json / biome.json / commitlint.config.js
```

---

## 实现摘要

### 牌库与洗牌（`server/pokerDeck.ts`）

- `create54PokerDeck()` 生成标准 54 张牌库：52 张正牌（4 花色 × A\~K，`ballNumber` 1\~13）+ 小王（`suitType: joker-small`，球号 14，灰）+ 大王（`joker-big`，球号 15，金）。
- `shuffle()` Fisher-Yates 洗牌，随机源 `crypto.randomInt`（CSPRNG），返回新数组不改原数组。
- 每张 `Card` 含 `id`（`c_1`…）、`suit`（花色符号）、`suitType`、`color`（红/黑/金/灰）、`rank`、`ballNumber`。

### 游戏引擎（`server/gameEngine.ts`）

- `addLog`：追加对局日志（`zh-CN` 时间戳 + `crypto.randomBytes` id），保留最近 50 条。
- `getPocketedBallNumbers`：`accidentalBalls`（意外进球）、`breakBalls`（开球进球）与各玩家 `pocketedCards`（销牌）的球号并集，升序返回——全局「已打进球号」的唯一来源。
- `checkGameWinners`：仅 `status === 'playing'` 时判定，某玩家 `cards` 中未被已打进球号命中的「有效卡牌」数量为 0 即胜，支持多人同时胜利。
- `calculateHandScore`：结算输家剩余手牌积分——大小王基数 1、其余牌基数 2，同 rank 组合倍乘（n 张 = 基数之和 × n）。
- `handleGameFinished`：置 `finished`、胜者 `wins+1`、击球触发者优先排序、记录 `lastWinnerUserId`；随后做本局积分结算——每位输家 `totalScore` 扣剩余手牌分、赢家平分输家总分（余数归击球触发的胜者），结果写入 `room.lastRoundScores` 并打印结算日志；结算完成后调用 `sendRoundResultToWecom` 异步推送本局结果到企业微信机器人（不阻塞结算流程）。
- `computeTurnOrder`：计算下局击球顺序——无上一局顺序时随机洗牌；否则保留上一局在场玩家并补入新玩家 → 顺序反转 → 上一局胜者轮转到首位。

### 游戏进行态快照与撤回（`server/gameState.ts`）

- 将一局游戏的「进行态」收敛为 `GameState`（`shared/types/game.ts`）：`status` / `players[]`（`GamePlayerSnapshot`，仅含 `cards`/`pocketedCards`/`cardCount`/`activeCardCount`/`wins`/`isWinner`/`totalScore`）/ `deck` / `accidentalBalls` / `breakBalls` / `winners` / `turnOrder` / `lastTurnOrder` / `lastWinnerUserId` / `roundCount` / `lastRoundScores`；不含 `logs` 与身份/连接/设置类字段。
- `snapshotGameState` / `restoreGameState`：深拷贝打包 / 还原进行态；`recordGameStep` 把「操作后」状态 push 进 `ServerRoom.gameHistory`；`undoGameStep` pop 掉当前状态回退到上一步（历史只剩基线时无效果）。
- 撤回语义：`retract_ball` 不再按 `cardId` 精确撤牌，而是整体回退牌桌最近一步操作；日志属于审计记录不随快照回退，每次撤回额外追加一条日志。

### 牌局命令边界（`server/gameRoomService.ts`）

- `applyGameRoomCommand(room, command)` 是服务端牌局内操作的统一边界，负责把发牌、销牌、犯规罚抽、意外进球、开球进球、裁判代记、撤回、重开等命令应用到 `ServerRoom`。
- 该模块隐藏原先散落在 Socket 事件里的组合顺序：状态校验、玩家定位、牌堆耗尽补牌、日志文本、胜负判定、积分结算、`recordGameStep`/`undoGameStep` 调用时机。
- `socketHandlers.ts` 保留传输与会话职责：Socket callback、`socket.join/leave`、create/join/rejoin/leave/disconnect、以及根据命令结果调用 `broadcastRoomState`；Socket 到玩家身份的索引由 `roomManager` 的 session registry helper 维护。

### 协议常量与数据模型契约（JSON Schema SSOT / `shared/schemas/` / `scripts/codegen-models.mjs`）

- **SSOT 单一事实来源**：在 `shared/schemas/` 集中定义了 `card.schema.json`、`room.schema.json` 与 `wear.schema.json` 三组 Draft-07 JSON Schema，作为前端 Web、后端 Server、Android App 与 Wear OS 手表全平台 Wire Models 的唯一规范来源。
- **自动代码生成 (Codegen)**：`scripts/codegen-models.mjs` 使用 `quicktype-core` 将 JSON Schema 自动编译为：
  - **TypeScript Wire Models** (`shared/types/generated/wire-models.ts`)：在 `shared/types/game.ts` 中重新导出，同时严格保持 `ServerRoom` / `GameState` 为服务端内部隔离模型。
  - **Kotlin Wire Models** (`android/shared-models/.../generated/WireModels.kt`)：采用 `kotlinx.serialization` 注解，在 `Models.kt` 中通过 `typealias` 桥接现有代码，实现无缝向后兼容。
  - 提供了 `pnpm run codegen:models`（重新生成）与 `pnpm run codegen:check`（CI/Pre-commit 漂移检查）脚本。
- **协议常量面**：`shared/types/protocol.ts` 集中维护 Socket.IO 事件名（`CLIENT_TO_SERVER_EVENTS` / `SERVER_TO_CLIENT_EVENTS`）、Wear action 序列化值（`WEAR_ACTIONS`）与 Wear OS DataLayer path（`DATA_LAYER_PATHS`）。
- `shared/types/socket.ts` 使用这些常量作为 `ClientToServerEvents` / `ServerToClientEvents` 的 computed keys，确保 TS 类型契约与运行时 `emit/on` 使用同一份事件名。
- Android/Wear 端在 `:shared-models` 中维护对应的 `SocketEvents` / `WearAction` / `DataLayerConstants` mirror，`WearDirectSocketManager` 与蓝牙凭证桥接统一引用该常量面。
- `server/__tests__/protocolContract.spec.ts` 作为轻量漂移检测：校验协议值稳定且唯一，确认 Kotlin mirror 覆盖 TS 协议层，并验证生成的 Wire Models 与 JSON Schema 保持同步。

### 企业微信结算推送（`server/wecomWebhook.ts` / `server/robotConfig.ts`）

- `wecomWebhook.ts`：`sendRoundResultToWecom(room)` 每局结算后把「房间号 + 各成员本局得分变化 + 累计积分」拼成文本，POST 到企业微信机器人 Webhook（`msgtype: text` + 固定提及成员列表）；未配置 Webhook 链接时直接返回不发送；HTTP 非 2xx / `errcode !== 0` / 异常时打印 `⚠️ [WeCom]` 警告日志，不抛出。
- `robotConfig.ts`：机器人 Webhook 链接运行时配置——内存变量 `robotWebhookUrl`，`getRobotWebhookUrl` / `setRobotWebhookUrl`（`trim` 后保存），服务重启即清空。

### 房间管理（`server/roomManager.ts`）

- `rooms` 内存房间表由 registry helper 统一读写；内部 `socketIndex` 作为 `socketId → { roomCode, userId }` 反向索引，外部通过 `registerSocketSession` / `getSocketSession` / `removeSocketSession` / `hasOtherSocketForUser` 维护多 Socket 身份。
- `generateRoomCode`：`crypto.randomInt(1000, 10000)` 生成 4 位数字房号，冲突时重试。
- `getClientRoomState`：把 `ServerRoom` 裁剪为下发客户端的 `Room`——未进球手牌 `cards` 仅当「目标用户本人」或「房间 finished」时下发，否则置空，从源头防止泄露其他玩家未进球手牌；而已消除的 `pocketedCards` 则向所有玩家下发；`logs` 只取最近 15 条。
- `broadcastRoomState`：遍历房间内 socket，按每个玩家的身份分别序列化下发，保证各客户端只见各自可见的数据。

### Socket 事件（`server/socketHandlers.ts`）

共 15 个事件处理器。create/join/rejoin/leave/disconnect 保持 Socket 会话生命周期职责；牌局内命令委托给 `gameRoomService` 后按结果 `broadcastRoomState`：

- `create_room` / `join_room` / `rejoin_room`：建房/加入/断线重连。均生成或校验 `sessionToken`（`crypto.randomUUID`）；`join_room` 按 `userId` 判重复，重复则复用玩家并刷新 `sessionToken`/`id`/`online`，新玩家若房间已在 `playing` 则从 `deck` 补发牌；`rejoin_room` 严格校验 `player.sessionToken === sessionToken`，不通过拒绝并返回「身份凭证失效」。
- `update_settings` / `start_game`：房主专属（通过 session registry 反查 `userId === hostUserId`）。`start_game` 洗牌发牌、清空 `accidentalBalls`/`breakBalls`/`winners`/`lastRoundScores`、`roundCount+1`、按 `computeTurnOrder` 计算击球顺序；随后清空 `gameHistory` 并 `recordGameStep` 播种发牌完成基线。
- `pocket_ball`（销牌）/ `draw_penalty`（犯规罚抽）/ `accidental_pocket`（意外进球）/ `retract_ball`（撤回上一步）：本人手牌操作；罚抽时牌堆耗尽自动洗新牌堆补牌；前三个操作完成后 `recordGameStep` 记快照，`retract_ball` 调用 `undoGameStep` 回退上一步。
- `break_pocket`（开球进球）：记录开球时入袋的球号到 `breakBalls`（不归入任何玩家手牌），已进则跳过，随后判定胜负并 `recordGameStep`。
- `referee_pocket_ball` / `referee_draw_penalty`：裁判代记，按 `targetUserId` 定位目标玩家消卡/罚抽；进球找不到对应球号时回退为「全场已进球」记录（`accidentalBalls`）；完成后 `recordGameStep`。
- `request_restart` / `confirm_restart` / `restart_game`：重开流程，`handleRestartRoom` 重置牌堆/球号/胜负、玩家清空手牌回 `waiting`，并清空 `gameHistory`。
- `leave_room`：移出玩家，房主离开自动转让给首位玩家；空房删除。
- `disconnect`：`logSocketDisconnect` + 标记 `online=false` 并广播。

### 服务启动与配置（`server/index.ts` / `server/config.ts` / `server/logger.ts`）

- `config.ts`：读取 `config.yaml`（端口），缺失/异常回退默认 3000；加载 `ball_configs.json`（缺 `default` 或非法直接 `process.exit(1)`），导出 `isValidBallConfigKey` 校验。
- `index.ts`：Express 提供 `/api/ball-configs`（球色配置）、`/api/rooms/:code`（HTTP 快照查询房间状态，供移动端快速同步）、`/api/robot-url`（GET/POST 读取/设置机器人 Webhook 链接）、`/enter_robot`（机器人链接设置页面，独立于 SPA 的静态路由）等接口；托管 `dist` 静态资源并 SPA 回退；Socket.IO 配置 `pingTimeout 10000` / `pingInterval 5000`。
- `logger.ts`：`formatTimestamp` 统一时间戳格式；`getSocketUsername` 从 `socket.data` → `handshake.auth/query` → 房间成员逐级取用户名；`logSocketConnect`/`logSocketDisconnect` 打印带时间戳、用户、断开原因的日志。

### 前端 Composables（`src/composables/`）

- `usePlayerProfile`：玩家身份持久化——`userId`（首次生成 `u_随机串`）、`playerName`、`selectedAvatar`（6 个头像）、`selectedBallConfigKey` 均存 `localStorage`；`getFinalPlayerName` 空名回退「球友+随机三位数」。
- `useSocket`：Socket.IO 客户端初始化，`auth` 携带已存 name/userId，调优重连参数 `reconnectionAttempts: Infinity` / `reconnectionDelay: 300` / `reconnectionDelayMax: 1000` / `timeout: 5000`；封装 `on`/`off`/`emit`。
- `useGameRoom`：核心业务状态与操作——`room` 状态、`isHost`/`myInfo`/`turnOrderPlayers` 计算属性、`sortedMyCards`（本人手牌按球号升序排序的计算属性）、球色配置加载与 CSS 变量生成（`--ball-N-hi/mid/lo`）、`isCardDimmed`（球号已打进则置灰免打）；挂载时 `fetchLatestRoomState`（HTTP 快照）+ `visibilitychange` 切前台时快照同步 + Socket 重连；`setupSocketListeners` 监听 `connect`（自动 `rejoin_room`）、`room_updated`（更新 `room` 并胜利时放彩带）、`room_created`、`error_message`；对外暴露建房/加入/调发牌数/开局/销牌/撤回上一步（`handleRetract`，`window.confirm` 确认后发 `retract_ball`）/记录进球/记录犯规/重开/离开等全部 `handle*` 方法。

### 前端组件结构

- **公共组件（`src/components/`）**：
  - `RoomLobby`：登录（昵称/球色）+ 创建/加入选项卡（4 位房间码数字输入）+ 等待大厅（成员列表/房主发牌数调节/开始发牌/新版 UI 切换开关）。
  - `GameHeader`：顶部状态栏（在等待大厅中通用，以及 v1 对局中使用）。
  - `VictoryModal`：结算弹窗——胜利者信息、图例、每位玩家三类手牌明细（已消除/免打卡/未消除，未消除牌按同 rank 倍乘标注 `-N分` 罚分）、本局积分变化（`+/-N分`）与累计总积分、房主「再来一局」。
  - `RefereePocketModal` / `RefereeFoulModal`：记录进球/犯规弹窗，默认选中当前玩家自己，进球额外选择未打进球号，并可切换「开球进球」记录不归属任何玩家的入袋球。
  - `RestartModal`：重开确认弹窗。
- **v1 经典版组件（`src/components/v1/`）**：
  - `GameView`：v1 对局主视图，装配手牌区、球盘与实况日志。
  - `BilliardsTable`：全局赛况——本局击球顺序、已打出球号列表（mini-ball 彩色球 + 条纹）、玩家赛况列表（胜场/剩余张数/暂离态/进度条/记录进球与犯规快捷按钮）。
  - `PokerCard`：2D 手牌卡牌（牌面 rank/suit + 台球球号），已打进球号覆盖「已进球·无需打出」遮罩。
  - `GameLogs`：对局实况日志面板。
- **v2 沉浸式组件（`src/components/v2/`）**：
  - `GameView`：v2 3D 对局主视图，装配极简 HUD、对手席、3D 球台与扇形手牌。
  - `ThreeBilliardsArena`：Three.js 3D 渲染球台、高光球号与入袋动画。
  - `HandDeckFan` / `PokerCardProp`：3D 拟真弧形扇面手牌与卡牌组件。
  - `GameMinimalHud`：极简顶栏（局数、比分概览、抽屉菜单入口）。
  - `TableOpponentSeats` / `RecordingPlayerDropdown`：环绕对手座位席与代记目标下拉框。
  - `GameControlDrawer`：侧边/底栏抽屉，收纳规则说明、对局实况日志与房间控制。
- `App.vue`：组装公共组件与根据 `useNewUi` 切换加载 `GameViewV1` / `GameViewV2`；手牌区含「规则」按钮弹出积分规则说明弹窗。

### 配置文件与主题（`ball_configs.json` / `config.yaml`）

- `ball_configs.json`：球色主题（`xingpai`），含 0~15 号球的三段渐变配色（`[hi, mid, lo]`）；星牌 4/12 号粉色、5 号红色真实配色。
- `config.yaml`：`app_name`、`port`、`room.default_cards_per_player`（默认 5）、`room.max_players`（8）、`room.disconnect_timeout_ms`（默认 1 小时）。

### 工程化与测试

- 构建链：Vite + `vue-tsc` 类型检查；`@/` 指向 `src`、`@shared/` 指向 `shared` 的路径别名；Biome 做 lint/format，Husky `pre-commit` + lint-staged、`commit-msg` + commitlint（conventional commits）；`tsx` 运行后端。
- `e2e/poolpoker.spec.ts`：Playwright 端到端测试，覆盖玩家资料持久化、多人房间同步、销牌/置灰/意外进球/撤回/罚牌/重开、累计胜负、多人同时胜利与下局首击顺序、裁判代记等全流程。

---

## 涉及文件清单

| 文件路径 |
|----------|
| `server/index.ts`（Express + Socket.IO 启动、`/api/ball-configs`、`/api/rooms/:code` 快照接口、静态托管） |
| `server/config.ts`（config.yaml / ball_configs.json 加载、`isValidBallConfigKey`） |
| `server/logger.ts`（socket 连接/断开日志，时间戳 + 用户名） |
| `server/pokerDeck.ts`（54 张牌库、CSPRNG 洗牌） |
| `server/gameEngine.ts`（胜负判定、积分结算、击球顺序） |
| `server/gameState.ts`（游戏进行态快照、记录、撤回 gameHistory 栈） |
| `server/gameRoomService.ts`（牌局命令边界，收敛发牌/进球/犯规/撤回/重开组合规则） |
| `server/wecomWebhook.ts`（每局结算推送企业微信机器人） |
| `server/robotConfig.ts`（机器人 Webhook 链接运行时配置） |
| `server/roomManager.ts`（房间注册表、Socket 会话索引、房间码生成、状态裁剪防泄露、广播） |
| `server/socketHandlers.ts`（15 个 Socket 事件处理器、sessionToken 校验） |
| `shared/types/game.ts`（Card/Player/Room/ServerRoom/GameState/GamePlayerSnapshot/RoundScoreEntry/BallConfig 等） |
| `shared/types/protocol.ts`（Socket 事件、Wear action、DataLayer path 协议常量） |
| `shared/types/socket.ts`（事件 payload 与 Client/Server 事件接口） |
| `src/composables/usePlayerProfile.ts` / `useSocket.ts` / `useGameRoom.ts` / `useUiPreferences.ts` |
| `src/App.vue`（页面组装、v1/v2 路由分发、积分规则弹窗） |
| `src/components/`（公共组件：`RoomLobby.vue` / `GameHeader.vue` / `VictoryModal.vue` / `RefereePocketModal.vue` / `RefereeFoulModal.vue` / `RestartModal.vue`） |
| `src/components/v1/`（v1 经典版组件：`GameView.vue` / `BilliardsTable.vue` / `PokerCard.vue` / `GameLogs.vue`） |
| `src/components/v2/`（v2 沉浸式组件：`GameView.vue` / `ThreeBilliardsArena.vue` / `HandDeckFan.vue` / `PokerCardProp.vue` / `GameMinimalHud.vue` / `TableOpponentSeats.vue` / `RecordingPlayerDropdown.vue` / `GameControlDrawer.vue`） |
| `public/enter_robot.html`（机器人 Webhook 链接设置页面） |
| `src/styles/main.css`（玻璃拟态、mini-ball 球色、条纹样式） |
| `e2e/poolpoker.spec.ts`（Playwright 端到端测试） |
| `ball_configs.json`（default / xingpai 球色主题） |
| `config.yaml`（端口、房间默认设置） |
| `run.sh`（一键构建运行）/ `webhook-deploy.sh`（Webhook 自动部署） |
| `vite.config.ts` / `tsconfig.json` / `tailwind.config.js` / `postcss.config.mjs` / `biome.json` / `commitlint.config.js` / `.husky/` |

---

## 专题文档索引

| 文档 | 内容 |
|------|------|
| [android_tauri_architecture.md](android_tauri_architecture.md) | Android 移动端 & Tauri 架构设计（Tauri v2 打包 APK、顶层 Gradle 多模块、Wear OS DataLayer 状态同步、R8 混淆规则） |
| [wear_app_architecture.md](wear_app_architecture.md) | Wear OS 手表端架构（Jetpack Compose for Wear OS 模块划分、单 Activity 架构、Swipe-To-Dismiss 侧滑手势导航规范） |
| [implement_log.md](implement_log.md) | 实现步骤日志（按轮次记录需求、探索与决策、最终改动、commit） |


### Wear OS 直连恢复（2026-09-07）

`WearDirectSocketManager` 使用入房 ACK 保存会话凭证，网络重连执行 `rejoin_room`，进程重启由 `WearMainActivity` 恢复最近成功会话。连接状态区分传输建立与入房成功，拒绝入房显示服务器原因；断线操作提示重试。手机原生凭证桥同步 token，详细生命周期见 `docs/wear_app_architecture.md` 第 4 节。

### v2 沉浸式对局原型（2026-09-07）

- 对局主屏由 `GameMinimalHud`、`TableOpponentSeats`、`ThreeBilliardsArena`、`HandDeckFan` / `PokerCardProp` 组成；规则、完整记录和重开/退出收进 `GameControlDrawer`。房间大厅和结算仍复用既有组件。
- “记球对象”是当前设备的代记目标，默认本人。点头像、下拉框或“下一位”切换；它不代表服务器强制执行的击球回合。开球模式逐个登记多球，不消去任何玩家手牌；直接点具体手牌始终为本人销牌。
- 桌面点球由服务端选择目标玩家第一张匹配牌；同号其他牌保留为免打牌。重复登记已经入袋的球不再消第二张牌。`cardCount` 表示实体手牌数，`activeCardCount` 表示未被全局已进球号覆盖的待打牌数。
- JSON Schema 中的可选 `Room.revision` / `Room.sceneEvent` 提供单调递增的版本和 UUID 事件标识。事件只含类型、目标玩家与公开进球号，罚抽事件不携带新牌。类型由 `codegen-models.mjs` 同步生成 TS/Kotlin。旧客户端可以忽略新增字段。
- 记球、开球、代记罚抽和撤回支持可选 Socket 回调；前端先显示待确认，收到服务器的新事件才演出。撤回带 `expectedRevision`，若期间有新操作则拒绝过期撤回。结算后的撤回入口禁用，既有结算/积分规则不变。
- `shouldAnimateRoomChange` 判断事件连续性；首次快照、HTTP 对齐、重连、后台更新和旧版本不重播。手牌临时保留上一状态以播放抬牌、出牌和免打转化，随后对齐权威状态；新事件到达会终止旧手牌演出，优先对齐新状态，不积压长动画队列。
- Three.js 球桌加载 Blender GLB（`public/models/billiards_table.glb`），包含圆角台框、皮革袋口和几何网袋；支持 HTML `link preload`、内存缓存与大厅闲时前置预加载，加载期间呈现台球流光 Loading 动效，模型或上下文异常时提供重试交互。模型中的六个 `PocketTarget_*` 标记驱动进球动画目标。使用顶棚环境反射、主光阴影和透明接影地面（透出页面绿色渐变）。固定球阵表达球号状态，不映射现实球位。投影后的 DOM 球号按钮保持可读和键盘可用；较矮设备允许页面纵向滚动。模型与导出说明见 `docs/table_asset_pipeline.md`。
- 球号白底随球体投影尺寸缩放，保留球色与条纹；画布填满球桌容器，宽屏使用横向构图。击球顺序以小字放在主屏记球对象下方。
- 渲染仅在初始化、尺寸变化和动画期间进行；后台停帧，卸载释放资源。WebGL 不可用/上下文丢失时降级为可点击平面球桌。音效和触觉反馈分别存储开关，默认关闭；尊重系统减少动态效果设置。
- 当前为 Three.js WebGL 原型，尚未接入 WebGPU 专用材质，也未完成 iOS/Android 真机性能与触觉验证。既有 `e2e/poolpoker.spec.ts` 仍使用 v1 选择器，不作为本轮 v2 浏览器验收依据。

- 袋口几何（2026-09-08）：桌布与木质底座使用同心的六个开孔，袋内壁和底面下沉；六段倒角库边在袋口处斜向收口，细金属袋沿贴近桌面。球体静止高度与袋口动画高度保持一致。
