<script setup lang="ts">
import type { NearbyRoom } from '@shared/types/discovery';

defineProps<{
  rooms: NearbyRoom[];
  status: string;
  enabled: boolean;
  joining: boolean;
  advertising?: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:enabled', value: boolean): void;
  (e: 'retry'): void;
  (e: 'join', room: NearbyRoom): void;
}>();
</script>

<template>
  <section class="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 space-y-3" aria-label="附近房间">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-bold text-emerald-200">{{ advertising ? '允许附近玩家发现' : '面对面 · 附近房间' }}</h3>
      <label class="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input type="checkbox" :checked="enabled" @change="emit('update:enabled', ($event.target as HTMLInputElement).checked)" aria-label="附近发现" class="accent-emerald-400">
        {{ enabled ? '已开启' : '已关闭' }}
      </label>
    </div>
    <p class="text-xs text-gray-300" role="status">{{ status }}</p>
    <template v-if="enabled && !advertising">
      <div v-for="room in rooms" :key="`${room.source}:${room.roomCode}`" class="flex items-center justify-between gap-3 rounded-lg bg-black/30 p-3" data-testid="nearby-room">
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-white">{{ room.hostName }} 的球局</p>
          <p class="text-xs text-gray-400 mt-1">房间 {{ room.roomCode }} · {{ room.playerCount }}/{{ room.maxPlayers }} 人</p>
        </div>
        <button type="button" :disabled="joining" @click="emit('join', room)" :aria-label="`加入 ${room.hostName} 的球局`" class="shrink-0 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-black disabled:opacity-50 cursor-pointer">
          {{ joining ? '加入中…' : '加入' }}
        </button>
      </div>
    </template>
    <button v-if="enabled && !advertising" type="button" @click="emit('retry')" class="text-xs text-emerald-300 underline underline-offset-4 cursor-pointer">重新定位</button>
  </section>
</template>
