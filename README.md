# 🎱 PoolPoker · 球霸扑克

> 朋友线下打台球聚会神器 —— 基于 54 张扑克发牌与球号映射的实时对战应用！

[![Node.js](https://img.shields.io/badge/Node.js-v24-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v11-orange)](https://pnpm.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.0-emerald)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue)](https://www.typescriptlang.org/)
[![Wear OS](https://img.shields.io/badge/Wear%20OS-Compose-green)](https://developer.android.com/wear)
[![Vite](https://img.shields.io/badge/Vite-v8.2-purple)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.3-sky)](https://tailwindcss.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.7-blue)](https://socket.io/)

---

## 🌟 项目亮点

- **🃏 54 张全副扑克牌库**：包含 52 张正牌（4种花色 × A~K）+ 小王 🃏 + 大王 👑。
- **🎱 真实球号映射**：A~K 自动对应 1~13 号台球，大小王对应 14、15 号球；固定包含 8 号黑八。
- **🔢 4 位数字房间号**：快捷创建与数字键盘扫码/输入加入，极简零门槛。
- **⚡ 实时低延迟同步**：基于 WebSocket (Socket.IO)，销牌、罚牌与战况实时秒级广播。
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

### 4. Android 移动端 & Wear OS App 编译打包
项目在 `android/` 目录下采用了统一的原生 Gradle 多模块结构：
- `:app`：基于 Tauri v2 封装的 Android 移动端应用，集成 WebView 壳、后台地址配置与 Wear OS 同步插件。
- `:wear-app`：基于 Jetpack Compose 构建的 Wear OS 手表原生应用。
- `:shared-models`：Kotlin 共享数据模型与 Wearable DataLayer 协议。

> 💡 **首次克隆或环境开发说明**：
> `android/tauri.settings.gradle` 属于 Tauri 根据开发者本机 Cargo 路径自动生成的依赖配置文件（已提交 Git 忽略）。
> - **命令行一键编译/自动初始化**：直接运行 `npm run tauri:android` 或 `npm run tauri:android:build`，Tauri 会自动建立环境链接并生成 `tauri.settings.gradle`。
> - **Android Studio 直接打开**：直接打开 `android/` 根目录。`settings.gradle.kts` 已做容错处理，即使尚未生成 `tauri.settings.gradle`，也可独立编译运行 `:wear-app` 与 `:shared-models` 模块。

**命令行打包命令**：
```bash
npm run tauri:android        # 编译生成 Debug 测试 APK
npm run tauri:android:build  # 编译生成独立脱机 Release APK (R8 混淆 + 自动签名)
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
