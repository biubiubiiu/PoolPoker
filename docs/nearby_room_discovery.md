# 面对面发现房间

Web 大厅默认开启基于定位的附近发现。首次访问需同意浏览器位置权限；授权后列表自动更新，选择房主球局即可加入，无需输入房间号。关闭开关会保存到本机，下次访问沿用。

## 使用与部署

- 页面需通过 HTTPS 访问（本机 localhost / 127.0.0.1 调试除外）。HTTP 局域网 IP 地址不满足浏览器定位要求；如部署在 iframe 中，还需要允许 geolocation 的 Permissions-Policy。
- 房主和加入者均需开启附近发现并授权位置，连接同一个后端服务。房主只在等待房间时发布附近可见状态。
- 默认搜索坐标距离 300 米内的房间，可在 `config.yaml` 的 `discovery.radius_meters` 调整（有效范围大于 0 且不超过 5000 米，非法值回落到 300）。不显示精确距离，因为室内定位无法可靠区分相邻球桌。
- 仅在首页没有有效位置时定位：先以低精度单次请求尝试快速取得缓存/粗略位置，同时通过 `watchPosition` 接收高精度更新。精度差于 300 米的定位不参与匹配；可用粗略位置立即上报，更好的位置按至少 1.1 秒间隔合并上报。达到 50 米精度，或已有可用位置且连续 10 秒没有超过 10% 的精度改善，停止监听；每轮最多 30 秒，无有效位置时冷却 20 秒再试。有效位置沿用原始采样时间，60 秒过期后仅首页重新定位。定位失败、拒绝、超时或浏览器不支持时展示原因；无效数据、精度不足、旧定位样本及未来时间戳分别提示，时间校验不再与精度混为一条报错，保留房间码入口和重新定位按钮。
- 列表每 2 秒检查变化，仅在内容变化时通过 Socket.IO 推送；新房主完成定位后，通常在下一个检查周期出现。位置获取本身的耗时由设备和浏览器决定。
- 创建/加入房间和开局后都停止定位。房主仅用首页取得的有效位置发布房间；没有有效位置时仍可建房，但附近不可见。房间位置沿用原始 60 秒有效期，过期后退出附近列表，房内不自动重新定位。房主临时隐藏页面保留剩余有效期；离开页面、进入游戏、普通玩家加入房间、关闭发现和组件卸载撤回状态。返回首页或重连时优先复用有效缓存（仅内存），首页手动重新定位会清除缓存。
- 已满员、开局、结束、解散、房主离线或不再具有房主身份的房间不显示。满员后有空位会重新出现。新房主需用自己的位置重新发布。
- 无需地图 API、地图组件、逆地理编码服务或第三方付费定位 SDK。设备实际定位服务的可用性与室内精度仍需在目标手机/浏览器和球房实测。

## 模块与协议

- `src/discovery/provider.ts`：`RoomDiscoveryProvider.start(mode, callbacks)` 返回清理函数。发现适配器输出统一 `NearbyRoom[]` 和状态文案，支持 browse / advertise 两种角色。
- `src/discovery/geolocationProvider.ts`：Web 渐进定位与稳定后停止、内存缓存、Socket 订阅、断线重连、权限/精度/过期处理。所有异步回调在清理后失效。
- `src/composables/useNearbyRooms.ts`：管理启用偏好、前后台和房间角色变化，可注入 provider factory。
- `src/components/NearbyRooms.vue`：大厅房间列表和房主可见开关；加入仍由 `useGameRoom` 执行。
- `server/roomDiscovery.ts`：短期 Socket presence、距离计算、房主鉴权、坐标校验、去重与筛选。
- `server/discoveryBroadcast.ts`：每个服务器一个定时任务，推送变化与过期后的空列表。
- `shared/schemas/discovery.schema.json`：跨平台发现模型 SSOT，同步生成 TypeScript / Kotlin。坐标不是 Room 字段，不修改现有手牌裁剪。

客户端发送 `discovery_update`（位置、精度、采样时间、角色）并接收成功/失败 ACK；`discovery_stop` 撤回状态；服务端发送 `nearby_rooms` 公共摘要。服务端每 Socket 至少间隔 1 秒接受同角色位置更新，坐标仅保留在内存、不写日志/持久化/公开房间快照，最多有效 60 秒。发布者身份来自已认证的 Socket 会话，不接受客户端指定房间号作为发布权限。

`join_room` 新增可选 `discoverySource`。定位发现入口发送 `geolocation`，服务端重新核验该 Socket 最新位置能看到的可加入房间，避免列表显示后开局/满员/位置过期导致误加入。手动输入不传此字段，沿用原有加入规则；仍能按项目原规则中途加入正在进行的球局。

定位仅提供便利发现，不是物理在场证明：浏览器可伪造位置，已有房间码加入规则仍然适用。列表不下发坐标、精确距离、玩家身份凭证或手牌。

## 后续原生 BLE 扩展

`DiscoverySource` 预留 `bluetooth`，但本轮不广播、不扫描，也不安装原生插件。未来 iOS/Android 适配器实现 `RoomDiscoveryProvider`，用 BLE 获得同一后端的房间标识并输出 `NearbyRoom`。通过 provider factory 或组合 provider 接入 UI，无需让展示组件依赖 GPS 坐标。

加入权限由服务端统一处理。目前明确拒绝 `bluetooth` 来源的加入请求；实现原生扩展时须补充相应来源的验证和房间可加入检查，不能仅靠新增适配器绕过服务器验证。多来源合并时应按后端和房间身份去重，并继续复用玩家身份、会话凭证及房间状态同步机制。

## Safari 时间基准兼容（2026-09-26 实机排查）

实机 Safari 的 GeolocationPosition.timestamp 返回了从 2001-01-01 起算的毫秒数，和 Unix 毫秒相差 978307200000；现场读取的原始年龄为 978307200069ms，加上基准差后实际年龄仅 69ms，定位精度约 63 米。Chrome 的定位年龄约 2ms、精度约 52 米。因此原来的统一报错实际上是时间基准不匹配，并非精度不足。

`src/discovery/geolocationTimestamp.ts` 只在 Apple vendor 且补偿这个特定偏移后仍落在有效时间窗口时进行转换。正常 Unix 时间戳保持原样，旧定位、未来定位、无效数值不续期；服务端依然只接收 Unix 毫秒并执行原有 60 秒过期规则。参考：[Geolocation timestamp 标准含义](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition/timestamp)、[Apple CFAbsoluteTime 的 2001 年参考日期](https://developer.apple.com/documentation/corefoundation/cfabsolutetime)。

验证通过 Computer-use 操作真实 Safari 和 Chrome：Safari 发布原有房间，Chrome 自动发现并一键加入，两端人数同步为 2 人。自动测试另外模拟 Apple 时间基准的房主与标准时间基准的加入者，避免只用 Chromium 标准定位时间戳的测试遗漏此兼容问题。

定位监听与取消使用标准 [watchPosition / clearWatch](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition)。粗略位置是否更快返回由浏览器决定；稳定判断采用精度收敛，不代表可以证明用户静止。
