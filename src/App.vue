<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import GameControlDrawer from '@/components/GameControlDrawer.vue';
import GameHeader from '@/components/GameHeader.vue';
import GameMinimalHud from '@/components/GameMinimalHud.vue';
import HandDeckFan from '@/components/HandDeckFan.vue';
import RefereeFoulModal from '@/components/RefereeFoulModal.vue';
import RefereePocketModal from '@/components/RefereePocketModal.vue';
import RestartModal from '@/components/RestartModal.vue';
import RoomLobby from '@/components/RoomLobby.vue';
import TableOpponentSeats from '@/components/TableOpponentSeats.vue';

const ThreeBilliardsArena = defineAsyncComponent(() => import('@/components/ThreeBilliardsArena.vue'));

import VictoryModal from '@/components/VictoryModal.vue';
import { useGameRoom } from '@/composables/useGameRoom';
import { usePlayerProfile } from '@/composables/usePlayerProfile';
import { useSocket } from '@/composables/useSocket';

const { userId, playerName, selectedBallConfigKey, getFinalPlayerName } = usePlayerProfile();

const { socket, serverUrl, savedServerUrls, updateServerUrl, addServerUrl, removeServerUrl } = useSocket();

const {
  room,
  recordingUserId,
  breakMode,
  pendingAction,
  feedback,
  displayCards,
  displayPocketed,
  sceneAnimationId,
  sceneReset,
  isPresenting,
  selectRecordingPlayer,
  nextRecordingPlayer,
  ballConfigs,
  activeBallConfigKey,
  showRestartConfirm,
  showRefereePocketModal,
  showRefereeFoulModal,
  refereeTargetUserId,
  refereeSelectedBallNum,
  ballConfigOptions,
  ballColorStyle,
  isHost,
  myInfo,
  sortedMyCards,
  turnOrderPlayers,
  currentShooter,
  isMyTurn,
  elevatedCardIds,
  selectableCardIds,
  discardingCardId,
  isCardDimmed,
  handleCreateRoom,
  handleJoinRoom,
  handleAdjustCards,
  handleStartGame,
  handleKickPlayer,
  handleHandCardClick,
  handleTableBallClick,
  handleRetract,
  openRefereePocket,
  openRefereeFoul,
  handleRefereePocketConfirm,
  handleBreakPocketConfirm,
  handleRefereeFoulConfirm,
  handleConfirmRestart,
  handleLeaveRoom,
} = useGameRoom({
  socket,
  userId,
  playerName,
  selectedBallConfigKey,
  getFinalPlayerName,
  serverUrl,
});

const busy = computed(() => pendingAction.value || isPresenting.value);
const activeCards = computed(() => sortedMyCards.value.filter((c) => !isCardDimmed(c)).length);
const pendingBallNumbers = computed(() =>
  room.value?.status === 'playing'
    ? [...new Set(sortedMyCards.value.filter((card) => !isCardDimmed(card)).map((card) => card.ballNumber))]
    : []
);
const showRulesModal = ref(false);
const showControlDrawer = ref(false);
</script>

<template>
  <div class="app-shell flex-1 flex flex-col mx-auto w-full safe-area-spacing relative min-h-dvh" :style="ballColorStyle">
    
    <!-- 顶部状态栏 (仅在等待大厅时显示传统 Header) -->
    <GameHeader v-if="room && (room.status === 'waiting' || room.status === 'lobby')"
                :room="room"
                :isHost="isHost"
                @request-restart="showControlDrawer = false; showRestartConfirm = true"
                @leave-room="handleLeaveRoom" />

    <!-- 登录大厅 / 房间等待视图 -->
    <RoomLobby v-if="!room || room.status === 'waiting' || room.status === 'lobby'"
               :room="room"
               :userId="userId"
               :isHost="isHost"
               :serverUrl="serverUrl"
               :savedServerUrls="savedServerUrls"
               v-model:playerName="playerName"
               v-model:selectedBallConfigKey="selectedBallConfigKey"
               :ballConfigOptions="ballConfigOptions"
               @update:serverUrl="updateServerUrl"
               @add-server-url="addServerUrl"
               @remove-server-url="removeServerUrl"
               @create-room="handleCreateRoom"
               @join-room="handleJoinRoom"
               @adjust-cards="handleAdjustCards"
               @kick-player="handleKickPlayer"
               @start-game="handleStartGame" />

    <main v-else-if="room" class="game-world">
      <GameMinimalHud :room="room" :isHost="isHost" @open-menu="showControlDrawer = true" />
      <TableOpponentSeats :players="room.players" :myUserId="userId"
        :currentShooterUserId="breakMode ? undefined : currentShooter?.userId" :turnOrder="room.turnOrder"
        @select-player="selectRecordingPlayer($event.userId)" />
      <div class="recording-strip">
        <div class="recording-caption">{{ breakMode ? '开球进球 · 不归属玩家' : '记球对象' }}</div>
        <div class="recording-actions">
          <select v-if="!breakMode" aria-label="记球对象" :value="recordingUserId"
            @change="selectRecordingPlayer(($event.target as HTMLSelectElement).value)">
            <option v-for="p in room.players" :key="p.userId" :value="p.userId">为 {{ p.name }}{{ p.userId === userId ? '（我）' : '' }} 记球</option>
          </select>
          <strong v-else>逐个点选已进球</strong>
          <button v-if="!breakMode && room.players.length > 1" @click="nextRecordingPlayer" aria-label="切换下一位记球对象">下一位 →</button>
          <button v-if="breakMode" @click="breakMode = false">完成开球</button>
        </div>
      </div>
      <div v-if="turnOrderPlayers.length" class="turn-order-strip" aria-label="本局击球顺序">
        <span>击球顺序</span>
        <ol><li v-for="(player, index) in turnOrderPlayers" :key="player.userId"><span v-if="index" aria-hidden="true">→</span><span>{{ index + 1 }}. {{ player.name }}</span><small v-if="index === 0">首发</small></li></ol>
      </div>
      <div class="table-stage">
        <ThreeBilliardsArena :pendingBallNumbers="pendingBallNumbers" :pocketedBallNumbers="room.pocketedBallNumbers" :animationId="sceneAnimationId"
          :resetKey="sceneReset" :disabled="busy || room.status !== 'playing'" :colors="ballConfigs[activeBallConfigKey]?.colors"
          @ball-click="handleTableBallClick" />
        <div v-if="myInfo?.pocketedCards.length" class="discard-tray" aria-label="我已打出的牌">
          <span v-for="card in myInfo.pocketedCards.slice(-3)" :key="card.id" :class="{ 'red-card': card.color === 'red' }">{{ card.rank }}{{ card.suit }}</span>
          <small>已出</small>
        </div>
      </div>
      <div v-if="feedback" class="action-error" role="alert">{{ feedback }}</div>
      <nav class="table-tools" aria-label="对局快捷操作">
        <button :disabled="busy || room.status !== 'playing'" :aria-pressed="breakMode" @click="breakMode = !breakMode">开球模式</button>
        <button :disabled="busy || room.status !== 'playing'" @click="openRefereeFoul()">犯规罚牌</button>
        <button :disabled="busy || !room.lastActionText || room.status !== 'playing'" @click="handleRetract">↶ 撤回上一步</button>
      </nav>
      <section class="hand-zone" aria-label="我的手牌">
        <div class="hand-heading"><span>我的手牌</span><strong>待打 {{ activeCards }} 张</strong>
          <small>手牌 {{ sortedMyCards.length }} · 免打 {{ sortedMyCards.length - activeCards }}</small></div>
        <HandDeckFan :key="sceneReset" :cards="displayCards ?? sortedMyCards"
          :pocketedBallNumbers="displayPocketed ?? room.pocketedBallNumbers" :elevatedCardIds="elevatedCardIds"
          :discardingCardId="discardingCardId" :disabled="busy || room.status !== 'playing'" @card-click="handleHandCardClick" />
      </section>

      <!-- 侧滑控制抽屉 (收敛次要操作与实况日志) -->
      <GameControlDrawer
        :show="showControlDrawer"
        :room="room"
        :userId="userId"
        :isHost="isHost"
        :turnOrderPlayers="turnOrderPlayers"
        @close="showControlDrawer = false"
        @retract="handleRetract"
        @open-referee-pocket="showControlDrawer = false; openRefereePocket()"
        @open-referee-foul="showControlDrawer = false; openRefereeFoul()"
        @open-rules="showControlDrawer = false; showRulesModal = true"
        @request-restart="showControlDrawer = false; showRestartConfirm = true"
        @leave-room="handleLeaveRoom"
      />

    </main>

    <!-- 弹窗部分 -->

    <RefereePocketModal :show="showRefereePocketModal"
                        :players="room?.players || []"
                        :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                        :defaultUserId="refereeTargetUserId"
                        :defaultBallNumber="refereeSelectedBallNum"
                        @close="showRefereePocketModal = false"
                        @confirm="handleRefereePocketConfirm"
                        @confirm-break="handleBreakPocketConfirm" />

    <RefereeFoulModal :show="showRefereeFoulModal"
                      :players="room?.players || []"
                      :defaultUserId="refereeTargetUserId"
                      @close="showRefereeFoulModal = false"
                      @confirm="handleRefereeFoulConfirm" />

    <VictoryModal :winners="isPresenting ? [] : room?.winners || []"
                  :isHost="isHost"
                  :players="room?.players || []"
                  :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                  :lastRoundScores="room?.lastRoundScores || []"
                  @restart="handleConfirmRestart" />

    <RestartModal :show="showRestartConfirm"
                  @cancel="showRestartConfirm = false"
                  @confirm="handleConfirmRestart" />

    <!-- 积分规则说明弹窗 -->
    <Transition name="fade">
      <div v-if="showRulesModal"
           class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
           @click.self="showRulesModal = false">
        <div class="glass-panel rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm border-t-2 sm:border-2 border-sky-400/50 shadow-2xl">
          <div class="px-5 pt-5 pb-2 flex items-center justify-between">
            <h3 class="text-sm font-black text-sky-300 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-question text-sky-400"></i> 积分计算规则
            </h3>
            <button @click="showRulesModal = false" class="text-gray-400 hover:text-white text-lg leading-none cursor-pointer">✕</button>
          </div>

          <div class="px-5 pb-5 space-y-4 text-xs text-gray-300">

            <div>
              <p class="font-bold text-white mb-1.5">牌的基础分值</p>
              <div class="space-y-1 pl-2">
                <div class="flex items-center gap-2">
                  <span class="text-amber-300 font-bold w-16">大王 / 小王</span>
                  <span class="text-gray-400">基数 <strong class="text-white">1</strong> 分</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-200 font-bold w-16">其余牌</span>
                  <span class="text-gray-400">基数 <strong class="text-white">2</strong> 分</span>
                </div>
              </div>
            </div>

            <div>
              <p class="font-bold text-white mb-1.5">组合倍率</p>
              <div class="space-y-1 pl-2">
                <div class="flex justify-between"><span class="text-gray-300">单张</span><span class="font-mono text-emerald-300">基数 × 1</span></div>
                <div class="flex justify-between"><span class="text-gray-300">一对</span><span class="font-mono text-emerald-300">(两张基数之和) × 2</span></div>
                <div class="flex justify-between"><span class="text-gray-300">三条</span><span class="font-mono text-emerald-300">(三张基数之和) × 3</span></div>
                <div class="flex justify-between"><span class="text-gray-300">四条</span><span class="font-mono text-emerald-300">(四张基数之和) × 4</span></div>
              </div>
            </div>

            <div class="bg-black/30 rounded-xl p-3 space-y-1.5 border border-white/8">
              <p class="font-bold text-white text-[11px]">示例</p>
              <div class="text-[10px] text-gray-400 space-y-1">
                <p>剩余 <span class="text-white">A、2、2、4、大王</span></p>
                <p class="font-mono text-sky-300">2 + (2+2)×2 + 2 + 1 = <strong class="text-white">13</strong> 分</p>
              </div>
              <div class="text-[10px] text-gray-400 space-y-1">
                <p>剩余 <span class="text-white">A、A、3、3、3</span></p>
                <p class="font-mono text-sky-300">(2+2)×2 + (2+2+2)×3 = <strong class="text-white">26</strong> 分</p>
              </div>
            </div>

            <div>
              <p class="font-bold text-white mb-1.5">结算方式</p>
              <ul class="space-y-1 pl-2 list-disc list-inside text-gray-400">
                <li>每位输家按剩余手牌计算失分</li>
                <li>赢家平分所有输家的总失分</li>
                <li>有余数时，击打赢的玩家多得 <strong class="text-white">1</strong> 分</li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>
