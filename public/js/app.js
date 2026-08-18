const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    const socket = ref(null);
    const socketId = ref('');
    
    // 玩家固定的唯一 userId (持久化存在 localStorage)
    let savedUserId = localStorage.getItem('billiards_user_id');
    if (!savedUserId) {
      savedUserId = 'u_' + Math.random().toString(36).substr(2, 8) + Date.now();
      localStorage.setItem('billiards_user_id', savedUserId);
    }
    const userId = ref(savedUserId);

    // 玩家个人设置
    const playerName = ref(localStorage.getItem('billiards_player_name') || '');
    const avatars = ['🎱', '🎯', '🔥', '⚡️', '🏆', '💎'];
    const selectedAvatar = ref(localStorage.getItem('billiards_player_avatar') || '🎱');

    // 界面标签与房间码
    const tab = ref('join');
    const joinCode = ref('');

    const room = ref(null);

    onMounted(() => {
      socket.value = io();

      socket.value.on('connect', () => {
        socketId.value = socket.value.id;
        console.log('[Socket] Connected, ID:', socketId.value);

        // 自动断线重连尝试
        const savedRoomCode = localStorage.getItem('billiards_room_code');
        if (savedRoomCode) {
          socket.value.emit('rejoin_room', {
            roomCode: savedRoomCode,
            userId: userId.value
          }, (res) => {
            if (!res.success) {
              console.warn('[Rejoin Failed]', res.message);
              localStorage.removeItem('billiards_room_code');
              room.value = null;
            }
          });
        }
      });

      socket.value.on('room_updated', (updatedRoom) => {
        room.value = updatedRoom;
        showRestartConfirm.value = false;
        if (updatedRoom && updatedRoom.code) {
          localStorage.setItem('billiards_room_code', updatedRoom.code);
        }
        
        if (updatedRoom.winner) {
          triggerConfetti();
        }
      });

      socket.value.on('room_created', ({ roomCode }) => {
        joinCode.value = roomCode;
        localStorage.setItem('billiards_room_code', roomCode);
      });

      socket.value.on('error_message', (msg) => {
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

    const isHost = computed(() => {
      return room.value && room.value.hostUserId === userId.value;
    });

    const myInfo = computed(() => {
      if (!room.value || !room.value.players) return null;
      return room.value.players.find(p => p.userId === userId.value);
    });

    const turnOrderPlayers = computed(() => {
      if (!room.value || !room.value.players || !room.value.turnOrder) return [];
      return room.value.turnOrder.map(uid => room.value.players.find(p => p.userId === uid)).filter(Boolean);
    });

    // 1. 创建房间
    const createRoom = () => {
      const finalName = playerName.value.trim() || `球友${Math.floor(Math.random() * 900 + 100)}`;
      if (playerName.value.trim()) {
        localStorage.setItem('billiards_player_name', playerName.value.trim());
      }
      socket.value.emit('create_room', {
        userId: userId.value,
        name: finalName,
        avatar: selectedAvatar.value
      });
    };

    // 2. 加入房间
    const joinRoom = () => {
      if (!joinCode.value.trim()) {
        alert('请输入4位房间码');
        return;
      }
      const finalName = playerName.value.trim() || `球友${Math.floor(Math.random() * 900 + 100)}`;
      if (playerName.value.trim()) {
        localStorage.setItem('billiards_player_name', playerName.value.trim());
      }

      socket.value.emit('join_room', {
        roomCode: joinCode.value,
        userId: userId.value,
        name: finalName,
        avatar: selectedAvatar.value
      }, (res) => {
        if (!res.success) {
          alert(res.message);
        } else if (res.roomCode) {
          localStorage.setItem('billiards_room_code', res.roomCode);
        }
      });
    };

    // 3. 房主调整发牌张数
    const adjustCardsCount = (delta) => {
      if (!isHost.value || !room.value) return;
      const current = room.value.settings.cardsPerPlayer || 5;
      const newCount = current + delta;
      socket.value.emit('update_settings', {
        roomCode: room.value.code,
        settings: { cardsPerPlayer: newCount }
      });
    };

    // 4. 房主开关黑八规则
    const toggleBlackEight = (e) => {
      if (!isHost.value || !room.value) return;
      socket.value.emit('update_settings', {
        roomCode: room.value.code,
        settings: { includeBlackEight: e.target.checked }
      });
    };

    // 5. 房主开始游戏
    const startGame = () => {
      if (!isHost.value || !room.value) return;
      socket.value.emit('start_game', { roomCode: room.value.code });
    };

    // 6. 销牌 / 确认进球（支持对应扑克卡片）
    const confirmPocketBall = (card) => {
      if (room.value.status !== 'playing') return;

      if (isCardDimmed(card)) {
        alert(`【${card.ballNumber}号球】已在场上被打进，你的卡片 [${card.suit}${card.rank}] 属于已进球免打卡，无需重复消去！`);
        return;
      }
      
      const confirmText = `确认已经打进 ${card.ballNumber} 号球，消去卡片 [${card.suit}${card.rank}] 吗？`;
      if (window.confirm(confirmText)) {
        socket.value.emit('pocket_ball', {
          roomCode: room.value.code,
          cardId: card.id
        });
      }
    };

    // 判断当前手牌点数是否已在场上打进 (手牌置灰)
    const isCardDimmed = (card) => {
      if (!room.value || !room.value.pocketedBallNumbers || !card) return false;
      return room.value.pocketedBallNumbers.includes(card.ballNumber);
    };

    // 球号映射名称
    const getBallName = (ballNum) => {
      const map = {
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
        15: '15号(大王)'
      };
      return map[ballNum] || `${ballNum}号球`;
    };

    // 获胜者名称格式化 (支持单人或多名玩家同时胜利)
    const getWinnersNames = () => {
      if (!room.value) return '';
      const winners = room.value.winners || (room.value.winner ? [room.value.winner] : []);
      if (winners.length === 0) return '';
      if (winners.length === 1) {
        return `恭喜 ${winners[0].name} 获胜！`;
      }
      const names = winners.map(w => w.name).join('、');
      return `恭喜 ${names} 共同获胜！`;
    };

    // 7. 犯规罚牌
    const drawPenalty = () => {
      if (room.value.status !== 'playing') return;
      if (window.confirm('确认因犯规从牌库罚抽一张扑克牌吗？')) {
        socket.value.emit('draw_penalty', { roomCode: room.value.code });
      }
    };

    // 7.5 意外进球 (打进手牌没有的球)
    const showAccidentalModal = ref(false);
    const selectedAccidentalBall = ref(null);

    const openAccidentalModal = () => {
      if (room.value.status !== 'playing') return;
      selectedAccidentalBall.value = null;
      showAccidentalModal.value = true;
    };

    const closeAccidentalModal = () => {
      showAccidentalModal.value = false;
      selectedAccidentalBall.value = null;
    };

    const selectAccidentalBall = (b) => {
      if (isBallPocketed(b) || isBallInMyHand(b)) return;
      selectedAccidentalBall.value = b;
    };

    const isBallPocketed = (b) => {
      return room.value && room.value.pocketedBallNumbers && room.value.pocketedBallNumbers.includes(b);
    };

    const isBallInMyHand = (b) => {
      return myInfo.value && myInfo.value.cards && myInfo.value.cards.some(c => c.ballNumber === b);
    };

    const confirmAccidentalPocket = () => {
      if (!room.value || room.value.status !== 'playing' || !selectedAccidentalBall.value) return;
      socket.value.emit('accidental_pocket', {
        roomCode: room.value.code,
        ballNumber: selectedAccidentalBall.value
      });
      showAccidentalModal.value = false;
      selectedAccidentalBall.value = null;
    };

    // 8. 重新开始 / 下一局 (支持二次确认 modal)
    const showRestartConfirm = ref(false);

    const requestRestart = () => {
      if (!isHost.value || !room.value) return;
      showRestartConfirm.value = true;
    };

    const confirmRestart = () => {
      showRestartConfirm.value = false;
      if (!isHost.value || !room.value) return;
      socket.value.emit('restart_game', { roomCode: room.value.code });
    };

    const cancelRestart = () => {
      showRestartConfirm.value = false;
    };

    const restartGame = () => {
      requestRestart();
    };

    // 9. 离开房间
    const leaveRoom = () => {
      if (window.confirm('确定要退出当前房间吗？')) {
        if (room.value) {
          socket.value.emit('leave_room', { roomCode: room.value.code });
        }
        localStorage.removeItem('billiards_room_code');
        room.value = null;
        joinCode.value = '';
        showRestartConfirm.value = false;
      }
    };

    const getBallClass = (ballNum) => {
      const isStriped = ballNum >= 9;
      return [
        `ball-${ballNum}`,
        isStriped ? 'ball-striped' : ''
      ].join(' ');
    };

    const getColorClass = (color) => {
      switch (color) {
        case 'red': return 'color-red';
        case 'gold': return 'color-gold';
        case 'gray': return 'color-gray';
        default: return 'color-black';
      }
    };

    const getCardProgressPercent = (remainingCards) => {
      if (!room.value) return 0;
      const initialCards = room.value.settings.cardsPerPlayer || 5;
      const progress = ((initialCards - remainingCards) / initialCards) * 100;
      return Math.max(0, Math.min(100, progress));
    };

    const triggerConfetti = () => {
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    };

    return {
      socketId,
      userId,
      playerName,
      avatars,
      selectedAvatar,
      tab,
      joinCode,
      room,
      isHost,
      myInfo,
      turnOrderPlayers,
      createRoom,
      joinRoom,
      adjustCardsCount,
      toggleBlackEight,
      startGame,
      confirmPocketBall,
      drawPenalty,
      showAccidentalModal,
      selectedAccidentalBall,
      openAccidentalModal,
      closeAccidentalModal,
      selectAccidentalBall,
      isBallPocketed,
      isBallInMyHand,
      confirmAccidentalPocket,
      restartGame,
      showRestartConfirm,
      requestRestart,
      confirmRestart,
      cancelRestart,
      leaveRoom,
      getBallClass,
      getColorClass,
      getCardProgressPercent,
      isCardDimmed,
      getBallName,
      getWinnersNames
    };
  }
}).mount('#app');
