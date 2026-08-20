<script setup lang="ts">
import type { Player, Room } from '@shared/types/game';

const props = defineProps<{
  room: Room;
  userId: string;
  turnOrderPlayers: Player[];
}>();

const getBallClass = (ballNum: number) => {
  if (ballNum >= 9 && ballNum <= 15) {
    return `ball-${ballNum} ball-striped`;
  }
  return `ball-${ballNum}`;
};

const getBallName = (ballNum: number) => {
  const map: Record<number, string> = {
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
  return map[ballNum] || `${ballNum}号`;
};

const getCardProgressPercent = (player: Player) => {
  const total = props.room.settings?.cardsPerPlayer || 5;
  const activeCount =
    player.activeCardCount !== undefined ? player.activeCardCount : player.cards ? player.cards.length : 0;
  return Math.max(0, Math.min(100, Math.round((activeCount / total) * 100)));
};

const isPlayerWinner = (player: Player) => {
  if (player.isWinner) return true;
  if (props.room.winners?.some((w) => w.userId === player.userId)) return true;
  return false;
};

const emit = defineEmits<{
  (e: 'open-referee-pocket', userId: string): void;
  (e: 'open-referee-foul', userId: string): void;
}>();
</script>

<template>
  <div class="glass-panel rounded-2xl p-4 shadow-xl">
    <h3 class="text-xs font-bold text-amber-300 mb-2 flex items-center justify-between">
      <span><i class="fa-solid fa-list-ol mr-1 text-emerald-400"></i> 全局赛况 (54张扑克牌库)</span>
      <span class="text-[10px] text-gray-400" v-if="room.deckCount !== undefined">牌库剩余 {{ room.deckCount }} 张扑克</span>
    </h3>

    <!-- 本局击球顺序展示 -->
    <div v-if="room.status === 'playing' && turnOrderPlayers.length > 0" class="mb-3 bg-emerald-950/80 p-3 rounded-xl border border-emerald-500/40 shadow-inner">
      <div class="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <i class="fa-solid fa-arrows-spin text-amber-400"></i> 本局击球顺序
      </div>
      <div class="flex items-center flex-wrap gap-1.5 text-xs">
        <template v-for="(p, idx) in turnOrderPlayers" :key="p.userId">
          <span :class="['px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-all',
                         idx === 0 ? 'bg-amber-400 text-black shadow-md ring-1 ring-amber-300' : 'bg-black/40 text-gray-200 border border-white/10']">
            <span>{{ p.avatar }}</span>
            <span>{{ p.name }}</span>
            <span v-if="idx === 0" class="text-[9px] bg-black/20 text-black px-1 rounded font-black">首发</span>
          </span>
          <i v-if="idx < turnOrderPlayers.length - 1" class="fa-solid fa-arrow-right text-[10px] text-emerald-400/80"></i>
        </template>
      </div>
    </div>

    <!-- 已打出的球号列表 (按点数 1~15 升序) -->
    <div class="mb-3 bg-black/40 p-2.5 rounded-xl border border-white/5">
      <div class="flex items-center justify-between text-[11px] mb-1.5">
        <span class="text-gray-300 font-bold flex items-center gap-1">
          <i class="fa-solid fa-circle-check text-emerald-400"></i> 已打出球号
        </span>
        <span class="text-[10px] text-gray-400">共 {{ room.pocketedBallNumbers ? room.pocketedBallNumbers.length : 0 }} 个球号</span>
      </div>

      <div v-if="room.pocketedBallNumbers && room.pocketedBallNumbers.length > 0" class="flex flex-wrap gap-1.5 items-center">
        <span v-for="ballNum in room.pocketedBallNumbers" :key="ballNum"
              class="inline-flex items-center justify-center text-xs font-black px-2 py-0.5 rounded-full bg-emerald-950/90 text-amber-300 border border-emerald-500/40 shadow-sm">
          <span :class="['w-3.5 h-3.5 rounded-full mr-1 text-[9px] flex items-center justify-center font-bold text-white mini-ball shrink-0', getBallClass(ballNum)]">
            <span class="relative z-10 leading-none text-[8px]">{{ ballNum }}</span>
          </span>
          {{ getBallName(ballNum) }}
        </span>
      </div>
      <div v-else class="text-[10px] text-gray-500 italic">
        暂无打出的球
      </div>
    </div>

    <!-- 玩家赛况列表 -->
    <div class="space-y-2">
      <div v-for="p in room.players" :key="p.userId" 
           :class="['p-2.5 rounded-xl border transition-all flex items-center justify-between',
                    p.userId === userId ? 'bg-emerald-950/60 border-emerald-500/50' : 'bg-black/30 border-white/5']">
        
        <div class="flex items-center space-x-2.5">
          <span class="text-xl">{{ p.avatar }}</span>
          <div>
            <div class="flex items-center space-x-1">
              <span class="font-bold text-xs text-gray-100">{{ p.name }}</span>
              <span v-if="p.userId === userId" class="text-[9px] text-emerald-400 font-bold">(我)</span>
              <span class="text-[9px] bg-amber-950/80 text-amber-300 border border-amber-600/40 px-1 rounded font-bold">
                {{ p.wins }}胜
              </span>
              <span v-if="p.online === false" class="text-[9px] bg-red-950 text-red-300 border border-red-700/50 px-1 rounded animate-pulse">暂离中</span>
            </div>
            <div class="w-24 bg-gray-800 h-1.5 rounded-full mt-1 overflow-hidden">
              <div class="bg-amber-400 h-full transition-all duration-300"
                   :style="{ width: getCardProgressPercent(p) + '%' }"></div>
            </div>
          </div>
        </div>

        <div class="text-right flex flex-col items-end">
          <div class="flex items-center space-x-1.5">
            <span :class="['font-mono font-black text-sm', isPlayerWinner(p) ? 'text-emerald-400 animate-bounce' : 'text-amber-300']">
              {{ isPlayerWinner(p) ? '🏆 胜出' : `还剩 ${p.activeCardCount !== undefined ? p.activeCardCount : (p.cards ? p.cards.length : p.cardCount)} 张` }}
            </span>

            <!-- 代记快捷入口按钮 -->
            <div v-if="room.status === 'playing'" class="flex items-center space-x-1 ml-1">
              <button @click="emit('open-referee-pocket', p.userId)"
                      title="代记该玩家进球"
                      class="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-600/50 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 active:scale-95 cursor-pointer">
                <i class="fa-solid fa-gavel"></i> 代记
              </button>
              <button @click="emit('open-referee-foul', p.userId)"
                      title="代记该玩家犯规"
                      class="bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/50 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 active:scale-95 cursor-pointer">
                <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 罚牌
              </button>
            </div>
          </div>
          <p class="text-[9px] text-gray-400 mt-0.5" v-if="p.pocketedCards && p.pocketedCards.length > 0">
            已消: {{ p.pocketedCards.map(c => `${c.suit}${c.rank}`).join(' ') }}
          </p>
        </div>

      </div>
    </div>
  </div>
</template>
