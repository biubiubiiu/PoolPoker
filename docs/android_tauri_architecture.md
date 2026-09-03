# Android & Tauri App Architecture (Android 移动端架构设计)

本文档记录 PoolPoker 项目中关于 **Tauri v2 打包 Android 移动端 App**、顶层无软链接的 **Gradle 多模块架构设计** 以及 **Android 手机与 Wear OS 手表协同通信** 的实现与技术细节。

---

## 1. 架构总览 (Overview)

PoolPoker 采用了支持 Web 浏览器、Android 手机 App 以及 Wear OS 手表原生应用的三端协同架构：

```
Web 浏览器 / Android 手机 App (:app)          Wear OS 手表 (:wear-app)
   │ Socket.IO                                   │ Socket.IO (直连)
   │ (多 Socket 同身份订阅)                        │ (共享相同 userId 身份)
   ▼                                             ▼
Express 后端服务 ◄───────────────────────── Socket.IO 后端
 (server/index.ts)                               ▲
        ▲                                        │
        └─── DataLayer 快捷同步 ──────────────────┘
             (/poolpoker/sync_room: 房间号/密钥)
```

1. **Web 核心与打包**：前端采用 Vue 3 + TypeScript + Vite 构建。在桌面/移动端通过 Tauri v2 封装为 Android 原生 APK。
2. **顶层多模块设计**：摒弃了默认的软链接目录，将 Tauri 生成的 Android 壳模块提升并收拢至顶层 `android/` 工程中，形成单一干净的原生 Gradle 多模块结构。
3. **同身份多 Socket 双向独立直连**：
   - 后端 (`server/roomManager.ts`) 天生支持**单 `userId` 挂载多个 Socket 连接**。
   - Wear OS 手表应用 (`:wear-app`) 内置 `WearDirectSocketManager`，使用与手机端相同的 `userId` **直接连接** Express 后端 Socket.IO。
   - 当手机或手表任一端操作打牌/犯规时，后端将手牌秒级同步广播给该 `userId` 下的所有连接（手机 + 手表同步渲染）。
4. **DataLayer 免输入快捷连入**：
   - 手机 App `:app` 仅在房间变更时将当前房间号/身份通过 `/poolpoker/sync_room` 写入 DataLayer。手表打开时自动读取该凭证并直连后端，无需在手表微型键盘上手动输入 4 位房间码。
5. **协议常量镜像**：
   - Web/服务端的 Socket 事件名、Wear action 与 DataLayer path 由 [`shared/types/protocol.ts`](../shared/types/protocol.ts) 统一定义；Android/Wear 端在 `:shared-models` 的 `SocketEvents` / `WearAction` / `DataLayerConstants` 中维护镜像，并由协议契约测试检查漂移。

---

## 2. Gradle 顶层多模块结构 (`android/`)

项目根目录下的 `android/` 为唯一的 Android Gradle 根工程，包含 3 个协同子模块（原独立的 `:phone-companion` App 已完全下掉）：

```
android/
├── build.gradle.kts           # 根工程构建脚本
├── settings.gradle.kts        # 统一声明 include(":app", ":wear-app", ":shared-models")
├── gradle.properties          # 根工程构建属性
├── app/                       # [Tauri Android 移动端主应用 (UI + DataLayer 快捷播种)]
│   ├── build.gradle.kts       # 集成 AGP 9.2+、Tauri 依赖与 R8 混淆配置
│   ├── proguard-rules.pro     # ProGuard 混淆保护规则 (保留 Tauri / DataLayer / Gson)
│   └── src/main/java/com/poolpoker/app/
│       ├── MainActivity.kt               # 继承 TauriActivity 主入口
│       ├── TauriWearSyncPlugin.kt        # Tauri 原生插件，向 Wear OS 播种房间凭证
│       └── WearableDataLayerService.kt   # 接收 DataLayer 基础状态通知
├── wear-app/                  # [Wear OS 原生 Compose 手表应用 (内置直连 Socket)]
└── shared-models/             # [共享模型包 (WearSyncRoomPayload / WearActionPayload)]
```

---

## 3. 手机与 Wear OS 手表协同通信流程

### 3.1 手机推送房间状态至手表 (`Web -> Tauri Plugin -> DataLayer -> Wear OS`)
1. **前端监听**：Vue 3 中 `useWearSync` composable 监听房间状态变更（`room_updated`，协议常量为 `SERVER_TO_CLIENT_EVENTS.roomUpdated`）。
2. **Tauri Command 触发**：调用 Tauri 自定义 Rust 命令 `sync_wear_state`。
3. **Native Plugin 处理**：`TauriWearSyncPlugin.kt` 捕获 payload，使用 `Wearable.getDataClient()` 将结构化 JSON 数据写入节点路径 `/poolpoker/sync_room`。
4. **手表端响应**：Wear OS 手表上的 `WearableListenerService` 收到更新后，实时同步手牌与进球状态。

### 3.2 手表发起的打牌/反之广播 (`Wear OS -> DataLayer -> Mobile -> Socket.IO`)
1. Wear OS 触发数据写入 `/poolpoker/action`。
2. Android App 的 `WearableDataLayerService` 收到监听消息后，将操作转译并通过 Socket.IO 广播至服务器。

---

## 4. 网络安全与跨域配置 (Network Security & CORS)

### 4.1 明文 HTTP 网络权限 (Cleartext Traffic)
由于在移动端局域网测试或连接自建服务器（如 `http://192.168.18.227:3000`）时属于明文 HTTP 协议，Android 9+ 默认会拦截非 HTTPS 流量。
- **配置**：在 [`android/app/src/main/AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml) 的 `<application>` 节点中声明了 `android:usesCleartextTraffic="true"`。

### 4.2 全局 HTTP CORS 响应头
- **配置**：在服务端 [`server/index.ts`](../server/index.ts) 中配置了 Express 全局跨域中间件（`Access-Control-Allow-Origin: *`），保障 Android WebView (`http://tauri.localhost`) 能成功发起 `/api/ball-configs` 与 `/api/rooms` 请求。

### 4.3 差异化移动端设置 UI
- **配置**：在大厅组件 [`RoomLobby.vue`](../src/components/RoomLobby.vue) 中加入了 `isTauriEnv` 环境检测。在 PC 浏览器访问时隐藏服务器配置入口；仅在 Tauri Android App 环境下展示「后端服务器地址配置」入口。

---

## 5. Standalone Release APK 构筑与 R8 混淆

### 5.1 离线/脱机运行原理
- **Debug 模式**：WebView 访问 `devUrl` (`http://192.168.18.227:5173`) 开展热重载调试。
- **Release 模式**：打包前自动触发 `npm run build`，将 `dist/` 下的 HTML/JS/CSS 静态资源直接打包进入 APK。运行时由 WebView 在本地读取 `http://tauri.localhost`，完全脱离电脑开发服务，支持 5G 网络与完全离线启动。

### 5.2 R8 / ProGuard 混淆规则 ([`proguard-rules.pro`](../android/app/proguard-rules.pro))
在 `build.gradle.kts` 中开启 `isMinifyEnabled = true` 和 `isShrinkResources = true` 后，已通过 `proguard-rules.pro` 保护以下关键类不被误删/误混淆：
- Tauri 核心与自定义插件类：`app.tauri.**`, `com.poolpoker.app.**`
- 共享模型类（避免序列化解包异常）：`com.poolpoker.shared.**`
- Gson 字段注解：`@SerializedName`
- Socket.IO 客户端网络栈：`io.socket.**`

---

## 6. 常用构建与调试命令

```bash
# 1. 编译生成 Debug 测试 APK
npm run tauri:android

# 2. 编译生成 Standalone 独立 Release APK (已代码混淆 + 自动签名)
npm run tauri:android:build
```

- 生成的 Debug APK 位置：`android/app/build/outputs/apk/debug/app-debug.apk`
- 生成的 Release APK 位置：`android/app/build/outputs/apk/release/app-release.apk`
