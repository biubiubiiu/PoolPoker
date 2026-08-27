<script setup lang="ts">
import { ref } from 'vue';
import BilliardsTable from '@/components/BilliardsTable.vue';
import GameHeader from '@/components/GameHeader.vue';
import GameLogs from '@/components/GameLogs.vue';
import PokerCard from '@/components/PokerCard.vue';
import RefereeFoulModal from '@/components/RefereeFoulModal.vue';
import RefereePocketModal from '@/components/RefereePocketModal.vue';
import RestartModal from '@/components/RestartModal.vue';
import RoomLobby from '@/components/RoomLobby.vue';
import VictoryModal from '@/components/VictoryModal.vue';
import { useGameRoom } from '@/composables/useGameRoom';
import { usePlayerProfile } from '@/composables/usePlayerProfile';
import { useSocket } from '@/composables/useSocket';

const { userId, playerName, avatars, selectedAvatar, selectedBallConfigKey, getFinalPlayerName } = usePlayerProfile();

const { socket, serverUrl, savedServerUrls, updateServerUrl, addServerUrl, removeServerUrl } = useSocket();

const {
  room,
  showRestartConfirm,
  showRefereePocketModal,
  showRefereeFoulModal,
  refereeTargetUserId,
  ballConfigOptions,
  ballColorStyle,
  isHost,
  myInfo,
  sortedMyCards,
  turnOrderPlayers,
  isCardDimmed,
  handleCreateRoom,
  handleJoinRoom,
  handleAdjustCards,
  handleStartGame,
  handleConfirmPocket,
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
  selectedAvatar,
  selectedBallConfigKey,
  getFinalPlayerName,
  serverUrl,
});

const showRulesModal = ref(false);
</script>

<template>
  <div class="flex-1 flex flex-col max-w-md mx-auto w-full safe-area-spacing relative min-h-dvh" :style="ballColorStyle">
    
    <!-- 顶部状态栏 -->
    <GameHeader v-if="room"
                :room="room"
                :isHost="isHost"
                @request-restart="showRestartConfirm = true"
                @leave-room="handleLeaveRoom" />

    <!-- 登录大厅 / 房间等待视图 -->
    <RoomLobby v-if="!room || room.status === 'waiting' || room.status === 'lobby'"
               :room="room"
               :userId="userId"
               :isHost="isHost"
               :serverUrl="serverUrl"
               :savedServerUrls="savedServerUrls"
               v-model:playerName="playerName"
               v-model:selectedAvatar="selectedAvatar"
               v-model:selectedBallConfigKey="selectedBallConfigKey"
               :avatars="avatars"
               :ballConfigOptions="ballConfigOptions"
               @update:serverUrl="updateServerUrl"
               @add-server-url="addServerUrl"
               @remove-server-url="removeServerUrl"
               @create-room="handleCreateRoom"
               @join-room="handleJoinRoom"
               @adjust-cards="handleAdjustCards"
               @start-game="handleStartGame" />

    <!-- 游戏进行/结算主界面 -->
    <div v-else-if="room && (room.status === 'playing' || room.status === 'ended' || room.status === 'finished')" class="flex-1 flex flex-col space-y-3">
      
      <!-- 我的扑克手牌区 -->
      <div class="glass-panel rounded-2xl p-4 shadow-2xl relative overflow-hidden border border-emerald-500/30">
        
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold text-amber-300">我的手上扑克手牌</span>
            <span class="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700/50">
              手上剩余 {{ myInfo?.cards ? myInfo.cards.length : 0 }} 张
            </span>
          </div>
          <button @click="showRulesModal = true"
                  class="text-[10px] text-sky-300 border border-sky-700/50 bg-sky-950/60 hover:bg-sky-900/60 px-2 py-0.5 rounded-lg font-bold active:scale-95 cursor-pointer flex items-center gap-1">
            <i class="fa-solid fa-circle-question text-sky-400"></i> 规则
          </button>
        </div>

        <div v-if="sortedMyCards && sortedMyCards.length > 0"
             class="flex flex-wrap justify-center items-center gap-2.5 sm:gap-3 py-2 min-h-[120px]">
          <PokerCard v-for="card in sortedMyCards" :key="card.id"
                     :card="card"
                     :isDimmed="isCardDimmed(card)"
                     @click="handleConfirmPocket" />
        </div>

        <div v-else class="text-center py-6 text-emerald-300 space-y-1">
          <span class="text-4xl">🎉</span>
          <p class="font-bold text-sm">你的扑克牌已全部消除完！</p>
        </div>

        <div class="mt-3 pt-2 border-t border-white/10 flex justify-between items-center text-xs">
          <span class="text-gray-400 text-[10px] shrink-0 mr-2">打进球后点击<br>对应扑克卡片销牌</span>
          
          <div class="flex items-center space-x-2">
            <button @click="handleRetract"
                    class="bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer">
              <i class="fa-solid fa-rotate-left text-blue-400"></i> 撤回
            </button>
            <button @click="openRefereePocket()"
                    class="bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer shadow">
              <i class="fa-solid fa-gavel text-amber-400"></i> 记录进球
            </button>
            <button @click="openRefereeFoul()"
                    class="bg-red-950/90 hover:bg-red-900 text-red-200 border border-red-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer shadow">
              <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 记录犯规
            </button>
          </div>
        </div>

      </div>

      <!-- 局况对比与球盘表格 -->
      <BilliardsTable :room="room"
                      :userId="userId"
                      :turnOrderPlayers="turnOrderPlayers"
                      @open-referee-pocket="openRefereePocket"
                      @open-referee-foul="openRefereeFoul" />

      <!-- 对局实况日志 -->
      <GameLogs :logs="room.logs || []" />

    </div>

    <!-- 弹窗部分 -->

    <RefereePocketModal :show="showRefereePocketModal"
                        :players="room?.players || []"
                        :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                        :defaultUserId="refereeTargetUserId"
                        @close="showRefereePocketModal = false"
                        @confirm="handleRefereePocketConfirm"
                        @confirm-break="handleBreakPocketConfirm" />

    <RefereeFoulModal :show="showRefereeFoulModal"
                      :players="room?.players || []"
                      :defaultUserId="refereeTargetUserId"
                      @close="showRefereeFoulModal = false"
                      @confirm="handleRefereeFoulConfirm" />

    <VictoryModal :winners="room?.winners || []"
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
