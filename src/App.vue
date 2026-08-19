<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';

import type { Room, Card, Player } from './types/game';
import GameHeader from './components/GameHeader.vue';
import RoomLobby from './components/RoomLobby.vue';
import PokerCard from './components/PokerCard.vue';
import BilliardsTable from './components/BilliardsTable.vue';
import GameLogs from './components/GameLogs.vue';
import AccidentalPocketModal from './components/AccidentalPocketModal.vue';
import VictoryModal from './components/VictoryModal.vue';
import RestartModal from './components/RestartModal.vue';

const socket = ref<Socket | null>(null);
const socketId = ref<string>('');

// 玩家固定的唯一 userId (持久化存在 localStorage)
let savedUserId = localStorage.getItem('billiards_user_id');
if (!savedUserId) {
  savedUserId = 'u_' + Math.random().toString(36).substr(2, 8) + Date.now();
  localStorage.setItem('billiards_user_id', savedUserId);
}
const userId = ref<string>(savedUserId);

// 玩家个人设置
const playerName = ref<string>(localStorage.getItem('billiards_player_name') || '');
const avatars = ['🎱', '🎯', '🔥', '⚡️', '🏆', '💎'];
const selectedAvatar = ref<string>(localStorage.getItem('billiards_player_avatar') || '🎱');

interface BallConfigItem {
  name: string;
  colors: Record<string, [string, string, string]>;
}

interface BallConfigResponse {
  defaultKey: string;
  configs: Record<string, BallConfigItem>;
}

const room = ref<Room | null>(null);
const showRestartConfirm = ref<boolean>(false);
const showAccidentalModal = ref<boolean>(false);
const ballConfigs = ref<Record<string, BallConfigItem>>({});
const selectedBallConfigKey = ref<string>(localStorage.getItem('billiards_ball_config_key') || 'default');

onMounted(async () => {
  const response = await fetch('/api/ball-configs');
  if (!response.ok) {
    throw new Error(`获取球色配置失败: ${response.status}`);
  }
  const data: BallConfigResponse = await response.json();
  ballConfigs.value = data.configs;
  if (!ballConfigs.value[selectedBallConfigKey.value]) {
    selectedBallConfigKey.value = data.defaultKey;
  }

  socket.value = io();

  socket.value.on('connect', () => {
    socketId.value = socket.value?.id || '';
    console.log('[Socket] Connected, ID:', socketId.value);

    // 自动断线重连尝试
    const savedRoomCode = localStorage.getItem('billiards_room_code');
    if (savedRoomCode) {
      socket.value?.emit('rejoin_room', {
        roomCode: savedRoomCode,
        userId: userId.value
      }, (res: { success: boolean; message?: string }) => {
        if (!res.success) {
          console.warn('[Rejoin Failed]', res.message);
          localStorage.removeItem('billiards_room_code');
          room.value = null;
        }
      });
    }
  });

  socket.value.on('room_updated', (updatedRoom: Room) => {
    room.value = updatedRoom;
    showRestartConfirm.value = false;
    if (updatedRoom && updatedRoom.code) {
      localStorage.setItem('billiards_room_code', updatedRoom.code);
    }
    
    if (updatedRoom && updatedRoom.winner) {
      triggerConfetti();
    }
  });

  socket.value.on('room_created', ({ roomCode }: { roomCode: string }) => {
    localStorage.setItem('billiards_room_code', roomCode);
  });

  socket.value.on('error_message', (msg: string) => {
    alert(msg);
  });
});

watch(playerName, (val) => {
  const trimmed = val.trim();
  if (trimmed) {
    localStorage.setItem('billiards_player_name', trimmed);
  } else {
    localStorage.removeItem('billiards_player_name');
  }
});

watch(selectedAvatar, (val) => {
  localStorage.setItem('billiards_player_avatar', val);
});

watch(selectedBallConfigKey, (val) => {
  localStorage.setItem('billiards_ball_config_key', val);
});

const isHost = computed(() => {
  return !!(room.value && room.value.hostUserId === userId.value);
});

const myInfo = computed<Player | null>(() => {
  if (!room.value || !room.value.players) return null;
  return room.value.players.find(p => p.userId === userId.value) || null;
});

const turnOrderPlayers = computed<Player[]>(() => {
  if (!room.value || !room.value.players || !room.value.turnOrder) return [];
  return room.value.turnOrder
    .map(uid => room.value!.players.find(p => p.userId === uid))
    .filter((p): p is Player => !!p);
});

const ballConfigOptions = computed(() => {
  return Object.entries(ballConfigs.value).map(([key, item]) => ({
    key,
    name: item.name
  }));
});

const activeBallConfigKey = computed(() => {
  if (room.value && room.value.settings && ballConfigs.value[room.value.settings.ballConfigKey]) {
    return room.value.settings.ballConfigKey;
  }
  if (ballConfigs.value[selectedBallConfigKey.value]) {
    return selectedBallConfigKey.value;
  }
  throw new Error(`当前球色配置不存在: ${selectedBallConfigKey.value}`);
});

const ballColorStyle = computed<Record<string, string>>(() => {
  const colors = ballConfigs.value[activeBallConfigKey.value].colors;
  const style: Record<string, string> = {};
  for (let i = 1; i <= 15; i++) {
    const [hi, mid, lo] = colors[String(i)];
    style[`--ball-${i}-hi`] = hi;
    style[`--ball-${i}-mid`] = mid;
    style[`--ball-${i}-lo`] = lo;
  }
  return style;
});

const isCardDimmed = (card: Card) => {
  if (!room.value || !room.value.pocketedBallNumbers || !card) return false;
  return room.value.pocketedBallNumbers.includes(card.ballNumber);
};

const triggerConfetti = () => {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
};

// 1. 创建房间
const handleCreateRoom = () => {
  const finalName = playerName.value.trim() || `球友${Math.floor(Math.random() * 900 + 100)}`;
  if (playerName.value.trim()) {
    localStorage.setItem('billiards_player_name', playerName.value.trim());
  }
  socket.value?.emit('create_room', {
    userId: userId.value,
    name: finalName,
    avatar: selectedAvatar.value,
    ballConfigKey: selectedBallConfigKey.value
  });
};

// 2. 加入房间
const handleJoinRoom = (code: string) => {
  const finalName = playerName.value.trim() || `球友${Math.floor(Math.random() * 900 + 100)}`;
  if (playerName.value.trim()) {
    localStorage.setItem('billiards_player_name', playerName.value.trim());
  }

  socket.value?.emit('join_room', {
    roomCode: code,
    userId: userId.value,
    name: finalName,
    avatar: selectedAvatar.value
  }, (res: { success: boolean; message?: string; roomCode?: string }) => {
    if (!res.success) {
      alert(res.message || '加入房间失败');
    } else if (res.roomCode) {
      localStorage.setItem('billiards_room_code', res.roomCode);
    }
  });
};

// 3. 房主调整发牌张数
const handleAdjustCards = (delta: number) => {
  if (!isHost.value || !room.value) return;
  const current = room.value.settings?.cardsPerPlayer || 5;
  const newCount = current + delta;
  if (newCount < 1 || newCount > 10) return;
  socket.value?.emit('update_settings', {
    roomCode: room.value.code,
    settings: { cardsPerPlayer: newCount }
  });
};

// 4. 房主开始游戏
const handleStartGame = () => {
  if (!isHost.value || !room.value) return;
  socket.value?.emit('start_game', { roomCode: room.value.code });
};

// 5. 销牌 / 确认进球
const handleConfirmPocket = (card: Card) => {
  if (!room.value || room.value.status !== 'playing') return;

  if (isCardDimmed(card)) {
    alert(`【${card.ballNumber}号球】已在场上被打进，你的卡片 [${card.suit}${card.rank}] 属于已进球免打卡，无需重复消去！`);
    return;
  }
  
  const confirmText = `确认已经打进 ${card.ballNumber} 号球，消去卡片 [${card.suit}${card.rank}] 吗？`;
  if (window.confirm(confirmText)) {
    socket.value?.emit('pocket_ball', {
      roomCode: room.value.code,
      cardId: card.id
    });
  }
};

// 6. 犯规抽卡
const handleDrawPenalty = () => {
  if (!room.value || room.value.status !== 'playing') return;
  if (window.confirm('确认要执行犯规罚抽 1 张扑克牌吗？')) {
    socket.value?.emit('draw_penalty', {
      roomCode: room.value.code
    });
  }
};

// 7. 意外进球确认
const handleAccidentalConfirm = (ballNum: number) => {
  if (!room.value) return;
  socket.value?.emit('accidental_pocket', {
    roomCode: room.value.code,
    ballNumber: ballNum
  });
  showAccidentalModal.value = false;
};

// 8. 重置房间
const handleConfirmRestart = () => {
  if (!isHost.value || !room.value) return;
  socket.value?.emit('restart_game', { roomCode: room.value.code });
  showRestartConfirm.value = false;
};

// 9. 离开房间
const handleLeaveRoom = () => {
  if (window.confirm('确认离开房间吗？')) {
    if (room.value) {
      socket.value?.emit('leave_room', { roomCode: room.value.code, userId: userId.value });
    }
    localStorage.removeItem('billiards_room_code');
    room.value = null;
  }
};
</script>

<template>
  <div class="flex-1 flex flex-col max-w-md mx-auto w-full px-4 py-3 relative min-h-screen" :style="ballColorStyle">
    
    <!-- 顶部状态栏 -->
    <GameHeader v-if="room"
                :room="room"
                :isHost="isHost"
                @request-restart="showRestartConfirm = true"
                @leave-room="handleLeaveRoom" />

    <!-- 登录大厅 / 房间等待视图 -->
    <RoomLobby v-if="!room || room.status === 'waiting' || room.status === 'lobby'"
               :room="room"
               :userId="userId"
               :isHost="isHost"
               v-model:playerName="playerName"
               v-model:selectedAvatar="selectedAvatar"
               v-model:selectedBallConfigKey="selectedBallConfigKey"
               :avatars="avatars"
               :ballConfigOptions="ballConfigOptions"
               @create-room="handleCreateRoom"
               @join-room="handleJoinRoom"
               @adjust-cards="handleAdjustCards"
               @start-game="handleStartGame" />

    <!-- 游戏进行/结算主界面 -->
    <div v-else-if="room && (room.status === 'playing' || room.status === 'ended' || room.status === 'finished')" class="flex-1 flex flex-col space-y-3">
      
      <!-- 我的扑克手牌区 -->
      <div class="glass-panel rounded-2xl p-4 shadow-2xl relative overflow-hidden border border-emerald-500/30">
        
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold text-amber-300">我的手上扑克手牌</span>
            <span class="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700/50">
              手上剩余 {{ myInfo?.cards ? myInfo.cards.length : 0 }} 张
            </span>
          </div>
        </div>

        <div v-if="myInfo && myInfo.cards && myInfo.cards.length > 0" 
             class="flex flex-wrap justify-center items-center gap-2.5 sm:gap-3 py-2 min-h-[120px]">
          <PokerCard v-for="card in myInfo.cards" :key="card.id"
                     :card="card"
                     :isDimmed="isCardDimmed(card)"
                     @click="handleConfirmPocket" />
        </div>

        <div v-else class="text-center py-6 text-emerald-300 space-y-1">
          <span class="text-4xl">🎉</span>
          <p class="font-bold text-sm">你的扑克牌已全部消除完！</p>
        </div>

        <div class="mt-3 pt-2 border-t border-white/10 flex justify-between items-center text-xs">
          <span class="text-gray-400 text-[10px]">打进球后点击对应扑克卡片进行销牌</span>
          
          <div class="flex items-center space-x-2">
            <button @click="showAccidentalModal = true"
                    class="bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer">
              <i class="fa-solid fa-bullseye text-amber-400"></i> 意外进球
            </button>
            <button @click="handleDrawPenalty"
                    class="bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 active:scale-95 text-xs cursor-pointer">
              <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> 犯规抽卡
            </button>
          </div>
        </div>

      </div>

      <!-- 局况对比与球盘表格 -->
      <BilliardsTable :room="room" :userId="userId" :turnOrderPlayers="turnOrderPlayers" />

      <!-- 对局实况日志 -->
      <GameLogs :logs="room.logs || []" />

    </div>

    <!-- 弹窗部分 -->
    <AccidentalPocketModal :show="showAccidentalModal"
                           :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                           :myCards="myInfo?.cards || []"
                           @close="showAccidentalModal = false"
                           @confirm="handleAccidentalConfirm" />

    <VictoryModal :winner="room?.winner || null"
                  :isHost="isHost"
                  :players="room?.players || []"
                  :pocketedBallNumbers="room?.pocketedBallNumbers || []"
                  @restart="handleConfirmRestart" />

    <RestartModal :show="showRestartConfirm"
                  @cancel="showRestartConfirm = false"
                  @confirm="handleConfirmRestart" />

  </div>
</template>
