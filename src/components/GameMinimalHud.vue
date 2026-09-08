<script setup lang="ts">
import type { Room } from '@shared/types/game';
import { onBeforeUnmount, ref } from 'vue';
import { useGameAudio } from '@/composables/useGameAudio';

const props = defineProps<{ room: Room; isHost: boolean }>();
const emit = defineEmits<(e: 'open-menu') => void>();
const { isSoundEnabled, toggleSound } = useGameAudio();
const copyMessage = ref('');
let timer: ReturnType<typeof setTimeout>;
const copyRoomCode = async () => {
  try {
    await navigator.clipboard.writeText(props.room.code);
    copyMessage.value = '已复制';
  } catch {
    copyMessage.value = `房间 ${props.room.code}`;
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    copyMessage.value = '';
  }, 1800);
};
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template>
  <header class="game-minimal-hud">
    <button class="room-code" @click="copyRoomCode" aria-label="复制房间号"><span class="status-dot"></span>{{ copyMessage || `#${room.code}` }}</button>
    <span class="round-label">第 {{ room.roundCount || 1 }} 局</span>
    <div class="hud-actions">
      <button @click="toggleSound" :aria-label="isSoundEnabled ? '关闭音效' : '开启音效'" :aria-pressed="isSoundEnabled"><i :class="isSoundEnabled ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-xmark'" aria-hidden="true"></i></button>
      <button @click="emit('open-menu')" aria-label="打开对局菜单"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
    </div>
  </header>
</template>
<style scoped>
.game-minimal-hud { display: flex; align-items: center; justify-content: space-between; padding: 4px 16px; color: #c8c5af; min-height: 52px; }
.room-code { display: flex; align-items: center; gap: 6px; min-height: 40px; font: 12px ui-monospace,monospace; }
.status-dot { width: 5px; height: 5px; background: #91b79b; border-radius: 50%; }
.round-label { font-size: 11px; color: #b6b49c; }
.hud-actions { display: flex; gap: 2px; }
.hud-actions button { width: 40px; height: 40px; border-radius: 50%; font-size: 13px; }
.hud-actions button:hover { background: #ffffff08; }
</style>
