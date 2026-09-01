# 🎱 PoolPoker

> Real-time multiplayer card combat & pool night companion app — mapping 54 poker cards to pool ball numbers across Web, Mobile & Wear OS.

🌐 **Language**: [简体中文](README.md) | **English**

[![Node.js](https://img.shields.io/badge/Node.js-v24-brightgreen?logo=nodedotjs)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-v11-orange?logo=pnpm)](https://pnpm.io/)
[![Vue.js](https://img.shields.io/badge/Vue.js-v3.0-emerald?logo=vuedotjs)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri)](https://tauri.app/)
[![Android](https://img.shields.io/badge/Android-App-green?logo=android)](https://developer.android.com/)
[![iOS](https://img.shields.io/badge/iOS-App-black?logo=apple)](https://developer.apple.com/)
[![Wear OS](https://img.shields.io/badge/Wear%20OS-Compose-green?logo=wearos)](https://developer.android.com/wear)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Quick Launch Script](#1-quick-launch-script)
  - [2. Local Development](#2-local-development)
  - [3. Production Build & Server](#3-production-build--server)
  - [4. Mobile & Wear OS Builds](#4-mobile--wear-os-builds)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Configuration](#configuration)
- [Documentation](#documentation)

---

## Overview

**PoolPoker** is a real-time multiplayer web & mobile application designed for offline pool nights.

The game mechanics map a standard 54-card poker deck to pool ball numbers: A–K map to balls 1–13, small joker to 14, and big joker to 15 (always including the 8-ball). Players create or join a room using a simple 4-digit code and pocket balls by playing matching cards. The first player to clear all valid cards wins.

The application features full real-time synchronization across Web browsers, iOS/Android mobile apps, and Wear OS smartwatches.

---

## Key Features

- 🃏 **Poker Deck & Ball Mapping**: 54 cards (52 standard + 2 jokers) mapped to pool balls 1–15 including the 8-ball.
- 🔢 **4-Digit Quick Rooms**: Simple room code system for instant creation and join via numeric keypad.
- ⚡ **Low-Latency Real-Time Sync**: Real-time card clearing, penalties, and game state updates via Socket.IO.
- 📱⌚ **Cross-Platform Support**: Web browser, iOS & Android apps (Tauri v2), and native Wear OS smartwatch app (Jetpack Compose).
- 🔒 **Seamless Reconnection**: Persistent player identity tokens restore hands automatically after app restart or page refresh.

---

## Architecture

PoolPoker uses a centralized backend domain engine serving multi-platform clients:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                              Clients                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  ┌───────────┐  │
│  │ Vue 3 Web    │   │ iOS App      │   │ Android App  │  │ Wear OS   │  │
│  │ (Browser)    │   │ (Tauri v2)   │   │ (Tauri v2)   │  │ App       │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  └─────┬─────┘  │
└─────────┼──────────────────┼──────────────────┼────────────────┼────────┘
          │                  │                  │                │
          └──────────────────┴────────┬─────────┴────────────────┘
                                      │ WebSocket / DataLayer
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Backend Server                               │
│                     server/socketHandlers.ts                            │
│                                     │                                   │
│           ┌─────────────────────────┼─────────────────────────┐         │
│           ▼                         ▼                         ▼         │
│   gameEngine.ts               pokerDeck.ts              roomManager.ts  │
│ (Domain Rules & Win Cond)    (Shuffle & Deal)       (Room & State Sync) │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Module | Technology | Description |
| :--- | :--- | :--- |
| **Web Frontend** | Vue 3 + TypeScript + Vite + Tailwind CSS | Component-based responsive UI |
| **Mobile Container** | Tauri v2 | Packaging iOS & Android native apps |
| **Wear OS App** | Kotlin + Jetpack Compose for Wear OS | Standalone native smartwatch app |
| **Backend Server** | Node.js + Express + Socket.IO | In-memory room management & domain engine |
| **Quality Assurance** | Vitest + Playwright + Biome | Unit testing, E2E integration tests & linting |

---

## Prerequisites

Before building or running the project, ensure your environment meets the following requirements:

- **Node.js**: `>= 24.0.0` (Recommended: use `nvm`)
- **pnpm**: `>= 10.0.0` (Install via `corepack enable` or `npm i -g pnpm`)
- **Android SDK & JDK 17+ (Optional)**: For building `:app` and `:wear-app`
- **macOS & Xcode 15+ (Optional)**: For building iOS App
- **Rust Toolchain (Optional)**: Cargo & Rust for Tauri CLI native compilation

---

## Getting Started

### 1. Quick Launch Script

Run `run.sh` at the project root to install dependencies, build the frontend, and start the server:

```bash
chmod +x run.sh
./run.sh
```

Open `http://localhost:3000` in your browser.

### 2. Local Development

Run the backend server (port `3000`) and Vite dev server (port `5173`) concurrently with HMR:

```bash
# Switch Node.js version and install dependencies
nvm use
pnpm install

# Start backend + frontend dev mode
pnpm run dev
```

To run services individually:
- Backend only: `pnpm run dev:backend`
- Frontend only: `pnpm run dev:frontend`

### 3. Production Build & Server

Build static frontend assets and launch Express/Socket.IO server in production mode:

```bash
# Build frontend (Vue 3 + TypeScript)
pnpm run build

# Start production server
pnpm start
```

### 4. Mobile & Wear OS Builds

The project uses Tauri v2 to package the web frontend into Android and iOS mobile applications:

#### Android Build (`android/`)
```bash
# Build Debug APK
npm run tauri:android

# Build Release APK (with R8 obfuscation and signing)
npm run tauri:android:build
```
> 💡 Generated Release APK is located at `android/app/build/outputs/apk/release/app-release.apk`. You can also open `android/` directly in Android Studio for multi-module debugging.

#### iOS Build & Debug (`apple/`)
```bash
# Launch iOS simulator / dev mode
npm run tauri:ios

# Build iOS production bundle
npm run tauri:ios:build
```

---

## Testing & Quality Assurance

### Unit Tests (Vitest)
Run unit tests for domain logic, room management, and scoring rules:
```bash
pnpm run test:unit         # Run all unit tests
pnpm run test:unit:watch   # Watch mode for development
```

### Automated E2E Integration Tests (Playwright)
Run end-to-end tests for multi-player room interactions:
```bash
pnpm run test:e2e
```

### Code Style & Linting (Biome)
```bash
pnpm run lint              # Check code style and type errors
pnpm run format            # Format code
```

---

## Configuration

### `config.yaml`
Server runtime configuration:
```yaml
app_name: "PoolPoker · 球霸扑克"
port: 3000                  # Server port

room:
  default_cards_per_player: 5 # Cards per player
  max_players: 8             # Max room capacity
  disconnect_timeout_ms: 3600000 # Disconnect cleanup timeout (ms)
```

### `ball_configs.json`
Pool ball color themes and gradients (supports `default` and `xingpai` theme):
```json
{
  "themes": {
    "default": {
      "balls": {
        "1": ["#FFFF00", "#E6E600", "#999900"],
        "8": ["#333333", "#1A1A1A", "#000000"]
      }
    }
  }
}
```

### `android/gradle.properties.local`
Local environment variables for Android / Wear OS (git-ignored):
```properties
POOLPOKER_SERVER_URL=http://192.168.1.100:3000
POOLPOKER_WATCH_PLAYER_NAME=WatchPlayer
```

---

## Documentation

- 📖 **[System Design & Architecture](docs/overview.md)**: Data flow diagram, domain model contract, and state transitions.
- 📱 **[Android & Tauri Architecture](docs/android_tauri_architecture.md)**: Android Gradle setup, Wearable DataLayer sync, and Tauri v2 integration.
- ⌚ **[Wear OS Native App Architecture](docs/wear_app_architecture.md)**: Jetpack Compose for Wear OS UI layout and swipe-to-dismiss navigation.
- 📝 **[Implementation Log](docs/implement_log.md)**: Historical design decisions and changelog.
