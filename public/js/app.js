const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    const socket = ref(null);
    const socketId = ref('');
    
    // 玩家个人设置
    const playerName = ref(localStorage.getItem('billiards_player_name') || '');
    const avatars = ['🎱', '🎯', '🔥', '⚡️', '🏆', '💎'];
    const selectedAvatar = ref(localStorage.getItem('billiards_player_avatar') || '🎱');

    // 界面标签与房间码
    const tab = ref('join');
    const joinCode = ref('');

    // 房间全景数据
    const room = ref(null);
    const isPrivacyHidden = ref(false); // 手牌防窥

    onMounted(() => {
      socket.value = io();

      socket.value.on('connect', () => {
        socketId.value = socket.value.id;
        console.log('[Socket] Connected, ID:', socketId.value);
      });

      socket.value.on('room_updated', (updatedRoom) => {
        room.value = updatedRoom;
        
        if (updatedRoom.winner) {
          triggerConfetti();
        }
      });

      socket.value.on('room_created', ({ roomCode }) => {
        joinCode.value = roomCode;
      });

      socket.value.on('error_message', (msg) => {
        alert(msg);
      });
    });

    watch(playerName, (val) => {
      localStorage.setItem('billiards_player_name', val);
    });
    watch(selectedAvatar, (val) => {
      localStorage.setItem('billiards_player_avatar', val);
    });

    const isHost = computed(() => {
      return room.value && room.value.hostSocketId === socketId.value;
    });

    const myInfo = computed(() => {
      if (!room.value || !room.value.players) return null;
      return room.value.players.find(p => p.id === socketId.value);
    });

    // 1. 创建房间
    const createRoom = () => {
      if (!playerName.value.trim()) {
        playerName.value = `球友${Math.floor(Math.random() * 900 + 100)}`;
      }
      socket.value.emit('create_room', {
        name: playerName.value,
        avatar: selectedAvatar.value
      });
    };

    // 2. 加入房间
    const joinRoom = () => {
      if (!joinCode.value.trim()) {
        alert('请输入4位房间码');
        return;
      }
      if (!playerName.value.trim()) {
        playerName.value = `球友${Math.floor(Math.random() * 900 + 100)}`;
      }

      socket.value.emit('join_room', {
        roomCode: joinCode.value,
        name: playerName.value,
        avatar: selectedAvatar.value
      }, (res) => {
        if (!res.success) {
          alert(res.message);
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
      
      const confirmText = `确认已经打进 ${card.ballNumber} 号球，消去卡片 [${card.suit}${card.rank}] 吗？`;
      if (window.confirm(confirmText)) {
        socket.value.emit('pocket_ball', {
          roomCode: room.value.code,
          cardId: card.id
        });
      }
    };

    // 7. 犯规罚牌
    const drawPenalty = () => {
      if (room.value.status !== 'playing') return;
      if (window.confirm('确认因犯规从牌库罚抽一张扑克牌吗？')) {
        socket.value.emit('draw_penalty', { roomCode: room.value.code });
      }
    };

    // 8. 重新开始 / 下一局
    const restartGame = () => {
      if (!isHost.value || !room.value) return;
      socket.value.emit('restart_game', { roomCode: room.value.code });
    };

    // 9. 离开房间
    const leaveRoom = () => {
      if (window.confirm('确定要退出当前房间吗？')) {
        if (room.value) {
          socket.value.emit('leave_room', { roomCode: room.value.code });
        }
        room.value = null;
        joinCode.value = '';
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
      playerName,
      avatars,
      selectedAvatar,
      tab,
      joinCode,
      room,
      isPrivacyHidden,
      isHost,
      myInfo,
      createRoom,
      joinRoom,
      adjustCardsCount,
      toggleBlackEight,
      startGame,
      confirmPocketBall,
      drawPenalty,
      restartGame,
      leaveRoom,
      getBallClass,
      getColorClass,
      getCardProgressPercent
    };
  }
}).mount('#app');
