<script setup lang="ts">
import { ref } from 'vue';
import type { Card } from '../types/game';

const props = defineProps<{
  show: boolean;
  pocketedBallNumbers: number[];
  myCards: Card[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', ballNum: number): void;
}>();

const selectedBall = ref<number | null>(null);

const isBallPocketed = (ballNum: number) => {
  return props.pocketedBallNumbers.includes(ballNum);
};

const isBallInMyHand = (ballNum: number) => {
  return props.myCards.some(c => c.ballNumber === ballNum);
};

const getBallClass = (ballNum: number) => {
  if (ballNum >= 9 && ballNum <= 15) {
    return `ball-${ballNum} ball-striped`;
  }
  return `ball-${ballNum}`;
};

const getBallName = (ballNum: number) => {
  const map: Record<number, string> = {
    1: '1号(A)', 2: '2号(2)', 3: '3号(3)', 4: '4号(4)', 5: '5号(5)',
    6: '6号(6)', 7: '7号(7)', 8: '8号(8)', 9: '9号(9)', 10: '10号(10)',
    11: '11号(J)', 12: '12号(Q)', 13: '13号(K)', 14: '14号(小王)', 15: '15号(大王)'
  };
  return map[ballNum] || `${ballNum}号`;
};

const selectBall = (ballNum: number) => {
  if (isBallPocketed(ballNum)) return;
  selectedBall.value = ballNum;
};

const onConfirm = () => {
  if (selectedBall.value !== null) {
    emit('confirm', selectedBall.value);
    selectedBall.value = null;
  }
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="glass-panel rounded-3xl p-5 text-center max-w-sm w-full border border-amber-500/40 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="text-sm font-black text-amber-300 flex items-center gap-1.5">
          <i class="fa-solid fa-bullseye text-amber-400"></i> 意外进球
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-white text-xs px-2 py-1 cursor-pointer">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <p class="text-xs text-gray-300 text-left leading-relaxed">
        请选择意外打进的球号（全员该球号将判定为已进球，如需罚牌请手动点击<b>犯规</b>）：
      </p>

      <!-- 1-15号球选择网格 -->
      <div class="grid grid-cols-5 gap-2 py-1">
        <button v-for="b in 15" :key="b"
                @click="selectBall(b)"
                :disabled="isBallPocketed(b)"
                :class="['p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all relative',
                         selectedBall === b ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400 scale-105' : 'bg-black/40 border-white/10 hover:border-white/30',
                         isBallPocketed(b) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer']">
          <div :class="['w-7 h-7 rounded-full text-xs flex items-center justify-center font-bold text-white mini-ball shadow', getBallClass(b)]">
            <span class="relative z-10 leading-none text-[9px]">{{ b }}</span>
          </div>
          <span class="text-[9px] font-bold mt-1 text-gray-200">{{ b }}号</span>

          <!-- 状态角标 -->
          <span v-if="isBallPocketed(b)" class="absolute -top-1 -right-1 text-[8px] bg-red-950 text-red-300 border border-red-700/60 px-1 rounded-full scale-75">已打进</span>
          <span v-else-if="isBallInMyHand(b)" class="absolute -top-1 -right-1 text-[8px] bg-blue-950 text-blue-300 border border-blue-700/60 px-1 rounded-full scale-75">我持有</span>
        </button>
      </div>

      <div v-if="selectedBall !== null" class="bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/30 text-xs text-amber-200">
        已选择：<span class="font-black text-amber-300 text-sm">{{ getBallName(selectedBall) }}</span>
        <p class="text-[10px] text-gray-300 mt-0.5">确认后该球将被判定为已打进，全员该球号状态更新。</p>
      </div>
      <div v-else class="text-[11px] text-gray-400 italic">
        请在上方点击选择打进的球号
      </div>

      <div class="flex space-x-2 pt-1">
        <button @click="emit('close')"
                class="flex-1 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded-xl border border-white/10 transition active:scale-95 cursor-pointer">
          取消
        </button>
        <button @click="onConfirm" :disabled="selectedBall === null"
                class="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-xs font-black text-black rounded-xl shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer">
          确认进球
        </button>
      </div>
    </div>
  </div>
</template>
