# 🎱 PoolPoker

> Real-time multiplayer card combat & pool night companion app — mapping 54 poker cards to pool ball numbers across Web, iOS, Android, Wear OS & Apple Watch, with both Online Server and Serverless Bluetooth LE Face-to-Face modes.

🌐 **Language**: [简体中文](README.md) | **English**

[![Node.js](https://img.shields.io/badge/Node.js-v24-brightgreen?logo=nodedotjs)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v12-orange?logo=pnpm)](https://pnpm.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.5-emerald?logo=vuedotjs)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri)](https://tauri.app/)
[![Android](https://img.shields.io/badge/Android-App-green?logo=android)](https://developer.android.com/)
[![iOS](https://img.shields.io/badge/iOS-App-black?logo=apple)](https://developer.apple.com/)
[![Wear OS](https://img.shields.io/badge/Wear%20OS-Compose-green?logo=wearos)](https://developer.android.com/wear)
[![watchOS](https://img.shields.io/badge/watchOS-SwiftUI-black?logo=apple)](https://developer.apple.com/watchos/)
[![BLE Mesh](https://img.shields.io/badge/Offline-BLE%20Multiplayer-0082FC?logo=bluetooth)](docs/ble_offline_architecture.md)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development & Server](#local-development--server)
  - [Mobile & Smartwatch Builds](#mobile--smartwatch-builds)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Configuration & 3D Assets](#configuration--3d-assets)
- [Documentation Index](#documentation-index)

---

## Overview

**PoolPoker** is a cross-platform multiplayer card & scoring companion app designed for offline pool nights with friends.

It maps a standard **54-card poker deck** to **pool balls 1–15**:
- **A – K** map to **Balls 1 – 13** (always including the 8-ball)
- **Small Joker** maps to **Ball 14**, and **Big Joker** maps to **Ball 15**

Each player is dealt a hand of cards at the start of a round (5 by default). Whenever a ball is pocketed on the physical pool table, players holding the matching rank tap the card to clear it; cards whose corresponding ball has already been pocketed are automatically dimmed as "no need to play". **The first player to clear all valid cards in their hand wins**, and round scores are settled automatically with rank-combo multipliers.

---

## Key Features

- 🃏 **Complete Pool-Poker Rule Engine**: Supports dealing, pocketing cards, auto-dimming pocketed numbers, foul penalty draws, break-shot pockets, accidental pockets, referee proxy recording, full-step state snapshot undo, and combo-multiplier score settlement.
- 📡 **Dual Connectivity (Online Server & Serverless BLE Offline)**:
  - **Online Server Mode**: Create or join rooms via a 4-digit code or 300m geolocation nearby discovery, synchronized in real time over Socket.IO.
  - **Serverless BLE Face-to-Face Mode**: Play in basement pool halls with zero internet access. Phones connect directly over Bluetooth Low Energy (GATT star topology) while the host phone runs the authoritative TypeScript domain engine (`LocalHostEngine`) in-memory.
- 🎱 **Immersive 3D Arena & Classic 2D Views**:
  - **v2 Immersive 3D View**: Three.js six-pocket billiards table rendered from a Blender GLB model with pocket animations, projected ball hit targets, and a 3D fan hand deck.
  - **v1 Classic 2D View**: Compact dashboard with live action logs, switchable anytime.
- 📱⌚ **Full Cross-Platform Coverage**:
  - **Web & Mobile Apps**: Responsive Vue 3 SPA packaged into native Android & iOS apps via Tauri v2.
  - **Wear OS & Apple Watch**: Standalone native smartwatch apps built with Jetpack Compose (`:wear-app`) and SwiftUI (`poolpoker_watchOS`).
- 🔒 **JSON Schema SSOT & Session Security**: Draft-07 JSON Schemas generate TypeScript, Kotlin, and Swift wire models; persistent `userId` and `sessionToken` credentials restore private hands seamlessly on reconnect.

---

## Architecture & Tech Stack

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                            Multi-Platform Clients                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Web Browser  │  │ Android App  │  │   iOS App    │  │ Wear OS / watchOS │  │
│  │ (Vue 3 SPA)  │  │  (Tauri v2)  │  │  (Tauri v2)  │  │ Native Watch Apps │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘  │
└─────────┼─────────────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                 │                    │
          ▼                 ▼                 ▼                    ▼
  [Mode A: Online Server Mode (WebSocket / HTTP Long-Polling / Watch Companion)]
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Node.js Authoritative Server (server/)                                        │
│  socketHandlers.ts ──► gameRoomService.ts ──► gameEngine / gameState / deck   │
│  roomManager.ts (clips private hands per userId + multi-socket broadcast)     │
└───────────────────────────────────────────────────────────────────────────────┘

  [Mode B: Serverless BLE Face-to-Face Mode (Bluetooth Low Energy Mesh)]
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Virtual BLE Transport (src/services/bleTransport.ts)                          │
│  ├─ Host Phone (Peripheral): LocalHostEngine (Pure TS Engine) + GATT Server   │
│  └─ Guest Phone (Central):   Compact Binary Codec + Dynamic MTU Reassembler   │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Web Frontend & 3D** | Vue 3 + TypeScript + Vite + Tailwind CSS + Three.js | Reactive UI, v1/v2 views, 3D table arena, and composables |
| **Mobile Runtime** | Tauri v2 + Rust (`src-tauri/`) | Native Android/iOS packaging, JNI & Swift C-ABI bridges |
| **Android & Wear OS** | Kotlin + Jetpack Compose for Wear OS (`android/`) | `:app`, `:wear-app`, `:phone-companion`, `:shared-models` |
| **iOS & Apple Watch** | Swift + SwiftUI + CoreBluetooth (`apple/`) | iOS host bridge and native `poolpoker_watchOS` companion |
| **Online Backend** | Node.js + Express + Socket.IO (`server/`) | In-memory room lifecycle, CSPRNG deck, undo snapshots, WeCom bot |
| **SSOT & QA** | JSON Schema (`quicktype`) + Vitest + Playwright + Biome | Cross-language model codegen, unit/E2E tests, and linting |

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 24.0.0` (use `nvm use` with the root `.nvmrc`)
- **pnpm**: `>= 12.6.0`
- **Optional Native Toolchains**:
  - **Rust**: `cargo` & `rustup` (for `src-tauri`)
  - **Android / Wear OS**: JDK 17+, Android SDK & NDK
  - **iOS / watchOS**: macOS + Xcode 15+

### Local Development & Server

```bash
# 1. Switch Node version and install dependencies
nvm use
pnpm install

# 2. Start backend (:3000) + frontend Vite dev server (:5173) concurrently
pnpm run dev
```

Other common commands:
- Backend only (watch mode): `pnpm run dev:backend`
- Frontend only (Vite HMR): `pnpm run dev:frontend`
- Production build & start: `pnpm start` (`pnpm run build && tsx server/index.ts`)
- Quick one-step launch script: `./run.sh`

### Mobile & Smartwatch Builds

```bash
# Android Debug / Release APK
pnpm pipeline android-debug --full
pnpm pipeline android-release --full

# iOS Simulator live dev & Debug / Release builds
pnpm exec tauri ios dev
pnpm pipeline ios-debug --full
pnpm pipeline ios-release --full
```

> See [Mobile Build Pipeline](docs/mobile_build_pipeline.md) for `--dry-run` inspection and concurrency slot details.

---

## Testing & Quality Assurance

```bash
pnpm run codegen:models   # Generate TS / Kotlin / Swift wire models from shared/schemas/
pnpm run codegen:check    # Verify generated wire models match JSON schemas
pnpm run test:unit        # Run Vitest unit tests (domain engine, BLE binary protocol, LocalHostEngine)
pnpm run test:e2e         # Run Playwright end-to-end tests
pnpm run lint             # Run Biome lint & type checks
pnpm run format           # Format codebase with Biome
```

---

## Configuration & 3D Assets

1. **Server Runtime (`config.yaml`)**: Configures `port` (`3000`), `room.default_cards_per_player` (`5`), `room.max_players` (`8`), and `room.disconnect_timeout_ms` (`3600000`).
2. **Android / Wear OS Local Properties (`android/gradle.properties.local`)**: Git-ignored file for injecting `POOLPOKER_SERVER_URL` and `POOLPOKER_WATCH_PLAYER_NAME` into `BuildConfig`.
3. **3D Billiards Table (`assets/models/billiards_table.blend` → `public/models/billiards_table.glb`)**: Tracked via Git LFS (`git lfs install --local --skip-repo`). Preserve the six `PocketTarget_*` anchor objects when exporting. See [Table Asset Pipeline](docs/table_asset_pipeline.md).

---

## Documentation Index

| Document | Description |
| :--- | :--- |
| 📖 **[System Architecture Overview (`docs/overview.md`)](docs/overview.md)** | Core rules, dual-mode data flow, module responsibilities, hand clipping, and undo stack |
| 蓝牙 **[BLE Offline Architecture (`docs/ble_offline_architecture.md`)](docs/ble_offline_architecture.md)** | Serverless BLE star topology, `LocalHostEngine`, GATT UUIDs, binary frame spec & dynamic MTU chunking |
| 📍 **[Nearby Room Discovery (`docs/nearby_room_discovery.md`)](docs/nearby_room_discovery.md)** | Geolocation-based nearby room discovery, accuracy convergence, and privacy model |
| 📱 **[Android & Tauri Architecture (`docs/android_tauri_architecture.md`)](docs/android_tauri_architecture.md)** | Android multi-module Gradle setup, Tauri v2 integration, and Wear OS DataLayer sync |
| ⌚ **[Wear OS Native Architecture (`docs/wear_app_architecture.md`)](docs/wear_app_architecture.md)** | Jetpack Compose for Wear OS modules, session recovery, and swipe-to-dismiss navigation |
| 🍎 **[Apple Watch Architecture (`docs/apple_watch_architecture.md`)](docs/apple_watch_architecture.md)** | watchOS 10+ SwiftUI app, Engine.IO long polling, WCSession bridge, and String Catalog localization |
| 🛠️ **[Mobile Build Pipeline (`docs/mobile_build_pipeline.md`)](docs/mobile_build_pipeline.md)** | Android / iOS build orchestration, preflight checks, and concurrency locks |
| 🎱 **[Table Asset Pipeline (`docs/table_asset_pipeline.md`)](docs/table_asset_pipeline.md)** | Blender source conventions, GLB export settings, and pocket target verification |
| 📝 **[Implementation Log (`docs/implement_log.md`)](docs/implement_log.md)** | Round-by-round engineering decisions, reviews, and changelog |
