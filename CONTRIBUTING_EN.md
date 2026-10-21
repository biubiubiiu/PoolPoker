# Contributing & Local Development Guide

Thank you for contributing to **PoolPoker (球霸扑克)**! This guide provides a complete walkthrough for cloning the repository, preparing your environment, local debugging, cross-platform wire model generation, and submitting Pull Requests.

🌐 **Language**: [简体中文](CONTRIBUTING.md) | **English**

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Quick Compilation & Local Run](#2-quick-compilation--local-run)
3. [Common Commands Cheat Sheet](#3-common-commands-cheat-sheet)
4. [Repository Directory Structure](#4-repository-directory-structure)
5. [Cross-Platform Wire Model Generation (JSON Schema SSOT)](#5-cross-platform-wire-model-generation-json-schema-ssot)
6. [Mobile & Smartwatch Builds](#6-mobile--smartwatch-builds)
7. [Testing, Code Style & Commit Guidelines](#7-testing-code-style--commit-guidelines)

---

## 1. Development Environment Setup

### Required Prerequisites (Web & Backend Development)

- **Node.js**: `>= 24.0.0` (A `.nvmrc` file is provided in the repository root; run `nvm use` to switch automatically)
- **pnpm**: `>= 12.6.0` (The project utilizes `pnpm pipeline` as a task orchestrator; please do not use `npm install` or `yarn`)
  ```bash
  nvm use
  corepack enable
  pnpm -v   # Verify version >= 12.6.0
  ```

### Optional Native Toolchains (Only needed when building App / Smartwatch or modifying 3D models)

| Target Platform | Required Toolchain |
|---|---|
| **Tauri Core (`src-tauri/`)** | Rust (`rustup` & `cargo`) |
| **Android & Wear OS (`android/`)** | JDK 17+, Android Studio / SDK, NDK |
| **iOS & Apple Watch (`apple/`)** | macOS + Xcode 15+, CocoaPods / Xcode Command Line Tools |
| **3D Billiards Table Asset (`assets/models/`)** | Git LFS (`git lfs install --local --skip-repo`) + Blender |

---

## 2. Quick Compilation & Local Run

### Method 1: Frontend + Backend Hot-Reload Mode (Recommended for Daily Development)

```bash
# 1. Install dependencies
pnpm install

# 2. Concurrently run backend Node.js (:3000) and frontend Vite HMR (:5173)
pnpm run dev
```

- Open **http://localhost:5173** in your browser (Vite automatically proxies `/socket.io` and `/api` requests to `http://localhost:3000`).
- Debugging multiplayer: Open 2–3 browser tabs or incognito windows, enter different nicknames, and join the same 4-digit room code.
- Debugging dual views: Toggle the **"New Interface"** switch at the top-right of the lobby to switch dynamically between the **v2 3D Immersive Arena** and the **v1 Classic 2D Board**.

### Method 2: Production Build & One-Click LAN Server

```bash
# Using the startup script (auto-checks nvm/pnpm, builds dist/, and prints your local LAN IP)
./run.sh

# Or build and launch manually:
pnpm start   # Equivalent to pnpm run build && tsx server/index.ts
```

The server listens on `http://localhost:3000`. You can configure the port, default deal card count, and max players in [`config.yaml`](config.yaml).

---

## 3. Common Commands Cheat Sheet

| Scenario | Command | Description |
|---|---|---|
| **Full-Stack Dev Server** | `pnpm run dev` | Runs `dev:backend` and `dev:frontend` concurrently |
| **Backend Only** | `pnpm run dev:backend` | `tsx watch server/index.ts` (listening on `:3000`) |
| **Frontend Vite Only** | `pnpm run dev:frontend` | Vite HMR (listening on `:5173`) |
| **Production Frontend Build** | `pnpm run build` | Runs `vue-tsc` type check + `vite build` to output `dist/` |
| **Codegen Wire Models** | `pnpm run codegen:models` | Generates TS / Kotlin / Swift wire models from `shared/schemas/*.json` |
| **Model Drift Check** | `pnpm run codegen:check` | Verifies generated code matches JSON Schemas strictly |
| **Run Unit Tests** | `pnpm run test:unit` | Runs Vitest tests (engine logic, binary BLE protocol, `LocalHostEngine`) |
| **Run E2E Tests** | `pnpm run test:e2e` | Runs Playwright multi-window integration tests (`e2e/poolpoker.spec.ts`) |
| **Lint Code** | `pnpm run lint` | Runs Biome static check |
| **Format Code** | `pnpm run format` | Runs `biome format --write .` |

---

## 4. Repository Directory Structure

```text
PoolPoker/
├── android/                 # Android Gradle multi-module project (:app, :wear-app, :phone-companion, :shared-models)
├── apple/                   # iOS (Tauri) and Apple Watch (WatchApp/) Xcode project & Swift bridge sources
├── assets/models/           # Blender 3D table source file (billiards_table.blend, tracked by Git LFS)
├── docs/                    # Architecture design, protocol specs, build pipeline, topic docs & UI screenshots
├── e2e/                     # Playwright end-to-end integration tests
├── public/                  # Static assets & runtime 3D table model (models/billiards_table.glb)
├── scripts/                 # Cross-platform model codegen (codegen-models.mjs) & test scripts
├── server/                  # Node.js + Socket.IO authoritative server & core game engine
├── shared/                  # Cross-platform shared layer: JSON Schema (SSOT), generated models & binary BLE codec
├── src/                     # Vue 3 frontend source (components/v1, components/v2, composables, services)
└── src-tauri/               # Tauri v2 Rust core (Android JNI / iOS C-ABI BLE & watch connectivity plugins)
```

---

## 5. Cross-Platform Wire Model Generation (JSON Schema SSOT)

The Draft-07 JSON Schemas under `shared/schemas/` (`card.schema.json`, `room.schema.json`, `wear.schema.json`, `discovery.schema.json`) serve as the **Single Source of Truth (SSOT)** for all cross-platform wire models.

- **Never modify the generated files directly**:
  - `shared/types/generated/wire-models.ts`
  - `android/shared-models/src/main/java/com/poolpoker/shared/generated/WireModels.kt`
  - `apple/Shared/Generated/WireModels.swift`
- **Correct workflow**:
  1. Modify `shared/schemas/*.schema.json`;
  2. Run `pnpm run codegen:models` to regenerate code across all three platforms;
  3. Run `pnpm run codegen:check` and `pnpm run test:unit` to verify consistency before committing.

---

## 6. Mobile & Smartwatch Builds

### 6.1 iOS & Apple Watch (Xcode Run Prerequisites)

The `poolpoker_iOS` Target in `apple/poolpoker.xcodeproj` depends on **Tauri v2** and the **Rust static library (`libapp.a`)**. When you click **Run (⌘R)** in Xcode, Xcode's `Build Rust Code` script automatically invokes `pnpm run build` and `cargo build`.

Attempting to run directly in Xcode without Rust or Tauri installed will result in a build failure. Before running in Xcode for the first time:

```bash
# 1. Install Rust and add iOS device & simulator compilation targets
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# 2. Install frontend and Tauri CLI dependencies, and generate models (including WireModels.swift)
nvm use
pnpm install
pnpm run codegen:models
```

Once completed, open `apple/poolpoker.xcodeproj` in Xcode, select `poolpoker_iOS` or `poolpoker_watchOS`, and click **Run**.

### 6.2 Command Line Pipeline Orchestration (`pnpm pipeline`)

Mobile and smartwatch command-line builds are scheduled via `pnpm pipeline` (sharing the `poolpoker-native` concurrency lock to prevent simultaneous overwrites of `dist/`):

```bash
# Android Debug / Release APK (Requires JDK 17+, Android SDK/NDK, and rustup Android targets)
pnpm pipeline android-debug --full
pnpm pipeline android-release --full

# iOS simulator live debug & Debug / Release builds
pnpm exec tauri ios dev
pnpm pipeline ios-debug --full
pnpm pipeline ios-release --full

# Apple Watch standalone builds
pnpm pipeline watchos-debug --full
pnpm pipeline watchos-release --full

# Dry-run pipeline task graph without building
pnpm pipeline ios-release --full --dry-run
```

> To inject a custom server address into Android / Wear OS locally, configure `POOLPOKER_SERVER_URL` and `POOLPOKER_WATCH_PLAYER_NAME` in `android/gradle.properties.local` (git-ignored). See [Mobile Build Pipeline](docs/mobile_build_pipeline.md).

---

## 7. Testing, Code Style & Commit Guidelines

The repository uses **Husky** Git Hooks to automate verification on each `git commit`:

1. **`pre-commit` Hook**:
   - Runs `pnpm exec vue-tsc --noEmit` (TypeScript type check)
   - Runs `lint-staged` (checks and formats staged files using Biome)
2. **`commit-msg` Hook**:
   - Validates commit messages with `commitlint`, enforcing the **Conventional Commits** standard, e.g.:
     - `feat: add foul penalty sound effect`
     - `fix(ble): handle Android MTU negotiation timeout`
     - `docs: reorganize README and add CONTRIBUTING guide`
     - `refactor(server): simplify turn order rotation`
     - `test: add unit tests for combo multiplier settlement`

Before creating a PR, run the full verification locally:

```bash
pnpm run codegen:check && pnpm run lint && pnpm run test:unit
```
