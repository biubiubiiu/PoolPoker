<script setup lang="ts">
import type { Room } from '@/types/game';

defineProps<{
  room: Room;
  isHost: boolean;
}>();

const emit = defineEmits<{
  (e: 'request-restart'): void;
  (e: 'leave-room'): void;
}>();
</script>

<template>
  <header class="glass-panel rounded-2xl px-4 py-3 mb-3 flex items-center justify-between shadow-lg">
    <div class="flex items-center space-x-2">
      <span class="text-2xl">🃏</span>
      <div>
        <div class="flex items-center space-x-2">
          <span class="text-xs text-emerald-400 font-bold uppercase tracking-wider">房间数字码</span>
          <span class="font-mono text-xl font-extrabold text-amber-400 tracking-wider">{{ room.code }}</span>
        </div>
        <p class="text-[10px] text-gray-400">第 {{ room.roundCount }} 局 · {{ room.players.length }}人在房间</p>
      </div>
    </div>

    <div class="flex items-center space-x-2">
      <button v-if="isHost" @click="emit('request-restart')" title="重置本局" 
              class="bg-emerald-800/80 hover:bg-emerald-700 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-600/50 transition active:scale-95">
        <i class="fa-solid font-bold fa-rotate-right mr-1"></i>重开
      </button>
      <button @click="emit('leave-room')" title="离开房间" 
              class="bg-red-900/60 hover:bg-red-800 text-xs px-2.5 py-1.5 rounded-lg border border-red-700/50 text-red-200 transition active:scale-95">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>
    </div>
  </header>
</template>
