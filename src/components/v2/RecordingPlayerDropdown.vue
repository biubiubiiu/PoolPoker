<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  players: { userId: string; name: string }[];
  userId: string;
  selectedUserId: string;
}>();
const emit = defineEmits<{ select: [userId: string] }>();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const open = ref(false);
const selected = computed(() => props.players.find((player) => player.userId === props.selectedUserId));
const label = (player: { userId: string; name: string }) =>
  `为 ${player.name}${player.userId === props.userId ? '（我）' : ''} 记球`;

function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function select(userId: string) {
  emit('select', userId);
  close(true);
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
function focusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget)) close();
}
watch(
  () => props.selectedUserId,
  () => close()
);
onMounted(() => document.addEventListener('pointerdown', outside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>

<template>
  <div ref="root" class="recording-dropdown" @keydown.esc.stop.prevent="close(true)" @focusout="focusOut">
    <button ref="trigger" type="button" class="recording-trigger" aria-label="记球对象"
      :aria-expanded="open" aria-controls="recording-player-options" @click="open = !open">
      <span>{{ selected ? label(selected) : '选择记球对象' }}</span>
      <span aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>
    <div v-if="open" id="recording-player-options" class="recording-options" role="group" aria-label="选择记球对象">
      <button v-for="player in players" :key="player.userId" type="button"
        :aria-pressed="player.userId === selectedUserId" @click="select(player.userId)">
        <span>{{ label(player) }}</span><span v-if="player.userId === selectedUserId" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.recording-dropdown { position: relative; min-width: 0; max-width: 75%; z-index: 10; }
.recording-dropdown .recording-trigger {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  font-size: 17px; font-weight: 600; padding: 3px 0;
}
.recording-trigger > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recording-options {
  position: absolute; top: calc(100% + 6px); left: 0; width: max-content;
  min-width: 100%; max-width: min(320px, calc(100vw - 48px)); max-height: 280px;
  overflow-y: auto; padding: 6px; border: 1px solid #52624e; border-radius: 12px;
  background: #172b22; box-shadow: 0 12px 32px #0008;
}
.recording-options button {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 7px;
  text-align: left; font-size: 14px; overflow-wrap: anywhere;
}
.recording-options button:hover, .recording-options button[aria-pressed='true'] { background: #314a39; }
.recording-dropdown button:focus-visible { outline: 2px solid #eadbc0; outline-offset: 2px; }
</style>
