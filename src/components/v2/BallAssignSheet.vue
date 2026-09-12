<script setup lang="ts">
import type { Player } from '@shared/types/game';
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  show: boolean;
  ballNumber: number | null;
  players: Player[];
  myUserId: string;
  currentShooterUserId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'assign-player', targetUserId: string, ballNumber: number): void;
  (e: 'assign-break', ballNumber: number): void;
}>();

const panel = ref<HTMLElement>();

watch(
  () => props.show,
  async (show) => {
    if (show) {
      await nextTick();
      panel.value?.focus();
    }
  }
);

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}

const ballNameMap: Record<number, string> = {
  1: '1号(A)',
  2: '2号(2)',
  3: '3号(3)',
  4: '4号(4)',
  5: '5号(5)',
  6: '6号(6)',
  7: '7号(7)',
  8: '8号(8)',
  9: '9号(9)',
  10: '10号(10)',
  11: '11号(J)',
  12: '12号(Q)',
  13: '13号(K)',
  14: '14号(小王)',
  15: '15号(大王)',
};

const ballLabel = computed(() => {
  if (!props.ballNumber) return '';
  return ballNameMap[props.ballNumber] || `${props.ballNumber}号球`;
});

const getBallClass = (num: number | null) => {
  if (!num) return '';
  if (num >= 9 && num <= 15) {
    return `ball-${num} ball-striped`;
  }
  return `ball-${num}`;
};

function assignPlayer(userId: string) {
  if (props.ballNumber === null) return;
  emit('assign-player', userId, props.ballNumber);
  emit('close');
}

function assignBreak() {
  if (props.ballNumber === null) return;
  emit('assign-break', props.ballNumber);
  emit('close');
}
</script>

<template>
  <Transition name="sheet-fade">
    <div
      v-if="show && ballNumber !== null"
      class="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="emit('close')"
      @keydown="onKeydown"
    >
      <div
        ref="panel"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        class="sheet-content w-full sm:max-w-md bg-[#0d2118] border-t sm:border border-emerald-500/40 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 text-gray-100 flex flex-col space-y-4 focus:outline-none"
      >
        <!-- 标题栏：展示当前击中的球号与名称 -->
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2.5">
            <div
              :class="['w-7 h-7 rounded-full text-xs flex items-center justify-center font-bold text-white mini-ball shadow-md shrink-0', getBallClass(ballNumber)]"
              aria-hidden="true"
            >
              <span class="relative z-10 leading-none text-[10px] font-black">{{ ballNumber }}</span>
            </div>
            <div>
              <h3 id="sheet-title" class="text-sm font-black text-amber-300 tracking-wide">
                {{ ballLabel }} 已入袋
              </h3>
              <p class="text-[10px] text-gray-400">请选择打进该球的归属玩家</p>
            </div>
          </div>
          <button
            type="button"
            @click="emit('close')"
            aria-label="关闭选择器"
            class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- 玩家归属列表 -->
        <div class="space-y-2 max-h-[48vh] overflow-y-auto pr-0.5">
          <div class="text-[10px] font-bold text-emerald-400/90 tracking-wider uppercase flex items-center gap-1 mb-1">
            <i class="fa-solid fa-user-check text-amber-400"></i> 玩家击球归属
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="p in players"
              :key="p.userId"
              type="button"
              @click="assignPlayer(p.userId)"
              :class="[
                'p-2.5 rounded-xl border text-left flex items-center justify-between transition-all active:scale-98 cursor-pointer',
                p.userId === currentShooterUserId
                  ? 'bg-emerald-900/60 hover:bg-emerald-800/80 border-amber-400/60 shadow-lg shadow-emerald-950/50 ring-1 ring-amber-400/40'
                  : 'bg-black/40 hover:bg-white/10 border-white/10'
              ]"
            >
              <div class="flex flex-col min-w-0 pr-2">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-xs text-white truncate max-w-[120px]">{{ p.name }}</span>
                  <span v-if="p.userId === myUserId" class="text-[9px] bg-emerald-700/60 text-emerald-200 px-1 py-0.2 rounded font-bold shrink-0">我</span>
                </div>
                <span class="text-[10px] text-gray-400 mt-0.5">
                  手牌 <b>{{ p.cardCount !== undefined ? p.cardCount : (p.cards ? p.cards.length : 0) }}</b> 张
                </span>
              </div>
              <div class="shrink-0 flex items-center">
                <span
                  v-if="p.userId === currentShooterUserId"
                  class="text-[9px] bg-amber-400 text-black px-1.5 py-0.5 rounded-md font-black shadow-sm flex items-center gap-0.5"
                >
                  <i class="fa-solid fa-crosshairs text-[8px]"></i> 击球手
                </span>
                <span v-else class="text-xs text-emerald-400/80 opacity-60">
                  记入 →
                </span>
              </div>
            </button>
          </div>

          <!-- 开球/公球免打选项 -->
          <div class="pt-2">
            <div class="text-[10px] font-bold text-sky-400/90 tracking-wider uppercase flex items-center gap-1 mb-1">
              <i class="fa-solid fa-cube text-sky-400"></i> 无人归属 / 免打
            </div>
            <button
              type="button"
              @click="assignBreak"
              class="w-full p-2.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/70 border border-sky-600/40 text-left flex items-center justify-between transition-all active:scale-98 cursor-pointer group"
            >
              <div>
                <div class="font-bold text-xs text-sky-200 flex items-center gap-1.5">
                  <span>开球进球 / 公球免打</span>
                  <span class="text-[9px] bg-sky-800/60 text-sky-200 px-1.5 py-0.2 rounded font-semibold">不归属任何玩家</span>
                </div>
                <p class="text-[10px] text-gray-400 mt-0.5">所有持有该球号卡片的玩家均可免打此牌</p>
              </div>
              <span class="text-xs font-bold text-sky-400 group-hover:translate-x-0.5 transition-transform">
                确认 →
              </span>
            </button>
          </div>
        </div>

        <!-- 底部取消按钮 -->
        <button
          type="button"
          @click="emit('close')"
          class="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
        >
          取消
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-fade-enter-active .sheet-content,
.sheet-fade-leave-active .sheet-content {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.sheet-fade-enter-from .sheet-content {
  transform: translateY(100%);
}

@media (min-width: 640px) {
  .sheet-fade-enter-from .sheet-content {
    transform: translateY(16px) scale(0.96);
  }
}

.sheet-fade-leave-to .sheet-content {
  transform: translateY(100%);
}

@media (min-width: 640px) {
  .sheet-fade-leave-to .sheet-content {
    transform: translateY(16px) scale(0.96);
  }
}
</style>
