<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AccountPanel from '@/components/AccountPanel.vue';
import GameHeader from '@/components/GameHeader.vue';
import RefereeFoulModal from '@/components/RefereeFoulModal.vue';
import RefereePocketModal from '@/components/RefereePocketModal.vue';
import RestartModal from '@/components/RestartModal.vue';
import RoomLobby from '@/components/RoomLobby.vue';
import VictoryModal from '@/components/VictoryModal.vue';
import GameViewV1 from '@/components/v1/GameView.vue';
import GameViewV2 from '@/components/v2/GameView.vue';
import { useGameRoom } from '@/composables/useGameRoom';
import { usePlayerProfile } from '@/composables/usePlayerProfile';
import { useSocket } from '@/composables/useSocket';
import { useUiPreferences } from '@/composables/useUiPreferences';
import { authReady, authUser } from '@/services/auth';
import { preloadTableModel } from '@/utils/tableModelLoader';

const { useNewUi } = useUiPreferences();
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
  handleConfirmPocket,
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
const showAccount = ref(false);
const resumeAccountRoom = (code: string, id: string) => {
  localStorage.setItem('billiards_room_id', id);
  handleJoinRoom(code, id);
};
const showRulesModal = ref(false);
const showControlDrawer = ref(false);

onMounted(() => {
  // 当开启新版界面时，利用空闲时间静默预加载 3D 球台组件与 3.38MB GLB 模型，消除开局等待
  const idlePreload = () => {
    import('@/components/v2/ThreeBilliardsArena.vue');
    preloadTableModel();
  };
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(idlePreload);
    } else {
      setTimeout(idlePreload, 1200);
    }
  }
});
</script>

<template>
  <div :class="[useNewUi ? 'app-shell' : 'max-w-md', 'flex-1 flex flex-col mx-auto w-full safe-area-spacing relative min-h-dvh']" :style="ballColorStyle">
    
    <AccountPanel v-if="!authUser || showAccount" :inRoom="!!room" @opened="showAccount=true" @close="showAccount=false" @resume="resumeAccountRoom" />
    <template v-else>
    <button class="account-access" @click="showAccount=true">{{ authUser.nickname }} · {{ authUser.kind==='guest'?'游客':'账号' }}</button>
    <!-- 顶部状态栏 (v1 在所有在房状态下显示，v2 仅在等待大厅时显示) -->
    <GameHeader v-if="room && (!useNewUi || room.status === 'waiting' || room.status === 'lobby')"
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
               v-model:useNewUi="useNewUi"
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

    <!-- v2 新版 3D 沉浸式对局界面 -->
    <GameViewV2
      v-else-if="room && useNewUi"
      :room="room"
      :userId="userId"
      :isHost="isHost"
      :myInfo="myInfo"
      :sortedMyCards="sortedMyCards"
      :turnOrderPlayers="turnOrderPlayers"
      :currentShooter="currentShooter"
      :breakMode="breakMode"
      :recordingUserId="recordingUserId"
      :busy="busy"
      :pendingBallNumbers="pendingBallNumbers"
      :sceneAnimationId="sceneAnimationId"
      :sceneReset="sceneReset"
      :ballConfigs="ballConfigs"
      :activeBallConfigKey="activeBallConfigKey"
      :feedback="feedback"
      :activeCards="activeCards"
      :displayCards="displayCards"
      :displayPocketed="displayPocketed"
      :elevatedCardIds="elevatedCardIds"
      :discardingCardId="discardingCardId"
      :showControlDrawer="showControlDrawer"
      @open-drawer="showControlDrawer = true"
      @close-drawer="showControlDrawer = false"
      @select-recording-player="selectRecordingPlayer"
      @next-recording-player="nextRecordingPlayer"
      @update:breakMode="breakMode = $event"
      @table-ball-click="handleTableBallClick"
      @hand-card-click="handleHandCardClick"
      @retract="handleRetract"
      @open-referee-foul="showControlDrawer = false; openRefereeFoul()"
      @open-referee-pocket="showControlDrawer = false; openRefereePocket()"
      @open-rules="showControlDrawer = false; showRulesModal = true"
      @request-restart="showControlDrawer = false; showRestartConfirm = true"
      @leave-room="handleLeaveRoom"
    />

    <!-- v1 旧版经典对局界面 -->
    <GameViewV1
      v-else-if="room"
      :room="room"
      :userId="userId"
      :isHost="isHost"
      :myInfo="myInfo"
      :sortedMyCards="sortedMyCards"
      :turnOrderPlayers="turnOrderPlayers"
      :isCardDimmed="isCardDimmed"
      @open-rules="showRulesModal = true"
      @confirm-pocket="handleConfirmPocket"
      @retract="handleRetract"
      @open-referee-pocket="openRefereePocket"
      @open-referee-foul="openRefereeFoul"
    />

    </template>
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

<style scoped>
.account-access{align-self:flex-end;position:relative;z-index:30;color:#88e9b9;border:1px solid #35674c;border-radius:999px;padding:7px 14px;font-size:12px;background:#0b2118;margin:6px 12px;cursor:pointer}
</style>
