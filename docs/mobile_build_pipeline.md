# Android / iOS 构建编排

使用项目固定的 pnpm 12.6.0，先运行 `nvm use`。任务定义位于根目录
`pnpm-workspace.yaml`，实际编译继续由 Tauri、Gradle 和 Xcode 执行。

| 构建 | 命令 | 前置步骤 |
| --- | --- | --- |
| Android Debug APK | `pnpm pipeline android-debug --full` | 生成 wire models → 一致性检查 |
| Android Release APK | `pnpm pipeline android-release --full` | 生成 wire models → 一致性检查、单元测试 |
| iOS Debug | `pnpm pipeline ios-debug --full` | 生成 wire models → 一致性检查 |
| iOS Release | `pnpm pipeline ios-release --full` | 生成 wire models → 一致性检查、单元测试 |

四条流程都会先执行 `codegen:models`，再执行 `codegen:check`；Release 的单元测试也等待检查完成。生成结果会更新工作区中的 TS/Kotlin 文件。独立 `pnpm run codegen:check` 仍只检查，不生成代码，可用于 CI 检测未提交的生成结果。

首次执行前准备好对应平台的 SDK、Rust targets 和签名环境。iOS 默认目标为
真机 `aarch64`，需要 macOS/Xcode；Release 沿用现有签名和导出配置，编排不负责上传商店。
Android Release 仍沿用工程已有的 debug keystore 签名，不会自动转换为商店发布签名。

```bash
# 只检查任务图，不安装依赖或执行编译；四个流程均支持
pnpm pipeline ios-release --full --dry-run --json

# 查看原生构建的运行/排队情况
pnpm tasks status

# 热重载开发（不是有限时长的打包任务）
pnpm exec tauri ios dev
```

`pnpm pipeline` 是实验功能，会先执行 frozen-lockfile 安装。这里使用 `--full`
确保本地手动打包不受默认 Git 变更筛选影响，`includeWorkspaceRoot: true`
使根目录脚本参与任务图。前置检查失败时，依赖它的构建不会执行。

生成、检查、测试和移动端打包任务共用 `poolpoker-native` 并发组，限额为 1，因为 Android/iOS
共享生成的 TS/Kotlin 文件，且都会通过 Tauri 的 `beforeBuildCommand` 重建同一个 `dist/`。并发组对使用同一
pnpm stateDir 的进程生效；直接运行 Tauri、Gradle 或 Xcode 不受 pnpm 调度保护。
不要同时手动启动这些构建。

前端构建只由 Tauri 触发一次，包含 TypeScript 检查和 Vite 构建。APK/IPA 不启用
pnpm 结果缓存，保留 Gradle/Cargo 自身的增量构建，避免本地 SDK、签名及
`android/gradle.properties.local` 等未跟踪配置变化被结果缓存掩盖。

旧的 `tauri:android*` / `tauri:ios*` scripts 已移除，日常打包统一使用上述 pipeline。
`package.json` 中的 `build:android:*` / `build:ios:*` 是供任务图调用的底层脚本，
保留它们是因为 pipeline 通过 scripts 执行命令；直接运行底层脚本不会展开前置依赖。

参考：[pnpm pipeline](https://pnpm.io/cli/pipeline)、
[任务依赖与并发组](https://pnpm.io/workspace-task-orchestration)。
