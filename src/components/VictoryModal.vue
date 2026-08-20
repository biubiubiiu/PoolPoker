<script setup lang="ts">
import { computed } from 'vue';
import type { Player, Card } from '../types/game';

const props = defineProps<{
  winners: Player[];
  isHost: boolean;
  players: Player[];
  pocketedBallNumbers: number[];
}>();

const emit = defineEmits<{
  (e: 'restart'): void;
}>();

const getSuitColor = (card: Card) => {
  if (card.color === 'red') return 'text-red-400';
  if (card.color === 'gold') return 'text-amber-400';
  if (card.color === 'gray') return 'text-gray-400';
  return 'text-gray-200';
};

// 把某位玩家的牌分成三类
const getPlayerCards = (player: Player) => {
  const pocketedSet = new Set(props.pocketedBallNumbers);
  const scored: Card[] = player.pocketedCards || [];
  const free: Card[] = (player.cards || []).filter(c => pocketedSet.has(c.ballNumber));
  const remaining: Card[] = (player.cards || []).filter(c => !pocketedSet.has(c.ballNumber));
  return { scored, free, remaining };
};

const isWinner = (player: Player) => {
  return props.winners.some(w => w.userId === player.userId) || player.isWinner;
};

const winningPlayers = computed<Player[]>(() => {
  return props.winners.length > 0 ? props.winners : props.players.filter(p => isWinner(p));
});

const winningNamesText = computed(() => {
  return winningPlayers.value.map(p => `${p.avatar} ${p.name}`).join(' 、 ');
});
</script>

<template>
  <div v-if="winners && winners.length > 0" class="fixed inset-0 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
    <div class="glass-panel rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm border-t-2 sm:border-2 border-amber-400/60 shadow-2xl flex flex-col max-h-[92vh]">

      <!-- 顶部胜利信息 -->
      <div class="text-center px-5 pt-5 pb-3 shrink-0">
        <div class="text-4xl animate-pulse mb-1">🏆</div>
        <h3 class="text-[10px] text-amber-300 font-bold uppercase tracking-widest">Victory</h3>
        <h2 class="text-lg font-black text-white mt-0.5">{{ winningNamesText }}</h2>
        <p class="text-xs text-emerald-300 mt-0.5" v-if="winningPlayers.length > 1">共同清空有效手牌，赢得本局胜利！</p>
        <p class="text-xs text-emerald-300 mt-0.5" v-else>率先消完所有手上扑克牌！</p>
      </div>

      <!-- 图例说明 -->
      <div class="flex justify-center gap-3 px-5 pb-2 shrink-0">
        <span class="flex items-center gap-1 text-[10px] text-emerald-300"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>已消除</span>
        <span class="flex items-center gap-1 text-[10px] text-sky-300"><span class="w-2 h-2 rounded-full bg-sky-600 inline-block"></span>免打卡</span>
        <span class="flex items-center gap-1 text-[10px] text-red-300"><span class="w-2 h-2 rounded-full bg-red-600 inline-block"></span>未消除</span>
      </div>

      <!-- 玩家手牌展示（可滚动） -->
      <div class="overflow-y-auto flex-1 px-4 pb-2 space-y-2.5">
        <div v-for="player in players" :key="player.userId"
             :class="['rounded-2xl p-3 border',
                      isWinner(player) ? 'bg-amber-950/60 border-amber-400/50' : 'bg-black/40 border-white/8']">

          <!-- 玩家信息行 -->
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xl">{{ player.avatar }}</span>
            <span class="font-bold text-sm text-gray-100">{{ player.name }}</span>
            <span v-if="isWinner(player)" class="text-[9px] bg-amber-400 text-black font-black px-1.5 py-0.5 rounded-full">🏆 胜出</span>
            <span v-if="player.online === false" class="text-[9px] bg-red-950 text-red-300 border border-red-700/50 px-1 rounded">暂离</span>

            <!-- 累计得分战报 -->
            <span class="ml-auto text-xs font-black text-amber-300 bg-amber-950/90 border border-amber-500/40 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
              <i class="fa-solid fa-trophy text-amber-400 text-[10px]"></i>
              <span>累计得分: {{ player.wins }}胜</span>
            </span>
          </div>

          <!-- 三类牌展示 -->
          <div class="space-y-1.5">

            <!-- 1. 已消除（本人打进） -->
            <template v-if="getPlayerCards(player).scored.length > 0">
              <div class="flex flex-wrap gap-1 items-center">
                <span class="text-[9px] text-emerald-400 font-bold mr-0.5 shrink-0">已消除</span>
                <span v-for="card in getPlayerCards(player).scored" :key="card.id"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-950 text-emerald-200 border border-emerald-600/50">
                  <span :class="getSuitColor(card)">{{ card.suit }}</span>
                  <span>{{ card.rank }}</span>
                  <span class="text-[9px] text-emerald-400/70">·{{ card.ballNumber }}</span>
                </span>
              </div>
            </template>

            <!-- 2. 免打卡（他人代进/意外进球） -->
            <template v-if="getPlayerCards(player).free.length > 0">
              <div class="flex flex-wrap gap-1 items-center">
                <span class="text-[9px] text-sky-400 font-bold mr-0.5 shrink-0">免打卡</span>
                <span v-for="card in getPlayerCards(player).free" :key="card.id"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-sky-950/80 text-sky-300/70 border border-sky-700/30 line-through">
                  <span>{{ card.suit }}</span>
                  <span>{{ card.rank }}</span>
                  <span class="text-[9px] text-sky-400/50">·{{ card.ballNumber }}</span>
                </span>
              </div>
            </template>

            <!-- 3. 未消除（还剩在手的） -->
            <template v-if="getPlayerCards(player).remaining.length > 0">
              <div class="flex flex-wrap gap-1 items-center">
                <span class="text-[9px] text-red-400 font-bold mr-0.5 shrink-0">未消除</span>
                <span v-for="card in getPlayerCards(player).remaining" :key="card.id"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-red-950/80 text-red-200 border border-red-700/40">
                  <span :class="getSuitColor(card)">{{ card.suit }}</span>
                  <span>{{ card.rank }}</span>
                  <span class="text-[9px] text-red-300/70">·{{ card.ballNumber }}</span>
                </span>
              </div>
            </template>

            <!-- 若三类均空（理论上不会出现） -->
            <p v-if="!getPlayerCards(player).scored.length && !getPlayerCards(player).free.length && !getPlayerCards(player).remaining.length"
               class="text-[10px] text-gray-500 italic">暂无牌面数据</p>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="px-4 pb-5 pt-2 shrink-0">
        <button v-if="isHost" @click="emit('restart')"
                class="w-full py-3 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black rounded-xl shadow-lg hover:from-amber-300 hover:to-yellow-400 active:scale-95 cursor-pointer">
          再来一局 <i class="fa-solid fa-rotate-right ml-1"></i>
        </button>
        <p v-else class="text-center text-xs text-gray-400">等待房主开启下一局...</p>
      </div>

    </div>
  </div>
</template>
