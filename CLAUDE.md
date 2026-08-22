# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PoolPoker (球霸扑克) — a real-time multiplayer web game for offline pool nights. 54 poker cards are dealt; card ranks map to pool ball numbers (A–K → 1–13, small joker → 14, big joker → 15, always including the 8-ball). Players create/join rooms via a 4-digit numeric code, then "pocket" balls by tapping the matching card to clear their hand. First to clear all valid cards wins.

## Commands

```bash
npm install          # install dependencies
npm run dev          # run backend (tsx watch) + frontend (Vite HMR) concurrently
npm run dev:backend  # backend only, watch mode (server/index.ts, port 3000)
npm run dev:frontend # Vite dev server only (port 5173, proxies /socket.io → :3000)
npm run build        # vue-tsc type-check + Vite production build → dist/
npm start            # npm run build && tsx server/index.ts
npm run preview      # serve the built dist/
npm run test:unit    # Vitest unit tests for server domain logic
npm run test:e2e     # Playwright end-to-end tests (single chromium project)
npm run lint         # biome check .
npm run format       # biome format --write .
```

- **Run unit tests**: `npm run test:unit` or `npm run test:unit:watch` (test files located in `server/__tests__/*.spec.ts`).
- **Run a single Playwright test**: `npx playwright test -g "<test name>"` (spec is `e2e/poolpoker.spec.ts`).
- The e2e config auto-starts the server via `npm start` (reuses an existing server on `http://127.0.0.1:3000`).
- **Husky** runs on commit: `pre-commit` → `vue-tsc --noEmit` + `lint-staged` (biome); `commit-msg` → commitlint (conventional commits required).
- Unit tests use **Vitest** for fast deterministic domain logic testing. Playwright is used for E2E tests.

## Architecture

Three layers, plus a shared types package that both ends import:

```
Browser (Vue 3 components)
  → src/composables (useGameRoom / useSocket / usePlayerProfile)
  → Socket.IO emit (contract in shared/types/socket.ts)
server/socketHandlers.ts  →  gameEngine.ts / pokerDeck.ts / roomManager.ts
  → broadcastRoomState → room_updated → Vue reactive re-render
```

- **Frontend** (`src/`): Vue 3 + TypeScript + Vite + Tailwind CSS. All business logic lives in three composables; components (`src/components/*.vue`) are presentation + event forwarding. `App.vue` assembles the page and modals (including the inline rules dialog).
- **Backend** (`server/`): Node.js + Express + Socket.IO, run via `tsx`. All room state is held in-memory in `roomManager.ts` (`rooms: Record<string, ServerRoom>`). `socketHandlers.ts` (14 event handlers) is the single mutation entry point.
- **Shared** (`shared/types/`): `game.ts` (domain models: `Card`/`Player`/`Room`/`ServerRoom`) and `socket.ts` (the client↔server event contract). Both ends import these types to keep fields in sync.

Path aliases (defined in both `tsconfig.json` and `vite.config.ts`): `@/` → `src/`, `@shared/` → `shared/`.

## Key constraints & invariants

These are non-obvious and must be preserved when editing:

- **Two room shapes.** `ServerRoom` holds server-internal fields (`deck`, `accidentalBalls`, `lastWinnerUserId`, `lastTurnOrder`); `Room` is the sanitized client view. `getClientRoomState` (in `roomManager.ts`) clips `cards` to only the requesting user (or everyone once the room is `finished`) to prevent leaking active hand cards, while `pocketedCards` (eliminated cards) are public to all players so everyone can see the "已消xxxx" status. Never add a sensitive field to the client view without clipping it here.
- **Identity & rejoin security.** Players have a persistent `userId` (client-generated, stored in `localStorage`) plus a per-session `sessionToken` (`crypto.randomUUID`). `rejoin_room` must verify `player.sessionToken === sessionToken` or reject with an "身份凭证失效" error.
- **CSPRNG only.** All randomness uses `node:crypto` (`crypto.randomInt` for shuffle/room codes, `crypto.randomUUID` for tokens). Never use `Math.random`.
- **Win condition is ball-number-based, not card-based.** The global "already-pocketed ball numbers" set is the union of `accidentalBalls` + every player's `pocketedCards` (`getPocketedBallNumbers`). A player wins when none of their remaining cards map to an unpocketed ball number. The UI greys out (dims) cards whose ball number is already pocketed ("已进球·无需打出") — a deliberate design that shows "no need to play" without revealing other hands.
- **Host authority.** `update_settings` and `start_game` are host-only; the host is resolved via the `socketIndex` reverse index (`socketId → { roomCode, userId }`). On host leave, hosting transfers to the first remaining player; empty rooms are deleted.

## Configuration

- `config.yaml` — server runtime settings: `port` (default 3000), `room.default_cards_per_player` (5), `room.max_players` (8), `room.disconnect_timeout_ms` (1h). Loaded by `server/config.ts`; missing/invalid values fall back to defaults.
- `ball_configs.json` — ball color themes (`default`, `xingpai`), each mapping ball numbers 0–15 to a `[hi, mid, lo]` gradient. Served via `GET /api/ball-configs`; missing/invalid `default` causes `process.exit(1)`.

## HTTP API (Express, `server/index.ts`)

- `GET /api/ball-configs` — ball color themes.
- `GET /api/rooms/:code?userId=...` — HTTP snapshot of sanitized room state (used by clients for fast re-sync on reconnect/tab-foreground). 404 if the room doesn't exist.

## Docs

`docs/overview.md` is the authoritative deep-dive: full data-flow diagram, per-file responsibilities, and implementation history. `docs/implement_log.md` records round-by-round implementation decisions. Consult these before making architectural changes; keep them in sync for substantive work.
