<script setup lang="ts">
import type { Card, Player, Room } from '@shared/types/game';
import BilliardsTable from './BilliardsTable.vue';
import GameLogs from './GameLogs.vue';
import PokerCard from './PokerCard.vue';

defineProps<{
  room: Room;
  userId: string;
  myInfo?: Player | null;
  sortedMyCards: Card[];
  turnOrderPlayers: Player[];
  isCardDimmed: (card: Card) => boolean;
}>();

const emit = defineEmits<{
  (e: 'open-rules'): void;
  (e: 'confirm-pocket', card: Card): void;
  (e: 'retract'): void;
  (e: 'open-referee-pocket', targetUserId?: string): void;
  (e: 'open-referee-foul', targetUserId?: string): void;
}>();
</script>

<template>
  <div class="flex-1 flex flex-col space-y-3">
    <!-- 我的扑克手牌区 -->
    <div class="glass-panel rounded-2xl p-4 shadow-2xl relative overflow-hidden border border-emerald-500/30">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-2">
          <span class="text-xs font-bold text-amber-300">我的手上扑克手牌</span>
          <span class="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700/50">
            手上剩余 {{ myInfo?.cards ? myInfo.cards.length : 0 }} 张
          </span>
        </div>
        <button
          type="button"
          @click="emit('open-rules')"
          class="text-[10px] text-sky-300 border border-sky-700/50 bg-sky-950/60 hover:bg-sky-900/60 px-2 py-0.5 rounded-lg font-bold active:scale-95 cursor-pointer flex items-center gap-1"
        >
          <i class="fa-solid fa-circle-question text-sky-400"></i> 规则
        </button>
      </div>

      <div
        v-if="sortedMyCards && sortedMyCards.length > 0"
        class="flex flex-wrap justify-center items-center gap-2.5 sm:gap-3 py-2 min-h-[120px]"
      >
        <PokerCard
          v-for="card in sortedMyCards"
          :key="card.id"
          :card="card"
          :isDimmed="isCardDimmed(card)"
          @click="emit('confirm-pocket', card)"
        />
      </div>

      <div v-else class="text-center py-6 text-emerald-300 space-y-1">
        <span class="text-4xl">🎉</span>
        <p class="font-bold text-sm">你的扑克牌已全部消除完！</p>
      </div>

      <div class="mt-3 pt-2 border-t border-white/10 flex justify-between items-center text-xs">
        <span class="text-gray-400 text-[10px] shrink-0 mr-2">打进球后点击<br>对应扑克卡片销牌</span>

        <div class="flex items-center space-x-2">
          <button
            type="button"
            @click="emit('retract')"
            class="bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer"
          >
            <i class="fa-solid fa-rotate-left text-blue-400"></i> 撤回
          </button>
          <button
            type="button"
            @click="emit('open-referee-pocket')"
            class="bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer shadow"
          >
            <i class="fa-solid fa-gavel text-amber-400"></i> 记录进球
          </button>
          <button
            type="button"
            @click="emit('open-referee-foul')"
            class="bg-red-950/90 hover:bg-red-900 text-red-200 border border-red-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer shadow"
          >
            <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 记录犯规
          </button>
        </div>
      </div>
    </div>

    <!-- 局况对比与球盘表格 -->
    <BilliardsTable
      :room="room"
      :userId="userId"
      :turnOrderPlayers="turnOrderPlayers"
      @open-referee-pocket="emit('open-referee-pocket', $event)"
      @open-referee-foul="emit('open-referee-foul', $event)"
    />

    <!-- 对局实况日志 -->
    <GameLogs :logs="room.logs || []" />
  </div>
</template>
