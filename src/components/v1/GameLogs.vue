<script setup lang="ts">
import type { GameLog } from '@shared/types/game';

defineProps<{
  logs: GameLog[];
}>();
</script>

<template>
  <div class="glass-panel rounded-2xl p-3 shadow-lg flex-1 flex flex-col min-h-[110px]">
    <h4 class="text-[11px] font-bold text-gray-400 mb-1 flex items-center gap-1">
      <i class="fa-solid fa-bolt text-amber-400"></i> 对局实况日志
    </h4>
    <div class="flex-1 overflow-y-auto log-scrollbar text-[11px] space-y-1 pr-1 max-h-[120px]">
      <div v-for="(log, idx) in logs" :key="idx" class="text-gray-300 leading-tight">
        <span class="text-gray-500 font-mono text-[9px] mr-1">[{{ log.time }}]</span>
        <span>{{ log.text }}</span>
      </div>
    </div>
  </div>
</template>
