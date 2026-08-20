<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Player } from '../types/game';

const props = defineProps<{
  show: boolean;
  players: Player[];
  pocketedBallNumbers: number[];
  defaultUserId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', targetUserId: string, ballNum: number): void;
}>();

const selectedUserId = ref<string>('');
const selectedBall = ref<number | null>(null);

watch(() => props.show, (newVal) => {
  if (newVal) {
    if (props.defaultUserId && props.players.some(p => p.userId === props.defaultUserId)) {
      selectedUserId.value = props.defaultUserId;
    } else if (props.players.length > 0) {
      selectedUserId.value = props.players[0].userId;
    }
    selectedBall.value = null;
  }
}, { immediate: true });

const targetPlayer = computed(() => {
  return props.players.find(p => p.userId === selectedUserId.value) || null;
});

const availableBalls = computed(() => {
  return Array.from({ length: 15 }, (_, i) => i + 1).filter(b => !props.pocketedBallNumbers.includes(b));
});

const getBallClass = (ballNum: number) => {
  if (ballNum >= 9 && ballNum <= 15) {
    return `ball-${ballNum} ball-striped`;
  }
  return `ball-${ballNum}`;
};

const getBallName = (ballNum: number) => {
  const map: Record<number, string> = {
    1: '1号(A)', 2: '2号(2)', 3: '3号(3)', 4: '4号(4)', 5: '5号(5)',
    6: '6号(6)', 7: '7号(7)', 8: '8号(8)', 9: '9号(9)', 10: '10号(10)',
    11: '11号(J)', 12: '12号(Q)', 13: '13号(K)', 14: '14号(小王)', 15: '15号(大王)'
  };
  return map[ballNum] || `${ballNum}号`;
};

const selectBall = (ballNum: number) => {
  selectedBall.value = ballNum;
};

const onConfirm = () => {
  if (selectedUserId.value && selectedBall.value !== null) {
    emit('confirm', selectedUserId.value, selectedBall.value);
    selectedBall.value = null;
  }
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="glass-panel rounded-3xl p-5 text-center max-w-sm w-full border border-amber-500/40 shadow-2xl space-y-4">
      
      <!-- 弹窗标题栏 -->
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="text-sm font-black text-amber-300 flex items-center gap-1.5">
          <i class="fa-solid fa-gavel text-amber-400"></i> 代记进球
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-white text-xs px-2 py-1 cursor-pointer">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- 步骤1: 选择击球玩家 -->
      <div class="space-y-1.5 text-left">
        <label class="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
          <i class="fa-solid fa-user-check"></i> 1. 选择击球进球的玩家：
        </label>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="p in players" :key="p.userId"
                  @click="selectedUserId = p.userId"
                  :class="['px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer',
                           selectedUserId === p.userId
                             ? 'bg-emerald-500/30 border-emerald-400 text-amber-300 shadow-md ring-1 ring-emerald-400/50'
                             : 'bg-black/40 border-white/10 text-gray-300 hover:border-white/30']">
            <span>{{ p.avatar }}</span>
            <span>{{ p.name }}</span>
          </button>
        </div>
      </div>

      <!-- 步骤2: 选择打进球号 -->
      <div class="space-y-1.5 text-left">
        <label class="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
          <i class="fa-solid fa-circle-dot"></i> 2. 选择场上未打进的球号：
        </label>
        
        <div v-if="availableBalls.length > 0" class="grid grid-cols-5 gap-2 py-1">
          <button v-for="b in availableBalls" :key="b"
                  @click="selectBall(b)"
                  :class="['p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all relative cursor-pointer',
                           selectedBall === b ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400 scale-105' : 'bg-black/40 border-white/10 hover:border-white/30']">
            <div :class="['w-7 h-7 rounded-full text-xs flex items-center justify-center font-bold text-white mini-ball shadow', getBallClass(b)]">
              <span class="relative z-10 leading-none text-[9px]">{{ b }}</span>
            </div>
            <span class="text-[9px] font-bold mt-1 text-gray-200">{{ b }}号</span>
          </button>
        </div>
        <div v-else class="text-xs text-gray-400 py-2 text-center italic">
          场上所有球号已全部进球
        </div>
      </div>

      <!-- 描述框 -->
      <div v-if="targetPlayer && selectedBall !== null" class="bg-emerald-950/50 p-2.5 rounded-xl border border-emerald-500/30 text-xs text-emerald-200 text-left">
        为 <span class="font-black text-amber-300">{{ targetPlayer.name }}</span> 记录打进：
        <span class="font-black text-amber-300 text-sm ml-1">{{ getBallName(selectedBall) }}</span>
        <p class="text-[10px] text-gray-300 mt-1">
          确认后将为 {{ targetPlayer.name }} 记录打进该球。
        </p>
      </div>
      <div v-else class="text-[11px] text-gray-400 italic">
        请选择目标玩家与打进的球号
      </div>

      <!-- 操作按钮 -->
      <div class="flex space-x-2 pt-1">
        <button @click="emit('close')"
                class="flex-1 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded-xl border border-white/10 transition active:scale-95 cursor-pointer">
          取消
        </button>
        <button @click="onConfirm" :disabled="!selectedUserId || selectedBall === null"
                class="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-xs font-black text-black rounded-xl shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer">
          确认代记进球
        </button>
      </div>

    </div>
  </div>
</template>
