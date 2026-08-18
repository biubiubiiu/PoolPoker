const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 读取 config.yaml 配置文件
let config = { port: 3000 };
const configPath = path.join(__dirname, 'config.yaml');
if (fs.existsSync(configPath)) {
  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = yaml.load(fileContents);
    if (parsedConfig) {
      config = { ...config, ...parsedConfig };
      console.log(`📄 成功读取 config.yaml 配置文件 (配置端口: ${config.port})`);
    }
  } catch (e) {
    console.warn(`⚠️ 读取 config.yaml 异常, 使用默认参数: ${e.message}`);
  }
}

// 托管 public 目录
app.use(express.static(path.join(__dirname, 'public')));

// 内存中维护所有房间数据
const rooms = {};

// 生成 4 位纯数字房间码 (1000 ~ 9999)
function generateRoomCode() {
  let code = '';
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

// 洗牌算法 (Fisher-Yates)
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 创建标准 54 张扑克牌库
function create54PokerDeck() {
  const suits = [
    { symbol: '♠', type: 'spade', color: 'black' },
    { symbol: '♥', type: 'heart', color: 'red' },
    { symbol: '♣', type: 'club', color: 'black' },
    { symbol: '♦', type: 'diamond', color: 'red' }
  ];
  const ranks = [
    { rank: 'A', ball: 1 },
    { rank: '2', ball: 2 },
    { rank: '3', ball: 3 },
    { rank: '4', ball: 4 },
    { rank: '5', ball: 5 },
    { rank: '6', ball: 6 },
    { rank: '7', ball: 7 },
    { rank: '8', ball: 8 },
    { rank: '9', ball: 9 },
    { rank: '10', ball: 10 },
    { rank: 'J', ball: 11 },
    { rank: 'Q', ball: 12 },
    { rank: 'K', ball: 13 }
  ];

  let deck = [];
  let cardId = 1;

  suits.forEach(s => {
    ranks.forEach(r => {
      deck.push({
        id: `c_${cardId++}`,
        suit: s.symbol,
        suitType: s.type,
        color: s.color,
        rank: r.rank,
        ballNumber: r.ball
      });
    });
  });

  deck.push({
    id: `c_${cardId++}`,
    suit: '🃏',
    suitType: 'joker-small',
    color: 'gray',
    rank: '小王',
    ballNumber: 14
  });

  deck.push({
    id: `c_${cardId++}`,
    suit: '👑',
    suitType: 'joker-big',
    color: 'gold',
    rank: '大王',
    ballNumber: 15
  });

  return deck;
}

// 获取当前房间所有已消除的球号列表 (1 ~ 15，按数字大小升序)
function getPocketedBallNumbers(room) {
  if (!room || !room.players) return [];
  const set = new Set();
  room.players.forEach(p => {
    (p.pocketedCards || []).forEach(c => {
      set.add(c.ballNumber);
    });
  });
  return Array.from(set).sort((a, b) => a - b);
}

// 检查是否有玩家满足胜利条件（手牌中未被打进的有效卡牌数为 0）
function checkGameWinners(room) {
  if (!room || room.status !== 'playing') return [];
  const pocketedSet = new Set(getPocketedBallNumbers(room));
  const winners = [];

  room.players.forEach(p => {
    const activeCards = (p.cards || []).filter(c => !pocketedSet.has(c.ballNumber));
    if (activeCards.length === 0) {
      p.isWinner = true;
      winners.push(p);
    }
  });

  return winners;
}

// 计算每局击球顺序
function computeTurnOrder(room) {
  if (!room || !room.players || room.players.length === 0) return [];
  const currentP = room.players.map(p => p.userId);
  if (!room.lastTurnOrder || room.lastTurnOrder.length === 0 || !room.lastWinnerUserId || !currentP.includes(room.lastWinnerUserId)) {
    // 初始局或没有上一局胜利者信息，随机打乱
    return shuffle(currentP);
  }

  // 1. 保留上一局在场玩家，并补全中途加入的玩家
  let validPrev = room.lastTurnOrder.filter(id => currentP.includes(id));
  currentP.forEach(id => {
    if (!validPrev.includes(id)) {
      validPrev.push(id);
    }
  });

  // 2. 顺序反转
  let reversed = [...validPrev].reverse();

  // 3. 胜者优先
  let winnerIdx = reversed.indexOf(room.lastWinnerUserId);
  if (winnerIdx === -1) winnerIdx = 0;

  return [...reversed.slice(winnerIdx), ...reversed.slice(0, winnerIdx)];
}

// 给房间全员广播渲染数据
function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const roomSockets = io.sockets.adapter.rooms.get(roomCode);
  if (!roomSockets) return;

  const pocketedBallNumbers = getPocketedBallNumbers(room);
  const pocketedSet = new Set(pocketedBallNumbers);

  for (const socketId of roomSockets) {
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      const currentPlayer = room.players.find(p => p.id === socketId);
      const clientRoom = {
        code: room.code,
        hostUserId: room.hostUserId,
        hostSocketId: room.hostSocketId,
        settings: room.settings,
        status: room.status,
        roundCount: room.roundCount,
        deckCount: room.deck.length,
        logs: room.logs.slice(-15),
        winner: room.winner,
        winners: room.winners || (room.winner ? [room.winner] : []),
        pocketedBallNumbers: pocketedBallNumbers,
        turnOrder: room.turnOrder || [],
        players: room.players.map(p => {
          const isSelf = currentPlayer && p.userId === currentPlayer.userId;
          const activeCardCount = (p.cards || []).filter(c => !pocketedSet.has(c.ballNumber)).length;
          return {
            id: p.id,
            userId: p.userId,
            name: p.name,
            avatar: p.avatar,
            isHost: p.userId === room.hostUserId,
            online: p.online !== false,
            cardCount: p.cards.length,
            activeCardCount: activeCardCount,
            cards: isSelf ? p.cards : [],
            pocketedCards: p.pocketedCards,
            score: p.score,
            isWinner: p.isWinner
          };
        })
      };
      playerSocket.emit('room_updated', clientRoom);
    }
  }
}

// 检查某个 Socket ID 是否为房间房主
function isRoomHost(room, socketId) {
  if (!room) return false;
  const player = room.players.find(p => p.id === socketId);
  return player && player.userId === room.hostUserId;
}

// 日志记录 Helper
function addLog(room, message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  room.logs.push({ id: Date.now() + Math.random(), text: message, time });
}

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. 创建房间
  socket.on('create_room', ({ userId, name, avatar }) => {
    const roomCode = generateRoomCode();
    const uid = userId || ('u_' + Date.now() + Math.random().toString(36).substr(2, 5));
    const newPlayer = {
      id: socket.id,
      userId: uid,
      name: name || '玩家1',
      avatar: avatar || '🎱',
      online: true,
      cards: [],
      pocketedCards: [],
      score: 0,
      isWinner: false
    };

    const defaultCards = (config.room && config.room.default_cards_per_player) || 5;

    rooms[roomCode] = {
      code: roomCode,
      hostUserId: uid,
      hostSocketId: socket.id,
      settings: {
        cardsPerPlayer: defaultCards
      },
      status: 'lobby',
      roundCount: 1,
      players: [newPlayer],
      deck: [],
      winner: null,
      logs: []
    };

    socket.join(roomCode);
    addLog(rooms[roomCode], `${newPlayer.name} 创建了房间 ${roomCode}`);
    
    socket.emit('room_created', { roomCode, userId: uid });
    broadcastRoomState(roomCode);
  });

  // 2. 加入房间
  socket.on('join_room', ({ roomCode, userId, name, avatar }, callback) => {
    const code = (roomCode || '').trim();
    const room = rooms[code];

    if (!room) {
      if (callback) callback({ success: false, message: '房间不存在或已解散' });
      return;
    }

    const uid = userId || ('u_' + Date.now() + Math.random().toString(36).substr(2, 5));
    const existingPlayer = room.players.find(p => p.userId === uid);

    if (existingPlayer) {
      if (existingPlayer.disconnectTimer) {
        clearTimeout(existingPlayer.disconnectTimer);
        existingPlayer.disconnectTimer = null;
      }
      existingPlayer.id = socket.id;
      existingPlayer.online = true;
      if (name) existingPlayer.name = name;
      if (avatar) existingPlayer.avatar = avatar;

      socket.join(code);
      addLog(room, `⚡️ ${existingPlayer.name} 重新连入了房间`);
      if (callback) callback({ success: true, roomCode: code, userId: uid });
      broadcastRoomState(code);
      return;
    }

    if (room.status === 'playing') {
      if (callback) callback({ success: false, message: '该房间对局已开始，无法中途加入' });
      return;
    }

    const maxPlayers = (config.room && config.room.max_players) || 8;
    if (room.players.length >= maxPlayers) {
      if (callback) callback({ success: false, message: `房间已满（最多${maxPlayers}人）` });
      return;
    }

    const newPlayer = {
      id: socket.id,
      userId: uid,
      name: name || `玩家${room.players.length + 1}`,
      avatar: avatar || '🎯',
      online: true,
      cards: [],
      pocketedCards: [],
      score: 0,
      isWinner: false
    };
    room.players.push(newPlayer);
    addLog(room, `${newPlayer.name} 加入了房间`);

    socket.join(code);
    if (callback) callback({ success: true, roomCode: code, userId: uid });
    broadcastRoomState(code);
  });

  // 2.5 自动恢复断线加入
  socket.on('rejoin_room', ({ roomCode, userId }, callback) => {
    const code = (roomCode || '').trim();
    const room = rooms[code];

    if (!room) {
      if (callback) callback({ success: false, message: '房间已被解散或不存在' });
      return;
    }

    const player = room.players.find(p => p.userId === userId);
    if (!player) {
      if (callback) callback({ success: false, message: '玩家不在该房间中' });
      return;
    }

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }

    player.id = socket.id;
    player.online = true;
    socket.join(code);

    addLog(room, `⚡️ ${player.name} 成功断线重连恢复了对局`);
    if (callback) callback({ success: true, roomCode: code });
    broadcastRoomState(code);
  });

  // 3. 修改房间设置
  socket.on('update_settings', ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room || !isRoomHost(room, socket.id)) return;

    if (settings.cardsPerPlayer) {
      room.settings.cardsPerPlayer = Math.max(1, Math.min(10, settings.cardsPerPlayer));
    }

    addLog(room, `房主修改了规则: 每人 ${room.settings.cardsPerPlayer} 张牌`);
    broadcastRoomState(roomCode);
  });

  // 4. 开始游戏 / 发牌
  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !isRoomHost(room, socket.id)) return;

    if (room.players.length < 1) return;

    const fullDeck = create54PokerDeck();
    const totalNeededCards = room.players.length * room.settings.cardsPerPlayer;
    if (totalNeededCards > fullDeck.length) {
      socket.emit('error_message', `玩家人数与发牌数过多，牌库总张数（${fullDeck.length}张）不足！`);
      return;
    }

    const shuffledDeck = shuffle(fullDeck);

    room.winner = null;
    room.winners = null;
    room.players.forEach(p => {
      p.cards = [];
      p.pocketedCards = [];
      p.isWinner = false;
      for (let i = 0; i < room.settings.cardsPerPlayer; i++) {
        p.cards.push(shuffledDeck.pop());
      }
      p.cards.sort((a, b) => a.ballNumber - b.ballNumber);
    });

    room.deck = shuffledDeck;
    room.status = 'playing';

    // 计算击球顺序
    const order = computeTurnOrder(room);
    room.turnOrder = order;
    room.lastTurnOrder = [...order];

    const turnNames = room.turnOrder.map(uid => {
      const p = room.players.find(pl => pl.userId === uid);
      return p ? p.name : uid;
    });

    addLog(room, `🃏 第 ${room.roundCount} 局对局开始！54张扑克已发给全员`);
    addLog(room, `🎯 本局击球顺序：${turnNames.join(' ➔ ')}`);
    broadcastRoomState(roomCode);
  });

  // 5. 销牌
  socket.on('pocket_ball', ({ roomCode, cardId }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const cardIndex = player.cards.findIndex(c => c.id === cardId);
    if (cardIndex !== -1) {
      const removedCard = player.cards.splice(cardIndex, 1)[0];
      player.pocketedCards.push(removedCard);
      player.score += 1;

      addLog(room, `🎱 ${player.name} 打进并消除了手牌 [${removedCard.suit}${removedCard.rank} -> ${removedCard.ballNumber}号球]！`);

      const winners = checkGameWinners(room);
      if (winners.length > 0) {
        room.status = 'finished';
        room.winners = winners.map(w => ({
          name: w.name,
          avatar: w.avatar,
          id: w.id,
          userId: w.userId
        }));
        room.winner = room.winners[0];
        room.lastWinnerUserId = winners[0].userId;

        if (winners.length === 1) {
          addLog(room, `🏆 恭喜 ${winners[0].name} 清空有效手牌，夺得本局胜利！🎉`);
        } else {
          const names = winners.map(w => w.name).join('、');
          addLog(room, `🏆 恭喜 ${names} 共同清空有效手牌，同时夺得本局胜利！🎉`);
        }
      }

      broadcastRoomState(roomCode);
    }
  });

  // 6. 罚牌
  socket.on('draw_penalty', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (room.deck.length === 0) {
      socket.emit('error_message', '牌库扑克已耗尽，无法补牌！');
      return;
    }

    const newCard = room.deck.pop();
    player.cards.push(newCard);
    player.cards.sort((a, b) => a.ballNumber - b.ballNumber);

    addLog(room, `⚠️ ${player.name} 触发犯规，从牌库罚抽了一张扑克牌！`);
    broadcastRoomState(roomCode);
  });

  // 7. 重新开始
  socket.on('restart_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !isRoomHost(room, socket.id)) return;

    room.roundCount += 1;
    room.status = 'lobby';
    room.winner = null;
    room.winners = null;
    room.players.forEach(p => {
      p.cards = [];
      p.pocketedCards = [];
      p.isWinner = false;
    });

    addLog(room, `🔄 房主重置了对局，准备进入第 ${room.roundCount} 局`);
    broadcastRoomState(roomCode);
  });

  // 8. 离开房间 (主动退出)
  socket.on('leave_room', ({ roomCode }) => {
    handlePlayerExplicitLeave(socket, roomCode);
  });

  // 9. 网络断开 (物理断线/暂离)
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        handlePlayerDisconnect(socket, code, player);
      }
    }
  });
});

// 处理暂离断线：标记 offline 并开启 1 小时倒计时
function handlePlayerDisconnect(socket, roomCode, player) {
  const room = rooms[roomCode];
  if (!room || !player) return;

  const timeoutMs = (config.room && config.room.disconnect_timeout_ms) || 3600000;
  const minutes = Math.round(timeoutMs / 60000);
  const timeDesc = minutes >= 60 ? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}小时` : `${minutes}分钟`;

  player.online = false;
  addLog(room, `⚠️ ${player.name} 暂离了网络，等待重连 (${timeDesc})...`);

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
  }

  player.disconnectTimer = setTimeout(() => {
    handlePlayerPermanentLeave(roomCode, player.userId);
  }, timeoutMs);

  broadcastRoomState(roomCode);
}

// 超过限时仍未重连，真正移除玩家
function handlePlayerPermanentLeave(roomCode, userId) {
  const room = rooms[roomCode];
  if (!room) return;

  const timeoutMs = (config.room && config.room.disconnect_timeout_ms) || 3600000;
  const minutes = Math.round(timeoutMs / 60000);
  const timeDesc = minutes >= 60 ? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}小时` : `${minutes}分钟`;

  const playerIndex = room.players.findIndex(p => p.userId === userId);
  if (playerIndex !== -1) {
    const player = room.players[playerIndex];
    if (player.online) return; // 已恢复连线，跳过删除

    room.players.splice(playerIndex, 1);
    addLog(room, `⌛️ ${player.name} 暂离超时 (${timeDesc})，已被系统移出房间`);

    if (room.turnOrder) {
      const idx = room.turnOrder.indexOf(userId);
      if (idx !== -1) {
        room.turnOrder.splice(idx, 1);
      }
    }

    if (room.players.length === 0) {
      delete rooms[roomCode];
    } else {
      if (room.hostUserId === userId) {
        const nextHost = room.players.find(p => p.online !== false) || room.players[0];
        room.hostUserId = nextHost.userId;
        room.hostSocketId = nextHost.id;
        addLog(room, `👑 ${nextHost.name} 自动成为新房主`);
      }
      broadcastRoomState(roomCode);
    }
  }
}

// 玩家主动退出房间
function handlePlayerExplicitLeave(socket, roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const playerIndex = room.players.findIndex(p => p.id === socket.id);
  if (playerIndex !== -1) {
    const player = room.players[playerIndex];
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
    }
    room.players.splice(playerIndex, 1);
    socket.leave(roomCode);
    addLog(room, `${player.name} 离开了房间`);

    if (room.turnOrder) {
      const idx = room.turnOrder.indexOf(player.userId);
      if (idx !== -1) {
        room.turnOrder.splice(idx, 1);
      }
    }

    if (room.players.length === 0) {
      delete rooms[roomCode];
    } else {
      if (room.hostUserId === player.userId) {
        const nextHost = room.players.find(p => p.online !== false) || room.players[0];
        room.hostUserId = nextHost.userId;
        room.hostSocketId = nextHost.id;
        addLog(room, `👑 ${nextHost.name} 自动成为新房主`);
      }
      broadcastRoomState(roomCode);
    }
  }
}

// 端口查找优先级：环境变量 PORT -> config.yaml 端口 -> 默认 3000
const PORT = process.env.PORT || config.port || 3000;
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🎱 54张扑克台球 Web App 已启动`);
  console.log(`📄 读取端口: ${PORT}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`=================================`);
});
