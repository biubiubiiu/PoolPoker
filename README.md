<div align="center">

<h1>
  <img src="public/favicon.png" alt="PoolPoker Emblem" width="110">
  <br>
  PoolPoker · 球霸扑克
</h1>

**让每一杆台球都变成一场刺激的卡牌博弈。**

面向线下台球聚会的全平台多人卡牌对战与计分应用 —— 将 54 张扑克牌映射至 1–15 号台球，支持在线建房与无网络蓝牙面对面直连。

球牌联动 · 3D 沉浸球台 · 离线蓝牙联机 · 智能手表抬腕控局

[核心特性](#核心特性) · [界面预览](#界面预览) · [快速开始](#快速开始) · [玩法规则](#玩法规则) · [文档导航](#文档导航) · [许可证](#许可证)

**简体中文** | [English](README_EN.md)

</div>

---

## 核心特性

- **完整球牌博弈引擎** — 将整副 54 张扑克牌映射至 1–15 号台球（`A–K` 对应 `1–13` 号球，小王对应 `14` 号，大王对应 `15` 号，必含黑八）。支持开局发牌、进球销牌、免打自动置灰、犯规罚抽牌、开球进球、意外进球、裁判代记、整步快照悔球（Undo）以及同点数倍乘积分结算。
- **v2 沉浸式 3D 球台 & v1 经典双视图** — v2 视图基于 Three.js 渲染 Blender 精模六袋球台，支持高光台球、袋口入袋动画与拟真扇形手牌；v1 视图提供紧凑直观的 2D 赛况看板与实况日志，大厅与局内随时一键切换。见[界面预览](#界面预览)。
- **在线服务器 + 离线蓝牙双模联机** —
  - **在线模式**：支持 4 位数字房间码或 300 米内地理位置“面对面发现”秒级入房，基于 Socket.IO 毫秒级同步。
  - **无服务器蓝牙面对面模式（Offline BLE）**：在无网地下球房，多部 iOS/Android 手机通过低功耗蓝牙（BLE GATT 星型拓扑）直接组网，房主手机内置纯 TypeScript 权威引擎（`LocalHostEngine`），零服务器依赖。详见 [BLE 离线架构](docs/ble_offline_architecture.md)。
- **全平台原生覆盖（Web / iOS / Android / 智能手表）** — 基于 Tauri v2 封装 iOS 与 Android 原生客户端；同时提供 Jetpack Compose（`:wear-app`）与 SwiftUI（`poolpoker_watchOS`）原生手表应用，支持手机伴侣同步与手表独立直连。
- **跨端单一事实来源（SSOT）与防作弊裁剪** — 基于 Draft-07 JSON Schema 自动生成 TypeScript、Kotlin 与 Swift 数据模型；服务端与本地引擎严格按 `userId` 裁剪私有底牌（仅本人可见未打出底牌），结合 `sessionToken` 实现断线重连无损恢复手牌。

---

## 界面预览

应用支持在大厅顶部随时切换 **新版 3D 沉浸视图（v2）** 与 **经典 2D 看板视图（v1）**，适配桌面浏览器、手机端安全区（灵动岛）及智能手表圆/方表盘。

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/images/preview-entry.png" alt="房间入口与模式切换" width="280">
      <br>
      <sub><b>1. 游戏大厅入口</b><br>支持 4 位房间码、附近定位发现与在线/蓝牙离线切换</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/preview-3d-arena.png" alt="v2 3D 沉浸式球台与扇形手牌" width="280">
      <br>
      <sub><b>2. v2 沉浸式 3D 对局视图</b><br>Three.js 3D 球台、高光待打球号提示与拟真扇形手牌</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/images/preview-classic-2d.png" alt="v1 经典 2D 视图与实况日志" width="280">
      <br>
      <sub><b>3. v1 经典 2D 赛况视图</b><br>直观卡牌列表、全局选手剩余张数对比与实况日志</sub>
    </td>
  </tr>
</table>

---

## 快速开始

### 1. 环境准备

克隆仓库后运行 Web 与服务端仅需 **Node.js >= 24** 和 **pnpm >= 12.6.0**：

```bash
# 若安装了 nvm，可在仓库根目录一键切换至 .nvmrc 指定版本 (Node 24)
nvm use

# 若尚未安装 pnpm，可通过 corepack 启用
corepack enable
```

### 2. 三步启动本地开发（最常用）

在仓库根目录执行以下命令，即可同时启动后端 Socket.IO 服务（`:3000`）与前端 Vite 热重载开发服（`:5173`）：

```bash
pnpm install
pnpm run dev
```

启动后在浏览器打开 **http://localhost:5173** 即可创建房间开始对局（可开多个浏览器无痕窗口模拟多人联机）。

### 3. 一键生产构建与局域网运行

如果你想在球房用电脑开服、让朋友用手机连同一 Wi-Fi 游玩，可直接运行一键脚本：

```bash
./run.sh
# 或手动执行：
pnpm start   # 等价于 pnpm run build && tsx server/index.ts (监听 http://localhost:3000)
```

终端会自动输出本机局域网访问地址（如 `http://192.168.x.x:3000`）。端口号、默认发牌数（默认 5 张）与房间人数上限可在根目录 [`config.yaml`](config.yaml) 中修改。

### 4. 移动端与智能手表编译（iOS / Android / Watch）

#### iOS & Apple Watch（Xcode 直接 Run 或命令行构建）

`poolpoker_iOS` 目标基于 **Tauri v2 + Rust** 构建。当你在 Xcode 中打开 `apple/poolpoker.xcodeproj` 并点击 **Run (⌘R)** 时，Xcode 的 `Build Rust Code` 前置脚本会自动调用 `pnpm` 与 `cargo` 将前端 `dist/` 与 `src-tauri` 编译为静态库 `libapp.a`。

在新设备上首次编译运行，**必须配置 Rust/Tauri 环境与 Xcode 开发者签名（Development Team）**：

1. **安装 Rust 工具链与跨端依赖**：
   ```bash
   # 安装 Rust 并添加 iOS 真机与模拟器编译目标
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add aarch64-apple-ios aarch64-apple-ios-sim

   # 安装依赖并生成跨端模型 (含 WireModels.swift)
   nvm use
   pnpm install
   pnpm run codegen:models
   ```

2. **配置 Xcode 开发者签名 (`Local.xcconfig`)**：
   为避免在 Git 中提交个人证书信息或出现 `Signing for "poolpoker_iOS" requires a development team` 报错，工程采用 `Local.xcconfig` 隔离个人开发团队 ID：
   ```bash
   # 复制模板生成本地签名配置文件（已被 .gitignore 忽略）
   cp apple/Local.xcconfig.template apple/Local.xcconfig
   ```
   打开 `apple/Local.xcconfig`，填入你的 Apple Developer Team ID（10 位团队标识符，可在 [Apple Developer 账户](https://developer.apple.com/account) 的 Membership 页面查看）：
   ```xcconfig
   DEVELOPMENT_TEAM = YOUR_TEAM_ID
   ```
   > 💡 也可以在 Xcode 打开工程后，直接在 Target (`poolpoker_iOS` / `poolpoker_watchOS`) 的 **Signing & Capabilities** 页面勾选 **Automatically manage signing** 并手动选择你的 Team。

准备就绪后，你可以选择以下任一方式运行：
- **在 Xcode 中直接点击 Run**：打开 `apple/poolpoker.xcodeproj`，选择 `poolpoker_iOS`（或手表端 `poolpoker_watchOS`）Target 点击 Run 即可自动构建并启动。
- **命令行热重载与流水线打包**：
  ```bash
  pnpm exec tauri ios dev                # iOS 模拟器实时热重载调试
  pnpm pipeline ios-debug --full         # 构建 iOS Debug 包
  pnpm pipeline watchos-debug --full     # 构建 Apple Watch 模拟器包
  ```

#### Android & Wear OS

需安装 **JDK 17+**、**Android SDK / NDK** 以及 **Rust Android Targets**（`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`）：

```bash
pnpm pipeline android-debug --full     # 构建 Android Debug APK
pnpm pipeline android-release --full   # 构建 Android Release APK
```

> 完整的移动端与手表端构建任务图、真机签名及并发锁机制请参阅 [移动端构建流水线指南](docs/mobile_build_pipeline.md)。

---

## 玩法规则

| 扑克牌面 | 对应台球球号 | 基础分值 | 规则说明 |
|---|---|---|---|
| **A – K**（四花色） | **1 – 13 号球** | `2` 分 / 张 | 开局发牌保底必含 **8 号黑八** |
| **小王** (`JOKER-S`) | **14 号球** | `1` 分 / 张 | 对应 14 号彩球 |
| **大王** (`JOKER-B`) | **15 号球** | `1` 分 / 张 | 对应 15 号彩球 |

1. **销牌与免打置灰**：台球桌上每打进一颗球，持有对应点数扑克牌的玩家点击该牌即可消除；若某个球号已被其他人打进（或开球/意外落袋），你手中同球号的牌会自动变暗标为 **“已进球·无需打出”**。
2. **犯规罚牌与悔球**：母球落袋或空杆犯规时，点击“记录犯规”由牌库自动罚抽一张新牌；误点可通过“撤回”恢复上一整步快照。
3. **获胜与同点数倍乘结算**：**率先将手中未落袋的有效牌全部清空的玩家获胜**。输家按剩余有效手牌扣分，若有 $n$ 张相同点数的牌则触发倍乘（$\text{得分} = \text{基础分之和} \times n$），赢家平分输家扣除的总分。

---

## 文档导航

### 开发与构建指南

- [贡献与开发指南 (`CONTRIBUTING.md`)](CONTRIBUTING.md) — 本地环境搭建、Xcode/Android 编译前置要求、跨端模型生成、测试门禁与 PR 规范
- [移动端构建流水线 (`docs/mobile_build_pipeline.md`)](docs/mobile_build_pipeline.md) — Android / iOS / watchOS 自动化构建任务图、前置检查与并发控制
- [3D 球台资产管线 (`docs/table_asset_pipeline.md`)](docs/table_asset_pipeline.md) — Blender 源文件（Git LFS）规范、GLB 导出要求与六个 `PocketTarget_*` 袋口锚点校验

### 核心架构与协议设计

- [系统架构与工程全景 (`docs/overview.md`)](docs/overview.md) — **权威总览**：双模数据流、模块职责划分、JSON Schema SSOT、私牌防泄露裁剪与悔球快照栈
- [BLE 面对面离线联机架构 (`docs/ble_offline_architecture.md`)](docs/ble_offline_architecture.md) — 无服务器蓝牙星型拓扑、`LocalHostEngine`、GATT UUID、紧凑二进制帧格式与动态 MTU 分片状态机
- [附近房间定位发现 (`docs/nearby_room_discovery.md`)](docs/nearby_room_discovery.md) — 在线模式下基于地理位置的面对面房间发现、精度收敛策略与隐私边界

### 原生客户端与智能手表专题

- [Android & Tauri 多模块架构 (`docs/android_tauri_architecture.md`)](docs/android_tauri_architecture.md) — Android Gradle 多模块工程（`:app`、`:wear-app`、`:phone-companion`、`:shared-models`）与 DataLayer 同步
- [Wear OS 原生手表端架构 (`docs/wear_app_architecture.md`)](docs/wear_app_architecture.md) — Jetpack Compose for Wear OS 界面模块划分、直连恢复与侧滑返回（Swipe-to-Dismiss）导航规范
- [Apple Watch 原生手表端架构 (`docs/apple_watch_architecture.md`)](docs/apple_watch_architecture.md) — watchOS 10+ SwiftUI 客户端、Engine.IO 长轮询、WCSession 凭证桥接与多语言 String Catalog
- [演进与实现日志 (`docs/implement_log.md`)](docs/implement_log.md) — 按迭代轮次记录的架构决策、疑难问题排查与演进历史

---

## 许可证

[Apache License 2.0](LICENSE)
