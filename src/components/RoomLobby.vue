<script setup lang="ts">
import { ref } from 'vue';
import type { Room } from '../types/game';

const props = defineProps<{
  room: Room | null;
  userId: string;
  isHost: boolean;
  playerName: string;
  selectedAvatar: string;
  avatars: string[];
  selectedBallConfigKey: string;
  ballConfigOptions: Array<{ key: string; name: string }>;
}>();
const emit = defineEmits<{
  (e: 'update:playerName', name: string): void;
  (e: 'update:selectedAvatar', avatar: string): void;
  (e: 'update:selectedBallConfigKey', key: string): void;
  (e: 'join-room', code: string): void;
  (e: 'create-room'): void;
  (e: 'adjust-cards', delta: number): void;
  (e: 'start-game'): void;
}>();

const tab = ref<'join' | 'create'>('join');
const joinCode = ref('');

const onJoin = () => {
  if (!joinCode.value.trim()) {
    alert('请输入4位房间码');
    return;
  }
  emit('join-room', joinCode.value.trim());
};
</script>

<template>
  <!-- View 1: 登录/创建与加入 (未在房间中) -->
  <div v-if="!room" class="flex-1 flex flex-col justify-center my-auto py-6">
    <div class="text-center mb-8">
      <div class="inline-block p-4 rounded-full bg-emerald-950/80 border border-emerald-500/30 mb-3 shadow-2xl gold-glow">
        <span class="text-5xl">🃏</span>
      </div>
      <h1 class="text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-200">
        PoolPoker · 球霸扑克
      </h1>
      <p class="text-xs text-emerald-400/80 mt-1">朋友台球聚会 · 54张扑克卡牌对战</p>
    </div>

    <!-- 个人昵称与头像 -->
    <div class="glass-panel rounded-2xl p-5 shadow-2xl mb-5 space-y-4">
      <div>
        <label class="block text-xs text-gray-300 mb-1 font-semibold">你的游戏昵称</label>
        <input :value="playerName" 
               @input="emit('update:playerName', ($event.target as HTMLInputElement).value)"
               type="text" placeholder="请输入你的大名/外号" maxlength="10" 
               class="w-full bg-black/40 border border-emerald-600/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-400">
      </div>

      <div>
        <label class="block text-xs text-gray-300 mb-1.5 font-semibold">选择球桌代号头像</label>
        <div class="flex justify-between gap-2">
          <button v-for="av in avatars" :key="av" 
                  @click="emit('update:selectedAvatar', av)"
                  :class="['w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all', 
                           selectedAvatar === av ? 'bg-amber-400 scale-110 shadow-lg text-black' : 'bg-black/40 border border-white/10 hover:bg-white/10']">
            {{ av }}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs text-gray-300 mb-1.5 font-semibold">球桌球色配置</label>
        <select
          :value="selectedBallConfigKey"
          @change="emit('update:selectedBallConfigKey', ($event.target as HTMLSelectElement).value)"
          class="w-full bg-black/40 border border-emerald-600/40 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
        >
          <option v-for="cfg in ballConfigOptions" :key="cfg.key" :value="cfg.key">{{ cfg.name }}</option>
        </select>
      </div>
    </div>

    <!-- 创建 / 加入 选项卡 -->
    <div class="glass-panel rounded-2xl p-5 shadow-2xl space-y-5">
      <div class="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
        <button @click="tab = 'join'" :class="['py-2 text-xs font-bold rounded-lg transition-all', tab === 'join' ? 'bg-amber-400 text-black shadow' : 'text-gray-400']">
          加入朋友房间
        </button>
        <button @click="tab = 'create'" :class="['py-2 text-xs font-bold rounded-lg transition-all', tab === 'create' ? 'bg-amber-400 text-black shadow' : 'text-gray-400']">
          创建新房间
        </button>
      </div>

      <!-- TAB A: 输入 4 位数字房间码加入 -->
      <div v-if="tab === 'join'" class="space-y-4">
        <div>
          <input v-model="joinCode" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="输入 4 位数字房间码 (如 6824)" maxlength="4"
                 class="w-full bg-black/50 border-2 border-emerald-500/50 text-center font-mono text-2xl font-black tracking-widest py-3 rounded-xl text-amber-300 placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-500 focus:outline-none focus:border-amber-400">
        </div>
        <button @click="onJoin" :disabled="!joinCode" 
                class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-extrabold rounded-xl shadow-lg transition active:scale-98 disabled:opacity-50 cursor-pointer">
          进入球局 <i class="fa-solid fa-arrow-right ml-1"></i>
        </button>
      </div>

      <!-- TAB B: 创建房间 -->
      <div v-if="tab === 'create'" class="space-y-4">
        <button @click="emit('create-room')" 
                class="w-full py-3.5 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black font-extrabold rounded-xl shadow-lg transition active:scale-98 cursor-pointer">
          一键创建数字房间 <i class="fa-solid fa-plus-circle ml-1"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- View 2: 房间等待大厅 -->
  <div v-else-if="room && (room.status === 'waiting' || room.status === 'lobby')" class="flex-1 flex flex-col justify-between py-2 space-y-4">
    <!-- 成员列表 -->
    <div class="glass-panel rounded-2xl p-4 shadow-xl flex-1 flex flex-col">
      <div class="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
        <h2 class="font-extrabold text-sm text-amber-300 flex items-center gap-1.5">
          <i class="fa-solid fa-users text-emerald-400"></i> 已加入玩家 ({{ room.players.length }}/8)
        </h2>
        <span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-600/40 px-2 py-0.5 rounded-full">
          等待房主开局
        </span>
      </div>

      <div class="space-y-2 flex-1 overflow-y-auto pr-1">
        <div v-for="p in room.players" :key="p.userId" 
             class="flex items-center justify-between bg-black/40 border border-white/5 px-3 py-2.5 rounded-xl">
          <div class="flex items-center space-x-3">
            <span class="text-2xl">{{ p.avatar }}</span>
            <div>
              <div class="flex items-center space-x-1.5">
                <span class="font-bold text-sm text-gray-100">{{ p.name }}</span>
                <span v-if="p.userId === room.hostUserId" class="text-[10px] bg-amber-400 text-black font-black px-1.5 py-0.2 rounded">房主</span>
                <span v-if="p.userId === userId" class="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded">我</span>
                <span class="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-600/40 px-1 rounded font-bold">
                  {{ p.wins }}胜
                </span>
              </div>
            </div>
          </div>
          <span v-if="p.online === false" class="text-xs text-red-400 font-mono animate-pulse">暂离</span>
          <span v-else class="text-xs text-emerald-400/80 font-mono">就绪</span>
        </div>
      </div>
    </div>

    <!-- 规则设置 (发牌张数) -->
    <div class="glass-panel rounded-2xl p-4 shadow-xl space-y-3">
      <h3 class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
        <i class="fa-solid fa-sliders text-amber-400"></i> 规则设置
      </h3>

      <div class="bg-black/40 p-3 rounded-xl border border-white/5 flex items-center justify-between">
        <div>
          <span class="block text-xs font-bold text-gray-200">每人初始发牌数</span>
          <span class="text-[10px] text-gray-400">从 54 张扑克牌中发牌</span>
        </div>
        <div class="flex items-center space-x-3">
          <button v-if="isHost" @click="emit('adjust-cards', -1)" class="w-8 h-8 bg-emerald-900 rounded-lg text-base font-bold text-emerald-200 border border-emerald-600/40 active:scale-95 cursor-pointer">-</button>
          <span class="font-mono text-xl font-black text-amber-300 min-w-[50px] text-center">{{ room.settings.cardsPerPlayer }} 张</span>
          <button v-if="isHost" @click="emit('adjust-cards', 1)" class="w-8 h-8 bg-emerald-900 rounded-lg text-base font-bold text-emerald-200 border border-emerald-600/40 active:scale-95 cursor-pointer">+</button>
        </div>
      </div>
    </div>

    <!-- 开始游戏 -->
    <div>
      <button v-if="isHost" @click="emit('start-game')" 
              class="w-full py-3.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-black font-black text-base rounded-xl shadow-xl transition active:scale-98 gold-glow cursor-pointer">
        <i class="fa-solid fa-play mr-1.5"></i> 开始扑克发牌
      </button>
      <div v-else class="text-center py-2 text-xs text-amber-300/80 animate-pulse">
        <i class="fa-solid fa-spinner fa-spin mr-1"></i> 等待房主开始游戏...
      </div>
    </div>
  </div>
</template>
