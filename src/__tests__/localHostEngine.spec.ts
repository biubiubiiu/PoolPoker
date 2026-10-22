import { beforeEach, describe, expect, it } from 'vitest';
import { BLE_PROTOCOL_VERSION, BleActionType, BleGameStatus } from '../../shared/types/bleProtocol';
import { decodeBleRoomState, encodeBleAction, encodeBleRoomState } from '../../shared/utils/bleCodec';
import { createLocalRoom, getLocalBleState, handleLocalCommand, LocalHostEngine } from '../services/localHostEngine';

describe('LocalHostEngine in Front-end', () => {
  let engine: LocalHostEngine;

  beforeEach(() => {
    engine = new LocalHostEngine();
  });

  it('should initialize local room correctly and return host state', () => {
    const room = engine.initRoom('host_user', '老球霸', '8848');
    expect(room.code).toBe('8848');
    expect(room.hostUserId).toBe('host_user');
    expect(room.players).toHaveLength(1);
    expect(room.players[0].isHost).toBe(true);
    expect(room.status).toBe('waiting');
  });

  it('should initialize room and produce valid BLE binary state via getLocalBleState', () => {
    const room = createLocalRoom('user_host', '老球霸', '6688');
    expect(room.players.length).toBe(1);
    expect(room.status).toBe('waiting');

    const bleState = getLocalBleState(room, 'user_host');
    expect(bleState.version).toBe(BLE_PROTOCOL_VERSION);
    expect(bleState.status).toBe(BleGameStatus.WAITING);

    const binary = encodeBleRoomState(bleState);
    expect(binary.length).toBeLessThan(60);

    const decoded = decodeBleRoomState(binary);
    expect(decoded.version).toBe(BLE_PROTOCOL_VERSION);
    expect(decoded.status).toBe(BleGameStatus.WAITING);
    expect(decoded.players[0].name).toBe('老球霸');
  });

  it('should start game and deal cards with private hand isolation in BLE payload', () => {
    const room = createLocalRoom('user_host', '老球霸');
    room.players.push({
      id: 'ble_client_user_guest',
      userId: 'user_guest',
      name: '挑战者',
      isHost: false,
      online: true,
      cardCount: 0,
      cards: [],
      pocketedCards: [],
      wins: 0,
      isWinner: false,
      totalScore: 0,
    });

    const res = handleLocalCommand(room, {
      type: 'start_game',
      actorUserId: 'user_host',
    });
    expect(res.changed).toBe(true);
    expect(room.status).toBe('playing');
    expect(room.players[0].cards.length).toBe(5);
    expect(room.players[1].cards.length).toBe(5);

    const hostBle = getLocalBleState(room, 'user_host');
    expect(hostBle.selfHandCards.length).toBe(5);

    const guestBle = getLocalBleState(room, 'user_guest');
    expect(guestBle.selfHandCards.length).toBe(5);
    expect(guestBle.selfHandCards).not.toEqual(hostBle.selfHandCards);

    const hostBin = encodeBleRoomState(hostBle);
    const guestBin = encodeBleRoomState(guestBle);
    expect(hostBin.length).toBeLessThan(100);
    expect(guestBin.length).toBeLessThan(100);
  });

  it('should not leak host cards when an unknown userId queries local state', () => {
    const room = createLocalRoom('user_host', '老球霸');
    handleLocalCommand(room, {
      type: 'start_game',
      actorUserId: 'user_host',
    });
    expect(room.players[0].cards.length).toBe(5);

    const unknownBle = getLocalBleState(room, 'malicious_unknown_user');
    expect(unknownBle.selfSeatIndex).toBe(0xff);
    expect(unknownBle.selfHandCards).toEqual([]);
  });

  it('should correctly round-trip UTF-8 lastActionText, sceneEvent, and turnOrderSeats', () => {
    const room = createLocalRoom('user_host', '老球霸');
    handleLocalCommand(room, {
      type: 'update_settings',
      actorUserId: 'user_host',
      cardsPerPlayer: 7,
    });
    expect(room.settings.cardsPerPlayer).toBe(7);

    handleLocalCommand(room, {
      type: 'start_game',
      actorUserId: 'user_host',
    });
    handleLocalCommand(room, {
      type: 'draw_penalty',
      actorUserId: 'user_host',
    });

    const bleState = getLocalBleState(room, 'user_host');
    expect(bleState.cardsPerPlayer).toBe(7);
    expect(bleState.lastActionText).toContain('老球霸 犯规，罚抽 1 张扑克牌');
    expect(bleState.sceneEventKind).toBe('draw_penalty');

    const bin = encodeBleRoomState(bleState);
    const decoded = decodeBleRoomState(bin);
    expect(decoded.cardsPerPlayer).toBe(7);
    expect(decoded.lastActionText).toBe(bleState.lastActionText);
    expect(decoded.sceneEventKind).toBe('draw_penalty');
    expect(decoded.turnOrderSeats).toEqual([0]);
  });

  it('should add guest players and broadcast updated roster to all players', () => {
    engine.initRoom('host_user', '老球霸', '8848');
    const updatedUsers: string[] = [];
    engine.setStateUpdateCallback((targetUserId, _bytes, clientRoom) => {
      updatedUsers.push(targetUserId);
      if (targetUserId === 'host_user') {
        expect(clientRoom.players).toHaveLength(2);
      }
    });

    const guestRoom = engine.addPlayer('guest_1', '挑战者1');
    expect(guestRoom).not.toBeNull();
    expect(engine.getRawRoom()?.players).toHaveLength(2);
    // 房主和客人都收到了最新状态
    expect(updatedUsers).toContain('host_user');
    expect(updatedUsers).toContain('guest_1');

    const { clientRoom: guestView } = engine.getStateForUser('guest_1');
    expect(guestView.players[1].userId).toBe('guest_1');
    expect(guestView.players[1].isHost).toBe(false);
  });

  it('should run full game lifecycle: start, pocket ball, and finish', () => {
    engine.initRoom('host_user', '老球霸', '8848');
    engine.addPlayer('guest_1', '挑战者1');

    // 1. 开局指令
    const startAction = encodeBleAction({
      version: 1,
      revision: 1,
      actionType: BleActionType.START_GAME,
    });
    const changed = engine.executeBinaryAction(startAction, 'host_user');
    expect(changed).toBe(true);

    const rawRoom = engine.getRawRoom();
    expect(rawRoom?.status).toBe('playing');
    expect(rawRoom?.players[0].cards.length).toBeGreaterThan(0);

    // 2. 房主出第一张手牌
    const hostFirstCard = rawRoom?.players[0]?.cards[0];
    expect(hostFirstCard).toBeDefined();
    if (!hostFirstCard) return;
    const pocketAction = encodeBleAction({
      version: 1,
      revision: 2,
      actionType: BleActionType.POCKET_BALL,
      ballNumber: hostFirstCard.ballNumber,
    });
    const pocketResult = engine.executeBinaryAction(pocketAction, 'host_user', hostFirstCard.id);
    expect(pocketResult).toBe(true);

    const { clientRoom } = engine.getStateForUser('host_user');
    expect(clientRoom.pocketedBallNumbers).toContain(hostFirstCard.ballNumber);
  });

  it('should correctly penalize target player when referee action specifies targetSeatIndex from guest', () => {
    engine.initRoom('host_user', '老球霸', '8848');
    engine.addPlayer('guest_1', '挑战者1');

    // 开局
    const startAction = encodeBleAction({
      version: 1,
      revision: 1,
      actionType: BleActionType.START_GAME,
    });
    engine.executeBinaryAction(startAction, 'host_user');

    const hostInitialCount = engine.getRawRoom()?.players[0].cards.length ?? 0;
    const guestInitialCount = engine.getRawRoom()?.players[1].cards.length ?? 0;
    expect(hostInitialCount).toBe(5);
    expect(guestInitialCount).toBe(5);

    // 客机发起对房主（席位 0）的罚牌
    const penaltyAction = encodeBleAction({
      version: 1,
      revision: 2,
      actionType: BleActionType.REFEREE_PENALTY,
      targetSeatIndex: 0, // 目标是房主
    });
    // sender 是 guest_1
    const res = engine.executeBinaryAction(penaltyAction, 'guest_1');
    expect(res).toBe(true);

    // 房主手牌数增加 1 (5 -> 6)，客机手牌数不变 (5)
    expect(engine.getRawRoom()?.players[0].cards.length).toBe(6);
    expect(engine.getRawRoom()?.players[1].cards.length).toBe(5);
  });

  it('should reject adding new player mid-game to prevent 0-card instant victory bug, while allowing existing player reconnect via bindPeerPlayer', () => {
    engine.initRoom('host_user', '老球霸', '8848');
    engine.addPlayer('peer_temp_1', '球友');
    // 升级身份握手
    const bindRes = engine.bindPeerPlayer('peer_temp_1', 'real_guest_1', '张三');
    expect(bindRes.ok).toBe(true);
    expect(engine.getRawRoom()?.players[1].userId).toBe('real_guest_1');
    expect(engine.getRawRoom()?.players[1].name).toBe('张三');

    // 开局
    const startAction = encodeBleAction({
      version: 1,
      revision: 1,
      actionType: BleActionType.START_GAME,
    });
    engine.executeBinaryAction(startAction, 'host_user');
    expect(engine.getRawRoom()?.status).toBe('playing');

    // 对局中陌生设备尝试中途加入，必须被拒绝
    const midGameJoin = engine.addPlayer('stranger_peer', '陌生人');
    expect(midGameJoin).toBeNull();
    const bindStranger = engine.bindPeerPlayer('stranger_peer', 'stranger_user', '陌生人');
    expect(bindStranger.ok).toBe(false);
    expect(bindStranger.reason).toBe('playing');
    expect(engine.getRawRoom()?.players).toHaveLength(2);

    // 对局中已加入玩家因 BLE MAC 轮换使用新 peerId 重连并发送 CLIENT_JOIN，必须成功恢复其席位与手牌
    engine.setPlayerOffline('real_guest_1');
    const reconnectRes = engine.bindPeerPlayer('new_rotated_mac', 'real_guest_1', '张三');
    expect(reconnectRes.ok).toBe(true);
    expect(engine.getRawRoom()?.players[1].online).toBe(true);
    expect(engine.getRawRoom()?.players[1].cards).toHaveLength(5);
  });
});
