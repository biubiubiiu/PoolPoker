<script setup lang="ts">
import type { Player } from '@shared/types/game';
import { computed } from 'vue';

const props = defineProps<{
  players: Player[];
  myUserId: string;
  currentShooterUserId?: string;
  turnOrder: string[];
}>();
const emit = defineEmits<(e: 'select-player', player: Player) => void>();
const opponents = computed(() => props.players.filter((p) => p.userId !== props.myUserId));
</script>
<template>
  <nav v-if="opponents.length" class="opponent-seats" aria-label="玩家席位，选择记球对象">
    <button v-for="p in opponents" :key="p.userId" class="seat" :class="{ selected: currentShooterUserId === p.userId }"
      :aria-pressed="currentShooterUserId === p.userId" :aria-label="`为 ${p.name} 记球`" @click="emit('select-player', p)">
      <span class="seat-name">{{ p.name }}</span>
      <span class="seat-count">待打 <b>{{ p.activeCardCount }}</b><span v-if="!p.online"> · 暂离</span></span>
    </button>
    <span v-if="!opponents.length" class="solo-seat">你的专属练习桌</span>
  </nav>
</template>
<style scoped>
.opponent-seats { display: flex; align-items: center; justify-content: safe center; gap: 8px; overflow-x: auto; width: 100%; flex-shrink: 0; padding: 4px 16px 6px; scrollbar-width: thin; }
.seat { min-width: 76px; max-width: 110px; flex-shrink: 0; text-align: center; padding: 4px 8px; border-bottom: 2px solid transparent; transition: border-color 250ms, background 250ms; border-radius: 8px 8px 0 0; }
.seat-name { display: block; font-size: 12px; color: #ece9da; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.seat-count { font-size: 10px; color: #a9b6a9; font-variant-numeric: tabular-nums; }
.seat-count b { color: #e0cc9d; }
.seat.selected { border-color: #d3b982; background: #d3b9820d; }
.solo-seat { font-size: 12px; color: #a4b3a3; padding: 10px; }
</style>
