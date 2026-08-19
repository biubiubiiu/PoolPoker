import { ref, computed, onMounted, watch, type Ref } from 'vue';
import type { Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import type { Room, Card, Player } from '../types/game';
import type { SocketCallbackResponse } from '../types/socket';

export interface BallConfigItem {
  name: string;
  colors: Record<string, [string, string, string]>;
}

export interface BallConfigResponse {
  defaultKey: string;
  configs: Record<string, BallConfigItem>;
}

export interface UseGameRoomOptions {
  socket: Ref<Socket | null>;
  userId: Ref<string>;
  playerName: Ref<string>;
  selectedAvatar: Ref<string>;
  selectedBallConfigKey: Ref<string>;
  getFinalPlayerName: () => string;
}

export function useGameRoom(options: UseGameRoomOptions) {
  const {
    socket,
    userId,
    playerName,
    selectedAvatar,
    selectedBallConfigKey,
    getFinalPlayerName
  } = options;

  const room = ref<Room | null>(null);
  const showRestartConfirm = ref<boolean>(false);
  const showAccidentalModal = ref<boolean>(false);
  const showRetractModal = ref<boolean>(false);
  const ballConfigs = ref<Record<string, BallConfigItem>>({});

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  onMounted(async () => {
    try {
      const response = await fetch('/api/ball-configs');
      if (!response.ok) {
        throw new Error(`获取球色配置失败: ${response.status}`);
      }
      const data: BallConfigResponse = await response.json();
      ballConfigs.value = data.configs;
      if (!ballConfigs.value[selectedBallConfigKey.value]) {
        selectedBallConfigKey.value = data.defaultKey;
      }
    } catch (err) {
      console.error('[BallConfigs Error]', err);
    }
  });

  const setupSocketListeners = (s: Socket) => {
    const handleConnect = () => {
      console.log('[Socket] Connected, ID:', s.id);

      const savedRoomCode = localStorage.getItem('billiards_room_code');
      if (savedRoomCode) {
        s.emit('rejoin_room', {
          roomCode: savedRoomCode,
          userId: userId.value
        }, (res: SocketCallbackResponse) => {
          if (!res.success) {
            console.warn('[Rejoin Failed]', res.message);
            localStorage.removeItem('billiards_room_code');
            room.value = null;
          }
        });
      }
    };

    s.on('connect', handleConnect);

    if (s.connected) {
      handleConnect();
    }

    s.on('room_updated', (updatedRoom: Room) => {
      room.value = updatedRoom;
      showRestartConfirm.value = false;
      if (updatedRoom && updatedRoom.code) {
        localStorage.setItem('billiards_room_code', updatedRoom.code);
      }

      if (updatedRoom && updatedRoom.winner) {
        triggerConfetti();
      }
    });

    s.on('room_created', ({ roomCode }: { roomCode: string }) => {
      localStorage.setItem('billiards_room_code', roomCode);
    });

    s.on('error_message', (msg: string) => {
      alert(msg);
    });
  };

  watch(socket, (newSocket, oldSocket) => {
    if (oldSocket) {
      oldSocket.off('connect');
      oldSocket.off('room_updated');
      oldSocket.off('room_created');
      oldSocket.off('error_message');
    }
    if (newSocket) {
      setupSocketListeners(newSocket);
    }
  }, { immediate: true });

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
    return 'default';
  });

  const ballColorStyle = computed<Record<string, string>>(() => {
    const currentConfig = ballConfigs.value[activeBallConfigKey.value];
    if (!currentConfig || !currentConfig.colors) return {};
    const style: Record<string, string> = {};
    for (let i = 1; i <= 15; i++) {
      const colorTuple = currentConfig.colors[String(i)];
      if (colorTuple) {
        const [hi, mid, lo] = colorTuple;
        style[`--ball-${i}-hi`] = hi;
        style[`--ball-${i}-mid`] = mid;
        style[`--ball-${i}-lo`] = lo;
      }
    }
    return style;
  });

  const isCardDimmed = (card: Card) => {
    if (!room.value || !room.value.pocketedBallNumbers || !card) return false;
    return room.value.pocketedBallNumbers.includes(card.ballNumber);
  };

  // 1. 创建房间
  const handleCreateRoom = () => {
    const finalName = getFinalPlayerName();
    socket.value?.emit('create_room', {
      userId: userId.value,
      name: finalName,
      avatar: selectedAvatar.value,
      ballConfigKey: selectedBallConfigKey.value
    });
  };

  // 2. 加入房间
  const handleJoinRoom = (code: string) => {
    const finalName = getFinalPlayerName();
    socket.value?.emit('join_room', {
      roomCode: code,
      userId: userId.value,
      name: finalName,
      avatar: selectedAvatar.value
    }, (res: SocketCallbackResponse) => {
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

  // 8. 撤回进球确认
  const handleRetractConfirm = (cardId: string) => {
    if (!room.value) return;
    socket.value?.emit('retract_ball', {
      roomCode: room.value.code,
      cardId
    });
    showRetractModal.value = false;
  };

  // 9. 重置房间
  const handleConfirmRestart = () => {
    if (!isHost.value || !room.value) return;
    socket.value?.emit('restart_game', { roomCode: room.value.code });
    showRestartConfirm.value = false;
  };

  // 10. 离开房间
  const handleLeaveRoom = () => {
    if (window.confirm('确认离开房间吗？')) {
      if (room.value) {
        socket.value?.emit('leave_room', { roomCode: room.value.code, userId: userId.value });
      }
      localStorage.removeItem('billiards_room_code');
      room.value = null;
    }
  };

  return {
    room,
    showRestartConfirm,
    showAccidentalModal,
    showRetractModal,
    ballConfigs,
    ballConfigOptions,
    activeBallConfigKey,
    ballColorStyle,
    isHost,
    myInfo,
    turnOrderPlayers,
    isCardDimmed,
    handleCreateRoom,
    handleJoinRoom,
    handleAdjustCards,
    handleStartGame,
    handleConfirmPocket,
    handleDrawPenalty,
    handleAccidentalConfirm,
    handleRetractConfirm,
    handleConfirmRestart,
    handleLeaveRoom
  };
}
