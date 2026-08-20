<script setup lang="ts">
import { usePlayerProfile } from './composables/usePlayerProfile';
import { useSocket } from './composables/useSocket';
import { useGameRoom } from './composables/useGameRoom';

import GameHeader from './components/GameHeader.vue';
import RoomLobby from './components/RoomLobby.vue';
import PokerCard from './components/PokerCard.vue';
import BilliardsTable from './components/BilliardsTable.vue';
import GameLogs from './components/GameLogs.vue';
import AccidentalPocketModal from './components/AccidentalPocketModal.vue';
import RetractBallModal from './components/RetractBallModal.vue';
import RefereePocketModal from './components/RefereePocketModal.vue';
import RefereeFoulModal from './components/RefereeFoulModal.vue';
import VictoryModal from './components/VictoryModal.vue';
import RestartModal from './components/RestartModal.vue';

const {
  userId,
  playerName,
  avatars,
  selectedAvatar,
  selectedBallConfigKey,
  getFinalPlayerName
} = usePlayerProfile();

const { socket } = useSocket();

const {
  room,
  showRestartConfirm,
  showAccidentalModal,
  showRetractModal,
  showRefereePocketModal,
  showRefereeFoulModal,
  refereeTargetUserId,
  ballConfigOptions,
  ballColorStyle,
  isHost,
  myInfo,
  turnOrderPlayers,
  isCardDimmed,
  handleCreateRoom,
  handleJoinRoom,
  handleAdjustCards,
  handleStartGame,
  handleConfirmPocket,
  handleDrawPenalty,
  handleAccidentalConfirm,
  handleRetractConfirm,
  openRefereePocket,
  openRefereeFoul,
  handleRefereePocketConfirm,
  handleRefereeFoulConfirm,
  handleConfirmRestart,
  handleLeaveRoom
} = useGameRoom({
  socket,
  userId,
  playerName,
  selectedAvatar,
  selectedBallConfigKey,
  getFinalPlayerName
});
</script>

<template>
  <div class="flex-1 flex flex-col max-w-md mx-auto w-full px-4 py-3 relative min-h-screen" :style="ballColorStyle">
    
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
               v-model:playerName="playerName"
               v-model:selectedAvatar="selectedAvatar"
               v-model:selectedBallConfigKey="selectedBallConfigKey"
               :avatars="avatars"
               :ballConfigOptions="ballConfigOptions"
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
        </div>

        <div v-if="myInfo && myInfo.cards && myInfo.cards.length > 0" 
             class="flex flex-wrap justify-center items-center gap-2.5 sm:gap-3 py-2 min-h-[120px]">
          <PokerCard v-for="card in myInfo.cards" :key="card.id"
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
            <button @click="showRetractModal = true"
                    class="bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer">
              <i class="fa-solid fa-rotate-left text-blue-400"></i> 撤回
            </button>
            <button @click="showAccidentalModal = true"
                    class="bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer">
              <i class="fa-solid fa-bullseye text-amber-400"></i> 意外进球
            </button>
            <button @click="handleDrawPenalty"
                    class="bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer">
              <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 犯规抽卡
            </button>
          </div>
        </div>

        <!-- 代记模式入口 -->
        <div class="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between">
          <span class="text-[10px] text-amber-300/90 font-bold flex items-center gap-1">
            <i class="fa-solid fa-gavel text-amber-400"></i> 代记模式
          </span>
          <div class="flex items-center space-x-2">
            <button @click="openRefereePocket()"
                    class="bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer shadow">
              <i class="fa-solid fa-gavel text-amber-400"></i> 代记进球
            </button>
            <button @click="openRefereeFoul()"
                    class="bg-red-950/90 hover:bg-red-900 text-red-200 border border-red-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer shadow">
              <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 代记犯规
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
    <AccidentalPocketModal :show="showAccidentalModal"
                           :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                           :myCards="myInfo?.cards || []"
                           @close="showAccidentalModal = false"
                           @confirm="handleAccidentalConfirm" />

    <RetractBallModal :show="showRetractModal"
                      :myPocketedCards="myInfo?.pocketedCards || []"
                      @close="showRetractModal = false"
                      @confirm="handleRetractConfirm" />

    <RefereePocketModal :show="showRefereePocketModal"
                        :players="room?.players || []"
                        :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                        :defaultUserId="refereeTargetUserId"
                        @close="showRefereePocketModal = false"
                        @confirm="handleRefereePocketConfirm" />

    <RefereeFoulModal :show="showRefereeFoulModal"
                      :players="room?.players || []"
                      :defaultUserId="refereeTargetUserId"
                      @close="showRefereeFoulModal = false"
                      @confirm="handleRefereeFoulConfirm" />

    <VictoryModal :winners="room?.winners || []"
                  :isHost="isHost"
                  :players="room?.players || []"
                  :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                  @restart="handleConfirmRestart" />

    <RestartModal :show="showRestartConfirm"
                  @cancel="showRestartConfirm = false"
                  @confirm="handleConfirmRestart" />

  </div>
</template>
