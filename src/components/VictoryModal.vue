<script setup lang="ts">
import type { Player } from '../types/game';

defineProps<{
  winner: Player | null;
  isHost: boolean;
}>();

const emit = defineEmits<{
  (e: 'restart'): void;
}>();
</script>

<template>
  <div v-if="winner" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="glass-panel rounded-3xl p-6 text-center max-w-xs w-full border-2 border-amber-400/60 shadow-2xl space-y-4 animate-bounce-short">
      <div class="text-6xl animate-pulse">🏆</div>
      <div>
        <h3 class="text-xs text-amber-300 font-bold uppercase tracking-widest">Victory</h3>
        <h2 class="text-xl font-black text-white mt-1 leading-snug">{{ winner.avatar }} {{ winner.name }}</h2>
        <p class="text-xs text-emerald-300 mt-1">率先消完所有手上扑克牌！</p>
      </div>

      <button v-if="isHost" @click="emit('restart')" 
              class="w-full py-3 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black rounded-xl shadow-lg hover:from-amber-300 hover:to-yellow-400 active:scale-95 cursor-pointer">
        再来一局 <i class="fa-solid fa-rotate-right ml-1"></i>
      </button>
      <p v-else class="text-xs text-gray-400">等待房主开启下一局...</p>
    </div>
  </div>
</template>
