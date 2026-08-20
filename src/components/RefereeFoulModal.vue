<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Player } from '../types/game';

const props = defineProps<{
  show: boolean;
  players: Player[];
  defaultUserId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', targetUserId: string): void;
}>();

const selectedUserId = ref<string>('');

watch(() => props.show, (newVal) => {
  if (newVal) {
    if (props.defaultUserId && props.players.some(p => p.userId === props.defaultUserId)) {
      selectedUserId.value = props.defaultUserId;
    } else if (props.players.length > 0) {
      selectedUserId.value = props.players[0].userId;
    }
  }
}, { immediate: true });

const targetPlayer = computed(() => {
  return props.players.find(p => p.userId === selectedUserId.value) || null;
});

const onConfirm = () => {
  if (selectedUserId.value) {
    emit('confirm', selectedUserId.value);
  }
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="glass-panel rounded-3xl p-5 text-center max-w-sm w-full border border-red-500/40 shadow-2xl space-y-4">
      
      <!-- 弹窗标题栏 -->
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="text-sm font-black text-red-300 flex items-center gap-1.5">
          <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 代记犯规
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-white text-xs px-2 py-1 cursor-pointer">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <p class="text-xs text-gray-300 text-left leading-relaxed">
        请选择犯规的玩家，确认后将为其从牌库自动<b>罚抽 1 张扑克牌</b>：
      </p>

      <!-- 步骤1: 选择犯规玩家 -->
      <div class="space-y-1.5 text-left">
        <label class="text-[11px] font-bold text-red-300 flex items-center gap-1">
          <i class="fa-solid fa-user-xmark"></i> 选择犯规惩罚的玩家：
        </label>
        <div class="space-y-2">
          <button v-for="p in players" :key="p.userId"
                  @click="selectedUserId = p.userId"
                  :class="['w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer',
                           selectedUserId === p.userId
                             ? 'bg-red-950/60 border-red-500 text-amber-300 shadow-md ring-1 ring-red-500/50'
                             : 'bg-black/40 border-white/10 text-gray-300 hover:border-white/30']">
            <div class="flex items-center space-x-2">
              <span class="text-lg">{{ p.avatar }}</span>
              <span>{{ p.name }}</span>
            </div>
            <span class="text-[10px] text-gray-400 font-normal">
              当前手牌 {{ p.activeCardCount !== undefined ? p.activeCardCount : (p.cards ? p.cards.length : p.cardCount) }} 张
            </span>
          </button>
        </div>
      </div>

      <!-- 确认提示框 -->
      <div v-if="targetPlayer" class="bg-red-950/40 p-2.5 rounded-xl border border-red-500/30 text-xs text-red-200 text-left space-y-1">
        <div>目标玩家：<span class="font-black text-amber-300">{{ targetPlayer.name }}</span></div>
        <p class="text-[10px] text-gray-300">⚠️ 点击确认后系统将自动从扑克牌库给 {{ targetPlayer.name }} 发一罚牌。</p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex space-x-2 pt-1">
        <button @click="emit('close')"
                class="flex-1 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded-xl border border-white/10 transition active:scale-95 cursor-pointer">
          取消
        </button>
        <button @click="onConfirm" :disabled="!selectedUserId"
                class="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-xs font-black text-white rounded-xl shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer">
          确认代记犯规
        </button>
      </div>

    </div>
  </div>
</template>
