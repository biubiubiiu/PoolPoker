# implement_log — PoolPoker 球霸扑克

> 实现步骤日志：每段一轮，记录 Agent 交互细节流程与最终改动。统一追加到文末，编号递增。

### 第1轮：项目初始化 — 台球抽牌卡牌对战原型 [2026-08-18]
- **输入**：搭建「朋友线下打台球聚会」的对战 Web 应用原型：基于 54 张扑克发牌、牌面映射台球球号，支持房间、发牌、销牌、胜负判定。
- **探索与决策**：采用 Node.js + Socket.IO 单文件 `server.js` + 原生 HTML/CSS/JS（`public/`）快速起步；牌面→球号映射定为 A\~K → 1\~13、小王 → 14、大王 → 15，固定含 8 号黑八。房间用 4 位数字码降低门槛。
- **最终改动**：
  - `server.js` — 新增：Socket.IO 服务，房间创建/加入、发牌、销牌、胜负判定逻辑。
  - `public/index.html` / `public/css/style.css` / `public/js/app.js` — 新增：游戏页面、样式、前端交互逻辑。
  - `config.yaml` / `deploy.sh` / `README.md` / `.gitignore` / `package.json` — 新增：配置、部署脚本、说明文档。
- **commit**：`485c4ab` / `04678ea`

### 第2轮：对局核心机制完善 — 全局赛况、置灰免打、自动/多人胜利 [2026-08-18]
- **输入**：完善对局体验——全局赛况显示球号、手牌自动置灰免打、自动与多人联合胜利判定；修正置灰球泄露其他玩家手牌信息的问题。
- **探索与决策**：胜利判定统一以「已打进球号集合」为准（`pocketedBallNumbers`），玩家手牌中未被打进的卡牌数归零即胜；已打进球号对应的手牌在 UI 置灰显示「已进球·无需打出」，既提示免打又不暴露他人手牌。
- **最终改动**：
  - `server.js` — 修改：完善胜利判定（自动/多人联合）、球号集合维护。
  - `public/index.html` / `public/js/app.js` / `public/css/style.css` — 修改：全局赛况球号显示、手牌置灰免打、胜利结算展示。
- **commit**：`e13488c` / `031b2f3`

### 第3轮：断线重连与暂离保护 [2026-08-18]
- **输入**：支持基于 `userId` 的断线重连，掉线玩家 30 秒内保留房间位置（后续放宽至 1 小时）；暂离玩家在 UI 标记「暂离」。
- **探索与决策**：玩家标识从 socket id 升级为持久化 `userId`（`localStorage` 生成 `u_随机串`），重连时按 `userId` 找回玩家；`config.yaml` 增加 `disconnect_timeout_ms`（默认 1 小时）。
- **最终改动**：
  - `server.js` — 修改：断线重连按 userId 定位、暂离保护、掉线标记。
  - `public/index.html` / `public/js/app.js` — 修改：userId 持久化、暂离态 UI。
  - `config.yaml` — 修改：新增 `disconnect_timeout_ms`。
- **commit**：`f02a571` / `4914229`

### 第4轮：击球顺序与 Continue 切牌提醒 [2026-08-18]
- **输入**：新增击球顺序显示与反向轮转逻辑，以及 Continue 提醒切牌功能；后续简化为仅在全局赛况展示击球顺序。
- **探索与决策**：击球顺序下局反向轮转（上一局顺序反转），上一局胜者轮转到首位优先击球；击球提醒收敛到全局赛况展示，去除多余提醒入口。
- **最终改动**：
  - `server.js` — 修改：击球顺序轮转计算（反转 + 胜者优先）。
  - `public/index.html` / `public/js/app.js` — 修改：击球顺序展示、Continue 提醒切牌；后续简化移除多余击球提醒。
- **commit**：`38d6446` / `e86e97b`

### 第5轮：意外进球与犯规罚抽 [2026-08-18]
- **输入**：新增「意外进球」选项——进球后可选择自己持有的球，去掉意外进球的自动罚牌，支持犯规罚抽牌并更新玩家手牌。
- **探索与决策**：意外进球记录到独立的 `accidentalBalls` 集合（不自动罚牌），与玩家销牌 `pocketedCards` 合并构成全局「已打进球号」；犯规则从牌堆 `pop` 一张罚给玩家。
- **最终改动**：
  - `server.js` — 修改：意外进球（`accidental_pocket`）去除自动罚牌、犯规罚抽逻辑。
  - `public/index.html` / `public/js/app.js` — 修改：意外进球选项、犯规交互与手牌更新。
- **commit**：`1d662ba` / `760469c` / `6121685`

### 第6轮：撤回进球与结算手牌明细 [2026-08-19]
- **输入**：添加撤回进球功能（底部提示文字优化）；结算弹窗展示所有玩家手牌明细。
- **探索与决策**：撤回进球把 `pocketedCards` 中的牌移回 `cards`；结算弹窗按「已消除 / 免打卡 / 未消除」三类展示每位玩家手牌。
- **最终改动**：
  - `server.js` — 修改：`retract_ball` 撤回逻辑。
  - `src/App.vue`（原 `public/js/app.js`）— 修改：撤回入口与底部提示。
  - `RetractBallModal.vue`（原结算相关）— 新增：撤回进球弹窗。
  - `VictoryModal.vue` — 修改：展示所有玩家手牌明细。
- **commit**：`0a41f1b` / `083f409`

### 第7轮：球色主题与星牌配色 [2026-08-19]
- **输入**：新增可配置球色主题（API + UI 选择），添加星牌（xingpai）品牌配色；后续调整星牌 4/12 号为粉色、5 号为红色，以及 5 号球默认配色微调。
- **探索与决策**：球色抽到 `ball_configs.json` 独立配置，服务端 `/api/ball-configs` 下发，前端下拉选择并生成 `--ball-N-hi/mid/lo` CSS 变量；球号 9\~15 用条纹样式区分。
- **最终改动**：
  - `ball_configs.json` — 新增：`default` / `xingpai` 两套 0\~15 号三段渐变配色。
  - `server.js` / `server/config.ts` — 修改：球色配置加载与 `/api/ball-configs` 接口。
  - `src/App.vue` / `src/components/RoomLobby.vue` / `src/styles/main.css` — 修改：球色选择 UI、CSS 变量、mini-ball 条纹样式。
- **commit**：`48d167e` / `a51eec6` / `65a8e92` / `f995e93` / `fc0aa19`

### 第8轮：前端工程化重构 — Vue3 + TS + Vite + Tailwind [2026-08-19]
- **输入**：升级前端工程架构至 Vue 3 + TypeScript + Vite，配置 PostCSS/Autoprefixer/Tailwind CSS；移除防窥遮盖功能；支持保存用户名下次自动填充；修复大厅输入框 placeholder 变形截断问题。
- **探索与决策**：原生 HTML/JS 拆分为 Vue 3 单文件组件（`src/components/`）+ `<script setup lang="ts">`；Tailwind 负责布局与玻璃拟态样式；`deploy.sh` 重命名为 `run.sh`。
- **最终改动**：
  - `src/App.vue` / `src/main.ts` / `src/components/*.vue` — 新增：Vue 组件化迁移。
  - `index.html` / `vite.config.ts` / `tsconfig.json` / `tsconfig.node.json` / `tailwind.config.js` / `postcss.config.mjs` — 新增：Vite/TS/Tailwind 工程配置。
  - `public/` 目录 — 删除：原生前端产物迁入 `src/`。
  - `src/styles/main.css` — 修改：移除防窥遮盖样式。
  - `src/composables/usePlayerProfile.ts`（后续拆分）— 修改：用户名 `localStorage` 持久化。
- **commit**：`89e2989` / `4cc4297` / `98a9b6e` / `a7b29bd` / `88e2c4f`

### 第9轮：业务逻辑抽离到 composables [2026-08-20]
- **输入**：把应用逻辑从组件解耦到 composables（`useGameRoom` / `usePlayerProfile` / `useSocket`）；优化服务端断线查找（socketId 反向索引 Map）。
- **探索与决策**：`App.vue` 中的 Socket 与房间逻辑抽到 `useGameRoom`；玩家资料持久化抽到 `usePlayerProfile`；Socket 连接管理抽到 `useSocket`。服务端用 `socketIndex: Map<socketId, {roomCode,userId}>` 取代遍历查找，O(1) 定位。
- **最终改动**：
  - `src/composables/useGameRoom.ts` / `usePlayerProfile.ts` / `useSocket.ts` — 新增：业务逻辑 composables。
  - `src/App.vue` — 修改：改为组装与调用 composables。
  - `server.js` — 修改：新增 `socketIndex` 反向索引。
- **commit**：`d2d844d` / `f198b95`

### 第10轮：Playwright E2E 测试与累计胜负 [2026-08-20]
- **输入**：初始化 Playwright 端到端测试；将计分替换为持久化胜场数（`wins`）并在游戏 UI 展示累计胜负。
- **探索与决策**：新增 `test:e2e` 脚本与 `playwright.config.ts`；玩家模型加 `wins` 字段，胜利时递增，大厅/赛况/结算弹窗展示「N 胜」。
- **最终改动**：
  - `e2e/poolpoker.spec.ts` / `playwright.config.ts` — 新增：端到端测试与配置。
  - `server.js` — 修改：胜利 `wins+1` 替代原计分。
  - `src/components/BilliardsTable.vue` / `RoomLobby.vue` / `VictoryModal.vue` — 修改：展示胜场数。
  - `src/types/game.ts` — 修改：Player 新增 `wins`。
  - `package.json` / `.gitignore` — 修改：`test:e2e` 脚本、测试产物忽略。
- **commit**：`84b33f4` / `34dd448`

### 第11轮：多人同时胜利与下局首击优先级 [2026-08-20]
- **输入**：支持多人同时胜利结算，击球触发的胜者优先展示；下一局首击顺序优先级（上局胜者轮转到首位）。
- **探索与决策**：`checkGameWinners` 返回所有有效手牌清空的玩家；`handleGameFinished` 把击球触发的胜者 `unshift` 到首位；`computeTurnOrder` 反转上局顺序后把胜者移到首位。
- **最终改动**：
  - `server.js` — 修改：多人胜利判定与结算、击球顺序胜者优先。
  - `src/components/VictoryModal.vue` — 修改：多人胜利展示（`共同清空有效手牌`）。
  - `e2e/poolpoker.spec.ts` — 修改：新增多人同时胜利测试。
- **commit**：`547b159`

### 第12轮：裁判代记模式 — 代理进球与罚抽 [2026-08-20]
- **输入**：新增代理记录模式，可为指定玩家记录进球/犯规（裁判代记）。
- **探索与决策**：新增 `referee_pocket_ball` / `referee_draw_penalty` 两个事件，按 `targetUserId` 定位目标玩家；进球找不到球号时回退为「全场已进球」记录；前端 `RefereePocketModal` / `RefereeFoulModal` 供选择目标玩家。
- **最终改动**：
  - `server.js` — 新增：`referee_pocket_ball` / `referee_draw_penalty` 事件。
  - `src/components/RefereePocketModal.vue` / `RefereeFoulModal.vue` — 新增：裁判代记弹窗。
  - `src/App.vue` / `src/components/BilliardsTable.vue` / `src/composables/useGameRoom.ts` — 修改：代记入口与处理。
  - `e2e/poolpoker.spec.ts` — 修改：裁判代记测试。
- **commit**：`e0b7da6`

### 第13轮：工程化优化 — 路径别名 / Biome / Husky / commitlint [2026-08-20]
- **输入**：工程 DX 优化——`@/` 路径别名、Biome linter、Husky pre-commit 钩子、commitlint commit-msg 钩子。
- **探索与决策**：`@/` → `src`、`@shared/` → `shared`（后续）；Biome 统一 lint/format；lint-staged 在提交时自动修复。
- **最终改动**：
  - `vite.config.ts` / `tsconfig.json` / `tailwind.config.js` — 修改：路径别名与配置。
  - `biome.json` / `.husky/pre-commit` / `commitlint.config.js` / `.husky/commit-msg` — 新增：lint/format 与 git 钩子。
  - `package.json` — 修改：lint/format/commitlint 脚本与依赖。
  - 大量 `src/**` — 修改：导入路径改用 `@/`、格式统一。
- **commit**：`4e25576` / `0d735c7`

### 第14轮：服务端 TypeScript 模块化与共享类型 [2026-08-21]
- **输入**：服务端模块化为 TypeScript，抽取 `shared/types`，清理代理文件。
- **探索与决策**：单文件 `server.js` 拆为 `index.ts` / `config.ts` / `logger.ts` / `pokerDeck.ts` / `gameEngine.ts` / `roomManager.ts` / `socketHandlers.ts`；前后端共享 `shared/types/game.ts` / `socket.ts`，删除旧的 `src/types` 与 `server.js`。
- **最终改动**：
  - `server/*.ts` — 新增：服务端模块化拆分。
  - `shared/types/game.ts` / `socket.ts` — 新增：共享类型（`src/types` 迁入并删除）。
  - `server.js` — 删除：单文件服务端。
  - `run.sh` / `package.json` / `tsconfig.json` / `vite.config.ts` — 修改：`tsx` 启动、`@shared` 别名、脚本调整。
- **commit**：`70d2483`

### 第15轮：移动端重连优化 — HTTP 快照与 Socket 参数调优 [2026-08-21]
- **输入**：优化移动端断线重连——HTTP 快速同步房间状态 + 调优 Socket.IO 参数；新增 `/api/rooms/:code` 快照接口。
- **探索与决策**：页面切回前台时先 `fetchLatestRoomState` 拉 `/api/rooms/:code` 快照立即恢复 UI，再触发 Socket 重连；Socket 客户端与 `pingTimeout/pingInterval` 参数调优以适配移动网络。
- **最终改动**：
  - `server/index.ts` — 新增：`/api/rooms/:code` HTTP 快照接口。
  - `server/roomManager.ts` — 修改：`getClientRoomState` 支持按 userId 查询（复用裁剪逻辑）。
  - `src/composables/useGameRoom.ts` — 新增：`fetchLatestRoomState` + `visibilitychange` 切前台同步。
  - `src/composables/useSocket.ts` — 修改：重连参数调优。
- **commit**：`d7d4e1b`

### 第16轮：进球/犯规记录合并与默认选中自己 [2026-08-21]
- **输入**：合并进球与犯规记录入口，默认选中当前玩家自己。
- **探索与决策**：删除独立的 `AccidentalPocketModal`，进球/犯规记录统一走 `RefereePocketModal` / `RefereeFoulModal`，打开时 `defaultUserId` 默认当前用户；服务端 `referee_pocket_ball` 自记时日志与本人销牌一致。
- **最终改动**：
  - `src/components/AccidentalPocketModal.vue` — 删除：意外进球独立弹窗（并入裁判代记）。
  - `server/socketHandlers.ts` — 修改：自记/代记日志区分。
  - `src/App.vue` / `src/components/RefereeFoulModal.vue` / `RefereePocketModal.vue` / `BilliardsTable.vue` / `src/composables/useGameRoom.ts` — 修改：记录入口合并、默认选中自己。
  - `e2e/poolpoker.spec.ts` — 修改：适配记录入口变更。
- **commit**：`33a20a9`

### 第17轮：Socket 日志优化 [2026-08-21]
- **输入**：优化 Socket 日志——带时间戳、关联用户名、断开原因。
- **探索与决策**：新增 `logger.ts` 抽离 `formatTimestamp` / `getSocketUsername` / `logSocketConnect` / `logSocketDisconnect`；用户名从 `socket.data` → `handshake.auth/query` → 房间成员逐级取。
- **最终改动**：
  - `server/logger.ts` — 新增：Socket 日志模块。
  - `server/index.ts` / `server/socketHandlers.ts` — 修改：接入日志。
  - `shared/types/socket.ts` / `src/composables/useSocket.ts` — 修改：连接携带 `auth.name/userId`。
- **commit**：`9c56339`

### 第18轮：会话安全 — sessionToken 防劫持 [2026-08-21]
- **输入**：引入 `sessionToken` 防止会话劫持，重连时校验身份。
- **探索与决策**：玩家创建/加入时生成 `sessionToken`（`crypto.randomUUID`），前端存 `localStorage`；`rejoin_room` 校验 `player.sessionToken === sessionToken`，不匹配拒绝。`shared/types/game.ts` 的 Player 增 `sessionToken`，`socket.ts` 增 `RejoinRoomPayload`。
- **最终改动**：
  - `server/socketHandlers.ts` — 修改：`sessionToken` 生成与 `rejoin_room` 校验。
  - `shared/types/game.ts` / `shared/types/socket.ts` — 修改：新增 `sessionToken` 字段与重连 payload。
  - `src/composables/useGameRoom.ts` — 修改：持久化并回传 `sessionToken`。
- **commit**：`c1f7219`

### 第19轮：随机数安全 — CSPRNG 替换 Math.random [2026-08-21]
- **输入**：洗牌与房间码改用 `node:crypto` CSPRNG，替换 `Math.random`。
- **探索与决策**：洗牌用 `crypto.randomInt(0, i+1)`、房间码用 `crypto.randomInt(1000, 10000)`；`pokerDeck.ts` / `gameEngine.ts` / `roomManager.ts` 引入 `node:crypto`。
- **最终改动**：
  - `server/pokerDeck.ts` — 修改：`shuffle` 用 `crypto.randomInt`。
  - `server/roomManager.ts` — 修改：`generateRoomCode` 用 `crypto.randomInt`。
  - `server/gameEngine.ts` — 修改：`addLog` id 用 `crypto.randomBytes`。
  - `playwright.config.ts` — 修改：测试配置微调。
- **commit**：`9d83e87`

### 第20轮：局末积分结算与规则弹窗 [2026-08-21]
- **输入**：新增局末积分结算——输家按剩余手牌扣分、赢家平分，结算弹窗展示每张未消除牌的罚分，并提供「积分计算规则」说明弹窗。
- **探索与决策**：`gameEngine.ts` 新增 `calculateHandScore`（大小王基数 1、其余 2，同 rank 组合倍乘）与 `handleGameFinished` 内的积分结算（输家 `totalScore` 扣分、赢家平分、余数归击球触发胜者），结果写 `room.lastRoundScores`；`shared/types/game.ts` 增 `RoundScoreEntry` 与 `totalScore`/`lastRoundScores` 字段；`VictoryModal` 展示本局积分变化、累计总分与每张剩余牌罚分（`cardPenaltyBase × rankCount`）；`App.vue` 内联积分规则弹窗。
- **最终改动**：
  - `server/gameEngine.ts` — 修改：`calculateHandScore` / `handleGameFinished` 积分结算。
  - `server/roomManager.ts` / `server/socketHandlers.ts` — 修改：下发 `totalScore` / `lastRoundScores`。
  - `shared/types/game.ts` — 修改：`RoundScoreEntry`、`Player.totalScore`、`Room.lastRoundScores`。
  - `src/App.vue` — 修改：积分规则弹窗（内联）。
  - `src/components/VictoryModal.vue` — 修改：积分变化、累计总分、单张罚分展示。
- **commit**：`150d669`（经 `38123ae` 合并）

### 第21轮：每局结算推送企业微信机器人 [2026-08-21]
- **输入**：新增「看板」——每局胜利结算后，把房间号与各成员积分推送到企业微信机器人。
- **探索与决策**：新增 `server/wecomWebhook.ts` 承载推送逻辑，`sendRoundResultToWecom(room)` 把「房间号 + 各成员本局得分变化（`+N/-N`）+ 累计积分」拼成文本消息（`msgtype: text`），POST 到企业微信机器人 Webhook（地址与提及成员先写死）；在 `gameEngine.ts` 的 `handleGameFinished` 结算完成后调用，异步推送、不阻塞结算流程；推送失败（HTTP 非 2xx / `errcode !== 0` / 异常）只打印 `⚠️ [WeCom]` 警告日志，不抛出、不影响对局。
- **最终改动**：
  - `server/wecomWebhook.ts` — 新增：企业微信结算推送（拼消息 + fetch POST + 错误告警）。
  - `server/gameEngine.ts` — 修改：`handleGameFinished` 结算后调用 `sendRoundResultToWecom`。
- **commit**：`ac2b2a2`

### 第22轮：机器人 Webhook 链接改为运行时配置 [2026-08-21]
- **输入**：机器人 Webhook 地址不写死，改为运行时通过设置页面配置。
- **探索与决策**：Webhook 地址抽到 `server/robotConfig.ts`（内存变量 + `get/set`），新增 `/api/robot-url`（GET 读 / POST 写）接口与 `/enter_robot` 静态设置页面（独立于 SPA），页面保存/清除后 `setRobotWebhookUrl` 更新内存值；`sendRoundResultToWecom` 推送前先 `getRobotWebhookUrl()` 检查，未配置则直接返回不发送；`index.ts` 启用 `express.json()` 以解析 POST body。链接仅存内存，服务重启后清空。
- **最终改动**：
  - `server/robotConfig.ts` — 新增：Webhook 链接内存配置（`getRobotWebhookUrl` / `setRobotWebhookUrl`）。
  - `server/index.ts` — 修改：`express.json()`、`/api/robot-url`（GET/POST）、`/enter_robot` 静态页面路由。
  - `server/wecomWebhook.ts` — 修改：改从 `robotConfig` 取链接，未配置跳过推送。
  - `public/enter_robot.html` — 新增：机器人链接设置页面（读取/保存/清除）。
- **commit**：`fb66860`

### 第23轮：手牌按球号排序，罚牌日志隐去点数花色 [2026-08-21]
- **输入**：手牌按球号升序排列；犯规罚抽的日志不再显示具体点数花色。
- **探索与决策**：手牌排序放在前端计算属性，新增 `sortedMyCards`（`[...cards].sort((a,b) => a.ballNumber - b.ballNumber)`），`App.vue` 手牌区改渲染 `sortedMyCards`，避免改动服务端 `cards` 数组本身；罚抽日志去掉 `[suit+rank]` 后缀，普通犯规与裁判代记两处统一为「罚抽 1 张扑克牌」。
- **最终改动**：
  - `src/composables/useGameRoom.ts` — 修改：新增 `sortedMyCards` 计算属性并导出。
  - `src/App.vue` — 修改：手牌区改渲染 `sortedMyCards`。
  - `server/socketHandlers.ts` — 修改：`draw_penalty` / `referee_draw_penalty` 罚抽日志去掉具体点数花色。
- **commit**：`9f3e9b4`

### 第24轮：开球进球记录 [2026-08-21]
- **输入**：新增「开球进球」记录——开球时入袋的球记为已进球，但不归入任何玩家手牌。
- **探索与决策**：沿用 `accidental_pocket` 的「全场已进球」思路，新增独立 `breakBalls` 数组（写入 `ServerRoom`，创建/开局/重开时清空）以区别于意外进球；`getPocketedBallNumbers` 把 `breakBalls` 并入全局已进球号并集，从而不影响胜负判定与前端置灰逻辑。新增 `break_pocket` 事件（payload `BreakPocketPayload`），去重入袋、记日志、判胜负。前端在 `RefereePocketModal` 里加「开球进球」切换按钮（`isBreakPocket`），选中后隐藏玩家选择、走独立的 `confirm-break` 事件，由 `useGameRoom.handleBreakPocketConfirm` 发 `break_pocket`。
- **最终改动**：
  - `shared/types/game.ts` — 修改：`ServerRoom` 新增 `breakBalls: number[]`。
  - `shared/types/socket.ts` — 修改：新增 `BreakPocketPayload` 与 `ClientToServerEvents.break_pocket`。
  - `server/gameEngine.ts` — 修改：`getPocketedBallNumbers` 并入 `breakBalls`。
  - `server/socketHandlers.ts` — 新增：`break_pocket` 事件处理器；创建/开局/重开处清空 `breakBalls`。
  - `src/components/RefereePocketModal.vue` — 修改：新增「开球进球」切换、`confirm-break` 事件、按钮禁用逻辑与开球描述框。
  - `src/composables/useGameRoom.ts` — 新增：`handleBreakPocketConfirm` 并导出。
  - `src/App.vue` — 修改：接入 `handleBreakPocketConfirm` 与 `@confirm-break`。
- **commit**：未提交（工作区改动）

### 第25轮：内存数据收敛 + 撤回改造为快照栈 [2026-08-22]
- **输入**：整理游戏进行用到的所有内存数据封装到一个结构体；撤回功能改为——每步操作后的新结构体放进一个总体记录数组，撤回时 pop 数组回到上一步；每局开始游戏时清空数组，数组为空时撤回无效果。
- **探索与决策**：
  - 将 `ServerRoom` 里散落的「进行态」字段收敛为 `GameState`（`shared/types/game.ts`）：`status` / `players[]`（`GamePlayerSnapshot`，仅含 `cards`/`pocketedCards`/`cardCount`/`activeCardCount`/`wins`/`isWinner`/`totalScore`）/ `deck` / `accidentalBalls` / `breakBalls` / `winners` / `turnOrder` / `lastTurnOrder` / `lastWinnerUserId` / `roundCount` / `lastRoundScores`。快照**不含 logs**（日志属审计记录不随撤回回退）与身份/连接/设置类字段（`id`/`userId`/`sessionToken`/`name`/`avatar`/`isHost`/`online`/`settings`）。
  - 新增 `server/gameState.ts` 承载快照：`snapshotGameState` / `restoreGameState`（深拷贝）、`recordGameStep`（操作后 push）、`undoGameStep`（pop 当前、回退到新栈顶）。采用「push 操作后状态」语义，`undoGameStep` 丢弃栈顶回退到再上一步，历史只剩基线（length ≤ 1）时返回 null 无效果。
  - 撤回权限定为「所有玩家」、前端交互定为「撤回上一步 + 确认框」，移除选牌弹窗（`RetractBallModal.vue` 删除），`RetractBallPayload` 去掉 `cardId`。
- **最终改动**：
  - `shared/types/game.ts` — 修改：新增 `GameState` / `GamePlayerSnapshot`；`ServerRoom` 增 `gameHistory: GameState[]`。
  - `shared/types/socket.ts` — 修改：`RetractBallPayload` 移除 `cardId`，仅留 `roomCode`。
  - `server/gameState.ts` — 新增：`snapshotGameState` / `restoreGameState` / `recordGameStep` / `undoGameStep`。
  - `server/socketHandlers.ts` — 修改：`create_room` 初始化 `gameHistory`；`start_game` 清空并 `recordGameStep` 播种发牌基线；`pocket_ball`/`draw_penalty`/`accidental_pocket`/`break_pocket`/`referee_pocket_ball`（两分支）/`referee_draw_penalty` 操作后 `recordGameStep`；`retract_ball` 改为 `undoGameStep` 并追加「已撤回到上一步操作 / 没有可撤回的操作」日志；`handleRestartRoom` 清空 `gameHistory`。
  - `src/composables/useGameRoom.ts` — 修改：`handleRetractConfirm(cardId)` 改为 `handleRetract()`（`window.confirm` 后发 `retract_ball`），移除 `showRetractModal`。
  - `src/App.vue` — 修改：撤回按钮改为 `@click="handleRetract"`，移除 `RetractBallModal` 引用。
  - `src/components/RetractBallModal.vue` — 删除：选牌撤回弹窗（被确认框交互取代）。
  - `e2e/poolpoker.spec.ts` — 修改：撤回用例改为验证「已撤回到上一步操作」日志。
- **验收**：`npm run build`（vue-tsc + vite）通过；变更文件 Biome 检查通过。
- **commit**：未提交（工作区改动）

### 第26轮：Tauri Android 打包与 Wear OS 协同通信整合 [2026-08-24]
- **输入**：完善 @android，通过 Tauri 打包 Web 应用至 Android，整合 phone-companion DataLayer 逻辑，提供 Android 与 Wear OS 手表协同通信功能。
- **探索与决策**：
  - 接入 Tauri v2（`src-tauri/`），配置 Web 静态产物路径（`dist/`）。采用顶层归一化 Android 多模块方案（Option 1），彻底摆脱软链接。
  - 顶层 `android/` 为唯一 Android 根工程，`settings.gradle.kts` 统一管理 `:app`（Tauri 移动端壳）、`:wear-app`（Wear OS 手表端）、`:phone-companion`（独立 Companion）与 `:shared-models`（共享模型）。
  - `:app` 继承 `TauriActivity`（`MainActivity.kt`）与 `WearableListenerService`（`WearableDataLayerService.kt`），直接引用 `:shared-models` 依赖，并通过 `TauriWearSyncPlugin.kt` 向 Wear OS `/poolpoker/sync_room` 发送状态。
  - 前端封装 `useWearSync` composable，并仅在移动端 App 环境下差异化提供「后端服务器地址配置」入口。
- **最终改动**：
  - `package.json` — 修改：新增 Tauri CLI 与 API 依赖，构建脚本调整为直接编译 `android/` 的 `:app` 模块。
  - `src-tauri/` — 新增：`Cargo.toml` / `tauri.conf.json` / `build.rs` / `src/lib.rs` / `src/main.rs` 及应用图标。删除 `src-tauri/gen` 软链接。
  - `android/app/` — 新增：Tauri Android 应用主模块配置（`build.gradle.kts` / `AndroidManifest.xml` / `MainActivity.kt` / `TauriWearSyncPlugin.kt` / `WearableDataLayerService.kt`）。
  - `src/composables/useWearSync.ts` — 新增：Tauri Android 平台 Wear OS 状态同步 Composable。
  - `src/components/RoomLobby.vue` — 修改：增加 `isTauriEnv` 判空，在移动端 App 下显示后端服务器 URL 设置入口。
- **验收**：`npm run format`、`npm run build` (`vue-tsc` + `vite build`)、`npm run test:unit` (18 个单元测试全部通过)。
- **commit**：未提交（工作区改动）

### 第27轮：牌局命令服务抽取 [2026-09-04]
- **输入**：先实行架构方案 1——把 `socketHandlers.ts` 中牌局操作的状态变更、日志、快照和胜负结算组合逻辑收敛为更深的领域边界。
- **探索与决策**：
  - 保留 `create_room` / `join_room` / `rejoin_room` / `leave_room` / `disconnect` 在 `socketHandlers.ts`，因为这些事件仍强依赖 Socket callback、`socket.join/leave`、`socketIndex`、cleanup timer 与会话生命周期。
  - 新增 `applyGameRoomCommand(room, command)` 作为牌局内命令统一入口，吸收 `start_game`、`pocket_ball`、`draw_penalty`、`accidental_pocket`、`break_pocket`、`retract_ball`、`referee_*`、`restart_game`、`request_restart` 的组合规则。
  - Socket 层现在只解析 payload / actor 上下文、调用命令服务、根据 `shouldBroadcast` 调用 `broadcastRoomState`。
- **最终改动**：
  - `server/gameRoomService.ts` — 新增：牌局命令边界，隐藏发牌、补牌、消牌、全场进球、撤回、重开、胜负判定、积分结算、日志与历史快照调用顺序。
  - `server/socketHandlers.ts` — 修改：牌局内事件改委托给 `applyGameRoomCommand`，删除重复领域流程代码。
  - `server/__tests__/gameRoomService.spec.ts` — 新增：命令边界测试，覆盖开局发牌、消牌结算、撤回、裁判代记 fallback 与罚牌。
  - `docs/overview.md` — 修改：更新服务端数据流、目录说明与模块职责。
- **验收**：`./node_modules/.bin/vue-tsc --noEmit` 通过；`./node_modules/.bin/vitest run --reporter verbose` 通过（5 个测试文件、25 个测试）；`./node_modules/.bin/biome check server/gameRoomService.ts server/socketHandlers.ts server/__tests__/gameRoomService.spec.ts` 通过。
- **备注**：`pnpm run test:unit` / `pnpm run lint` 与 `pnpm exec ...` 在本机本轮启动后无输出卡住，已改用 `node_modules/.bin` 直接执行同等检查。
- **commit**：未提交（工作区改动）

### 第28轮：房间注册表与 Socket 会话索引边界收敛 [2026-09-04]
- **输入**：实行架构方案 2——把 `rooms` / `socketIndex` / cleanup timer 的存储与会话索引职责收敛到 `roomManager` 边界，减少 Socket handler 直接操作全局状态。
- **探索与决策**：
  - 采用增量方案，不一次性搬迁 create/join/rejoin/leave/disconnect 的全部生命周期逻辑；先把房间查询/保存/删除、Socket session 绑定/读取/解绑、多 Socket 同用户检测封成 helper。
  - `socketIndex` 改为 `roomManager` 内部实现细节，外部通过 `registerSocketSession`、`getSocketSession`、`removeSocketSession`、`hasOtherSocketForUser` 访问。
  - `logger.ts` 与崩溃告警推送也改用 registry/query helper，避免直接依赖底层 Map/Object 结构。
- **最终改动**：
  - `server/roomManager.ts` — 修改：新增 `SocketSession`、`getRoom`、`listRooms`、`saveRoom`、`removeRoom`、session registry helper，并在 broadcast/client projection 内部复用这些边界。
  - `server/socketHandlers.ts` — 修改：房间和 Socket session 的读写改走 `roomManager` helper；disconnect 的多 Socket 在线判定改走 `hasOtherSocketForUser`。
  - `server/logger.ts` / `server/wecomWebhook.ts` — 修改：改用 `getRoom` / `getSocketSession` / `listRooms` 查询状态。
  - `server/__tests__/roomManager.spec.ts` — 修改：新增房间 registry 与 session registry 边界测试。
  - `docs/overview.md` — 修改：更新 `roomManager` 职责说明。
- **验收**：`./node_modules/.bin/vue-tsc --noEmit` 通过；`./node_modules/.bin/vitest run --reporter verbose` 通过（5 个测试文件、27 个测试）；`./node_modules/.bin/biome check server/roomManager.ts server/socketHandlers.ts server/logger.ts server/wecomWebhook.ts server/__tests__/roomManager.spec.ts` 通过。
- **commit**：未提交（工作区改动）

### 第29轮：客户端协议常量边界收敛 [2026-09-04]
- **输入**：实行架构方案 3——统一 Web、服务端与 Wear OS 之间的 Socket 事件名、Wear action 与 DataLayer path 协议面，降低协议漂移风险。
- **探索与决策**：
  - 新增 `shared/types/protocol.ts` 作为 TS 侧协议常量锚点，覆盖 `CLIENT_TO_SERVER_EVENTS`、`SERVER_TO_CLIENT_EVENTS`、`WEAR_ACTIONS` 与 `DATA_LAYER_PATHS`。
  - `shared/types/socket.ts` 的 Socket.IO 事件接口改用协议常量 computed keys，让类型契约和运行时事件名共享同一份定义。
  - Kotlin 侧保持现有 `WearAction` enum 序列化模型，新增 `SocketEvents` object 并复用既有 `DataLayerConstants`，以低迁移成本接入 Wear 直连与蓝牙凭证桥。
  - 新增 TS 协议契约测试，检查协议值稳定、唯一，并确认 Kotlin mirror 中包含 TS 协议常量面。
- **最终改动**：
  - `shared/types/protocol.ts` — 新增：Socket 事件、Wear action、DataLayer path 常量与派生类型。
  - `shared/types/socket.ts` — 修改：事件接口改用协议常量作为 key。
  - `server/socketHandlers.ts` / `server/roomManager.ts` / `src/composables/useGameRoom.ts` — 修改：运行时 Socket `emit/on/off` 改引用协议常量。
  - `android/shared-models/src/main/java/com/poolpoker/shared/Models.kt` — 修改：新增 `SocketEvents` mirror。
  - `android/wear-app/src/main/java/com/poolpoker/wear/WearDirectSocketManager.kt` / `WearBluetoothClient.kt` / `android/app/src/main/java/com/poolpoker/app/BluetoothServerRelay.kt` — 修改：Wear 直连与本地桥接改引用 Kotlin 协议常量。
  - `server/__tests__/protocolContract.spec.ts` — 新增：协议漂移契约测试。
- **验收**：`./node_modules/.bin/vue-tsc --noEmit` 通过；`./node_modules/.bin/vitest run --reporter verbose` 通过（6 个测试文件、30 个测试）；`./node_modules/.bin/biome check .` 通过；`android/./gradlew :shared-models:compileDebugKotlin :wear-app:compileDebugKotlin :app:compileDebugKotlin` 通过（Gradle 仍输出 Tauri 依赖与生成 WebView 代码的既有 deprecated warning）。
- **commit**：未提交（工作区改动）


### Wear OS 断线与进程重启后的会话恢复 [2026-09-07]
- **问题**：直连 Socket 每次连接都发送 `join_room`，未处理 ACK、未保存 token；已有玩家被服务端拒绝，但 UI 仍显示已连接。断线操作还会错误地转发到手机，未连接手机时没有反馈。
- **改动**：保存最近成功会话的服务器、房间、用户和凭证；重连使用 `rejoin_room`，Activity 启动时自动恢复；连接成功以入房 ACK 为准，显示拒绝原因并在 ACK 超时后重建连接。统一主线程处理连接事件并过滤旧 Socket 回调。直连断线操作提示重试；手机原生凭证桥补充 token 并去除蓝牙凭证原文日志。
- **回归**：新增服务端测试，覆盖断线 40 分钟后普通加入被拒绝、持保存凭证恢复且手牌、已进球、积分与牌堆不变。房间生命周期测试 8 项通过；`vue-tsc --noEmit`、相关文件 Biome 检查与 `git diff --check` 通过。
- **限制**：旧版本未保存的凭证无法事后恢复；未进行真机 40 分钟持续运行、断网及 kill/relaunch 复测。最初传输断线原因需要设备日志确认。
- **Android 构建**：原工程缺少 git-ignored 的 `tauri.settings.gradle`，以临时独立工程保留相同 Gradle、SDK、依赖与 Wear/shared 源码构建，`:wear-app:assembleDebug` 通过；APK 复制到 `android/wear-app/build/outputs/apk/debug/wear-app-debug.apk`。未安装到设备。


### Wear OS 使用协程管理延时与主线程调度 [2026-09-07]
- **输入**：使用 Kotlin 协程替换本次修复中的 Runnable，优先采用现代 Android 组件。
- **改动**：`WearDirectSocketManager` 用 `Dispatchers.Main.immediate` 调度 Socket 事件与 ACK，用 `Job + delay` 替换入房超时；每个连接有独立子 scope，替换或关闭时整体取消，避免旧连接的排队任务和超时继续执行。进程级管理 scope 保留跨 Activity 的连接生命周期。
- **界面**：`WearMainActivity` 的亮屏倒计时改为 `LaunchedEffect(roomState)`，状态变化自动取消重启，使用 `finally` 清除 Window 标记。
- **依赖**：Wear 模块显式声明 `kotlinx-coroutines-android` 1.9.0，复用已有依赖版本，不依赖 Compose 间接引入。
- **验证**：相同依赖及源码的独立 Wear 工程 `:wear-app:assembleDebug --offline` 通过，`git diff --check` 通过；已刷新原 APK 输出路径，未安装或真机复测。


### 准备界面房主移出玩家 [2026-09-07]
- **交互**：准备界面其他玩家旁显示仅房主可见的「移出」按钮，确认后执行；支持移出暂离玩家，不能移出自己，开局后不可执行。
- **服务端**：新增 `kick_player` / `room_kicked` 协议；生命周期服务校验 Socket 的房间和房主身份，移除玩家及其所有 Socket 会话、通知并退出 Socket 房间，再广播最新成员。旧 token 无法恢复已移除成员，允许主动重新加入。补充 `leave_room` 本人鉴权，防止冒用他人 userId 绕过踢人权限。
- **客户端**：Web 清除本地房间及凭证并提示被移出，过滤踢人前发起的过期 HTTP 快照；Wear 直连端清理已保存会话及房间状态。
- **验证**：51 项单元测试通过，覆盖多连接清理、旧凭证、非房主、跨房间、非准备状态、离线玩家和冒用退出。生产构建通过；独立端口 Playwright 测试通过，验证按钮权限、取消/确认、退出提示与刷新后不自动回房。
- **Wear 验证**：使用已有临时独立 Gradle 工程同步本次 Kotlin 与资源变更，离线 `:wear-app:compileDebugKotlin` 通过；未做真机测试。相关文件 Biome 与 `git diff --check` 通过。

### 第30轮：v2 沉浸式球桌可玩原型 [2026-09-07]
- **输入**：确认实施“手机作为球桌一侧”的 2.5D 方案，围绕球桌、真实手牌与事件动画升级 UI/UX。
- **改动**：沿用工作区已有 Three.js 探索组件，重做灯光、桌布、球阵、镜头适配和 DOM 触控层；手牌增加纸张质感、可见球号角标、展开浏览、免打徽记和出牌动效。系统信息收进 HUD 与抽屉，保留开球、犯规、撤回快捷入口。
- **规则与一致性**：明确本地记球对象，不虚构当前回合；同号牌自动选一张，其他牌保留免打。服务端重复进球保护、公开有效手牌数、版本化事件与可选操作回调；撤回校验客户端所见版本。已确认事件驱动画面，刷新、后台与重连按快照恢复。
- **验证**：类型检查、生产构建、Biome、模型生成一致性检查；新增重复进球、撤回版本、联合胜利、公开字段隐私和事件连续性测试。浏览器双人实测点球、代记、同号免打、罚抽、撤回、多次开球、刷新恢复与带免打牌的胜利结算；320×667 / 390×844 热区与横向溢出检查通过。
- **边界**：WebGPU 和原生真机性能未验证；保留 v1 E2E 文件，旧选择器需后续迁移，本轮浏览器验证通过 CUA 执行。未提交或部署。

### 第31轮：球色辨识与桌面构图修正 [2026-09-07]
- **输入**：球体呈现全白、主屏缺少击球顺序、PC 球桌偏小。
- **改动**：号码白底随球体投影缩放，调整条纹朝向；画布绝对定位填满容器，宽屏旋转球桌并重新适配镜头。击球顺序移到主屏小字行，单人时移除空席位提示。
- **验证**：类型检查、Biome、生产构建通过；浏览器确认 775px 横向球桌与球色，320px 无横向溢出和球号触控重叠。

### 第32轮：按实拍修正 Three.js 条纹球 [2026-09-08]
- **改动**：条纹球采用连续宽色带与两端象牙白球冠，号码直接映射到白色球冠；全色球保留小白色号码区。球面投影避免经纬贴图拉伸，去除 DOM 号码浮层，保留无障碍触控按钮。
- **朝向**：横竖屏下号码区域正对镜头；入袋滚动叠加于静止朝向，恢复时还原。
- **辨识优化**：号码字号从 144px 增至 200px，条纹球进一步扩大号码映射范围，按字形实际边界居中；移除侧倾，使号码区正对玩家。
- **验证**：类型检查、生产构建及相关文件 Biome 通过；浏览器独立组件预览核对宽屏和 390px 窄屏，正式入口刷新验证加大号码与正面朝向。

### 球面号码清晰度优化 [2026-09-08]
- **原因**：号码从 DOM 转入球面后受环境反射与清漆高光影响，衬线字体细笔画在小球尺寸下不易辨认。
- **改动**：降低球体环境反射、镜面及清漆强度，提高粗糙度保留柔和光泽；号码保留深色 Georgia 粗体（按反馈恢复衬线字体），渲染像素比上限从 1.75 提至 2。
- **验证**：类型检查、生产构建和相关文件 Biome 通过；刷新本地正式页面，窄屏确认高光白斑消退、号码完整可辨。

### 六袋球桌袋口衔接 [2026-09-08]
- **输入**：参考图中的细袋沿、下沉袋口与库边收口，修正粗圆环和桌面叠加造成的割裂。
- **改动**：木质底座和桌布共用六个圆形开孔；袋内增加深色内壁与下沉底面，细金属袋沿替代凸起黄铜圆环。六段库边用带倒角的斜口几何体连接袋口，木框改为圆角整体底座。球体高度及入袋动画起点随桌面高度同步调整。
- **验证**：类型检查、生产构建、相关文件 Biome 和差异空白检查通过；本地正式页面刷新核对六袋与库边的连接。

### 袋口尺寸与中袋连接微调 [2026-09-08]
- 六个袋口直径缩小 30%，同步缩放袋沿、内壁下口和底面。中袋向库边外移 0.15，入袋目标同步使用新位置；库边按袋口圆弧收口并预留倒角宽度，去除中袋连接处的桌布间隙。角袋库边端点随新半径延伸。
- 类型检查、生产构建、Biome 通过；正式页面刷新验证尺寸和中袋衔接。

### 本人待打球蓝圈提示 [2026-09-08]
- 从本人手牌提取尚未进袋的球号并去重，仅在 playing 状态显示；在对应 3D 台球底部添加贴桌面的蓝色细环。环使用不受灯光影响的材质，球号按钮同步增加「我的待打球」无障碍描述。
- 进球时隐藏蓝圈，撤回、罚牌和快照更新后按当前手牌重绘；不随代记对象切换，不读取其他玩家私有手牌。几何与材质沿用场景卸载清理。
- 类型检查、生产构建、Biome 和差异空白检查通过；正式页面核对蓝圈仅出现在本人剩余的 3、6、7、11 号球下方。

### 窄屏悬浮光圈尺寸修正 [2026-09-08]
- 悬浮/按压光圈改为独立伪元素，尺寸取球体实时投影直径（含动画缩放），不再取固定 44px 点击区域；保留原触控范围，触屏不启用 hover 样式。
- 类型检查、构建、Biome 通过；窄屏正式页面实测球体投影约 27.90px，光圈约 27.90px，点击区域仍为 44px。

### v2 UI 自动化端到端测试适配与全量验证 [2026-09-08]
- **改动**：适配 `e2e/poolpoker.spec.ts` 至全新 v2 UI 架构。更新手牌与球号定位器（`.poker-prop-card .corner-ball`）；适配大厅个人设置与球桌配色选择；抽屉实况日志查验支持防窥与撤回记录；优化多人同时获胜判定与击球轮换次序验证；新增 3D 球靶、开球模式、手牌折叠与规则弹窗专属测试。
- **验证**：Playwright E2E 测试 10/10 全部通过，Vitest 单元测试 59 项通过，Biome 格式与代码检查通过，模型生成同步校验一致，生产编译通过。

### 参考实景重建球台袋口与材质 [2026-09-08]
- 通过 Blender MCP 在独立 `Refined_Table` 集合重建圆角铸件、库边收口、皮革卷边/缝线、镂空菱形绳网与深处衬底。另存独立成品工程（现名 `billiards_table.blend`），当时保留原源文件和 GLB。
- 新 GLB 约 3.4 MB、7.3 万三角面；只导出球台与六个 `PocketTarget_*` 锚点。网页用模型锚点确定进球目标，保留程序化降级模型的位置约定。
- 调整顶棚环境反射、桌沿补光、暗色接影地面及较克制的待打提示环；保留用户此前的球体光泽与横竖屏镜头调整。阴影类型改用当前 Three.js 支持的 PCFShadowMap。
- 验证：生产构建和组件 Biome 检查通过；桌面、390px、320px 网页检查完成，320px 无横向溢出、球号热区无重叠；实际点击进球并刷新后，球号状态正确保留。撤回确认弹窗受浏览器工具限制，本轮未完成撤回验收。未测 iOS/Android 真机帧率。
- 本轮使用一次性 Blender 重建与预览脚本；效果确认后的维护流程见 `docs/table_asset_pipeline.md`。

### 球台成品确认后的资源清理 [2026-09-08]
- 按用户要求删除旧版 `billiards_table.blend` 及 `.blend1` / `.blend.bak` 备份、旧版 GLB（包括 dist 副本），以及一次性 Blender 重建和预览脚本。
- 保留当前使用的 `billiards_table.blend` / `.glb`、纹理和成品预览；导出文档改为直接编辑成品工程的流程。

### 球台成品文件命名统一 [2026-09-08]
- 当前成品工程和 GLB 去除 `_refined` 后缀，统一为 `billiards_table.blend` / `billiards_table.glb`；同步更新网页引用与维护文档。

### 球台 GLB 前置预加载与移除参数化临时球桌 [2026-09-08]
- **改动**：
  1. 彻底移除 `ThreeBilliardsArena.vue` 中的 2D 参数化绿底棕边临时球桌（`.fallback-balls`）及 130 余行遗留的 3D 程序化球台代码（`buildProceduralTable`）。
  2. 引入高品质台球 Loading 动效（流光旋转环 + 拟真母球呼吸脉冲 + 提示文案），并在加载异常时提供优雅的错误状态与重试入口。
  3. 构建三级 GLB 资源预加载体系：`index.html` 增加 `<link rel="preload">` 底层预拉取；新增 `src/utils/tableModelLoader.ts` 开启 Three.js 内存缓存与 ArrayBuffer 单例管理；`App.vue` 在用户处于大厅阶段利用 `requestIdleCallback` 提前静默加载 `ThreeBilliardsArena` 代码块与 3.38MB GLB 模型。
- **验证**：`pnpm run lint` 检查通过；`pnpm run test:unit` 全部 59 项通过；`pnpm run build` 成功，JS bundle 减少约 57KB，加载时间与过渡顺畅。

---

## 2026-09-11 清理 src/components/ 冗余组件与规范公共/版本化目录架构

- **需求**：清理 commit `6be20f2` 引入 v1/v2 双套 UI 分离时残留在 `src/components/` 根目录下的重复组件副本，明确公共组件与版本专用组件的职责边界。
- **探索与决策**：
  - 确认根目录下的 10 个组件分别与 `v1/`（`BilliardsTable.vue`, `GameLogs.vue`, `PokerCard.vue`）和 `v2/`（`ThreeBilliardsArena.vue`, `GameControlDrawer.vue`, `GameMinimalHud.vue`, `HandDeckFan.vue`, `PokerCardProp.vue`, `RecordingPlayerDropdown.vue`, `TableOpponentSeats.vue`）内容完全一致，且应用代码（`App.vue`、`GameView.vue` 等）已全量切换为引用各自子目录中的版本或公共组件。
  - 保留 `src/components/` 根目录下的 6 个真正跨版本公共组件：`RoomLobby.vue`, `GameHeader.vue`, `VictoryModal.vue`, `RefereePocketModal.vue`, `RefereeFoulModal.vue`, `RestartModal.vue`。
  - 彻底删除根目录下遗留的 10 个未被引用的重名文件。
- **改动**：
  - `src/components/` — 删除：`BilliardsTable.vue`, `GameLogs.vue`, `PokerCard.vue`, `GameControlDrawer.vue`, `GameMinimalHud.vue`, `HandDeckFan.vue`, `PokerCardProp.vue`, `RecordingPlayerDropdown.vue`, `TableOpponentSeats.vue`, `ThreeBilliardsArena.vue`。
  - `docs/overview.md` / `docs/implement_log.md` — 修改：更新组件目录划分结构与维护记录。
- **验证**：
  - `vue-tsc --noEmit` 类型校验通过。
  - `biome check .` 检查全部通过。
  - `vitest run` 9 个测试文件共 67 项测试全部通过。
  - `vite build` 生产构建成功。

### 第38轮：修复全局赛况手牌计数泄露手牌缺陷并彻底删除 activeCardCount [2026-09-13]
- **需求**：玩家手上有 3 张实体手牌（其中 1 张因对应球号已被打进而置灰免打），但在全局赛况中显示为“还剩 2 张”，泄露了玩家手牌中包含免打牌的隐私信息。需要修复并彻底移除冗余有害的 `activeCardCount` 字段。
- **探索与决策**：
  - 排查历史提交 `031b2f3` 与 `6121685`，此前已定论：广播给客户端的手牌计数绝不能过滤已进球号（免打牌），否则场上一旦进球，持有对应球号的玩家计数无故突变减少，将直接出卖其持有该球；且当玩家实际拿着 3 张牌却在公屏显示 2 张时，所有对手都能断定其手中有免打牌。
  - 后来在 v2 原型中，`activeCardCount` 意外被重新用于过滤死牌并作为公开字段广播；而在 v1 `BilliardsTable.vue` 和 v2 `TableOpponentSeats.vue` 中也优先展示了该过滤计数字段，造成信息泄露。
  - 决议：彻底删除跨端 Schema 及前后端内部所有 `activeCardCount` 字段。所有全局公开展示（包括全局赛况卡片“还剩 X 张”、进度条、席位手牌等）统一严格使用实体手牌总数 `p.cardCount`（即 `p.cards.length`）。本人客户端的“待打 X 张”由前端本地基于自身私密可见的手牌 `myInfo.cards` 独立计算，绝不通过网络广播向其他对手暴露。
- **改动**：
  - `shared/schemas/room.schema.json` — 修改：从 `Player` 属性及必填列表中彻底删除 `activeCardCount`。
  - `scripts/codegen-models.mjs` — 运行代码生成，同步刷新 TS wire models (`wire-models.ts`) 与 Kotlin wire models (`WireModels.kt`)。
  - `shared/types/game.ts` — 修改：`GamePlayerSnapshot` 移除 `activeCardCount`。
  - `server/gameState.ts` — 修改：`clonePlayer` 与 `restoreGameState` 移除 `activeCardCount`。
  - `server/roomManager.ts` — 修改：`getClientRoomState` 不再组装与广播 `activeCardCount`，仅保留权威实体手牌数 `cardCount: p.cards.length`。
  - `server/roomLifecycleService.ts` / `server/gameRoomService.ts` — 修改：创建玩家与重置游戏逻辑移除 `activeCardCount`。
  - `src/components/v1/BilliardsTable.vue` — 修改：全局赛况计数及进度条百分比严格使用 `p.cardCount`。
  - `src/components/v2/TableOpponentSeats.vue` — 修改：对手席位计数改为显示实体手牌数 `手牌 {{ p.cardCount }}`。
  - `server/__tests__/` — 修改：更新 `gameState.spec.ts`、`gameRoomService.spec.ts`、`roomManager.spec.ts` 并新增对局中手牌隐私及计数防泄露断言。
- **验证**：
  - `pnpm run codegen:check` 通过。
  - `pnpm run lint` (`biome check .`) 0 警告 0 报错通过。
  - `pnpm exec vue-tsc --noEmit` 类型校验通过。
  - `pnpm run test:unit` 9 个测试文件共 68 项测试全部通过。
  - `pnpm run build` 生产构建成功。




## 2026-09-26 Web 定位发现附近房间

- 需求：在大厅自动感知附近新房间并一键加入，保留将来 iOS/Android 原生 BLE 发现扩展能力。
- 实现：新增发现 Schema 与生成的 TS/Kotlin 契约、临时定位 presence、距离/有效期/精度/房主权限检查、Socket 增量列表推送，以及大厅附近列表和房主附近可见开关。默认 300 米范围可配置；位置只存内存，60 秒过期。
- 客户端：首次浏览器定位授权后自动运行；20 秒重新定位，处理定位拒绝/超时/精度不足、后台暂停、开局停止、重连恢复、开关持久化与快速加入的重复点击防护。
- 扩展：发现适配器与加入业务分离，`RoomDiscoveryProvider` 可替换；`bluetooth` 来源仅预留，未实现时服务端明确拒绝。不会改变手动输入房间码的原有加入规则。
- 文档：新增 `docs/nearby_room_discovery.md`，同步更新架构说明。
- 验证：生产构建、100 项单元测试、lint、codegen:check、git diff --check 均通过；4 项新增 Playwright 用例通过，覆盖自动出现/一键加入/开局移除、距离与开关、前后台暂停恢复、重连、权限拒绝，并检查 390px 手机布局无横向溢出。
- 完整浏览器回归：13/16 通过。原有对局用例 3、5、7 未通过，仍引用已不存在的“犯规罚牌”按钮（当前按钮为对局菜单中的“记录犯规”）；用例 5 首轮为 3D 手牌等待超时，复跑后同样停在旧按钮。未扩大本次范围修改旧对局测试。
- 测试环境：避免复用本机已有 3000 端口旧后端，使用临时 Playwright 配置在 3107 端口运行当前代码；未停止现有服务。

### 2026-09-26 修复真实 Safari 定位过期误判与后台撤房

- Computer-use 实测定位返回：Safari 的时间戳与 Unix 毫秒相差 978307200000（2001/1970 时间基准差），原始定位年龄 978307200069ms，补偿后仅 69ms、精度约 63 米；Chrome 正常。新增仅适用于 Apple vendor 且补偿后仍新鲜的窄范围转换，不用 Date.now() 替换原始采样时间。
- 前后端共用定位校验，将无效数据、精度不足、过期和未来时间分别提示；进入后台时保留最近状态，避免诊断信息被暂停提示覆盖。
- 房主临时隐藏页面时停止定位但不立即撤房，沿用最近位置剩余的 60 秒有效期，且不续期；关闭发现、离开页面、卸载、开局及失去房主权限仍撤回。
- 真实 Safari/Chrome 验证：Chrome 自动发现 Safari 房间并点击加入，两端显示 2 人；新增 Apple 时间基准单测与端到端模拟，并验证后台保持可发现、显式关闭撤回。
- 验证：112 项单元测试、4 项附近发现 Playwright 用例、生产构建、lint 和 codegen:check 全部通过；实际浏览器已刷新至修复后的构建。未重复执行与本次修复无关且已知选择器过时的旧对局测试。


### 2026-09-26 首页渐进定位与按需停止

- 将固定 20 秒重新定位改为仅首页无有效位置时启动快速粗定位和高精度 watch；300 米以内立即参与发现，更好精度合并上报（最小间隔 1.1 秒）。
- 50 米精度或 10 秒无超过 10% 的改善后 clearWatch，每轮最多 30 秒；失败冷却 20 秒再试。成功后继续接收列表，不持续定位，原始样本 60 秒过期后首页重新获取。
- 缓存仅在内存按 Socket 保存，供页面恢复、重连、建房复用；显式首页重试清除缓存。所有迟到回调均按采集轮次作废。
- 进入任何房间、开局、后台或卸载均取消监听。房主不再定位，只发布已有首页位置剩余有效期；没有位置或位置过期时附近不可见，保留房间码加入。未修改服务端坐标过期策略。
- 验证：118 项单元测试、4 项附近发现 Playwright 用例、生产构建、lint、codegen:check 均通过。浏览器测试发现并修复了手动重试复用浏览器旧定位缓存的问题（手动请求 maximumAge=0）。本轮未重复真实 Safari/Chrome Computer-use 测试。

### 2026-09-26 pnpm 移动端构建编排

- 接入 Android/iOS Debug、Release 四个 pnpm pipeline；根项目纳入任务图，Debug 前置 codegen:check，Release 再加单元测试。
- 新增 tauri:ios:debug 有限时长构建，保留原有 iOS 热重载开发入口和所有直接构建命令；Tauri 前端钩子统一使用 pnpm。
- 四个原生构建共用 poolpoker-native 单并发组，避免共享 dist/ 写入冲突；不启用 APK/IPA 结果缓存，沿用 Gradle/Cargo 增量构建和既有签名配置。
- 验证：pnpm 12.6.0 下四条 pipeline 的 --full --dry-run --json 任务图及前置依赖断言通过；模型一致性、118 项单元测试、TypeScript/Vite 生产构建、修改 JSON 的 Biome 检查通过。未执行 Android/iOS 原生打包或签名验证。

### 2026-09-26 移除旧移动端构建入口

- 用户确认四条 pipeline 已实际验证可用；移除 tauri:android* / tauri:ios* 旧脚本，底层构建任务改名为 build:android:* / build:ios:*，四个 pipeline 名称和依赖保持不变。
- README、中英文说明、AGENTS 和移动端构建文档统一使用 pnpm pipeline；iOS 热重载改用 pnpm exec tauri ios dev，同步 XcodeGen 源文件和现有 Xcode 工程的诊断提示。
- 验证：四条 pipeline dry-run 的任务存在性和前置依赖断言通过，package.json Biome 和 git diff --check 通过。本轮只调整入口，未重复原生打包。

### 2026-09-26 构建前生成 wire models

- 四条移动端 pipeline 增加 codegen:models → codegen:check 依赖链，Release 单元测试等待检查完成，确保使用最新生成类型。
- 生成、检查和测试也加入 poolpoker-native 并发组，避免多个编排进程读写共享生成文件冲突；独立 pnpm run codegen:check 保持只检查语义。
- 验证：四条 pipeline dry-run 依赖图断言通过；实际递归运行按顺序完成生成、一致性检查和 118 项单元测试，生成文件无内容变化。未重复原生打包。

### 2026-09-26 花色球色带与号码位置校准

- 星爵色带半宽由 0.56 调整为 0.63，给号码黑圈外侧留出彩色间距。
- 星牌花色球色带轴与号码投影方向对齐，号码直接印在两侧白色端面；2D 图标号码正对前方，不额外旋转球体。颜色、字体及实色球资源保持不变。
- 同步更新两套配置 9–15 号球的 28 张 2D/3D WebP 和 Blender 源文件。抽查图标及 UV 贴图，vue-tsc、Vite 构建和 Git LFS 检查通过。

### 2026-09-27 星牌号码字重与字号微调

- 星牌单字字号 1.28 → 1.40，双字字号 1.12 → 1.23；文字轮廓外扩 0.022 加粗笔画，保留原有字体、位置和正面朝向。
- 轮廓外扩按主题读取，星爵明确回退到 0，避免共用文字对象带入星牌字重。同步重新生成星牌 1–15 号球的 2D/3D 资源及 Blender 源文件。

### 2026-09-27 Wear OS 面对面加入

- 在手表直连页面新增面对面加入列表，显示房主、房间号和人数，保留手动键盘；支持侧滑/硬件返回和中英繁体文案。
- 使用 Android 原生 LocationManager 获取前台位置，30 秒定位上限、300 米精度门槛、原始样本 60 秒有效期；后台、退出及选房后立即清理定位和发现连接。
- 复用现有生成的 DiscoveryPosition/NearbyRoom 和服务端协议，在游戏 Socket 上先登记位置再加入，保留 sessionToken 安全恢复；失败和取消不降级为手动加入。
- 验证：`:wear-app:assembleDebug` 和 `:wear-app:lintDebug` 通过（保留既有警告）；附近发现/协议测试 27 项通过，`git diff --check` 通过。生成 Debug APK；未进行手表真机定位与双端入房验收。Lint 同时修复连接页资源读取方式和既有踢出提示的中文翻译缺失。

### 2026-09-27 球外观上下文

- 新增 `useBallAppearance`，通过带类型的 provide/inject 共享既有主题和配色的只读响应式视图，不创建新的可变主题状态。
- V1/V2、裁判弹窗和 3D 球台移除外观参数透传；BallIcon 保留显式主题覆盖，主题变化会重置图片加载失败状态，3D 球台继续刷新贴图。
- 验证：vue-tsc 与 Vite 生产构建通过；上下文冒烟检查覆盖响应式主题/配色、只读保护及无 provider 默认值；Biome 和 diff 空白检查通过。未进行浏览器视觉验收。

### 2026-10-03 移除 ball_configs.json 与相关代码

- **移除 ball_configs.json 与渐变色配置**：删除根目录 `ball_configs.json`；移除服务端加载逻辑、`DEFAULT_BALL_CONFIG_KEY`、`isValidBallConfigKey` 及 `/api/ball-configs` 路由。
- **协议与数据结构精简**：从 `shared/schemas/room.schema.json` 中移除 `RoomSettings.ballConfigKey` 必填字段；从 `shared/types/socket.ts` 的 `CreateRoomPayload` 中移除 `ballConfigKey`；从 `shared/types/game.ts` 中移除 `BallConfig` 类型；通过 `codegen-models.mjs` 重新生成多端 wire models（TS/Kotlin）。
- **前端重构**：从 `usePlayerProfile` 与 `RoomLobby` 中移除球色配置选项及下拉选择框；`useGameRoom` 移除 `fetchBallConfigs`、`ballConfigs`、`ballConfigOptions`、`activeBallConfigKey`、`ballColorStyle`；`useBallAppearance` 改为仅管理 `theme`，默认使用星牌美术资产（`xingpai`）；`ThreeBilliardsArena` 贴图加载失败时直接使用标准 8 色回退。
- **测试与文档同步**：同步更新所有单元测试及 E2E 测试用例，清理 `AGENTS.md`、`README.md`、`docs/overview.md` 中对 `ball_configs.json` 和 `/api/ball-configs` 的描述；全量 Vitest 单元测试（122 项）、vue-tsc 类型检查、Biome lint/format、Vite 生产构建均顺利通过。

### 2026-10-06 Wear OS 主动退出房间功能

- **主动退房入口全覆盖**：为手表端（`:wear-app`）补齐主动离开房间入口，对齐 Web 端「退出房间」能力；分别在等待开局界面（`WearWaitingScreen`）、牌局进行中操作底栏与手牌清空获胜界面（`WearMainGameContent`）、对局结算界面（`WearSettlementScreen`）均新增「🚪 退出房间」按钮。
- **二次确认弹窗与手势规范**：实现 `WearLeaveRoomModalScreen` 确认浮层，采用 Root Box Overlay 模式挂载在 `WearGameScreen` 顶层，支持 Wear OS `SwipeToDismissBox` 侧滑手势与物理返回键（`BackHandler`）取消，防误触退出。
- **服务端退房协议与本地凭证彻底清理**：在 `WearDirectSocketManager` 中实现 `leaveRoom(context, roomCode)`，向服务端发送 `leave_room` 事件通知服务端将手表玩家安全移出房间（若为空房则自动解散），并在断开 Socket 的同时清理 `WearUserPrefs` 中持久化的房间凭证与 `WearDataLayerListenerService` 内存房间状态，彻底解决手表重启或前台切回时自动重新加入无人房间且无法退出的问题。
- **多语言资源**：在简体中文、繁体中文、英文 `strings.xml` 中补齐「🚪 退出房间」、「确认退出房间 %1$s 吗？」、「确认退出」等文案。
- **验证**：`:wear-app:compileDebugSources` 编译通过、`:wear-app:testDebugUnitTest` 通过、Vitest 单元测试全量通过（122/122）、`codegen:check` 通过、Biome 代码规范与 `vue-tsc` 检查均通过。

## 2026-10-14：补齐 Apple Watch 客户端

- 新增 watchOS 10+ SwiftUI 目标，嵌入现有 iOS app 并允许独立运行，覆盖 Wear OS 的房间加入、附近发现、手牌、裁判记球/罚牌、开球、撤回及结算。
- wire models 从同一 JSON Schema 生成 Swift Codable，并纳入 codegen 一致性检查。
- 使用 URLSession 的 Engine.IO HTTP 长轮询适配 watchOS 网络限制；入房 ACK、Keychain 会话、凭证重连、断线拒绝操作及撤回 revision 保护沿用服务器规则。
- iPhone 通过现有 Tauri 命令和 WatchConnectivity 同步同一用户身份；新增独立 watchOS 构建 pipeline、真实后端 Swift 协议测试和真机验收说明。
- 详见 [Apple Watch 架构与验收](apple_watch_architecture.md)。

### Apple Watch 模拟器验收补充

安装 watchOS 26.5 runtime 后完成 42mm 对局界面验收和完整 Debug pipeline；修复模拟器 Keychain 签名缺失导致会话无法保存，以及进球归属 wheel picker 高度被压缩的问题。已复测重启恢复、消牌、撤回、犯规、开球和结算。验收范围及硬件边界见 Apple Watch 架构文档。

### 2026-10-15：40mm 附近加入验收

40mm SE 3 使用合成坐标完成发现、点击加入、重启恢复和主动离房；定位拒绝提示通过。修复 discovery_update ACK 覆盖已有附近列表提示的时序问题，并在界面复测。模型一致性和 4 项 Swift 协议测试再次通过。

iPhone 实际 Tauri 模拟器包在原有 Build Rust Code 阶段失败；关闭该目标构建脚本沙箱的方案被自动审批拒绝，用户选择保留沙箱并记录限制，未修改该安全设置。手机配对会话同步仍未验收。

### 2026-10-15：Apple Watch 本地化规范重构与对局界面优化

- **String Catalog 本地化迁移**：将原 `apple/WatchApp/Localization.swift` 中的单文件硬编码字典重构迁移至 Apple 官方标准 String Catalog（`apple/WatchApp/Localizable.xcstrings`），完整提取 85 条文案，规范格式化占位符，支持 `en`、`zh-Hans`、`zh-Hant`。
- **强类型访问层精简**：重写 `Localization.swift`，代码行数从 703 行精简至约 140 行。`WatchStrings` 保持原有调用 API 100% 向后兼容，底层基于 `bundle.localizedString(forKey:value:table:)`，享有系统级本地化回退优先级和自动语言匹配。
- **构建与测试资源接入**：在 `Package.swift`（SwiftPM 测试目标）和 `apple/poolpoker.xcodeproj/project.pbxproj`（`poolpoker_watchOS` 资源的 `PBXResourcesBuildPhase`）中注册 `Localizable.xcstrings`，构建产物中自动编译生成 `zh-Hans.lproj`、`zh-Hant.lproj`、`en.lproj` 的 `Localizable.strings`。
- **对局界面 UI 优化**：在 `PoolPokerWatchApp.swift` 中调整当前玩家名展示逻辑，对局中（`case .playing`）不再在击球顺序上方重复渲染玩家昵称，直接突出击球顺序条；玩家昵称仅保留在入房等待大厅。
- **验证**：`xcodebuild` watchOS Target 编译通过，`swift test --package-path apple` 单元测试通过，全量 Vitest 单元测试（122 项）通过，Husky / Biome 检查通过。

## 2026-10-15：离线蓝牙（BLE）本地版架构与 QuickJS 状态机落地

- **BLE 紧凑二进制协议设计**：在 `shared/types/bleProtocol.ts`（协议常量与接口）与 `shared/utils/bleCodec.ts`（编解码实现）定义低功耗蓝牙专有二进制报文规范。4 字节定长帧头预留协议主版本号（`0x01`）与扩展标志位；54 张扑克牌按 6-bit 映射为单字节索引，1~15 号落袋球压缩为 16-bit 位图；下行状态帧从原 2.5KB+ JSON 压缩至 26~45 字节，单次 BLE Notify 瞬间到达，杜绝分包与延迟。
- **核心状态机同构化脱耦**：提取无依赖的跨平台 CSPRNG 随机数工具 `shared/utils/crypto.ts`；解除 `gameEngine.ts` 对企微推送模块的静态耦合，改用事件侦听钩子；创建 `shared/engine/isomorphicEngine.ts` 并通过 `esbuild` 编译出自包含单文件产物 `src-tauri/engine.bundle.js`（体积仅 14KB）。
- **Rust 内嵌 QuickJS 状态机**：在 `src-tauri/Cargo.toml` 引入纯 C 编译轻量 JS 引擎 `rquickjs = "0.9"`；实现 `LocalGameEngine`（`src-tauri/src/engine_bridge.rs`），支持在 Rust 后台调度 QuickJS 状态机完成建房、发牌、打牌、消除、撤回及紧凑二进制切片导出（执行耗时 0.01s，内存消耗 < 3MB）。
- **Tauri 原生命令与前端虚拟 Socket**：在 `src-tauri/src/lib.rs` 引入 `BleAppState` 及 `ble_start_host` / `ble_connect_host` / `ble_send_action` 命令；前端编写 `src/services/bleTransport.ts` 模拟 Socket.IO 协议契约；在 `useSocket` 与 `RoomLobby.vue` 中集成「离线蓝牙对战模式」开关与状态展示，实现上层 Vue 组件对底层连接通道的无感切换。
- **全量测试与验证**：新增 `bleCodec.spec.ts`、`isomorphicEngine.spec.ts`、`bleTransport.spec.ts`；Vitest 单元测试增至 131 项全绿通过；Rust `engine_bridge` 单元测试通过；Biome lint / format 零报错；`vue-tsc` 类型检查与 Vite 生产打包通过。

## 2026-10-16：离线蓝牙本地版 CodeReview 7 项缺陷修复与系统级加固

针对自动化 CodeReview 提出的 7 个问题（6 个 P1、1 个 P2），逐项复现、根因排查并完成闭环修复与系统级验证：

1. **[P1] 建房后无法识别自己和房主**：
   - *根因*：BLE 紧凑状态序列化时为压缩体积将 `userId` 替换为了单字节哈希 `userIdHash`，客户端无法还原真实 `userId`，导致前端 `myInfo`/`isHost` 判断和手牌过滤失败。
   - *修复*：在 `BleRoomState` 增加 `selfSeatIndex` 与 `hostSeatIndex` 字段；`isomorphicEngine.ts` 在导出下行状态帧时计算精准席位索引；`bleStateToClientRoom` 在反序列化时将接收者本人准确还原为真实的 `selfUserId`、将房主席位还原为真实 `hostUserId` 并设 `isHost: true`。同时保留单字节传输效率。
2. **[P1] Socket 接口不完整**：
   - *根因*：`BleTransport` 缺少 `connect()`、`disconnect()`、`timeout()` 链式调用方法；`emit()` 未执行传入的操作回调（如 `create_room`、`pocket_ball` 等），导致上层 `useGameRoom.ts` 的 `pendingAction` 阻塞卡死。
   - *修复*：`BleTransport` 完整补齐 `connect()`、`disconnect()`、`timeout(ms)` 方法，并规范触发 `callback({ success: true, ... })`，在建房、加房、出牌等全部动作后平稳释放前端锁状态。
3. **[P1] 出牌无法生效**：
   - *根因*：前端 `useGameRoom` 出牌传的是 `{ cardId: card.id }`，而底层 BLE 协议只定义了 `ballNumber`，Rust 桥接层固定传递空 `cardId`，引擎判定找不到卡牌拒绝操作；且缺少点球、裁判罚牌、修改设置、踢人等完整事件分发。
   - *修复*：`server/gameRoomService.ts` 扩展 `pocketBall`，支持通过 `cardId`、`cardIndex`、`ballNumber` 三重定位手牌；`BleTransport` 在出牌时智能从手牌中解析出 `ballNumber` 与 `cardIndex` 并透传 `cardId`；`src-tauri/src/lib.rs` 补齐 `card_id`、`target_user_id` 等完整参数映射，支持 11 类完整指令。
4. **[P1] 蓝牙联机尚未实现**：
   - *根因*：`ble_connect_host` 原实现仅返回成功标志，没有将客端加入引擎房间玩家列表，导致主客无法联机同步。
   - *修复*：在 `LocalGameEngine` 增加 `add_player(&self, user_id, name)` 方法；`ble_connect_host` 成功时自动将新玩家注册入局，并通过 `ble://state_updated` 及时向前端推送最新对局状态。
5. **[P1] 全新检出无法构建原生应用**：
   - *根因*：`engine.bundle.js` 被放入 `.gitignore`，干净仓库全新 `git clone` 检出后没有编译好的 bundle，导致 `cargo build` 找不到内嵌文件而失败。
   - *修复*：从 `.gitignore` 移除 `src-tauri/engine.bundle.js` 纳入版本追踪；`package.json` 的 `build` 脚本前置追加 `pnpm run build:engine`；`src-tauri/build.rs` 增加 fallback stub 保底生成机制，双重确保首次构建零配置通过。
6. **[P1] QuickJS 洗牌退化成非安全随机数**：
   - *根因*：QuickJS 默认没有系统级 Web Crypto API，代码在没有 `globalThis.crypto` 时会退化走 `Math.random()`，违反项目关于洗牌/随机数强制使用 CSPRNG 的核心铁律。
   - *修复*：在 `src-tauri/Cargo.toml` 引入 `getrandom = "0.2"`；在 `engine_bridge.rs` 初始化 QuickJS 上下文时，向全局注入原生的 `globalThis.__nativeGetRandom` 及符合 Web Crypto 标准的 `globalThis.crypto.getRandomValues`，底层直接调用 OS 系统级安全随机源，彻底杜绝随机退化风险。
7. **[P2] 撤回与结算状态不完整**：
   - *根因*：`BleRoomState` 缺少 `lastActionText`、`pocketedCards` 以及单局得分变化 `roundScoreDelta`，导致前端撤回按钮不可用、结算弹窗得分丢失。
   - *修复*：在紧凑协议中增加落袋牌列表（单字节长度 + 6-bit 索引）、结算分差及变长 `lastActionText` 字段；`isomorphicEngine.ts` 和 `bleStateToClientRoom` 完整打通序列化/反序列化链路，精确还原落袋卡牌、当局结算分及操作日志。

- **验证结果**：
  - `cargo test --manifest-path src-tauri/Cargo.toml`：QuickJS 状态机测试通过；
  - `pnpm run test:unit`：17 个测试文件、133 个单元测试全量通过；
  - `pnpm run lint`：Biome 代码规范检查 0 错误；
  - `pnpm run build`：`vue-tsc` 类型检查与 Vite 生产构建顺利通过。

## 2026-10-16：离线本地版 CodeReview 复审 8 项缺陷闭环加固

针对复审提出的 8 项问题（4 项 P1、4 项 P2），完成全量根因排查、代码修复与单测覆盖：

1. **[P1] QuickJS 缺少 UTF-8 编码支持**：
   - *修复*：在 `shared/utils/bleCodec.ts` 实现纯 JS 无依赖的 `utf8Encode` 与 `utf8Decode`，并向 QuickJS 全局运行时注入 `TextEncoder`/`TextDecoder` polyfills；在 `engine_bridge.rs` 中增加单测验证出牌与罚牌后 `get_ble_binary_state` 正常序列化带 Emoji 及中文的 `lastActionText`。
2. **[P1] 随机数组填充方式导致洗牌有偏**：
   - *修复*：修正 `src-tauri/src/engine_bridge.rs` 中的 `crypto.getRandomValues`，由 `arr.length` 改为 `arr.byteLength` 获取系统级随机字节，并通过 `new Uint8Array(arr.buffer, arr.byteOffset || 0, byteLength)` 映射写入底座缓冲区；在 Rust 单测中验证 `Uint32Array(50)` 填充均布且无 8-bit 截断。
3. **[P1] 加入房间未连接远端房主**：
   - *修复*：在 `src-tauri/src/lib.rs` 中，`ble_connect_host` 发现本机没有运行 Host 时明确返回明确的中文错误信息（避免“假成功”）；在 `RoomLobby.vue` 中对离线蓝牙模式提供引导，明确提示当前离线对局由本机创建开局，跨设备蓝牙扫描从机功能适配中。
4. **[P1] 未知用户查询泄露房主手牌**：
   - *修复*：`shared/engine/isomorphicEngine.ts` 中 `getLocalBleState` 对查找不到的 `userId` 标记席位为 `0xff`，手牌固定返回 `[]`，严格杜绝 `Math.max(0, -1)` 回退到席位 0 泄露房主手牌。
5. **[P2] 点击指定卡牌误消同球号其他卡牌**：
   - *修复*：`server/gameRoomService.ts` 中的 `pocketBall` 调整匹配优先级：优先根据 `cardId` 或 `cmdCardIndex` 精确匹配卡牌；仅在缺少精确标识时才以 `ballNumber` 回退。新增单测验证手牌同时有 ♠A 与 ♥A 时精确消除 ♥A。
6. **[P2] 发牌设置上下行字段未打通**：
   - *修复*：`BleTransport.ts` 中读取 `payload?.settings?.cardsPerPlayer ?? payload?.cardsPerPlayer`；并在 `BleRoomState` 头部字节 3 编码 `cardsPerPlayer`，在 `bleStateToClientRoom` 中动态还原 `settings.cardsPerPlayer`。
7. **[P2] `rejoin_room` 未实现却返回成功**：
   - *修复*：在 Tauri 原生端新增 `ble_rejoin_room` 命令，当存在对应本地房间时返回最新状态；`BleTransport` 实现 `rejoin_room` 处理，成功时反序列化状态并分发 `room_updated`，失败时明确回调错误并清理缓存。
8. **[P2] 缺少引擎产物时生成假实现**：
   - *修复*：彻底移除 `src-tauri/build.rs` 的假桩生成逻辑；当缺失 `engine.bundle.js` 时尝试自动运行 `pnpm run build:engine`，若依然失败则直接 `panic!` 终止编译并给出清晰的操作指引，杜绝生成可安装但无法对局的残废包。

- **复审验收**：
  - `cargo test --manifest-path src-tauri/Cargo.toml`：2/2 项测试全部通过（包含 32-bit CSPRNG 及 UTF-8 导出测试）；
  - `pnpm run test:unit`：17 个测试文件、138 项测试全量通过；
  - `pnpm run lint`：Biome 零报错；
  - `pnpm run build`：真实引擎 bundle 构建、`vue-tsc` 类型检查、Vite 生产构建全绿通过。

## 2026-10-17：离线蓝牙面对面联机重构【阶段一】— 剥离 QuickJS，状态机前端化与 SSOT 契约规范

面向“无需网络，多部手机通过蓝牙面对面联机”目标，对单机版实施阶段一核心架构重构与瘦身：

1. **架构瘦身与隐患清除（剥离 QuickJS）**：
   - 从 `src-tauri/Cargo.toml` 彻底移除 `rquickjs` 与 `getrandom` 依赖；
   - 彻底删除 `src-tauri/src/engine_bridge.rs`（彻底消除 `unsafe impl Send` 跨线程 UB 崩溃风险）；
   - 删除 `src-tauri/engine.bundle.js`，恢复 `src-tauri/build.rs` 为标准简洁构建，包体积减少 3MB，Rust 编译耗时由 1 分钟降至 4 秒。
2. **纯前端权威状态机（LocalHostEngine）**：
   - 新增 `src/services/localHostEngine.ts`，直接在前端 Webview（原生 V8/JSC 宿主）运行同构状态机，零 IPC 开销，原生支持 Web Crypto 与标准字符串处理；
   - 重构 `src/services/bleTransport.ts`，房主模式下直接绑定本地状态机，完整支持开局、出牌、罚牌、撤回、裁判操作与断线重连；
   - 新增 `src/__tests__/localHostEngine.spec.ts` 专用单元测试，全生命周期端到端覆盖。
3. **SSOT 契约规范化**：
   - 新增 `shared/schemas/ble.schema.json`，将 BLE Wire Models 纳入单一事实来源；
   - 执行 `codegen:models` 自动同步生成 TypeScript、Kotlin、Swift 三端线上传输数据模型，为 iOS/Android 手机及穿戴设备蓝牙直连预留统一规范。
4. **全量构建与测试验证**：
   - `cargo test --manifest-path src-tauri/Cargo.toml`：编译通过，0 错误；
   - `pnpm run test:unit`：18 个测试文件、139 项单元测试全量通过；
   - `pnpm run codegen:check`：三端 wire models 一致性检查全绿；
   - `pnpm run lint`：Biome 零错误零警告；
   - `pnpm run build`：`vue-tsc` 类型检查与 Vite 生产构建顺利通过。

## 2026-10-17：离线蓝牙面对面联机重构【阶段二】— 移动端双平台（Android/iOS）物理 BLE 驱动与近场雷达扫房落地

在阶段一架构瘦身与状态机前端化的坚实基础上，全量落地面向多部手机面对面射频联机的跨平台原生 BLE 驱动：

1. **Android 原生 BLE 驱动栈（`BleMeshManager.kt`）**：
   - **外设模式（房主）**：使用 `BluetoothLeAdvertiser` + `BluetoothGattServer`，广播 Service UUID（`0000a848-...`）并在广播包 ServiceData 编码 4 位房间码；建立 Command 特征值（支持客户端无响应快速写入）与 State 特征值（支持 CCCD 订阅与 Notify 广播）；
   - **中心模式（客端）**：使用 `BluetoothLeScanner` 配合硬件过滤扫描附近 PoolPoker 桌台；连接后自动协商 256 字节 MTU 并订阅状态更新；
   - **权限完备**：在 `AndroidManifest.xml` 与 `MainActivity.kt` 补齐 Android 12+ `BLUETOOTH_ADVERTISE`、`BLUETOOTH_SCAN`、`BLUETOOTH_CONNECT` 运行时权限。
2. **iOS 原生 CoreBluetooth 驱动栈（`BleMeshBridge.swift`）**：
   - **外设模式**：基于 `CBPeripheralManager` 实现前台 GATT 外设广播与客户端指令接收，通过 `updateValue` 推送脱敏对局帧；
   - **中心模式**：基于 `CBCentralManager` + `CBPeripheralDelegate` 实现桌台近场探测与特征值订阅，通过 C-ABI 与 Rust 桥接；
   - **权限声明**：在 `apple/project.yml` 与 `apple/poolpoker_iOS/Info.plist` 注入 `NSBluetoothAlwaysUsageDescription` 与 `NSBluetoothPeripheralUsageDescription`。
3. **Rust 跨平台字节管道（`src-tauri/src/lib.rs`）**：
   - 暴露 8 项统一切面 Tauri 命令（`ble_start_advertising`, `ble_stop_advertising`, `ble_start_scanning`, `ble_stop_scanning`, `ble_connect_peripheral`, `ble_disconnect_peripheral`, `ble_send_command_to_host`, `ble_notify_state_to_clients`）；
   - 双向中继 JNI（Android）与 C-ABI（iOS）事件到前端 `ble://*` 通道，提供非移动端/测试环境的安全回退。
4. **近场蓝牙雷达与 UI 交互升级（`BleScanner.ts` & `RoomLobby.vue`）**：
   - 封装近场蓝牙扫描服务 `BleScanner`，实时探测周围桌台、解析房间码、按信号强度（RSSI）倒序排列；
   - 在 `RoomLobby.vue` 加入炫酷的近场雷达动效与桌台列表卡片，支持免输 IP/无需配对“一键加入”；
   - 编写 `src/__tests__/bleScanner.spec.ts` 单元测试，全生命周期端到端覆盖。
## 2026-10-17：离线面对面联机自动化 CodeReview 专项修复（6 项 P1 级缺陷彻底闭环）

针对自动化审查指出的 6 项阻塞多机面对面蓝牙对局的关键缺陷，实施全面闭环修复与多平台端到端交叉验证：

1. **[P1-1] 修复雷达扫描列表“一键加入”无法触发蓝牙连接**：
   - `src/services/bleTransport.ts` 中 `join_room` 兼容提取 `payload?.deviceId || payload?.discoverySource?.deviceId`，与 `RoomLobby.vue` / `useGameRoom.ts` 的入参结构完全统一；新增覆盖该链路的自动化单元测试。
2. **[P1-2] 消除私有手牌广播与席位错乱（实现定向 Unicast）**：
   - 房主 `BleTransport` 建立 `peerId <-> userId` 映射表，在 `setStateUpdateCallback` 中严格隔离：房主本人状态仅更新本地视图，严禁下发给蓝牙从机；对于客机玩家，定向解析其蓝牙 `targetPeerId` 并单发。
   - Rust 跨平台中继 `ble_notify_state_to_clients` 支持可选 `target_peer_id: Option<String>` 参数；
   - Android 原生 `BleMeshManager.kt` 与 iOS `BleMeshBridge.swift` 增加 `targetAddress` / `targetPeerId` 硬件级连接过滤，实现真正的点对点状态推送，彻底杜绝手牌串牌与错乱。
3. **[P1-3] 解决客人加入/离线后房主界面不刷新人数**：
   - `src/services/localHostEngine.ts` 中的 `addPlayer` 与 `setPlayerOffline` 改为调用 `this.broadcastAll()`，使得房主及全体玩家的脱敏视图与席位状态在花名册变动时实时响应并同步更新；新增单元测试验证双端通知。
4. **[P1-4] 补齐 iOS 房主客机订阅与连接/断开事件中继**：
   - `BleMeshBridge.swift` 补充 `CBPeripheralManagerDelegate` 的 `didSubscribeTo` 与 `didUnsubscribeFrom` 特征值订阅回调，记录 `subscribedCentrals: [UUID: CBCentral]`；
   - 对接新增的 C-ABI `poolpoker_on_ble_client_connected` 与 `poolpoker_on_ble_client_disconnected`，将客机入席事件派发至 Rust 并发射 `ble://client_connected` 与 `ble://client_disconnected` 事件，打通客人进入 iOS 房主房间的生命周期。
5. **[P1-5] 修复 JNI 0.21 API 签名与 Android 跨平台编译阻断**：
   - `src-tauri/src/lib.rs` 中 Android JNI 回调修正为 `payload: jni::objects::JByteArray` 及 `&payload` 借用，并按需显式指定 `mut env: jni::JNIEnv`；
   - 修复 iOS 字符串传参所有权 move 告警；
   - 启用本地 Android NDK (`aarch64-linux-android`) 及 iOS SDK (`aarch64-apple-ios`) 执行真实 Rust 跨平台目标交叉编译验证，确保零编译错误。
6. **[P1-6] 修复 iOS 首次进入雷达扫描时请求丢失**：
   - `BleMeshBridge.swift` 增加 `isScanning` 意图标记；
   - 在 `centralManagerDidUpdateState` 检测到 CoreBluetooth 状态从未就绪就绪为 `.poweredOn` 时，自动恢复并执行扫描任务，彻底解决首屏雷达无响应问题。

## 2026-10-17：离线面对面联机自动化 CodeReview 第二轮深化修复（5 项隐患闭环）

针对自动化审查第二轮指出的 5 项关于真实多手机交互边界的隐患，全量落实针对性修复与自动化验证：

1. **[P1-1] Android 客机首次入席初始状态防丢（绑定 CCCD 描述符完成时机）**：
   - 之前在 `BluetoothProfile.STATE_CONNECTED` 时立即调用 `notifyNativeClientConnected`，而此时 Central 尚未发现服务和写入 CCCD 开启通知，导致下发的初始状态帧被物理层丢弃，客机可能长期停留在空桌台状态；
   - 现调整为在 `onDescriptorWriteRequest` 中，当客户端成功写入 CCCD (`ENABLE_NOTIFICATION_VALUE`) 时再触发 `notifyNativeClientConnected`，确保 Central 准备就绪后第一时间收到个性化手牌与桌台状态。
2. **[P1-2] iOS 客机断开时防止私有手牌误广播泄露**：
   - `BleMeshBridge.swift` 的 `notifyClients(data, targetPeerId)` 在传入目标 Central 但该 Central 已断开/找不到时，之前会退回全员广播分支，导致其他在线客机误收到该离线玩家的手牌；
   - 修复为：只要显式传入了 `targetPeerId`，若找不到目标设备则立即丢弃并返回，绝不降级为全员广播。
3. **[P2-3] 客机为他人代记进球／罚牌准确解析目标玩家**：
   - 在 SSOT `ble.schema.json`、`bleProtocol.ts` 的 `CLIENT_ACTION` 二进制报文（第 7 字节）编码 `targetSeatIndex`；
   - 客机前端根据 `cachedRoom.players` 精准计算并编码目标席位；
   - 房主 `LocalHostEngine.executeBinaryAction` 优先通过 `action.targetSeatIndex` 还原目标玩家 `userId`，彻底解决客机代记罚牌反向罚自己手牌的问题。
4. **[P1-4] 彻底打通“离开房间”生命周期清理**：
   - `BleTransport.ts` 补齐 `leave_room` 事件拦截：房主退出时立即调用 `ble_stop_advertising` 停止外设广播并销毁本地单例引擎 `resetSharedHostEngine()`；客机退出时立即调用 `ble_disconnect_peripheral` 切断蓝牙连接；双端均清除缓存与映射。
5. **[P2-5] 真实客机 WebView 刷新后通过蓝牙重新恢复房间**：
   - 客机在 `join_room` 连接成功后将 `deviceId` 持久化；
   - `rejoin_room` 在非房主节点（无本地状态机）时，自动提取上次连接的 `deviceId` 重新发起物理蓝牙连接并恢复会话，彻底消除“本地房间已解散或不存在”的误报拦截。

**全量验收验证结果**：
- `pnpm run test:unit`：19 个测试套件，**146 项测试全部通过**（新增代记罚牌席位映射、leave_room 物理清理、客机断线重连等用例）；
- `cargo check --target aarch64-linux-android --manifest-path src-tauri/Cargo.toml`：Android 交叉编译通过；
- `cargo check --target aarch64-apple-ios --manifest-path src-tauri/Cargo.toml`：iOS 交叉编译通过；
- `cargo check --manifest-path src-tauri/Cargo.toml`：桌面端 macOS 编译通过；
- `pnpm run codegen:check`：跨平台 SSOT 规范校验通过；
- `pnpm run lint`：Biome 零报错；
- `pnpm run build`：Vite + `vue-tsc` 生产构建成功通过。

## 2026-10-17：离线面对面联机自动化 CodeReview 第三轮深化修复（5 项缺陷彻底闭环）

针对自动化审查第三轮指出的 5 项缺陷（3 项 P1、2 项 P2），全量落实针对性修复、工程同步与自动化验证：

1. **[P1-1] 新增 Swift 蓝牙桥加入已提交的 Xcode 工程**：
   - 运行 `xcodegen generate`，更新并同步提交 `apple/poolpoker.xcodeproj/project.pbxproj`；
   - `BleMeshBridge.swift` 现已正式纳入 `PBXBuildFile`、`PBXFileReference` 及 `Sources` 编译阶段，iOS 原生构建与 Rust C-ABI 链接畅通无阻。
2. **[P1-2] iOS 冷启动客机重连外设恢复机制**：
   - 修复 `BleMeshBridge.swift` 仅依赖内存 `discoveredPeripherals` 的问题；
   - 引入 `pendingConnectIdentifier` 与状态保护，调用 `connectPeripheral` 时即刻确保 `setupManagers()` 唤起中心管理器；
   - 优先查内存字典；内存无命中时通过 `centralManager.retrievePeripherals(withIdentifiers: [uuid])` 唤醒 iOS 系统记忆外设并连接；若系统未缓存则自动发起针对 `POOLPOKER_SERVICE_UUID` 的扫描，并在 `didDiscover` / `didUpdateState` 检测到目标后自动连接，打通冷启动重连链路。
3. **[P1-3] 客机处理与房主物理断线事件**：
   - `BleTransport.ts` 在初始化时新增监听原生 `ble://peripheral_disconnected` 事件；
   - 非房主客机断开时立即将 `this.connected` 标记为 `false`，并广播 `disconnect`（`transport close`）；
   - 在游戏指令下发前检查 `this.connected`，断开时直接回调明确的中文断线错误，阻止向已断开通道静默发包及误报成功。
4. **[P2-4] 房主 Transport 恢复后恢复 isHost、状态广播与指令直通**：
   - 修复 `BleTransport.ts` 中 `rejoin_room` 房主恢复分支的缺陷：新实例完整恢复 `this.isHost = true`、`this.connected = true`、`this.currentRoomCode = roomCode`；
   - 重新向 `LocalHostEngine` 注册 `setStateUpdateCallback` 定向推送回调；
   - 重新触发 `ble_start_advertising` 恢复广播。后续房主交互指令（如罚牌、出牌）直接由本地权威状态机执行并刷新视图（手牌从 5 张准确增加至 6 张）。
5. **[P2-5] 退出房间后严格丢弃迟到在途状态包**：
   - 在 `BleTransport.ts` 的 `ble://state_received` 与 `handleIncomingState` 增加双重守卫校验：仅在 `!this.isHost && this.connected && this.currentRoomCode` 时才解析与分发状态；
   - `leave_room` 时立即将 `this.currentRoomCode` 清空为 `''`、`this.connected = false`、`this.cachedRoom = null`，网络栈或蓝牙队列中残留的迟到包被彻底静默过滤，彻底解决已退房用户被重新拉回空房间的闪烁问题。

**本轮全量验证结果**：
- `pnpm run test:unit`：19 个测试套件，**149 项测试全部通过**（新增客机物理断线拦截、房主重连状态与回调恢复、退房后丢弃在途包 3 项端到端单测）；
- `cargo check --target aarch64-linux-android --manifest-path src-tauri/Cargo.toml`：Android 交叉编译零错误；
- `cargo check --target aarch64-apple-ios --manifest-path src-tauri/Cargo.toml`：iOS 交叉编译零错误；
- `cargo check --manifest-path src-tauri/Cargo.toml`：macOS 原生 Rust 零错误；
- `pnpm run codegen:check`：跨平台 SSOT 契约一致性通过；
- `pnpm run lint`：Biome 零报错；
- `pnpm run build`：Vite + `vue-tsc` 生产构建成功。

## 2026-10-17：离线面对面联机自动化 CodeReview 第四轮深化修复（2 项阻断缺陷闭环）

针对自动化审查第四轮复现的 2 项阻断缺陷，完成闭环排查与针对性修复：

1. **[P1-1] 退出或断线后 `connect()` 恢复连接通道**：
   - *根因*：`BleTransport.ts` 的 `connect()` 原先只调用 `init()`；由于 `initialized` 在初次启动后即为 `true`，`init()` 遇到前置保护直接返回，未能将 `connected` 恢复为 `true`；且 `leave_room` 将 `connected` 置为 `false` 后导致大厅界面中的“一键加入”持续触发 `尚未连接服务器` 拦截。
   - *修复*：
     - 重构 `connect()` 方法：显式设置 `this.connected = true`，并在从非连接状态切回时规范发射 `'connect'` 本地事件；
     - 明确 `leave_room` 语义：退房仅退出当局游戏并切断与该桌台的蓝牙链路（`connectedDeviceId = null`、`currentRoomCode = ''`），而客户端底座 Transport 保持可用状态（`connected = true`），玩家在大厅中可无阻碍点击重新建房或加入新桌台；
     - 增加单元测试，验证 `leave_room → connect()` 与 `peripheral_disconnected → connect()` 均可靠保持/恢复 `connected: true`。
2. **[P1-2] 物理连接成功事件与会话恢复彻底解耦（杜绝重复 GATT 连接与句柄覆盖）**：
   - *根因*：收到 `ble://peripheral_connected` 原生事件时发射了 `'connect'`，触发 `useGameRoom.ts` 的 `handleConnect` 监听自动调用 `rejoin_room`；而 `rejoin_room` 未检查当前物理连接状态，盲目再次调用 `ble_connect_peripheral`，导致 Android 原生层在已有活跃 GATT 连接的情况下再次调用 `connectGatt` 覆盖句柄。
   - *修复*：
     - **TS 虚拟传输层**：`BleTransport.ts` 引入 `connectedDeviceId` 追踪当前物理连接的设备 ID；`ble://peripheral_connected` 仅维护物理链路状态，严禁在此发射 `'connect'` 事件，彻底切断连环触发回路；
     - **业务会话层**：`join_room` 与 `rejoin_room` 增加物理连接复用校验：当已与目标外设建立物理连接时，直接复用当前 GATT 通道恢复房间状态，不再调用 `ble_connect_peripheral`；
     - **原生驱动层双重防重**：
       - Android `BleMeshManager.kt`：在 `connectPeripheral` 中比对 `clientGatt?.device?.address`，若已在连接或已连接则直接复用，防止重复创建 GATT 客户端；
       - iOS `BleMeshBridge.swift`：在 `performConnect` 中比对 `connectedPeripheral?.state`（`.connected` 或 `.connecting`），跳过重复请求；
     - 新增单元测试，模拟注入物理连接就绪事件，断言不触发 `'connect'` 且 `rejoin_room` 零额外原生连接调用。

**本轮全量验证结果**：
- `pnpm run test:unit`：19 个测试套件，**151 项测试全量通过**；
- `cargo check --target aarch64-linux-android --manifest-path src-tauri/Cargo.toml`：Android 交叉编译零错误；
- `cargo check --target aarch64-apple-ios --manifest-path src-tauri/Cargo.toml`：iOS 交叉编译零错误；
- `pnpm run codegen:check`：跨平台 SSOT 契约一致性通过；
- `pnpm run lint`：Biome 零报错；
- `pnpm run build`：Vite + `vue-tsc` 生产构建成功。

## 2026-10-18：BLE 面对面离线联机全量工程审查、去冗余重构与架构文档沉淀（`34e42a5^..e65259d`）

针对 `34e42a5^..e65259d` 提交区间引入的“无需服务器蓝牙面对面联机”特性，进行系统性架构审查、冗余清理、边界缺陷修复与技术文档沉淀：

1. **清理历史方案遗留与跨层冗余**：
   - **移除废弃的 JSON Schema 与生成模型**：删除从未在业务代码中引用的 `shared/schemas/ble.schema.json`，重新执行 `pnpm run codegen:models`，从 TypeScript (`wire-models.ts`)、Kotlin (`WireModels.kt`) 与 Swift (`WireModels.swift`) 中清理约 350 行死代码（`BleWire*`），使二进制协议单一事实来源收敛至 `shared/types/bleProtocol.ts` 与 `shared/utils/bleCodec.ts`。
   - **消除 `shared -> server` 反向依赖**：将 `shared/engine/isomorphicEngine.ts` 内联整合进 `src/services/localHostEngine.ts`（并将对应单测合并至 `src/__tests__/localHostEngine.spec.ts`），消除包装层冗余。
   - **清理配置与类型残留**：移除 `biome.json` 中废弃的 `!!**/src-tauri/engine.bundle.js` 忽略规则；清理 `shared/types/socket.ts` 中残留的 `avatar?: string` 字段；恢复 `apple/project.yml` 与 `apple/poolpoker_iOS/Info.plist` 中的 `UILaunchScreen -> UIColorName: LaunchBackgroundColor` 配置以防 iOS 冷启动白屏闪烁。
2. **简化房主本地执行路径与加固二进制协议边界**：
   - **房主本地零拷贝直通**：在 `LocalHostEngine` 中新增 `getDirectClientRoom(userId)` 与 `executeAction(action, ...)`，房主自身状态更新直接构造无损 `Room` 视图（完整保留 15 条日志、真实卡牌 ID 与玩家身份），跳过不必要的 `encodeBleRoomState -> decodeBleRoomState` 与 `encodeBleAction -> decodeBleAction` 二进制编解码自环。
   - **扑克牌解码元数据对齐**：修正 `shared/utils/bleCodec.ts` 中的 `indexToCard`，默认生成 `c_1..c_54` 卡牌 ID，并将大小王花色与颜色（小王 `gray`、大王 `👑`/`gold`）与 `server/pokerDeck.ts` 完全对齐。
   - **UTF-8 字节截断防溢出**：使用原生 `TextEncoder`/`TextDecoder` 替代手写 UTF-8 编解码循环，新增 `truncateUtf8Bytes` 对 `lastActionText`（`<= 180` 字节）和玩家昵称（`<= 48` 字节）在写入单字节长度头前进行安全截断，杜绝超长中文日志导致 `uint8` 长度回绕损坏包体。
3. **修复 BLE 扫描、会话与原生层物理时序竞态**：
   - **扫描列表过期淘汰**：在 `src/services/bleScanner.ts` 增加 12 秒 TTL 过期清理机制（`evictStaleRooms`），自动移除已关房或离开范围的蓝牙桌台。
   - **弹窗去重与会话隔离**：`BleTransport` 收到 `JOIN_REJECTED_FULL` / `JOIN_REJECTED_PLAYING` 时通过 `room_kicked` 携带 `reason` 触发单次提示，避免连续弹出两次原生 Alert；严格收紧 `join_room`（仅在 `!deviceId && sharedHostEngine?.getRawRoom()?.code === roomCode`）与 `rejoin_room`（校验 `hostUserId === targetUserId`）的同机沙盒条件；`toggleBleOfflineMode` 切换时清理残留房间凭证并在离线模式下跳过手表 `room_credentials` 同步。
   - **Android & iOS 原生 GATT 订阅与写流控加固**：
     - Android (`BleMeshManager.kt`) 将 `notifyNativePeripheralConnected` 延后至 `onDescriptorWrite`（CCCD 订阅完成）后触发；
     - iOS (`BleMeshBridge.swift`) 实现 `peripheral(_:didUpdateNotificationStateFor:error:)` 确保订阅就绪后再通知连接成功，增加 `canSendWriteWithoutResponse` + `peripheralIsReady(toSendWriteWithoutResponse:)` 写流控防止多片 `CLIENT_JOIN` 握手丢包，并开启 `CBCentralManagerScanOptionAllowDuplicatesKey: true` 配合 1.5s 节流支持动态 RSSI 与房间号刷新。
4. **架构文档沉淀**：
   - 新增 [`docs/ble_offline_architecture.md`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/docs/ble_offline_architecture.md) 完整记录离线 BLE 架构、GATT UUID、二进制帧格式、分片重组及状态机，并在 `AGENTS.md` 中建立索引。


## 2026-10-22：Android release 离线模式权限循环退出修复

- 真机系统日志显示定位权限 Activity 反复启动，系统记录 `rapidActivityLaunch`，对应应用退出记录为 `EXIT_SELF`、status 0。
- BLE 虚拟 Socket 被在线附近发现当作在线连接，导致离线模式仍申请定位。`App.vue` 使用计算属性 `onlineSocket`，BLE 模式传入 `null`，复用 `useNearbyRooms` 已有的空 Socket 判断和清理流程；恢复在线后自动重新发现。
- 改动仅隔离调用入口，保留原有重试行为和 composable 接口。Manifest 移除精确定位的 API 30 上限并补齐粗略定位，支持现代 Android 上的在线附近发现；声明权限本身不触发授权弹窗。
- 回归覆盖无在线 Socket 时不启动、在线/离线切换清理与恢复、离线 Socket 更新。尚未重新打包安装 release APK 做修复后真机验证。

### 第39轮：BLE 离线面对面联机 CRDT 事件溯源重构与多端交替锁屏记牌修复 [2026-10-22]
- **输入**：用户反馈“房主锁屏后，在另一台设备上尝试记牌没有任何反应”，以及真实线下场景诉求——房主开局看完手牌即长时间锁屏，其他成员交替亮屏记牌并锁屏，要求即使房主锁屏，记牌仍能正常记录且恢复后全员状态一致。
- **探索与决策**：
  1. *根因排查*：定位到 4 处硬阻塞：① `useGameRoom.ts:sendAction` 遇 `!socket.value?.connected` 截断；② `bleTransport.ts:emit` 遇 `!this.connected` 返回失败阻断且未本地处理；③ `handleIncomingState` 在非连接态拒绝派发 `room_updated`；④ 客机锁屏再亮屏时 `rejoin_room` 因底层 GATT 连不上锁屏房主返回失败，误触发 `localStorage.removeItem('billiards_room_code'); room.value = null` 将客机踢出房间。
  2. *方案抉择*：舍弃重型 Raft 动态选主与容易产生脑裂的快照二选一冲突弹窗，转向纯领域 CRDT 事件溯源与本地乐观演算方案。基于台球落袋操作的数学可交换性（$A \cup B = B \cup A$），任意成员可在离线断网状态下 0ms 乐观更新并加入持久化队列，重连后自动重放冲刷。
  3. *清理与备份*：将 1700 行暂存区 Raft 选举改动安全归档到分支 `refs/heads/backup-staged-recovery`（commit `586d00ed677a159f0e53ae0931911a4e90536267`）。
- **最终改动**：
  - `src/services/crdt/gameEvents.ts` — 新增：Mulberry32 确定性 32-bit PRNG 洗牌、Genesis 基线快照与 Lamport 全序时钟比较器。
  - `src/services/crdt/deterministicEngine.ts` — 新增：`reduceGameState` 纯函数演算器，支持无序事件去重、可交换落袋并集计算、悔球撤销与手牌脱敏。
  - `src/services/crdt/eventLogStorage.ts` — 新增：追加式离线事件日志持久化与幂等去重工具。
  - `src/services/bleTransport.ts` — 修改：
    - 新增 `applyLocalOptimisticAction`：断网状态下即刻本地计算消除手牌、标记落袋球、驱动 3D 台面动画并强制广播 `room_updated`（0ms 响应）；
    - 新增 `pendingOfflineActions`：离线操作队列同步持久化至内存与 `localStorage`；
    - 新增 `flushPendingOfflineActions`：监听到 `ble://peripheral_connected` 时自动串行重放离线动作，并在接收到权威状态后自动剪枝对齐；
    - 重构 `rejoin_room`：房主锁屏断连时自动从本地缓存恢复界面并返回成功，启动后台静默重试，绝不清空房间。
  - `src/services/localHostEngine.ts` — 修改：新增 `saveToStorage` 与 `restoreFromStorage`，支持房主端进程被杀或切回前台时无损恢复权威房间状态。
  - `src/composables/useGameRoom.ts` — 修改：
    - `sendAction` 在 BLE 离线模式下放行离线动作；
    - 接入 Web Screen WakeLock API，对局中自动阻止锁屏，切回前台（`visibilitychange`）自动重新申请锁定；
    - 优化断线提示为“房主锁屏离线中，已开启离线记牌（随时打出，碰面自动对齐）”；
    - `rejoin_room` 失败时对离线 BLE 模式增加豁免保护，保留本地房间与卡牌。
  - `src/__tests__/crdtEngine.spec.ts` — 新增：6 项 CRDT 乱序合并、重复过滤与最终一致性单测。
  - `src/__tests__/bleTransport.spec.ts` — 修改：更新断线拦截测试为离线记牌与重连自动冲刷测试，新增多端交替锁屏端到端用例。
- **验收**：
  - `pnpm run test:unit`：19 个测试套件，181 项单元测试全量通过（100% Pass）；
  - `pnpm run lint`：Biome 检查通过，0 错误 0 警告；
  - `pnpm run build`：`vue-tsc` 类型检查通过，Vite 生产构建成功。
- **commit**：`df2f338`

### 第40轮：`useGameRoom` 传输与同步策略解耦重构（策略模式） [2026-10-22]
- **输入**：用户提出 `useGameRoom.ts` 中同时维护在线 Socket 与离线 BLE 两种游玩逻辑，存在耦合分支，评估是否值得重构。
- **探索与决策**：
  1. *根因分析*：核心对局引擎、3D 台面动画与卡牌演算逻辑在在线与离线模式下 100% 共享，不应将 `useGameRoom` 拆分为两个平行的 composable；但网络拓扑语义（C/S 中心化 vs 近场 P2P 容灾）的特异行为（HTTP 快照同步与 404 清退、手表凭证同步、断线离线出牌放行、退房确认等）散落在 7 个不同函数中，破坏了 `useGameRoom` 的单一职责。
  2. *重构方案*：采用策略模式（Strategy Pattern）。提取抽象接口 `GameRoomSyncStrategy`，分别实现 `OnlineSyncStrategy`（包含 HTTP 快照、404 清退、手表凭证同步、断线重连）与 `BleOfflineSyncStrategy`（包含离线动作放行、断线保留本地手牌、离线退房确认）。
  3. *接入方式*：`useGameRoom` 面向策略接口编程，彻底清除其内部的 `isOfflineBleActive` 及硬编码 HTTP 同步逻辑。`syncStrategy` 设为**必填**选项，由唯一调用方 `App.vue` 按 `isBleOfflineMode` 组装注入——不保留「未传策略时读 `localStorage` 回退」的兼容路径，因为该路径一旦包进 `computed` 便会缓存非响应式的 `localStorage` 读取，切换离线模式后策略不再更新。
  4. *契约层次收敛*：`GameRoomStrategyContext` 中 `room` 收紧为 `Readonly<Ref<Room | null>>` 并新增 `clearRoom()` 回调，使 `useGameRoom` 重新成为房间状态的唯一变更入口，策略层任何直接写入都会被 `vue-tsc` 编译期拦下；会话存储键名提升为 `SAVED_ROOM_CODE_KEY` / `SAVED_SESSION_TOKEN_KEY` 常量，策略经 `getSavedRoomCode()` / `getSavedSessionToken()` 读取，键名知识单点化。
  5. *无状态约束*：策略单例在所有房间与调用方间共享，必须保持无状态；已在 `sync/index.ts` 注释声明，若未来需持有状态则改为工厂内 `new` 新实例。
- **最终改动**：
  - `src/composables/sync/types.ts` — 新增：策略契约 `GameRoomSyncStrategy`、`GameRoomStrategyContext`、`StrategyActionCheck` 与两个会话存储键名常量。
  - `src/composables/sync/onlineSyncStrategy.ts` — 新增：在线同步策略实现；顺带修复 `window.location.origin` 被提前求值的隐患（改为 `getOriginUrl()` 懒取并容忍宿主无 `location`）。
  - `src/composables/sync/bleSyncStrategy.ts` — 新增：BLE 离线同步策略实现，离线提示文案提取为 `OFFLINE_FEEDBACK` 常量。
  - `src/composables/sync/index.ts` — 新增：策略导出、工厂函数、`useGameRoomSyncStrategy` 与无状态约束声明。
  - `src/composables/useGameRoom.ts` — 修改：接入策略依赖注入（`syncStrategy` 必填），移除 7 处硬编码分支与内部 HTTP 逻辑，8 处 `localStorage` 字面量键名统一为常量。
  - `src/App.vue` — 修改：组装 `useGameRoomSyncStrategy(isBleOfflineMode)` 注入 `useGameRoom`。
  - `src/__tests__/gameRoomStrategy.spec.ts` — 新增：20 项针对在线与离线策略隔离行为的单元测试，覆盖 `canSendAction` / `onActionTimeout` / `fetchLatestRoomState`（含 404 清退、在途换房丢弃过期响应）/ `onRejoinFailed` / `syncNativeSession`（含 BLE 不下发在线凭证、非 Tauri 宿主跳过）/ `leaveRoom`；全局 `window` 与 `localStorage` 打桩收进 `beforeAll`/`afterAll`，避免关闭 Vitest `isolate` 后污染其他套件。
- **验收**：
  - `pnpm run test:unit`：20 个测试套件，205 项单元测试全量通过；
  - `pnpm exec vue-tsc --noEmit`：TypeScript 类型检查通过（0 错误）；
  - `pnpm run lint`：Biome 检查通过（0 错误 0 警告）。
  - **待补**：BLE 离线链路的真机/模拟器手动回归——离线模式下断开房主，确认本地房间未被清空且出现「房主锁屏离线中…」提示（该不变量位于 `useGameRoom` 接线层，单测仅覆盖策略层）。
- **commit**：`0c3b3ca`
