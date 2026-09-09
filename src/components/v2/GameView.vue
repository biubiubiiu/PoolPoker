<script setup lang="ts">
import type { BallConfig, Card, Player, Room } from '@shared/types/game';
import { defineAsyncComponent } from 'vue';
import GameControlDrawer from './GameControlDrawer.vue';
import GameMinimalHud from './GameMinimalHud.vue';
import HandDeckFan from './HandDeckFan.vue';
import RecordingPlayerDropdown from './RecordingPlayerDropdown.vue';
import TableOpponentSeats from './TableOpponentSeats.vue';

const ThreeBilliardsArena = defineAsyncComponent(() => import('./ThreeBilliardsArena.vue'));

defineProps<{
  room: Room;
  userId: string;
  isHost: boolean;
  myInfo?: Player | null;
  sortedMyCards: Card[];
  turnOrderPlayers: Player[];
  currentShooter?: Player | null;
  breakMode: boolean;
  recordingUserId: string;
  busy: boolean;
  pendingBallNumbers: number[];
  sceneAnimationId?: string | null;
  sceneReset: number;
  ballConfigs: Record<string, BallConfig>;
  activeBallConfigKey: string;
  feedback: string | null;
  activeCards: number;
  displayCards?: Card[] | null;
  displayPocketed?: number[] | null;
  elevatedCardIds: string[];
  discardingCardId?: string | null;
  showControlDrawer: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-drawer'): void;
  (e: 'close-drawer'): void;
  (e: 'select-recording-player', userId: string): void;
  (e: 'next-recording-player'): void;
  (e: 'update:breakMode', val: boolean): void;
  (e: 'table-ball-click', ballNum: number): void;
  (e: 'hand-card-click', card: Card): void;
  (e: 'retract'): void;
  (e: 'open-referee-foul'): void;
  (e: 'open-referee-pocket'): void;
  (e: 'open-rules'): void;
  (e: 'request-restart'): void;
  (e: 'leave-room'): void;
}>();
</script>

<template>
  <main class="game-world">
    <GameMinimalHud :room="room" :isHost="isHost" @open-menu="emit('open-drawer')" />
    <TableOpponentSeats
      :players="room.players"
      :myUserId="userId"
      :currentShooterUserId="breakMode ? undefined : currentShooter?.userId"
      :turnOrder="room.turnOrder"
      @select-player="emit('select-recording-player', $event.userId)"
    />
    <div class="recording-strip">
      <div class="recording-caption">{{ breakMode ? '开球进球 · 不归属玩家' : '记球对象' }}</div>
      <div class="recording-actions">
        <RecordingPlayerDropdown
          v-if="!breakMode"
          :players="room.players"
          :userId="userId"
          :selectedUserId="recordingUserId"
          @select="emit('select-recording-player', $event)"
        />
        <strong v-else>逐个点选已进球</strong>
        <button
          type="button"
          v-if="!breakMode && room.players.length > 1"
          @click="emit('next-recording-player')"
          aria-label="切换下一位记球对象"
        >
          下一位 →
        </button>
        <button type="button" v-if="breakMode" @click="emit('update:breakMode', false)">完成开球</button>
      </div>
    </div>
    <div v-if="turnOrderPlayers.length" class="turn-order-strip" aria-label="本局击球顺序">
      <span>击球顺序</span>
      <ol>
        <li v-for="(player, index) in turnOrderPlayers" :key="player.userId">
          <span v-if="index" aria-hidden="true">→</span>
          <span>{{ index + 1 }}. {{ player.name }}</span>
          <small v-if="index === 0">首发</small>
        </li>
      </ol>
    </div>
    <div class="table-stage">
      <ThreeBilliardsArena
        :pendingBallNumbers="pendingBallNumbers"
        :pocketedBallNumbers="room.pocketedBallNumbers"
        :animationId="sceneAnimationId"
        :resetKey="sceneReset"
        :disabled="busy || room.status !== 'playing'"
        :colors="ballConfigs[activeBallConfigKey]?.colors"
        @ball-click="emit('table-ball-click', $event)"
      />
    </div>
    <div v-if="feedback" class="action-error" role="alert">{{ feedback }}</div>
    <nav class="table-tools" aria-label="对局快捷操作">
      <button
        type="button"
        :disabled="busy || room.status !== 'playing'"
        :aria-pressed="breakMode"
        @click="emit('update:breakMode', !breakMode)"
      >
        开球模式
      </button>
      <button
        type="button"
        :disabled="busy || room.status !== 'playing'"
        @click="emit('open-referee-foul')"
      >
        犯规罚牌
      </button>
      <button
        type="button"
        :disabled="busy || !room.lastActionText || room.status !== 'playing'"
        @click="emit('retract')"
      >
        ↶ 撤回上一步
      </button>
    </nav>
    <section class="hand-zone" aria-label="我的手牌">
      <div class="hand-heading">
        <span>我的手牌</span>
        <strong>待打 {{ activeCards }} 张</strong>
        <small>手牌 {{ sortedMyCards.length }} · 免打 {{ sortedMyCards.length - activeCards }}</small>
        <small v-if="myInfo?.pocketedCards.length" class="played-cards">
          已出：{{ myInfo.pocketedCards.map(card => `${card.rank}${card.suit}`).join(' ') }}
        </small>
      </div>
      <HandDeckFan
        :key="sceneReset"
        :cards="displayCards ?? sortedMyCards"
        :pocketedBallNumbers="displayPocketed ?? room.pocketedBallNumbers"
        :elevatedCardIds="elevatedCardIds"
        :discardingCardId="discardingCardId"
        :disabled="busy || room.status !== 'playing'"
        @card-click="emit('hand-card-click', $event)"
      />
    </section>

    <!-- 侧滑控制抽屉 (收敛次要操作与实况日志) -->
    <GameControlDrawer
      :show="showControlDrawer"
      :room="room"
      :userId="userId"
      :isHost="isHost"
      :turnOrderPlayers="turnOrderPlayers"
      @close="emit('close-drawer')"
      @retract="emit('retract')"
      @open-referee-pocket="emit('open-referee-pocket')"
      @open-referee-foul="emit('open-referee-foul')"
      @open-rules="emit('open-rules')"
      @request-restart="emit('request-restart')"
      @leave-room="emit('leave-room')"
    />
  </main>
</template>
