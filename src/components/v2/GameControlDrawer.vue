<script setup lang="ts">
import type { Player, Room } from '@shared/types/game';
import { nextTick, ref, watch } from 'vue';
import { useGameAudio } from '@/composables/useGameAudio';

const { isHapticEnabled, toggleHaptic } = useGameAudio();
const panel = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;

const props = defineProps<{
  show: boolean;
  room: Room;
  userId: string;
  isHost: boolean;
  turnOrderPlayers: Player[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'retract'): void;
  (e: 'open-referee-pocket'): void;
  (e: 'open-referee-foul'): void;
  (e: 'open-rules'): void;
  (e: 'request-restart'): void;
  (e: 'leave-room'): void;
}>();
watch(
  () => props.show,
  async (show) => {
    if (show) {
      previousFocus = document.activeElement as HTMLElement;
      await nextTick();
      panel.value?.focus();
    } else previousFocus?.focus();
  }
);
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
  if (event.key !== 'Tab') return;
  const buttons = panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
  if (!buttons?.length) return;
  const first = buttons[0],
    last = buttons[buttons.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <Transition name="drawer">
    <div
      v-if="show"
      class="drawer-overlay fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex justify-end"
      @click.self="emit('close')"
    >
      <div ref="panel" role="dialog" aria-modal="true" aria-label="对局菜单" tabindex="-1" @keydown="onKey" class="drawer-content w-full max-w-sm h-full bg-[#0d1f17] border-l border-emerald-500/30 flex flex-col shadow-2xl p-4 overflow-y-auto">
        <!-- 抽屉顶栏 -->
        <div class="flex items-center justify-between pb-3 border-b border-white/10">
          <div class="flex items-center gap-2">
            <span class="text-emerald-400 font-black text-sm">对局菜单</span>
            <span class="text-[10px] text-gray-400 font-mono">房间 #{{ room.code }}</span>
          </div>
          <button
            @click="emit('close')"
            class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="space-y-4 my-4 flex-1">
          <!-- 1. 核心快捷操作 -->
          <div class="space-y-2">
            <div class="text-[11px] font-bold text-gray-400">操作控制</div>
            <div class="grid grid-cols-3 gap-2">
              <button
                @click="emit('retract')" :disabled="!room.lastActionText || room.status !== 'playing'"
                class="bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-700/50 p-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer text-xs"
              >
                <i class="fa-solid fa-rotate-left text-blue-400 text-sm"></i>
                <span>撤回操作</span>
              </button>

              <button
                @click="emit('open-referee-pocket')"
                class="bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/40 p-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer text-xs"
              >
                <i class="fa-solid fa-gavel text-amber-400 text-sm"></i>
                <span>记录进球</span>
              </button>

              <button
                @click="emit('open-referee-foul')"
                class="bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/40 p-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer text-xs"
              >
                <i class="fa-solid fa-triangle-exclamation text-red-400 text-sm"></i>
                <span>记录犯规</span>
              </button>
            </div>
          </div>

          <!-- 2. 对局状态与牌库 -->
          <div class="bg-black/30 rounded-xl p-3 border border-white/5 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">牌库剩余扑克</span>
              <span class="font-mono font-black text-amber-300">{{ room.deckCount ?? 0 }} 张</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">场上已进球数</span>
              <span class="font-mono font-black text-emerald-400">{{ room.pocketedBallNumbers?.length ?? 0 }} / 15</span>
            </div>
          </div>

          <!-- 4. 对局日志缩略 -->
          <div class="bg-black/30 rounded-xl p-3 border border-white/5">
            <div class="text-[11px] font-bold text-gray-400 mb-1.5 flex items-center justify-between">
              <span>实况日志</span>
              <span class="text-[9px] text-gray-500">最近 5 条</span>
            </div>
            <div class="space-y-1 max-h-36 overflow-y-auto text-[11px] text-gray-300">
              <div
                v-for="(log, idx) in (room.logs || []).slice(-5).reverse()"
                :key="idx"
                class="py-0.5 border-b border-white/5 last:border-none"
              >
                <span class="text-gray-500 text-[9px] mr-1">{{ log.time }}</span>
                <span>{{ log.text }}</span>
              </div>
            </div>
          </div>

          <button @click="toggleHaptic" :aria-pressed="isHapticEnabled" class="w-full py-3 text-xs text-gray-300 border-b border-white/10">触觉反馈 · {{ isHapticEnabled ? '已开启' : '已关闭' }}</button>
          <!-- 5. 规则说明入口 -->
          <button
            @click="emit('open-rules')"
            class="w-full py-2.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/60 border border-sky-600/40 text-sky-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <i class="fa-solid fa-circle-question"></i>
            <span>查看积分计算规则</span>
          </button>
        </div>

        <!-- 底部危险操作区 -->
        <div class="pt-3 border-t border-white/10 space-y-2">
          <button
            v-if="isHost"
            @click="emit('request-restart')"
            class="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-black text-xs cursor-pointer active:scale-98"
          >
            重新开始本局对决
          </button>
          <button
            @click="emit('leave-room')"
            class="w-full py-2.5 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-700/50 text-red-300 font-bold text-xs cursor-pointer active:scale-98"
          >
            退出当前房间
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-active .drawer-content,
.drawer-leave-active .drawer-content {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-enter-from .drawer-content {
  transform: translateX(100%);
}

.drawer-leave-to .drawer-content {
  transform: translateX(100%);
}
</style>
