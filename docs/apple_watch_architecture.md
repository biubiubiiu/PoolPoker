# Apple Watch 客户端

`apple/WatchApp` 是 watchOS 10+ 原生 SwiftUI 应用，目标名 / scheme 为
`poolpoker_watchOS`，标识为 `com.poolpoker.app.watchkitapp`。iPhone 应用嵌入该目标，
同时允许手表独立运行。`apple/project.yml` 和已提交的 Xcode 工程包含相同目标配置。

## 功能对照

| Wear OS 功能 | Apple Watch 实现 |
| --- | --- |
| 四位房间号键盘加入 | 数字键盘、服务器地址和昵称设置 |
| 面对面加入 | Core Location 前台定位 + 现有附近房间协议 |
| 手机同步同一身份 | WatchConnectivity 同步服务器、用户、房间和 sessionToken |
| 脱离手机独立连接 | URLSession HTTP 长轮询连接现有 Socket.IO 后端 |
| 等待、轮次和手牌 | 等待房主开局（大厅展示昵称）、出杆顺序（对局内顶部聚焦出杆顺序，不重复展示玩家名）、按球号排序的手牌 |
| 多语言适配 | 英语、简体中文、繁体中文（通过标准 String Catalog `Localizable.xcstrings` 管理，`WatchStrings` 强类型封装） |
| 消牌、已进球免打 | 点击消牌，按全局球号集合禁用并淡化免打牌 |
| 裁判记球、开球、罚牌 | 玩家选择、1–15 号球选择、开球模式、犯规玩家选择 |
| 撤回 | 显示最近操作，确认时携带打开弹层时的 revision |
| 结算 | 赢家、本局分数、累计分数、已消除/免打/未消除及扣分 |
| 返回和震动 | 原生 sheet 下滑关闭/取消，主界面滚动位置保留，状态变化触觉反馈 |
| 重连恢复 | Keychain 保存凭证，前台恢复时使用 rejoin_room |

Wear OS 的常亮窗口策略不移植至 watchOS；手表遵循系统显示/前后台生命周期，后台停止连接和定位，
前台重新鉴权同步。不会为游戏启用音频或运动后台模式。

## 本地化与文案

- 文案资源采用 Apple 官方推荐的 String Catalog 标准，集中管理于 `apple/WatchApp/Localizable.xcstrings`，覆盖 `en`、`zh-Hans` 和 `zh-Hant`。
- `apple/WatchApp/Localization.swift` 提供强类型的 `WatchStrings` API，底层自动委托给 `bundle.localizedString(forKey:value:table:)`，享有系统级语言回退与设备偏好；同时内置代码级默认英文兜底，避免任何极端环境出现空串。
- `Localizable.xcstrings` 分别在 `apple/poolpoker.xcodeproj/project.pbxproj`（`PBXResourcesBuildPhase`）与 `apple/WatchTests/Package.swift`（`resources: [.process(...)]`）中注册，支持 Xcode 完整打包和 SwiftPM 跨平台单元测试。

## 数据和连接

- `scripts/codegen-models.mjs` 从 `shared/schemas/*.schema.json` 同步生成 TS、Kotlin 和
  `apple/Shared/Generated/WireModels.swift`。Swift 使用 Codable，保留协议枚举原始值。
  不直接修改生成文件。`codegen:check` 同时检查三个平台。
- `SocketTransport` 实现本项目需要的默认 namespace、JSON event/ACK、Engine.IO v4
  polling、心跳和超时，不引入额外依赖，不实现未使用的二进制事件和自定义 namespace。
  只保持一个 GET 和一个串行 POST；接收批次使用标准 record separator 拆包。
  参见 [Engine.IO v4](https://github.com/socketio/socket.io/blob/main/docs/engine.io-protocol/v4-current.md)。
- watchOS 对普通游戏的 WebSocket/底层网络有限制，所以采用标准 URLSession HTTP 请求，
  参见 [Apple TN3135](https://developer.apple.com/documentation/technotes/tn3135-low-level-networking-on-watchos)。
  反向代理必须允许 `/socket.io/` 的 GET/POST 长轮询；多实例服务需要会话粘滞。
- `WatchRoomStore` 在主线程管理连接、ACK 入房、服务器裁剪后的 Room、操作和重连。
  `ready` 只在成功入房 ACK 后置真；失败鉴权不降级为普通加入。
  断线操作立即拒绝，动作不跨连接缓存/重放，超时后只恢复快照。
  旧连接和旧 ACK 无法覆盖新连接状态。手动离开先发送离房请求，再关闭传输。
- `RoomCredential` 是本地会话元数据；token 存在 Keychain，偏好和独立 userId 保存在 UserDefaults。
  不打印凭证。应用卸载/重装后的 Keychain 保留由系统决定，不保证恢复。
- `WatchSessionBridge.swift` 通过 C ABI 接收 Tauri Rust `sync_wear_state` 的已有
  `room_credentials` / `leave_room` 事件。启动时激活 WCSession，使用 application context 保留最新会话，
  可达时即时发送。手表主动请求最新会话；消息按时间戳去重，离房以服务器、房间和用户三者匹配。
  手表用手机的凭证直接 `rejoin_room`，保留后端多 Socket 私有手牌广播。
  WatchConnectivity 不传输游戏操作，也不充当后台常驻网络代理。

## 附近房间

`NearbyRoomsStore` 使用前台位置权限，30 秒内寻找精度不差于 300 米、年龄小于 60 秒的样本。
保留原始 Unix 采样时间，取得有效样本后停止定位，过期后仅在发现页前台重新获取。
独立浏览连接先登记 `discovery_update`，选中房间后实际游戏连接再次登记位置，
再携带 `discoverySource: geolocation` 加入，仍由服务器复核可见性。
退出、后台、取消或加入成功均释放浏览连接和定位。拒绝/超时显示原因并提供重试及房间号入口。
不保存坐标，不增加 BLE 发现，也不绕过后端对 BLE 来源的拒绝规则。

## 构建与验证

```bash
nvm use
pnpm pipeline watchos-debug --full    # 生成/校验模型，构建本地签名模拟器 app
pnpm pipeline watchos-release --full  # 模型、服务器单测、Swift 后端集成测试、真机 Release 构建
pnpm run test:watch                 # macOS + Xcode，临时本机后端与 Swift 测试
```

Release 签名需在 Xcode 中为 iOS / watchOS 目标配置同一开发团队；包版本须保持一致。
iOS 原有 pipeline 会随嵌入依赖构建 watchOS。独立 watchOS 构建不依赖 Tauri/Rust 库。
完整资源编译（包括图标）和模拟器运行均需安装 watchOS runtime；只有 SDK 时可交叉检查 Swift 源码，
但 Xcode 的资源编译器可能以缺少 watchsimulator runtime 结束构建。
使用 Xcode 打开 `apple/poolpoker.xcodeproj`，选择 `poolpoker_watchOS` 和手表运行。
独立测试在首页填写真实服务器 URL；生产使用 HTTPS，局域网调试可使用本机 IP/Bonjour 地址。
不要填写 localhost，除非后端确实运行在该设备本机。

`test:watch` 使用真实生产 Socket handlers，验证 Swift 枚举、附近发现加入、私有手牌裁剪、
裁判进球/犯规、过期撤回拒绝、成功撤回、错误凭证拒绝、第二 Socket 恢复、心跳及点击消牌。
临时后端仅绑定 127.0.0.1，禁用企微推送，测试后终止进程。

真机验收仍需覆盖：iPhone 与 Apple Watch 配对安装、手机会话同步/离房、独立 Wi-Fi/蜂窝连接、
位置授权拒绝和室内定位、锁屏/抬腕恢复、圆角小屏可读性、所有操作和结算。
桌面 Swift 测试与交叉编译不能替代这些硬件验证。

本次环境验证：122 项现有单测、4 项 Swift 测试（含真实后端流程）、Vue 类型检查、
三平台模型一致性、watchOS 真机目标 Swift 类型检查、iOS 桥接 Swift 类型检查和 pipeline 任务图检查通过。
初次构建因缺少 watchOS runtime 停在图标资源编译；安装 watchOS 26.5 runtime 后，
完整 Debug pipeline 的 3 项任务均通过，42mm Series 11 和 40mm SE 3 均已构建、安装、启动。
真机架构的未签名 Release 完整编译也已通过（尚未签名安装到物理手表）。

### 模拟器验收补充（2026-10-14）

- 42mm：通过界面数字键盘加入临时本机球局，等待开局、手牌排序、点击消牌、撤回确认、
  代记房主犯规、选择开球归属、开球进球、免打牌变灰，以及结算赢家/分数/手牌分类均已检查，
  操作结果与真实后端状态核对一致。进球弹层关闭后主列表保持滚动位置。
- 重启恢复：终止应用后重新启动，不传测试启动参数，自动恢复同一玩家和房间。
- 修复：模拟器无签名包无法访问 Keychain。Debug 构建改为本地 ad hoc 签名，
  `Shared/Simulator.entitlements` 为手表/手机模拟器提供各自 bundle ID 的独立 Keychain 访问组；
  仅对 simulator SDK 生效，真机继续使用开发团队签名。已复测会话保存与重启恢复。
- 修复：进球归属默认 wheel picker 在滚动容器中被压缩，改为 watchOS 原生 navigationLink 选择列表；
  已通过界面选择开球模式并成功记球。
- 复跑 4 项 Swift 测试通过。物理手表的 Wi-Fi/蜂窝、触觉、抬腕与室内定位不属于模拟器验收结果。

### 40mm 与手机联调补充（2026-10-15）

- Apple Watch SE 3（40mm）：使用合成坐标查找到本机测试房主，点击附近列表成功加入同一房间，
  后端人数与手表等待页一致。重新启动后会话恢复成功；通过确认弹层离房后，后端移除该玩家。
- 定位拒绝时显示设置权限/房间号备用入口；此前无定位样本时的 30 秒超时提示也已观察到。
- 修复发现结果文案时序：服务器先发 nearby_rooms、再回 discovery_update ACK 时，成功 ACK 不再覆盖已有列表的“选择球局加入”提示。
  已重新构建并在 40mm 界面复测显示一致。
- 2026-10-15 再次通过模型一致性检查和全部 4 项 Swift 协议测试。
- iPhone 配对同步尚未验收：实际 Tauri iPhone 模拟器构建在原有 Build Rust Code 脚本阶段失败，
  未产出可运行手机包。拟议关闭 `poolpoker_iOS` 的用户脚本沙箱被自动审批拒绝，
  用户明确选择保留沙箱、先记录限制，因此没有修改 `ENABLE_USER_SCRIPT_SANDBOXING=YES`，也未实施绕过。
  不将手机 Swift 类型检查、后端多 Socket 测试或独立手表运行视为真实配对链路验收。
  后续需在保留沙箱的既定构建环境中解决脚本输入/输出与依赖访问，再测试手机凭证同步、手表同身份恢复及手机离房。
