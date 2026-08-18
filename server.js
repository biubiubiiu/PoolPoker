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

// 给房间全员广播渲染数据
function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const roomSockets = io.sockets.adapter.rooms.get(roomCode);
  if (!roomSockets) return;

  for (const socketId of roomSockets) {
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      const clientRoom = {
        code: room.code,
        hostSocketId: room.hostSocketId,
        settings: room.settings,
        status: room.status,
        roundCount: room.roundCount,
        deckCount: room.deck.length,
        logs: room.logs.slice(-15),
        winner: room.winner,
        players: room.players.map(p => {
          const isSelf = p.id === socketId;
          return {
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isHost: p.id === room.hostSocketId,
            cardCount: p.cards.length,
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

// 日志记录 Helper
function addLog(room, message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  room.logs.push({ id: Date.now() + Math.random(), text: message, time });
}

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. 创建房间
  socket.on('create_room', ({ name, avatar }) => {
    const roomCode = generateRoomCode();
    const newPlayer = {
      id: socket.id,
      name: name || '玩家1',
      avatar: avatar || '🎱',
      cards: [],
      pocketedCards: [],
      score: 0,
      isWinner: false
    };

    const defaultCards = (config.room && config.room.default_cards_per_player) || 5;

    rooms[roomCode] = {
      code: roomCode,
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
    
    socket.emit('room_created', { roomCode });
    broadcastRoomState(roomCode);
  });

  // 2. 加入房间
  socket.on('join_room', ({ roomCode, name, avatar }, callback) => {
    const code = (roomCode || '').trim();
    const room = rooms[code];

    if (!room) {
      if (callback) callback({ success: false, message: '房间不存在或已解散' });
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

    const existingPlayer = room.players.find(p => p.id === socket.id);
    if (!existingPlayer) {
      const newPlayer = {
        id: socket.id,
        name: name || `玩家${room.players.length + 1}`,
        avatar: avatar || '🎯',
        cards: [],
        pocketedCards: [],
        score: 0,
        isWinner: false
      };
      room.players.push(newPlayer);
      addLog(room, `${newPlayer.name} 加入了房间`);
    }

    socket.join(code);
    if (callback) callback({ success: true, roomCode: code });
    broadcastRoomState(code);
  });

  // 3. 修改房间设置
  socket.on('update_settings', ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room || room.hostSocketId !== socket.id) return;

    if (settings.cardsPerPlayer) {
      room.settings.cardsPerPlayer = Math.max(1, Math.min(10, settings.cardsPerPlayer));
    }

    addLog(room, `房主修改了规则: 每人 ${room.settings.cardsPerPlayer} 张牌`);
    broadcastRoomState(roomCode);
  });

  // 4. 开始游戏 / 发牌
  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.players.length < 1) return;

    const fullDeck = create54PokerDeck();
    const totalNeededCards = room.players.length * room.settings.cardsPerPlayer;
    if (totalNeededCards > fullDeck.length) {
      socket.emit('error_message', `玩家人数与发牌数过多，牌库总张数（${fullDeck.length}张）不足！`);
      return;
    }

    const shuffledDeck = shuffle(fullDeck);

    room.winner = null;
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

    addLog(room, `🃏 第 ${room.roundCount} 局对局开始！54张扑克已发给全员`);
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

      addLog(room, `🎱 ${player.name} 打进并消除了手牌 [${removedCard.suit}${removedCard.rank} -> ${removedCard.ballNumber}号球]！(还剩 ${player.cards.length} 张)`);

      if (player.cards.length === 0) {
        player.isWinner = true;
        room.status = 'finished';
        room.winner = {
          name: player.name,
          avatar: player.avatar,
          id: player.id
        };
        addLog(room, `🏆 恭喜 ${player.name} 先清空手牌，夺得本局胜利！🎉`);
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
    if (!room || room.hostSocketId !== socket.id) return;

    room.roundCount += 1;
    room.status = 'lobby';
    room.winner = null;
    room.players.forEach(p => {
      p.cards = [];
      p.pocketedCards = [];
      p.isWinner = false;
    });

    addLog(room, `🔄 房主重置了对局，准备进入第 ${room.roundCount} 局`);
    broadcastRoomState(roomCode);
  });

  // 8. 离开房间
  socket.on('leave_room', ({ roomCode }) => {
    handlePlayerLeave(socket, roomCode);
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        handlePlayerLeave(socket, code);
      }
    }
  });
});

function handlePlayerLeave(socket, roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const player = room.players.find(p => p.id === socket.id);
  if (player) {
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(roomCode);
    addLog(room, `${player.name} 离开了房间`);

    if (room.players.length === 0) {
      delete rooms[roomCode];
    } else {
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = room.players[0].id;
        addLog(room, `👑 ${room.players[0].name} 自动成为新房主`);
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
