# User 体系：实现方案与运行约定

更新：2026-09-09。本文以最终确认的「HTTP 尽可能开放全部能力」为准，替代此前 HTTP 仅游客、原生低权限会话的建议。

## 产品行为

- 首页提供创建账号、登录账号、以游客登录三个入口。沿用 Session 参考中的深色背景、绿色主按钮、分步昵称页与登录方式切换；保留现有游戏界面和安全区适配。
- 游客不需要手机号、邮箱或密码。服务器创建 `kind=guest` 的稳定内部身份，Cookie/原生会话存在时可以刷新、重连。注册是显式操作；游客升级保留 userId、当前座位与手牌。
- 注册用户具有不可修改的 userId；昵称允许重复和修改（1–24 个字符），服务端同步已加入房间及在线设备。首页旧昵称输入框仍有 10 字符显示约束，账号页可编辑完整昵称。
- 同一账号可多设备同时在线，每台设备持有独立会话。输入四位房间码时，服务端发现该身份已有座位就恢复，不重复入座或发牌。用户不需要输入 roomId；自动恢复请求携带内部 roomId 防止旧房间码复用。
- 在牌局内不能切换账号，游客可以就地注册。退出账号入口在牌局内禁用；要切换身份先退出房间。退出房间会移除该身份所有设备的座位关联。
- 注册后允许稍后备份，但没有恢复短语或 Passkey、也没有其他已登录设备时，清除会话会丢失账号访问能力。UI 展示当前备份状态。

## HTTP 与客户端能力

| 能力 | HTTP 局域网 Web | 可信 HTTPS 域名 Web | Tauri App |
| --- | --- | --- | --- |
| 游客、注册、昵称、牌局 | 支持 | 支持 | 支持 |
| 12 词恢复登录、管理账号 | 支持 | 支持 | 支持 |
| 展示二维码、手动配对码授权 | 支持 | 支持 | 支持 |
| 网页调用相机 | 不提供坏入口，使用系统相机/手动码 | 当前同样使用系统相机/手动码 | 系统相机/手动码 |
| Passkey | 浏览器限制；localhost 例外 | 能力检测后提供 | 系统浏览器登录后通过配对授权回传，无需固定回跳域名 |

HTTP 使用 Cookie/WS 明文传输，原生安全存储不会让 HTTP 传输变成加密。本次按产品取舍接受该风险，不降低 HTTP 账号权限，不尝试伪装安全上下文。网页恢复推导采用纯 JS，不依赖 SubtleCrypto；随机数仍来自 CSPRNG。所有客户端必须连接同一个服务器实例；相同短语不意味着不同自建服务器自动共享数据库。

原生「在系统浏览器登录」为新 App 会话生成短时请求，打开所配置服务器的配对链接。浏览器完成 Passkey/短语登录后，核对六位码并确认授权；App 轮询领取独立会话。无需 Universal Links、App Links 或自定义 scheme 携带 token。

## 身份与凭证

`shared/schemas/auth.schema.json` 定义公开 AuthUser、AuthSessionInfo、AuthPairing，通过 codegen 生成 TS/Kotlin。认证存储不进入公开 Room。

- Web：HttpOnly、SameSite=Lax Cookie；HTTPS 时 Secure。localStorage 只保留昵称、球色、服务器地址和非秘密身份/房间提示。
- Android/Wear OS：Android Keystore AES-GCM 加密后的会话存储；iOS/macOS：Keychain。恢复私钥不长期存储，恢复短语只在备份或输入期间存在于客户端内存。
- 服务端：保存随机 256 位 bearer token 的 SHA-256 摘要。管理会话有效期 30 天；伴随 play 会话 30 分钟，绑定父会话与 roomId。会话撤销会断开对应 Socket；父会话失效也使伴随会话失效。
- 每次 Socket 连接用 Cookie 换取一次性、30 秒有效的票据；服务端从票据对应会话确定身份，忽略客户端声明的调用者 userId。

### 恢复短语

12 词 BIP-39 英文，128 位熵。格式版本 `poolpoker-recovery-v1`：BIP-39 seed → HKDF-SHA256（salt 为格式版本，info 为 `account-recovery-signing`，32 字节）→ Ed25519 签名密钥。使用经过维护的 scure/noble 库，共享一份 TS 实现；不自创短语到 P-256 标量的映射。Passkey 算法由 WebAuthn 库和认证器协商，不要求原生端重复实现曲线算法。

服务端只存恢复公钥。挑战绑定用途、服务地址、nonce、用户/会话、请求秘密摘要和到期时间，客户端只提交签名。设置/替换已有恢复方式需要当前恢复方式的重新验证。更换恢复短语撤销旧会话及待授权配对；Passkey 仍保留。备份页通过核对第 3/9 个单词确认，不提供后续明文取回接口。

### Passkey

SimpleWebAuthn 提供注册与认证校验；要求 user verification、resident credential，并校验 challenge、origin、rpId、userHandle、公钥及计数器。服务地址为纯 IP 时隐藏入口；Tauri 不直接把 WebView 的虚拟域名当作服务器 RP。撤销最后一个 Passkey 前必须存在恢复短语或另一个 Passkey。

### 设备授权

新设备生成两分钟有效请求，展示二维码与六位发现码。二维码不含可领取会话的秘密；领取还需要新设备独有的 256 位随机 secret。旧设备先查询并核对代码/设备名，再明确确认授权。服务端检查批准会话仍有效，领取时原子消费请求，发放独立会话。支持刷新、取消、到期提示。六位码不是账号恢复密码。

## 房间鉴权与可靠性

HTTP `GET /api/rooms/:code` 从 Cookie/Bearer 验证会话，并检查房间成员关系；`?userId=` 不再决定返回谁的私有手牌。无会话 401、非成员 404、旧 roomId 409。Socket 操作从已认证身份及反向 socketIndex 检查成员/房主权限，广播保留逐用户裁剪。

RoomController 是 Socket 写入入口：校验 → 内存变更 → SQLite 事务提交 → Socket 加入/离开、广播和 ACK。事务失败回滚内存房间和反向索引。球号、基础设置、载荷大小和请求速率有边界校验。旧 `sessionToken` 仍留在内部游戏领域模型中以复用领域重连逻辑，但不再是 Web 身份来源。

每个房间持有不可复用 roomId、递增 revision。客户端命令可带 commandId/expectedRevision/expectedRoomId；已记录命令重试返回原 ACK，载荷不同则拒绝。首期没有通用离线命令队列，未收到 ACK 时刷新状态并提示核对，不自动重复业务操作。

## SQLite 与启动

Node.js 24 内置 `node:sqlite`，无需额外数据库服务。默认 `data/poolpoker.sqlite`，`pnpm dev`/`pnpm start` 启动时自动建目录和表。可用 `POOLPOKER_DB_PATH` 覆盖路径、`POOLPOKER_PORT` 覆盖端口。

WAL + synchronous=NORMAL 用于游戏事务；凭证更改使用短 FULL 事务。保存每个变更房间的最新状态，gameHistory 拆为 undo_steps，只更新变化的撤回步，不在每次操作递归重写完整历史。当前是同步 SQLite 单进程写入；尚未进行低速 TF 卡/高并发压测，不能把它视为无限吞吐。多个 Node 实例不应共用该库。

表：users、sessions、challenges、passkeys、pairings、rooms、undo_steps、receipts、outbox、migrations。删除房间级联清理撤回步和命令回执。离线房间按 config.yaml 的 disconnect_timeout_ms 到期（默认一小时），期限落库，重启不重置期限；重启后玩家先标为离线，认证重连恢复。

结算通知写入 Outbox，与牌局事务一起提交；提交后异步推送，失败至少等待一分钟重试。外部 Webhook 不支持幂等键，因此崩溃在远端成功与本地删除之间可能重复通知（至少一次语义）。

备份：`pnpm backup:db -- /absolute/path/backup.sqlite` 使用 SQLite 在线备份 API。恢复需停止服务，备份当前库，将备份替换为配置的数据库文件，并移除与旧库对应的 WAL/SHM 后再启动。不要运行时单独复制 sqlite 主文件。备份中包含账号公钥、会话摘要和私有牌局状态，应按服务器数据管理。

首次从旧版本升级会重启原先仅内存存储的服务，旧 localStorage userId/token 不作为新账号的认领凭据。应在牌局结束后升级；没有无凭据认领旧座位的兼容后门。

## Wear OS

手机从自己的管理会话申请一次性 companion 票据，通过已配对蓝牙安全 RFCOMM/DataLayer 传递。手表换取限定当前房间的 play token，凭证加密保存，仍直接 Socket 连服务器并接收本人手牌。父会话撤销、房间成员退出、房间实例变化均使游戏权限失效。手机在线时定期更新授权；手机后台挂起且授权到期时需恢复手机 App 同步。

独立手表游客入口通过服务器申请游客身份，之后使用同一认证 Socket；不再信任手表自造 userId。短语推导和 Passkey 操作留在手机/浏览器。

## 配置与验证

反向代理时保留 Host/Origin，Vite 开发代理已设置 changeOrigin=false。跨域 Web 部署显式配置 `POOLPOKER_AUTH_ORIGINS`（逗号分隔），Passkey 域名可配置 `POOLPOKER_RP_ID`。Cookie 跨站限制仍由浏览器执行，推荐前后端同源；不要用任意 Origin 放行来绕过浏览器限制。

验证入口：`pnpm build`、`pnpm test:unit`、`pnpm codegen:check`、`pnpm test:e2e`。新 `e2e/auth.spec.ts` 覆盖恢复、挑战重放、配对秘密、HTTP 越权、手表受限会话、注册首页、虚拟认证器 Passkey。原生代码编译验证不能替代真实 iOS/Android/Wear OS 的相机、蓝牙、Keychain/Keystore 与后台恢复验收。

### 最终验证记录（2026-09-10）

- Web production build 成功；66 项 Vitest、13 项 Playwright 全部通过；codegen 一致性检查通过。
- 恢复签名派生与 Node crypto 独立实现交叉验证通过；SQLite 文件关闭/重开及在线备份验证通过；命令重复提交不重复发牌。
- macOS、iOS simulator、Android Rust 目标 cargo check 通过；Android app/Wear OS Kotlin 编译通过。
- Biome 无错误，仍有非空断言等警告。真机蓝牙/后台恢复和低速存储压力测试未完成，不以编译和模拟认证器代替这些验收。
