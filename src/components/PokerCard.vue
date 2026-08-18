<script setup lang="ts">
import type { Card } from '../types/game';

const props = defineProps<{
  card: Card;
  isDimmed: boolean;
}>();

const emit = defineEmits<{
  (e: 'click', card: Card): void;
}>();

const getColorClass = (color: string) => {
  if (color === 'red') return 'color-red';
  if (color === 'black') return 'color-black';
  if (color === 'gold') return 'color-gold';
  return 'color-gray';
};

const getBallClass = (ballNum: number) => {
  if (ballNum >= 9 && ballNum <= 15) {
    return `ball-${ballNum} ball-striped`;
  }
  return `ball-${ballNum}`;
};
</script>

<template>
  <div @click="emit('click', card)"
       :class="['poker-card-frame relative group', isDimmed ? 'is-dimmed' : 'cursor-pointer']">
    
    <div class="card-corner" :class="getColorClass(card.color)">
      <span>{{ card.rank }}</span>
      <span class="text-sm leading-none">{{ card.suit }}</span>
    </div>

    <div :class="['billiard-ball', getBallClass(card.ballNumber)]">
      <div class="ball-number">{{ card.ballNumber }}</div>
    </div>

    <div class="text-[9px] text-center font-bold text-gray-700 leading-none">
      {{ card.ballNumber }}号球
    </div>

    <!-- 若该球号已被打进，显示免打遮罩 -->
    <div v-if="isDimmed" class="absolute inset-0 bg-black/70 rounded-[9px] flex flex-col items-center justify-center z-10 border border-emerald-500/30">
      <span class="text-emerald-400 font-black text-xs drop-shadow">已进球</span>
      <span class="text-[9px] text-gray-300 font-bold scale-90">无需打出</span>
    </div>
  </div>
</template>
