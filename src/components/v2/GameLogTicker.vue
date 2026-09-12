<script setup lang="ts">
import type { GameLog } from '@shared/types/game';
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  logs: GameLog[];
}>();

const showSheet = ref(false);
const panel = ref<HTMLElement>();

const latestLog = computed(() => {
  if (!props.logs || props.logs.length === 0) return null;
  return props.logs[props.logs.length - 1];
});

const reversedLogs = computed(() => {
  if (!props.logs) return [];
  return [...props.logs].reverse();
});

watch(showSheet, async (open) => {
  if (open) {
    await nextTick();
    panel.value?.focus();
  }
});

function getLogCategory(text: string): { label: string; class: string } {
  if (text.includes('犯规') || text.includes('罚抽')) {
    return { label: '犯规', class: 'bg-red-950/80 text-red-300 border-red-700/50' };
  }
  if (text.includes('撤回')) {
    return { label: '撤回', class: 'bg-blue-950/80 text-blue-300 border-blue-700/50' };
  }
  if (text.includes('打进') || text.includes('进球') || text.includes('消去') || text.includes('消牌')) {
    return { label: '进球', class: 'bg-emerald-950/80 text-amber-300 border-emerald-600/50' };
  }
  if (text.includes('开球') || text.includes('公球')) {
    return { label: '公球', class: 'bg-sky-950/80 text-sky-300 border-sky-600/50' };
  }
  if (text.includes('胜出') || text.includes('获胜') || text.includes('赢')) {
    return { label: '胜出', class: 'bg-amber-950/80 text-amber-200 border-amber-500/50' };
  }
  return { label: '动态', class: 'bg-gray-800 text-gray-300 border-white/10' };
}
</script>

<template>
  <div class="game-log-ticker-container px-3 sm:px-6 my-1.5">
    <!-- 常驻单行赛况跑马灯胶囊 -->
    <div
      role="button"
      tabindex="0"
      aria-label="查看对局实况历史流水"
      @click="showSheet = true"
      @keydown.enter.prevent="showSheet = true"
      @keydown.space.prevent="showSheet = true"
      class="ticker-pill flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#0c1f17]/90 hover:bg-[#132c21] border border-emerald-500/30 shadow-md backdrop-blur-md cursor-pointer transition-all active:scale-[0.99] group select-none"
    >
      <!-- 左侧：脉冲状态指示与图标 -->
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <i class="fa-solid fa-bolt text-amber-400 text-[11px]"></i>
      </div>

      <!-- 中部：最新动态播报 -->
      <div class="flex-1 min-w-0 flex items-center text-xs overflow-hidden">
        <Transition name="ticker-slide" mode="out-in">
          <div
            v-if="latestLog"
            :key="latestLog.text + latestLog.time"
            class="flex items-center truncate"
          >
            <span class="text-gray-400 font-mono text-[10px] mr-1.5 shrink-0">
              [{{ latestLog.time }}]
            </span>
            <span class="text-gray-200 font-medium truncate">
              {{ latestLog.text }}
            </span>
          </div>
          <span v-else class="text-gray-500 text-[11px] italic">
            暂无赛况动态 · 对局开始后将在此实时播报
          </span>
        </Transition>
      </div>

      <!-- 右侧：展开入口与条数 -->
      <div class="flex items-center gap-1 text-[10px] text-emerald-400/90 font-bold shrink-0 group-hover:text-emerald-300">
        <span>历史 <b class="font-mono text-amber-300">{{ logs.length }}</b></span>
        <i class="fa-solid fa-chevron-up text-[9px] transition-transform group-hover:-translate-y-0.5"></i>
      </div>
    </div>

    <!-- 弹出的半屏对局日志详情抽屉 / 浮层 -->
    <Transition name="sheet-fade">
      <div
        v-if="showSheet"
        class="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        @click.self="showSheet = false"
        @keydown.esc="showSheet = false"
      >
        <div
          ref="panel"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logs-sheet-title"
          class="sheet-content w-full sm:max-w-md bg-[#0d2118] border-t sm:border border-emerald-500/40 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 text-gray-100 flex flex-col space-y-3 max-h-[75vh] focus:outline-none"
        >
          <!-- 弹窗标题栏 -->
          <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-clock-rotate-left text-amber-400 text-sm"></i>
              <h3 id="logs-sheet-title" class="text-sm font-black text-amber-300 tracking-wide">
                对局实况流水
              </h3>
              <span class="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-700/50 font-mono">
                共 {{ logs.length }} 条
              </span>
            </div>
            <button
              type="button"
              @click="showSheet = false"
              aria-label="关闭实况日志"
              class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>

          <!-- 日志流水列表 (倒序，最新在最上方) -->
          <div
            v-if="reversedLogs.length > 0"
            class="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[50vh] log-scrollbar text-xs"
          >
            <div
              v-for="(log, idx) in reversedLogs"
              :key="idx"
              class="p-2 rounded-xl bg-black/30 border border-white/5 flex items-start gap-2 hover:bg-white/5 transition-colors"
            >
              <!-- 分类微标签 -->
              <span
                :class="[
                  'text-[9px] px-1.5 py-0.5 rounded font-black shrink-0 border mt-0.5',
                  getLogCategory(log.text).class
                ]"
              >
                {{ getLogCategory(log.text).label }}
              </span>

              <!-- 时间与内容 -->
              <div class="flex-1 min-w-0">
                <div class="text-[10px] text-gray-500 font-mono leading-none mb-1">
                  {{ log.time }}
                </div>
                <div class="text-gray-200 leading-snug font-medium break-words">
                  {{ log.text }}
                </div>
              </div>
            </div>
          </div>

          <!-- 空态 -->
          <div v-else class="py-8 text-center text-gray-500 text-xs italic">
            暂无对局历史记录
          </div>

          <!-- 底部收起按钮 -->
          <button
            type="button"
            @click="showSheet = false"
            class="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            收起实况
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ticker-slide-enter-active,
.ticker-slide-leave-active {
  transition: all 0.2s ease-out;
}

.ticker-slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.ticker-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

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
