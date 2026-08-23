# Wear OS App Architecture & UI Module Design (`:wear-app`)

本文档记录 PoolPoker Native Wear OS 手表端（`:wear-app`）的架构设计、UI 模块拆分与侧滑返回（Swipe-to-Dismiss）交互规范。

---

## 1. 总体架构

Wear OS 手表端采用 **Single-Activity + Wear Compose 响应式架构**：

```
WearDataLayerListenerService.roomStateFlow / WearDirectSocketManager
                           ↓
                   WearMainActivity
                           ↓
                   WearGameScreen (State Router & SwipeToDismissBox Host)
            ┌──────────────┼──────────────┐
            ↓              ↓              ↓
  WearDirectConnectScreen  WearMainGameContent  WearModalScreens
                           ↓              ↓
                   WearSingleCardItem   BilliardBallBadge
```

- **数据源与通信**：
  - `WearDataLayerListenerService` 监听手机伴侣端 DataLayer 广播。
  - `WearDirectSocketManager` 在直连模式下维持与后端 Socket.IO 的直接连接。
- **单 Activity 原则与 Window 职责**：
  - `WearMainActivity` 负责管理系统的 `Window` 属性（如基于房间状态进入/刷新 2 分钟 `FLAG_KEEP_SCREEN_ON` 常亮超时倒计时）。
  - 所有页面与弹层切换均在 `WearMainActivity` 内部通过 Compose 状态控制，保持 UI 层 (`com.poolpoker.wear.ui`) 的纯粹性，避免与 Android System Window API 产生耦合。

---

## 2. UI 模块拆分 (`com.poolpoker.wear.ui`)

为了保持代码的可维护性与模块解耦，界面解耦拆分为 6 个职责明确的模块：

### 2.1 顶级路由与手势容器 ([`GameCardScreen.kt`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/android/wear-app/src/main/java/com/poolpoker/wear/ui/GameCardScreen.kt))
- `WearGameScreen(roomState: WearSyncRoomPayload?)`:
  - 核心状态分发器：处理 `roomState == null` (跳转直连连接页)、`WAITING` (等待开局)、`ENDED/FINISHED` (对局结算) 与 `PLAYING` (进行中)。
  - 管理 `showPocketModal` 与 `showFoulModal` 状态。
  - 挂载 `SwipeToDismissBox` 与 `BackHandler`，捕获 Wear OS 侧滑与 Back 按钮事件。
- `sendActionToPhone(context, action)`: 统一的操作发送入口（优先使用 Direct Socket，次选 Wearable DataLayer 消息传递）。
- `triggerVibration(context)`: 触觉震动反馈工具。

### 2.2 游戏主界面 ([`WearMainGameContent.kt`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/android/wear-app/src/main/java/com/poolpoker/wear/ui/WearMainGameContent.kt))
- `WearMainGameContent`:
  - 渲染房间号与玩家昵称 Header。
  - 使用 `ScalingLazyColumn` 按球号升序显示玩家当前手牌。
  - 底部提供垂直堆叠的物理大按钮（「记录进球」、「记录犯规」、「撤回进球」），适配圆形表盘边缘触控。

### 2.3 裁判弹层选择器 ([`WearModalScreens.kt`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/android/wear-app/src/main/java/com/poolpoker/wear/ui/WearModalScreens.kt))
- `WearFoulModalScreen`: 裁判选择犯规玩家的选择列表。
- `WearPocketModalScreen`: 裁判选择进球玩家与 1-15 号球矩阵选择器。

### 2.4 手牌列表项 ([`WearSingleCardItem.kt`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/android/wear-app/src/main/java/com/poolpoker/wear/ui/WearSingleCardItem.kt))
- `WearSingleCardItem`: 展示单张扑克牌的花色、点数与「已进球/点击消牌」状态。

### 2.5 台球徽章组件 ([`BilliardBallBadge.kt`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/android/wear-app/src/main/java/com/poolpoker/wear/ui/BilliardBallBadge.kt))
- `BilliardBallBadge`: 独立纯 UI 组件，支持 1-8 号全色台球与 9-15 号花色台球（中间带状球色 + 白色数字圆盘）的精细化渲染。

### 2.6 九宫格直连页面 ([`WearDirectConnectScreen.kt`](file:///Users/raymond/Desktop/Workspace/dev/PoolPoker/android/wear-app/src/main/java/com/poolpoker/wear/ui/WearDirectConnectScreen.kt))
- `WearDirectConnectScreen`: 当手表脱离手机独立使用时，提供 4 位房间号的九宫格数字键盘快速加入房间。

---

## 3. 侧滑返回（Swipe-to-Dismiss）交互规范与防闪烁设计

1. **根节点底层常驻（Root Box Overlay Pattern）**：
   - `WearMainGameContent` 在根节点 `Box` 中**永久常驻挂载**，其 `ScalingLazyColumn` 的 Layout Node 和滚动状态在打开/关闭 Modal 时均**不会被销毁或重置**。
   - Modal 弹层（`SwipeToDismissBox`）作为浮层（Overlay）覆盖在根节点 `Box` 的上方。
2. **彻底解决 1 帧切换闪烁**：
   - 原先在 `isBackground == true` 和 `hasActiveModal == false` 两个分支中重复调用 `WearMainGameContent`，会导致 Compose 在侧滑完成瞬间销毁背景分支节点并在主分支重新创建节点，触发滚动位置重置与 1 帧 Layout Re-measure 闪烁。
   - 改为 Root Box Overlay 模式后，`SwipeToDismissBox` 关闭时直接移除浮层，底层 `WearMainGameContent` 的节点与状态 100% 保持不动，彻底消除任何闪烁。
3. **层级拦截**：
   - 当用户在「记录进球」或「记录犯规」弹层视图中时，系统通过 `BackHandler` 和 `SwipeToDismissBox` 拦截侧滑手势。
   - 侧滑仅关闭当前弹层（`showPocketModal = false` / `showFoulModal = false`），返回上一级（手牌主界面），不会退出 Activity 返回手表桌面。
4. **视觉跟随动画与按钮对齐**：
   - 侧滑过程中，`SwipeToDismissBox` 将底层的 `WearMainGameContent` 实时透露呈现，实现符合 Wear OS Design 规范的平滑手势跟随滑动。点击界面底部的「返回/取消」按钮与从左侧滑返回的逻辑完全对齐。
