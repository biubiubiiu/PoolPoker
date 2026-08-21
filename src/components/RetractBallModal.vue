<script setup lang="ts">
import type { Card } from '@shared/types/game';
import { ref } from 'vue';

const props = defineProps<{
  show: boolean;
  myPocketedCards: Card[];
  breakBalls: number[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', cardId: string): void;
  (e: 'confirm-break', ballNum: number): void;
}>();

const selectedCardId = ref<string | null>(null);
const selectedBreakBall = ref<number | null>(null);

const getBallClass = (ballNum: number) => {
  if (ballNum >= 9 && ballNum <= 15) {
    return `ball-${ballNum} ball-striped`;
  }
  return `ball-${ballNum}`;
};

const getBallName = (ballNum: number) => {
  const map: Record<number, string> = {
    1: '1号(A)',
    2: '2号(2)',
    3: '3号(3)',
    4: '4号(4)',
    5: '5号(5)',
    6: '6号(6)',
    7: '7号(7)',
    8: '8号(8)',
    9: '9号(9)',
    10: '10号(10)',
    11: '11号(J)',
    12: '12号(Q)',
    13: '13号(K)',
    14: '14号(小王)',
    15: '15号(大王)',
  };
  return map[ballNum] || `${ballNum}号`;
};

const selectCard = (cardId: string) => {
  selectedCardId.value = cardId;
  selectedBreakBall.value = null;
};

const selectBreakBall = (ballNum: number) => {
  selectedBreakBall.value = ballNum;
  selectedCardId.value = null;
};

const hasAnySelection = () => {
  return selectedCardId.value !== null || selectedBreakBall.value !== null;
};

const onConfirm = () => {
  if (selectedCardId.value !== null) {
    emit('confirm', selectedCardId.value);
    selectedCardId.value = null;
  } else if (selectedBreakBall.value !== null) {
    emit('confirm-break', selectedBreakBall.value);
    selectedBreakBall.value = null;
  }
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="glass-panel rounded-3xl p-5 text-center max-w-sm w-full border border-blue-500/40 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="text-sm font-black text-blue-300 flex items-center gap-1.5">
          <i class="fa-solid fa-rotate-left text-blue-400"></i> 撤回进球
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-white text-xs px-2 py-1 cursor-pointer">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <p class="text-xs text-gray-300 text-left leading-relaxed">
        请选择要撤回的进球：可撤回你本局打进的手牌（返回手牌），或撤回记录的开球进球（恢复为场上未进球）：
      </p>

      <!-- 已打进的牌列表 -->
      <div v-if="myPocketedCards.length > 0 || breakBalls.length > 0" class="space-y-3">
        <div v-if="myPocketedCards.length > 0" class="text-left">
          <p class="text-[11px] font-bold text-blue-300 mb-1.5">本局打进的手牌</p>
          <div class="grid grid-cols-5 gap-2">
            <button v-for="card in myPocketedCards" :key="card.id"
                    @click="selectCard(card.id)"
                    :class="['p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all relative cursor-pointer',
                             selectedCardId === card.id ? 'bg-blue-400/20 border-blue-400 ring-2 ring-blue-400 scale-105' : 'bg-black/40 border-white/10 hover:border-white/30']">
              <div :class="['w-7 h-7 rounded-full text-xs flex items-center justify-center font-bold text-white mini-ball shadow', getBallClass(card.ballNumber)]">
                <span class="relative z-10 leading-none text-[9px]">{{ card.ballNumber }}</span>
              </div>
              <span class="text-[9px] font-bold mt-1 text-gray-200">{{ card.ballNumber }}号</span>
              <span class="text-[8px] text-gray-400">{{ card.suit }}{{ card.rank }}</span>
            </button>
          </div>
        </div>

        <div v-if="breakBalls.length > 0" class="text-left">
          <p class="text-[11px] font-bold text-amber-300 mb-1.5">开球进球</p>
          <div class="grid grid-cols-5 gap-2">
            <button v-for="b in breakBalls" :key="b"
                    @click="selectBreakBall(b)"
                    :class="['p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all relative cursor-pointer',
                             selectedBreakBall === b ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400 scale-105' : 'bg-black/40 border-white/10 hover:border-white/30']">
              <div :class="['w-7 h-7 rounded-full text-xs flex items-center justify-center font-bold text-white mini-ball shadow', getBallClass(b)]">
                <span class="relative z-10 leading-none text-[9px]">{{ b }}</span>
              </div>
              <span class="text-[9px] font-bold mt-1 text-gray-200">{{ b }}号</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="py-4 text-xs text-gray-400 italic">
        本局尚未打进任何球，无法撤回
      </div>

      <div v-if="selectedCardId !== null" class="bg-blue-950/40 p-2.5 rounded-xl border border-blue-500/30 text-xs text-blue-200">
        已选择：<span class="font-black text-blue-300 text-sm">{{ getBallName(myPocketedCards.find(c => c.id === selectedCardId)?.ballNumber ?? 0) }}</span>
        <p class="text-[10px] text-gray-300 mt-0.5">确认后该牌将从打出牌中撤回到你的手牌。</p>
      </div>
      <div v-else-if="selectedBreakBall !== null" class="bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/30 text-xs text-amber-200">
        已选择：<span class="font-black text-amber-300 text-sm">{{ getBallName(selectedBreakBall) }}</span>
        <p class="text-[10px] text-gray-300 mt-0.5">确认后该球号将恢复为场上未进球。</p>
      </div>
      <div v-else class="text-[11px] text-gray-400 italic">
        请在上方点击选择要撤回的球号
      </div>

      <div class="flex space-x-2 pt-1">
        <button @click="emit('close')"
                class="flex-1 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded-xl border border-white/10 transition active:scale-95 cursor-pointer">
          取消
        </button>
        <button @click="onConfirm" :disabled="!hasAnySelection()"
                class="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-xs font-black text-white rounded-xl shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer">
          确认撤回
        </button>
      </div>
    </div>
  </div>
</template>
