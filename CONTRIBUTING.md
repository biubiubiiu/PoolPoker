# 贡献与本地开发指南 (Contributing Guide)

感谢你参与 **PoolPoker（球霸扑克）** 的开发与维护！本文档提供从克隆仓库、环境准备、本地联调、跨端协议生成到提交 Pull Request 的完整操作指南。

🌐 **语言 / Language**: **简体中文** | [English](CONTRIBUTING_EN.md)

---

## 目录

1. [开发环境准备](#1-开发环境准备)
2. [快速编译与本地运行](#2-快速编译与本地运行)
3. [常用命令速查表](#3-常用命令速查表)
4. [仓库目录结构说明](#4-仓库目录结构说明)
5. [跨端数据模型生成 (JSON Schema SSOT)](#5-跨端数据模型生成-json-schema-ssot)
6. [移动端与智能手表构建](#6-移动端与智能手表构建)
7. [测试、代码规范与提交门禁](#7-测试代码规范与提交门禁)

---

## 1. 开发环境准备

### 必选基础环境（Web & 服务端开发）

- **Node.js**: `>= 24.0.0`（仓库根目录提供 `.nvmrc`，执行 `nvm use` 即可切换）
- **pnpm**: `>= 12.6.0`（项目使用 `pnpm pipeline` 任务编排器，请勿使用 `npm install` 或 `yarn`）
  ```bash
  nvm use
  corepack enable
  pnpm -v   # 确认版本 >= 12.6.0
  ```

### 可选原生工具链（仅构建 App / 手表或修改 3D 模型时需要）

| 目标平台 | 所需工具链 |
|---|---|
| **Tauri Core (`src-tauri/`)** | Rust (`rustup` & `cargo`) |
| **Android & Wear OS (`android/`)** | JDK 17+、Android Studio / SDK、NDK |
| **iOS & Apple Watch (`apple/`)** | macOS + Xcode 15+、CocoaPods / Xcode Command Line Tools |
| **3D 球台资产 (`assets/models/`)** | Git LFS (`git lfs install --local --skip-repo`) + Blender |

---

## 2. 快速编译与本地运行

### 方式一：前后端热重载开发模式（推荐日常开发）

```bash
# 1. 安装依赖
pnpm install

# 2. 同时启动 Node.js 后端 (:3000) 与 Vite 前端热重载服务 (:5173)
pnpm run dev
```

- 浏览器访问 **http://localhost:5173**（Vite 会自动将 `/socket.io` 与 `/api` 请求代理至 `http://localhost:3000`）。
- 调试多人联机：打开 2~3 个浏览器标签页或无痕窗口，输入不同昵称并加入同一个 4 位房间码即可。
- 调试双视图：点击大厅右上角的 **“新版界面”** 开关，即可在 **v2 3D 沉浸球台** 与 **v1 经典 2D 看板** 之间实时切换。

### 方式二：生产构建与一键局域网开服

```bash
# 使用一键脚本（自动检测 nvm/pnpm、构建 dist/ 并打印本机局域网 IP）
./run.sh

# 或手动构建并启动
pnpm start   # 等价于 pnpm run build && tsx server/index.ts
```

启动后服务监听在 `http://localhost:3000`（可在 [`config.yaml`](config.yaml) 中修改端口、默认发牌数及房间人数上限）。

---

## 3. 常用命令速查表

| 场景 | 命令 | 说明 |
|---|---|---|
| **同时启动前后端开发** | `pnpm run dev` | 并发运行 `dev:backend` 与 `dev:frontend` |
| **仅启动后端服务** | `pnpm run dev:backend` | `tsx watch server/index.ts`（监听 `:3000`） |
| **仅启动前端 Vite** | `pnpm run dev:frontend` | Vite HMR（监听 `:5173`） |
| **生产编译前端** | `pnpm run build` | 执行 `vue-tsc` 类型检查 + `vite build` 产出 `dist/` |
| **跨端模型代码生成** | `pnpm run codegen:models` | 从 `shared/schemas/*.json` 生成 TS / Kotlin / Swift 模型 |
| **跨端模型漂移检查** | `pnpm run codegen:check` | 校验生成代码是否与 JSON Schema 完全同步 |
| **运行单元测试** | `pnpm run test:unit` | 运行 Vitest 测试（服务端引擎、BLE 二进制协议、`LocalHostEngine`） |
| **运行端到端测试** | `pnpm run test:e2e` | 运行 Playwright 多窗口集成测试 (`e2e/poolpoker.spec.ts`) |
| **代码静态检查** | `pnpm run lint` | 运行 Biome 静态检查 |
| **代码自动格式化** | `pnpm run format` | 运行 `biome format --write .` |

---

## 4. 仓库目录结构说明

```text
PoolPoker/
├── android/                 # Android Gradle 多模块工程 (:app, :wear-app, :phone-companion, :shared-models)
├── apple/                   # iOS (Tauri) 与 Apple Watch (WatchApp/) Xcode 工程及 Swift 桥接源码
├── assets/models/           # Blender 3D 球台源文件 (billiards_table.blend, Git LFS 托管)
├── docs/                    # 架构设计、协议规范、构建流水线、专题文档与界面截图
├── e2e/                     # Playwright 端到端集成测试
├── public/                  # 静态资源与运行时 3D 球台模型 (models/billiards_table.glb)
├── scripts/                 # 跨端模型代码生成 (codegen-models.mjs) 与测试脚本
├── server/                  # Node.js + Socket.IO 权威服务端与核心领域规则引擎
├── shared/                  # 跨端共享层：JSON Schema (SSOT)、生成模型与二进制 BLE 协议编解码
├── src/                     # Vue 3 前端源码 (components/v1, components/v2, composables, services)
└── src-tauri/               # Tauri v2 Rust 核心层 (Android JNI / iOS C-ABI BLE 与手表通信插件)
```

---

## 5. 跨端数据模型生成 (JSON Schema SSOT)

`shared/schemas/` 下的 Draft-07 JSON Schema（`card.schema.json`、`room.schema.json`、`wear.schema.json`、`discovery.schema.json`）是全平台数据结构的**唯一事实来源（SSOT）**。

- **切勿直接手动修改以下自动生成的文件**：
  - `shared/types/generated/wire-models.ts`
  - `android/shared-models/src/main/java/com/poolpoker/shared/generated/WireModels.kt`
  - `apple/Shared/Generated/WireModels.swift`
- **正确的修改流程**：
  1. 编辑 `shared/schemas/*.schema.json`；
  2. 运行 `pnpm run codegen:models` 重新生成三端代码；
  3. 运行 `pnpm run codegen:check` 与 `pnpm run test:unit` 确认无误后一并提交。

---

## 6. 移动端与智能手表构建

### 6.1 iOS & Apple Watch（Xcode 直接 Run 前置要求）

`apple/poolpoker.xcodeproj` 中的 `poolpoker_iOS` Target 依赖 **Tauri v2** 与 **Rust 静态库 (`libapp.a`)**。当你在 Xcode 中直接点击 **Run (⌘R)** 时，Xcode 的 `Build Rust Code` 脚本会自动执行前端 `pnpm run build` 与 `cargo build`。

若未安装 Rust / Tauri 环境就直接在 Xcode 中点击 Run，编译会报错失败。首次在 Xcode 中运行前请先执行：

```bash
# 1. 安装 Rust 并添加 iOS 真机与模拟器编译目标
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# 2. 安装前端与 Tauri CLI 依赖并生成跨端模型 (含 WireModels.swift)
nvm use
pnpm install
pnpm run codegen:models
```

完成后即可在 Xcode 中打开 `apple/poolpoker.xcodeproj`，选择 `poolpoker_iOS` 或 `poolpoker_watchOS` 直接点击 **Run**。

### 6.2 命令行统一流水线构建 (`pnpm pipeline`)

移动端与手表端命令行构建统一通过 `pnpm pipeline` 调度（共享 `poolpoker-native` 并发锁，防止并发覆盖 `dist/`）：

```bash
# Android Debug / Release APK (需安装 JDK 17+、Android SDK/NDK 及 rustup Android targets)
pnpm pipeline android-debug --full
pnpm pipeline android-release --full

# iOS 模拟器实时调试与 Debug / Release 构建
pnpm exec tauri ios dev
pnpm pipeline ios-debug --full
pnpm pipeline ios-release --full

# Apple Watch 独立构建
pnpm pipeline watchos-debug --full
pnpm pipeline watchos-release --full

# 仅预览流水线任务图而不实际编译
pnpm pipeline ios-release --full --dry-run
```

> 需要在 Android / Wear OS 本地注入自定义默认服务器地址时，可在 `android/gradle.properties.local`（已被 Git 忽略）中配置 `POOLPOKER_SERVER_URL` 与 `POOLPOKER_WATCH_PLAYER_NAME`。详见 [移动端构建流水线文档](docs/mobile_build_pipeline.md)。

---

## 7. 测试、代码规范与提交门禁

仓库配置了 **Husky** Git Hooks，在每次 `git commit` 时会自动触发检查：

1. **`pre-commit` 钩子**：
   - 自动运行 `pnpm exec vue-tsc --noEmit`（TypeScript 类型检查）
   - 自动运行 `lint-staged`（使用 Biome 对暂存区文件执行检查与自动格式化）
2. **`commit-msg` 钩子**：
   - 使用 `commitlint` 校验提交信息，必须遵循 **Conventional Commits** 规范，例如：
     - `feat: add foul penalty sound effect`
     - `fix(ble): handle Android MTU negotiation timeout`
     - `docs: reorganize README and add CONTRIBUTING guide`
     - `refactor(server): simplify turn order rotation`
     - `test: add unit tests for combo multiplier settlement`

提交 PR 前，建议在本地运行完整检查：

```bash
pnpm run codegen:check && pnpm run lint && pnpm run test:unit
```
