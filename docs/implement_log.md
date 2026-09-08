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

