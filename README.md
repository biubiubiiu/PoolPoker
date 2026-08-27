# 🎱 PoolPoker · 球霸扑克

> 朋友线下打台球聚会神器 —— 基于 54 张扑克发牌与球号映射的实时对战应用！

[![Node.js](https://img.shields.io/badge/Node.js-v24-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v11-orange)](https://pnpm.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.0-emerald)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri)](https://tauri.app/)
[![iOS](https://img.shields.io/badge/iOS-App-black?logo=apple)](https://developer.apple.com/ios/)
[![Android](https://img.shields.io/badge/Android-App-green?logo=android)](https://developer.android.com/)
[![Wear OS](https://img.shields.io/badge/Wear%20OS-Compose-green)](https://developer.android.com/wear)
[![Vite](https://img.shields.io/badge/Vite-v8.2-purple)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.3-sky)](https://tailwindcss.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.7-blue)](https://socket.io/)

---

## 🌟 项目亮点

- **🃏 54 张全副扑克牌库**：包含 52 张正牌（4种花色 × A\~K）+ 小王 🃏 + 大王 👑。
- **🎱 真实球号映射**：A\~K 自动对应 1\~13 号台球，大小王对应 14、15 号球；固定包含 8 号黑八。
- **🔢 4 位数字房间号**：快捷创建与数字键盘扫码/输入加入，极简零门槛。
- **⚡ 实时低延迟同步**：基于 WebSocket (Socket.IO)，销牌、罚牌与战况实时秒级广播。
- **📱 移动端 iOS & Android 原生打包与深度适配**：
  - 基于 Tauri v2 封装，完美覆盖 iOS (`apple/`) 与 Android (`android/app`) 跨端应用。
  - **iOS 深度适配**：支持 Safe Area（刘海屏 / 灵动岛 / Home 底部条避让）、基于 `@tauri-apps/plugin-dialog` 接入 iOS 原生 `UIAlertController` 对话框，以及移动端网络后端 Server 地址自由配置。
- **⌚ 独立 Wear OS 手表应用 (`android/wear-app`)**：
  - 基于 Kotlin + Jetpack Compose for Wear OS 构建。
  - 支持房间号直接连入房间，或通过 Phone Companion (`android/phone-companion`) 手机伴侣蓝牙联动。
- **💻 现代前端工程化**：使用 Vue 3 + TypeScript + Vite + Tailwind CSS 组件化架构开发，采用 `nvm` + `pnpm` 环境与包管理。
- **🚀 快捷构建与运行**：自带 `config.yaml` 配置文件与一键构建启动脚本 `run.sh`。

---

## 🚀 快速启动

### 1. Web 后端与前端启动 (推荐)
直接运行根目录下的 `run.sh` 脚本，将自动调取 nvm 环境、依赖安装、前端打包与服务启动：
```bash
chmod +x run.sh
./run.sh
```

### 2. 手动构建与运行

```bash
# 1. 加载推荐的 Node.js 版本并安装依赖
nvm use
pnpm install

# 2. 构建前端 (Vite + TypeScript)
pnpm run build

# 3. 启动服务端
pnpm start
```

### 3. 本地开发模式
如需同时开启后端服务与前端 Vite 热重载调试：
```bash
pnpm run dev
```

### 4. 移动端 (Android / iOS) & Wear OS App 编译打包
项目采用 Tauri v2 进行跨平台移动端打包适配：
- **iOS 移动端 App** (`apple/` 或 `src-tauri/gen/apple`)：支持 iOS 模拟器/真机调试与打包，内置 Xcode 工程并完整适配 Safe Area 避让与原生弹窗。
- **Android 移动端 App** (`android/app`)：基于 Tauri v2 封装的 Android 主程序，集成 Wear OS 数据播种与 DataLayer 同步。
- **Wear OS 手表应用** (`android/wear-app`)：基于 Jetpack Compose 构建的 Wear OS 手表原生应用。

> 💡 **环境与打包说明**：
> - **iOS 平台**：开发需 macOS + Xcode 环境。运行 `npm run tauri:ios` 可自动拉起 Xcode 模拟器进行热更新调试；运行 `npm run tauri:ios:build` 编译 iOS 生产包。亦可使用 Xcode 打开 `apple/poolpoker.xcodeproj` 进行真机安装与签名。
> - **Android 平台**：`android/tauri.settings.gradle` 由 Tauri 依据本机 Cargo 路径自动生成（已 Git 忽略）。命令行运行 `npm run tauri:android` 或 `npm run tauri:android:build` 会自动建立关联。
> - **Android Studio 打开**：可直接打开 `android/` 根工程独立调试与运行 `:app` / `:wear-app`。详情参见 [Android & Tauri 移动端架构文档](docs/android_tauri_architecture.md)。

**命令行打包与调试命令**：
```bash
# Android 打包
npm run tauri:android        # 编译生成 Debug 测试 APK
npm run tauri:android:build  # 编译生成独立脱机 Release APK (R8 混淆 + 自动签名)

# iOS 打包与调试
npm run tauri:ios            # 开启 iOS 模拟器/真机 Dev 调试 (tauri ios dev)
npm run tauri:ios:build      # 编译生成 iOS 正式包 (tauri ios build)
```
- 生成的 Release APK 位于 `android/app/build/outputs/apk/release/app-release.apk`，在 5G 移动网络或无网状态下均可直接秒开。
- 在 Android Studio 中直接打开 `android` 目录即可在单窗口中调试或运行 `:app` / `:wear-app` 模块。详情参见 [Android & Tauri 移动端架构文档](docs/android_tauri_architecture.md)。

### 5. 单元测试 (Vitest)
使用 Vitest 运行服务端核心领域逻辑、撤回深拷贝与计分规则的单元测试：
```bash
pnpm run test:unit       # 运行全量单元测试
pnpm run test:unit:watch # 开发模式（监视文件变化自动重测）
```

### 6. 自动化 E2E 集成测试 (Playwright)
使用 Playwright 自动化测试完整的多人双窗口对局流程：
```bash
pnpm run test:e2e
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
