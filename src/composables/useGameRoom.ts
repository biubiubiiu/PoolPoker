import type { Card, Player, Room } from '@shared/types/game';
import type { SocketCallbackResponse } from '@shared/types/socket';
import confetti from 'canvas-confetti';
import type { Socket } from 'socket.io-client';
import { computed, onMounted, onUnmounted, type Ref, ref, watch } from 'vue';

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
  const { socket, userId, playerName, selectedAvatar, selectedBallConfigKey, getFinalPlayerName } = options;

  const room = ref<Room | null>(null);
  const showRestartConfirm = ref<boolean>(false);
  const showRefereePocketModal = ref<boolean>(false);
  const showRefereeFoulModal = ref<boolean>(false);
  const refereeTargetUserId = ref<string>('');
  const ballConfigs = ref<Record<string, BallConfigItem>>({});

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const fetchLatestRoomState = async () => {
    const savedRoomCode = localStorage.getItem('billiards_room_code');
    if (!savedRoomCode) return;

    try {
      const res = await fetch(`/api/rooms/${savedRoomCode}?userId=${encodeURIComponent(userId.value)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.room) {
          console.log('[HTTP] 极速同步房间状态成功');
          room.value = data.room;
        }
      } else if (res.status === 404) {
        console.warn('[HTTP Sync] 房间不存在或已解散');
        localStorage.removeItem('billiards_room_code');
        localStorage.removeItem('billiards_session_token');
        room.value = null;
      }
    } catch (err) {
      console.error('[HTTP Sync Error]', err);
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[VisibilityChange] 页面切回前台，立即发起 HTTP 快照同步与 Socket 重连');
      fetchLatestRoomState();

      if (socket.value && !socket.value.connected) {
        socket.value.connect();
      }
    }
  };

  onMounted(async () => {
    fetchLatestRoomState();
    document.addEventListener('visibilitychange', handleVisibilityChange);

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

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  const setupSocketListeners = (s: Socket) => {
    const handleConnect = () => {
      console.log('[Socket] Connected, ID:', s.id);

      const savedRoomCode = localStorage.getItem('billiards_room_code');
      const savedSessionToken = localStorage.getItem('billiards_session_token') || '';
      if (savedRoomCode) {
        s.emit(
          'rejoin_room',
          {
            roomCode: savedRoomCode,
            userId: userId.value,
            sessionToken: savedSessionToken,
          },
          (res: SocketCallbackResponse) => {
            if (!res.success) {
              console.warn('[Rejoin Failed]', res.message);
              localStorage.removeItem('billiards_room_code');
              localStorage.removeItem('billiards_session_token');
              room.value = null;
            } else if (res.sessionToken) {
              localStorage.setItem('billiards_session_token', res.sessionToken);
            }
          }
        );
      }
    };

    s.on('connect', handleConnect);

    if (s.connected) {
      handleConnect();
    }

    s.on('room_updated', (updatedRoom: Room) => {
      room.value = updatedRoom;
      showRestartConfirm.value = false;
      if (updatedRoom?.code) {
        localStorage.setItem('billiards_room_code', updatedRoom.code);
      }

      if (updatedRoom?.winners && updatedRoom.winners.length > 0) {
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

  watch(
    socket,
    (newSocket, oldSocket) => {
      if (oldSocket) {
        oldSocket.off('connect');
        oldSocket.off('room_updated');
        oldSocket.off('room_created');
        oldSocket.off('error_message');
      }
      if (newSocket) {
        setupSocketListeners(newSocket);
      }
    },
    { immediate: true }
  );

  const isHost = computed(() => {
    return !!(room.value && room.value.hostUserId === userId.value);
  });

  const myInfo = computed<Player | null>(() => {
    if (!room.value?.players) return null;
    return room.value.players.find((p) => p.userId === userId.value) || null;
  });

  const sortedMyCards = computed<Card[]>(() => {
    const cards = myInfo.value?.cards ?? [];
    return [...cards].sort((a, b) => a.ballNumber - b.ballNumber);
  });

  const turnOrderPlayers = computed<Player[]>(() => {
    if (!room.value?.players || !room.value.turnOrder) return [];
    return room.value.turnOrder
      .map((uid) => room.value?.players.find((p) => p.userId === uid))
      .filter((p): p is Player => !!p);
  });

  const ballConfigOptions = computed(() => {
    return Object.entries(ballConfigs.value).map(([key, item]) => ({
      key,
      name: item.name,
    }));
  });

  const activeBallConfigKey = computed(() => {
    if (room.value?.settings && ballConfigs.value[room.value.settings.ballConfigKey]) {
      return room.value.settings.ballConfigKey;
    }
    if (ballConfigs.value[selectedBallConfigKey.value]) {
      return selectedBallConfigKey.value;
    }
    return 'default';
  });

  const ballColorStyle = computed<Record<string, string>>(() => {
    const currentConfig = ballConfigs.value[activeBallConfigKey.value];
    if (!currentConfig?.colors) return {};
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
    if (!room.value?.pocketedBallNumbers || !card) return false;
    return room.value.pocketedBallNumbers.includes(card.ballNumber);
  };

  // 1. 创建房间
  const handleCreateRoom = () => {
    const finalName = getFinalPlayerName();
    socket.value?.emit(
      'create_room',
      {
        userId: userId.value,
        name: finalName,
        avatar: selectedAvatar.value,
        ballConfigKey: selectedBallConfigKey.value,
      },
      (res: SocketCallbackResponse) => {
        if (res.success && res.roomCode) {
          localStorage.setItem('billiards_room_code', res.roomCode);
          if (res.sessionToken) {
            localStorage.setItem('billiards_session_token', res.sessionToken);
          }
        }
      }
    );
  };

  // 2. 加入房间
  const handleJoinRoom = (code: string) => {
    const finalName = getFinalPlayerName();
    socket.value?.emit(
      'join_room',
      {
        roomCode: code,
        userId: userId.value,
        name: finalName,
        avatar: selectedAvatar.value,
      },
      (res: SocketCallbackResponse) => {
        if (!res.success) {
          alert(res.message || '加入房间失败');
        } else if (res.roomCode) {
          localStorage.setItem('billiards_room_code', res.roomCode);
          if (res.sessionToken) {
            localStorage.setItem('billiards_session_token', res.sessionToken);
          }
        }
      }
    );
  };

  // 3. 房主调整发牌张数
  const handleAdjustCards = (delta: number) => {
    if (!isHost.value || !room.value) return;
    const current = room.value.settings?.cardsPerPlayer || 5;
    const newCount = current + delta;
    if (newCount < 1 || newCount > 10) return;
    socket.value?.emit('update_settings', {
      roomCode: room.value.code,
      settings: { cardsPerPlayer: newCount },
    });
  };

  // 4. 房主开始游戏
  const handleStartGame = () => {
    if (!isHost.value || !room.value) return;
    socket.value?.emit('start_game', { roomCode: room.value.code });
  };

  // 5. 销牌 / 确认进球
  const handleConfirmPocket = (card: Card) => {
    if (room.value?.status !== 'playing') return;

    if (isCardDimmed(card)) {
      alert(
        `【${card.ballNumber}号球】已在场上被打进，你的卡片 [${card.suit}${card.rank}] 属于已进球免打卡，无需重复消去！`
      );
      return;
    }

    const confirmText = `确认已经打进 ${card.ballNumber} 号球，消去卡片 [${card.suit}${card.rank}] 吗？`;
    if (window.confirm(confirmText)) {
      socket.value?.emit('pocket_ball', {
        roomCode: room.value.code,
        cardId: card.id,
      });
    }
  };

  // 6. 撤回上一步操作（整体回退到上一步状态）
  const handleRetract = () => {
    if (!room.value) return;
    if (window.confirm('确认撤回到上一步操作吗？将整体回退牌桌最近一次的操作。')) {
      socket.value?.emit('retract_ball', { roomCode: room.value.code });
    }
  };

  // 7. 记录进球与记录犯规打开与确认（默认选中当前玩家自己）
  const openRefereePocket = (targetUserId?: string) => {
    refereeTargetUserId.value = targetUserId || userId.value;
    showRefereePocketModal.value = true;
  };

  const openRefereeFoul = (targetUserId?: string) => {
    refereeTargetUserId.value = targetUserId || userId.value;
    showRefereeFoulModal.value = true;
  };

  const handleRefereePocketConfirm = (targetUserId: string, ballNum: number) => {
    if (!room.value) return;
    socket.value?.emit('referee_pocket_ball', {
      roomCode: room.value.code,
      targetUserId,
      ballNumber: ballNum,
    });
    showRefereePocketModal.value = false;
  };

  const handleBreakPocketConfirm = (ballNum: number) => {
    if (!room.value) return;
    socket.value?.emit('break_pocket', {
      roomCode: room.value.code,
      ballNumber: ballNum,
    });
    showRefereePocketModal.value = false;
  };

  const handleRefereeFoulConfirm = (targetUserId: string) => {
    if (!room.value) return;
    socket.value?.emit('referee_draw_penalty', {
      roomCode: room.value.code,
      targetUserId,
    });
    showRefereeFoulModal.value = false;
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
        socket.value?.emit('leave_room', {
          roomCode: room.value.code,
          userId: userId.value,
        });
      }
      localStorage.removeItem('billiards_room_code');
      localStorage.removeItem('billiards_session_token');
      room.value = null;
    }
  };

  return {
    room,
    showRestartConfirm,
    showRefereePocketModal,
    showRefereeFoulModal,
    refereeTargetUserId,
    ballConfigs,
    ballConfigOptions,
    activeBallConfigKey,
    ballColorStyle,
    isHost,
    myInfo,
    sortedMyCards,
    turnOrderPlayers,
    isCardDimmed,
    handleCreateRoom,
    handleJoinRoom,
    handleAdjustCards,
    handleStartGame,
    handleConfirmPocket,
    handleRetract,
    openRefereePocket,
    openRefereeFoul,
    handleRefereePocketConfirm,
    handleBreakPocketConfirm,
    handleRefereeFoulConfirm,
    handleConfirmRestart,
    handleLeaveRoom,
  };
}
