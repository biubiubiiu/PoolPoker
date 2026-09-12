<script setup lang="ts">
import type { BallConfig, Card, Player, Room } from '@shared/types/game';
import { defineAsyncComponent, ref } from 'vue';
import BallAssignSheet from './BallAssignSheet.vue';
import GameControlDrawer from './GameControlDrawer.vue';
import GameLogTicker from './GameLogTicker.vue';
import GameMinimalHud from './GameMinimalHud.vue';
import HandDeckFan from './HandDeckFan.vue';
import TableOpponentSeats from './TableOpponentSeats.vue';

const ThreeBilliardsArena = defineAsyncComponent(() => import('./ThreeBilliardsArena.vue'));

const props = defineProps<{
  room: Room;
  userId: string;
  isHost: boolean;
  myInfo?: Player | null;
  sortedMyCards: Card[];
  turnOrderPlayers: Player[];
  currentShooter?: Player | null;
  recordingUserId?: string;
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
  (e: 'referee-pocket', targetUserId: string, ballNum: number): void;
  (e: 'break-pocket', ballNum: number): void;
  (e: 'hand-card-click', card: Card): void;
  (e: 'retract'): void;
  (e: 'open-referee-foul'): void;
  (e: 'open-referee-pocket'): void;
  (e: 'open-rules'): void;
  (e: 'request-restart'): void;
  (e: 'leave-room'): void;
}>();

const selectedBallForAssign = ref<number | null>(null);

function onTableBallClick(ballNum: number) {
  if (props.busy || props.room.status !== 'playing' || props.room.pocketedBallNumbers.includes(ballNum)) {
    return;
  }
  selectedBallForAssign.value = ballNum;
}

function handleAssignPlayer(targetUserId: string, ballNum: number) {
  emit('referee-pocket', targetUserId, ballNum);
}

function handleAssignBreak(ballNum: number) {
  emit('break-pocket', ballNum);
}
</script>

<template>
  <main class="game-world">
    <GameMinimalHud :room="room" :isHost="isHost" @open-menu="emit('open-drawer')" />
    <TableOpponentSeats
      :players="room.players"
      :myUserId="userId"
      :currentShooterUserId="currentShooter?.userId"
      :turnOrder="room.turnOrder"
      @select-player="emit('select-recording-player', $event.userId)"
    />
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
        @ball-click="onTableBallClick"
      />
    </div>
    <div v-if="feedback" class="action-error" role="alert">{{ feedback }}</div>
    <GameLogTicker :logs="room.logs || []" />
    <section class="hand-zone" aria-label="我的手牌">
      <HandDeckFan
        :key="sceneReset"
        :cards="displayCards ?? sortedMyCards"
        :pocketedBallNumbers="displayPocketed ?? room.pocketedBallNumbers"
        :elevatedCardIds="elevatedCardIds"
        :discardingCardId="discardingCardId"
        :disabled="busy || room.status !== 'playing'"
        :playedCards="myInfo?.pocketedCards"
        @card-click="emit('hand-card-click', $event)"
      />
    </section>

    <!-- 极速归属派发浮层 (方案 A: 点球即选人归属/公球免打) -->
    <BallAssignSheet
      :show="selectedBallForAssign !== null"
      :ballNumber="selectedBallForAssign"
      :players="room.players"
      :myUserId="userId"
      :currentShooterUserId="currentShooter?.userId"
      @close="selectedBallForAssign = null"
      @assign-player="handleAssignPlayer"
      @assign-break="handleAssignBreak"
    />

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
