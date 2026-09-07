import type { Card, Player, Room } from '@shared/types/game';
import { CLIENT_TO_SERVER_EVENTS, SERVER_TO_CLIENT_EVENTS } from '@shared/types/protocol';
import type { SocketCallbackResponse } from '@shared/types/socket';
import type { Socket } from 'socket.io-client';
import { computed, onMounted, onUnmounted, type Ref, ref, watch } from 'vue';
import { showAlert, showConfirm } from '@/utils/dialog';
import { shouldAnimateRoomChange } from '@/utils/roomPresentation';
import { useGameAudio } from './useGameAudio';

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
  selectedBallConfigKey: Ref<string>;
  getFinalPlayerName: () => string;
  serverUrl?: Ref<string>;
}

export function useGameRoom(options: UseGameRoomOptions) {
  const { socket, userId, playerName, selectedBallConfigKey, getFinalPlayerName, serverUrl } = options;

  const getApiUrl = (endpointPath: string) => {
    const base = serverUrl?.value ? serverUrl.value.trim().replace(/\/+$/, '') : '';
    return `${base}${endpointPath}`;
  };

  const room = ref<Room | null>(null);
  const showRestartConfirm = ref<boolean>(false);
  const showRefereePocketModal = ref<boolean>(false);
  const showRefereeFoulModal = ref<boolean>(false);
  const refereeTargetUserId = ref<string>('');
  const refereeSelectedBallNum = ref<number | null>(null);
  const ballConfigs = ref<Record<string, BallConfigItem>>({});

  // 3D 动画与卡牌交互状态
  const elevatedCardIds = ref<string[]>([]);
  const selectableCardIds = ref<string[]>([]);
  const discardingCardId = ref<string | null>(null);

  const recordingUserId = ref(userId.value);
  const breakMode = ref(false);
  const pendingAction = ref(false);
  const feedback = ref('');
  const displayCards = ref<Card[] | null>(null);
  const displayPocketed = ref<number[] | null>(null);
  const sceneAnimationId = ref<string | null>(null);
  const sceneReset = ref(0);
  const isPresenting = ref(false);
  const { unlockAudio, playCardSlideSound } = useGameAudio();
  let presentationTimers: ReturnType<typeof setTimeout>[] = [];
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressNextAnimation = true;
  const clearPresentation = () => {
    presentationTimers.forEach(clearTimeout);
    presentationTimers = [];
    displayCards.value = null;
    displayPocketed.value = null;
    elevatedCardIds.value = [];
    discardingCardId.value = null;
    isPresenting.value = false;
  };
  const acceptRoom = (next: Room, live = false) => {
    const previous = room.value;
    if (previous?.code === next.code && (next.revision ?? 0) < (previous.revision ?? 0)) return;
    const changed = previous?.sceneEvent?.id !== next.sceneEvent?.id;
    if (!live) feedback.value = '';
    const animate = shouldAnimateRoomChange(previous, next, {
      live,
      suppress: suppressNextAnimation,
      visible: document.visibilityState === 'visible',
    });
    if (!live || suppressNextAnimation) {
      sceneReset.value++;
      suppressNextAnimation = false;
    }
    if (changed || !live) {
      clearTimeout(pendingTimer);
      pendingAction.value = false;
      clearPresentation();
    }
    room.value = next;
    if (!next.players.some((p) => p.userId === recordingUserId.value)) recordingUserId.value = userId.value;
    if (!previous || previous.code !== next.code || previous.roundCount !== next.roundCount) breakMode.value = false;
    if (!animate || !next.sceneEvent || !previous) return;
    sceneAnimationId.value = next.sceneEvent.id;
    const oldHand = previous.players.find((p) => p.userId === userId.value)?.cards ?? [];
    const newPlayer = next.players.find((p) => p.userId === userId.value);
    const discarded = oldHand.find((card) => newPlayer?.pocketedCards.some((c) => c.id === card.id));
    const addedBalls = next.pocketedBallNumbers.filter((n) => !previous.pocketedBallNumbers.includes(n));
    feedback.value = '';
    if ((addedBalls.length || discarded) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      isPresenting.value = true;
      displayCards.value = [...oldHand].sort((a, b) => a.ballNumber - b.ballNumber);
      displayPocketed.value = previous.pocketedBallNumbers;
      elevatedCardIds.value = oldHand.filter((c) => addedBalls.includes(c.ballNumber)).map((c) => c.id);
      presentationTimers.push(
        setTimeout(() => {
          discardingCardId.value = discarded?.id ?? null;
          if (discarded) playCardSlideSound();
        }, 260)
      );
      presentationTimers.push(setTimeout(clearPresentation, 850));
    }
  };
  const sendAction = (event: string, payload: Record<string, unknown>) => {
    if (!room.value || pendingAction.value || isPresenting.value) return;
    if (!socket.value?.connected) {
      feedback.value = '连接已断开，重连后再记球';
      return;
    }
    unlockAudio();
    pendingAction.value = true;
    feedback.value = '';
    socket.value.emit(event, { roomCode: room.value.code, ...payload }, (result: SocketCallbackResponse) => {
      clearTimeout(pendingTimer);
      pendingAction.value = false;
      if (!result.success) feedback.value = result.message || '牌局已变化，请查看最新状态';
    });
    pendingTimer = setTimeout(() => {
      pendingAction.value = false;
      feedback.value = '未收到确认，请核对最新牌局后再操作';
      void fetchLatestRoomState();
    }, 4000);
  };

  const syncNativeRoomSession = async (code: string | null) => {
    if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const payload = code
          ? JSON.stringify({
              event: 'room_credentials',
              sessionToken: localStorage.getItem('billiards_session_token'),
              roomCode: code,
              userId: userId.value,
              myUserId: userId.value,
              serverUrl: serverUrl?.value || '',
            })
          : JSON.stringify({ event: CLIENT_TO_SERVER_EVENTS.leaveRoom });
        await invoke('sync_wear_state', { payload });
      } catch (err) {
        console.warn('[NativeSync] Failed to sync room session:', err);
      }
    }
  };

  watch(
    () => room.value?.code,
    (newCode, oldCode) => {
      if (newCode !== oldCode) {
        syncNativeRoomSession(newCode || null);
      }
    }
  );

  const smartFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let tauriErr: any = null;
    if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        return await tauriFetch(input, init);
      } catch (err) {
        tauriErr = err;
        console.warn('[smartFetch] @tauri-apps/plugin-http fetch failed, falling back to browser fetch:', err);
      }
    }
    return await fetch(input, init);
  };

  const fetchLatestRoomState = async () => {
    const savedRoomCode = localStorage.getItem('billiards_room_code');
    if (!savedRoomCode) return;
    const savedToken = localStorage.getItem('billiards_session_token');

    try {
      const res = await smartFetch(getApiUrl(`/api/rooms/${savedRoomCode}?userId=${encodeURIComponent(userId.value)}`));
      if (res.ok) {
        const data = await res.json();
        if (
          localStorage.getItem('billiards_room_code') !== savedRoomCode ||
          localStorage.getItem('billiards_session_token') !== savedToken
        )
          return;
        if (data.success && data.room?.players.some((p: Player) => p.userId === userId.value)) {
          console.log('[HTTP] 极速同步房间状态成功');
          acceptRoom(data.room);
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
    suppressNextAnimation = true;
    clearPresentation();
    sceneReset.value++;
    if (document.visibilityState === 'visible') {
      console.log('[VisibilityChange] 页面切回前台，立即发起 HTTP 快照同步与 Socket 重连');
      fetchLatestRoomState();

      if (socket.value && !socket.value.connected) {
        socket.value.connect();
      }
    }
  };

  const fetchBallConfigs = async () => {
    const targetUrl = getApiUrl('/api/ball-configs');
    try {
      const response = await smartFetch(targetUrl);
      if (!response.ok) {
        throw new Error(`获取球色配置失败: ${response.status}`);
      }
      const data: BallConfigResponse = await response.json();
      ballConfigs.value = data.configs;
      if (!ballConfigs.value[selectedBallConfigKey.value]) {
        selectedBallConfigKey.value = data.defaultKey;
      }
    } catch (err: any) {
      console.error('[BallConfigs Error Detail]', err);
    }
  };

  onMounted(async () => {
    fetchLatestRoomState();
    fetchBallConfigs();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  watch(
    () => serverUrl?.value,
    (newUrl) => {
      if (newUrl !== undefined) {
        fetchBallConfigs();
        fetchLatestRoomState();
      }
    }
  );

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearPresentation();
    clearTimeout(pendingTimer);
  });

  const setupSocketListeners = (s: Socket) => {
    const handleConnect = () => {
      suppressNextAnimation = true;
      console.log('[Socket] Connected, ID:', s.id);

      const savedRoomCode = localStorage.getItem('billiards_room_code');
      const savedSessionToken = localStorage.getItem('billiards_session_token') || '';
      if (savedRoomCode) {
        s.emit(
          CLIENT_TO_SERVER_EVENTS.rejoinRoom,
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

    s.on(SERVER_TO_CLIENT_EVENTS.roomUpdated, (updatedRoom: Room) => {
      acceptRoom(updatedRoom, true);
      showRestartConfirm.value = false;
      if (updatedRoom?.code) {
        localStorage.setItem('billiards_room_code', updatedRoom.code);
      }
    });

    s.on(SERVER_TO_CLIENT_EVENTS.roomKicked, ({ roomCode }: { roomCode: string }) => {
      if (room.value?.code !== roomCode && localStorage.getItem('billiards_room_code') !== roomCode) return;
      localStorage.removeItem('billiards_room_code');
      localStorage.removeItem('billiards_session_token');
      room.value = null;
      showRestartConfirm.value = false;
      showRefereePocketModal.value = false;
      showRefereeFoulModal.value = false;
      showAlert('你已被房主移出房间');
    });

    s.on(SERVER_TO_CLIENT_EVENTS.roomCreated, ({ roomCode }: { roomCode: string }) => {
      localStorage.setItem('billiards_room_code', roomCode);
    });

    s.on(SERVER_TO_CLIENT_EVENTS.errorMessage, (msg: string) => {
      showAlert(msg);
    });
  };

  watch(
    socket,
    (newSocket, oldSocket) => {
      if (oldSocket) {
        oldSocket.off('connect');
        oldSocket.off(SERVER_TO_CLIENT_EVENTS.roomUpdated);
        oldSocket.off(SERVER_TO_CLIENT_EVENTS.roomCreated);
        oldSocket.off(SERVER_TO_CLIENT_EVENTS.roomKicked);
        oldSocket.off(SERVER_TO_CLIENT_EVENTS.errorMessage);
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
      CLIENT_TO_SERVER_EVENTS.createRoom,
      {
        userId: userId.value,
        name: finalName,
        avatar: '🎱',
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
      CLIENT_TO_SERVER_EVENTS.joinRoom,
      {
        roomCode: code,
        userId: userId.value,
        name: finalName,
        avatar: '🎱',
      },
      (res: SocketCallbackResponse) => {
        if (!res.success) {
          showAlert(res.message || '加入房间失败');
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
    socket.value?.emit(CLIENT_TO_SERVER_EVENTS.updateSettings, {
      roomCode: room.value.code,
      settings: { cardsPerPlayer: newCount },
    });
  };

  const handleKickPlayer = async (targetUserId: string) => {
    const currentRoom = room.value;
    if (!isHost.value || !currentRoom || !['waiting', 'lobby'].includes(currentRoom.status)) return;
    const player = currentRoom.players.find((p) => p.userId === targetUserId);
    if (!player || targetUserId === currentRoom.hostUserId) return;
    if (!(await showConfirm(`确认将「${player.name}」移出房间吗？`, '移出玩家'))) return;
    if (!isHost.value || room.value?.code !== currentRoom.code || !['waiting', 'lobby'].includes(room.value.status))
      return;
    socket.value?.emit(CLIENT_TO_SERVER_EVENTS.kickPlayer, { roomCode: currentRoom.code, targetUserId });
  };

  // 4. 房主开始游戏
  const handleStartGame = () => {
    if (!isHost.value || !room.value) return;
    socket.value?.emit(CLIENT_TO_SERVER_EVENTS.startGame, { roomCode: room.value.code });
  };

  const currentShooter = computed(
    () => room.value?.players.find((p) => p.userId === recordingUserId.value) ?? myInfo.value
  );
  const selectRecordingPlayer = (id: string) => {
    recordingUserId.value = id;
    breakMode.value = false;
  };
  const nextRecordingPlayer = () => {
    const order = turnOrderPlayers.value;
    if (order.length)
      selectRecordingPlayer(
        order[(order.findIndex((p) => p.userId === recordingUserId.value) + 1) % order.length].userId
      );
  };
  const isMyTurn = computed(() => currentShooter.value?.userId === userId.value);
  const handleHandCardClick = (card: Card) => {
    if (room.value?.status !== 'playing') return;
    if (isCardDimmed(card)) {
      return;
    }
    if (pendingAction.value || isPresenting.value) return;
    selectRecordingPlayer(userId.value);
    sendAction(CLIENT_TO_SERVER_EVENTS.pocketBall, { cardId: card.id });
  };
  const handleTableBallClick = (ballNum: number) => {
    if (room.value?.status !== 'playing' || room.value.pocketedBallNumbers.includes(ballNum)) return;
    if (breakMode.value) sendAction(CLIENT_TO_SERVER_EVENTS.breakPocket, { ballNumber: ballNum });
    else
      sendAction(CLIENT_TO_SERVER_EVENTS.refereePocketBall, {
        targetUserId: currentShooter.value?.userId ?? userId.value,
        ballNumber: ballNum,
      });
  };

  const handleConfirmPocket = handleHandCardClick;

  // 6. 撤回上一步操作（整体回退到上一步状态）
  const handleRetract = () => {
    if (!room.value?.lastActionText || room.value.status !== 'playing') return;
    // Capture the visible revision; never undo somebody else's newer operation.
    sendAction(CLIENT_TO_SERVER_EVENTS.retractBall, { expectedRevision: room.value.revision ?? 0 });
  };

  // 7. 记录进球与记录犯规打开与确认（默认选中当前玩家自己）
  const openRefereePocket = (targetUserId?: string, ballNum?: number) => {
    refereeTargetUserId.value = targetUserId || currentShooter.value?.userId || userId.value;
    refereeSelectedBallNum.value = ballNum ?? null;
    showRefereePocketModal.value = true;
  };

  const openRefereeFoul = (targetUserId?: string) => {
    refereeTargetUserId.value = targetUserId || currentShooter.value?.userId || userId.value;
    showRefereeFoulModal.value = true;
  };

  const handleRefereePocketConfirm = (targetUserId: string, ballNum: number) => {
    if (!room.value) return;
    sendAction(CLIENT_TO_SERVER_EVENTS.refereePocketBall, {
      targetUserId,
      ballNumber: ballNum,
    });
    showRefereePocketModal.value = false;
  };

  const handleBreakPocketConfirm = (ballNum: number) => {
    if (!room.value) return;
    sendAction(CLIENT_TO_SERVER_EVENTS.breakPocket, {
      ballNumber: ballNum,
    });
    showRefereePocketModal.value = false;
  };

  const handleRefereeFoulConfirm = (targetUserId: string) => {
    if (!room.value) return;
    sendAction(CLIENT_TO_SERVER_EVENTS.refereeDrawPenalty, {
      targetUserId,
    });
    showRefereeFoulModal.value = false;
  };

  // 8. 重置房间
  const handleConfirmRestart = () => {
    if (!isHost.value || !room.value) return;
    socket.value?.emit(CLIENT_TO_SERVER_EVENTS.restartGame, { roomCode: room.value.code });
    showRestartConfirm.value = false;
  };

  // 9. 离开房间
  const handleLeaveRoom = async () => {
    if (await showConfirm('确认离开房间吗？', '离开确认')) {
      if (room.value) {
        socket.value?.emit(CLIENT_TO_SERVER_EVENTS.leaveRoom, {
          roomCode: room.value.code,
        });
      }
      localStorage.removeItem('billiards_room_code');
      localStorage.removeItem('billiards_session_token');
      room.value = null;
    }
  };

  return {
    room,
    recordingUserId,
    breakMode,
    pendingAction,
    feedback,
    displayCards,
    displayPocketed,
    sceneAnimationId,
    sceneReset,
    isPresenting,
    selectRecordingPlayer,
    nextRecordingPlayer,
    showRestartConfirm,
    showRefereePocketModal,
    showRefereeFoulModal,
    refereeTargetUserId,
    refereeSelectedBallNum,
    ballConfigs,
    ballConfigOptions,
    activeBallConfigKey,
    ballColorStyle,
    isHost,
    myInfo,
    sortedMyCards,
    turnOrderPlayers,
    currentShooter,
    isMyTurn,
    elevatedCardIds,
    selectableCardIds,
    discardingCardId,
    isCardDimmed,
    handleCreateRoom,
    handleJoinRoom,
    handleAdjustCards,
    handleStartGame,
    handleKickPlayer,
    handleConfirmPocket,
    handleHandCardClick,
    handleTableBallClick,
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
