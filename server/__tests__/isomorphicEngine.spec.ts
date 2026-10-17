import { describe, expect, it } from 'vitest';
import { createLocalRoom, getLocalBleState, handleLocalCommand } from '../../shared/engine/isomorphicEngine';
import {
  BLE_PROTOCOL_VERSION,
  BleGameStatus,
  decodeBleRoomState,
  encodeBleRoomState,
} from '../../shared/types/bleProtocol';

describe('Isomorphic Engine with BLE Serialization', () => {
  it('should initialize room and produce valid BLE binary state', () => {
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
    // 增加第二个玩家
    room.players.push({
      id: 'ble_client_user_guest',
      userId: 'user_guest',
      name: '挑战者',
      avatar: '🎱',
      isHost: false,
      online: true,
      cardCount: 0,
      cards: [],
      pocketedCards: [],
      wins: 0,
      isWinner: false,
      totalScore: 0,
    });

    // 房主开局发牌
    const res = handleLocalCommand(room, {
      type: 'start_game',
      actorUserId: 'user_host',
    });
    expect(res.changed).toBe(true);
    expect(room.status).toBe('playing');
    expect(room.players[0].cards.length).toBe(5);
    expect(room.players[1].cards.length).toBe(5);

    // 验证 Host 视角获得的 BLE Payload：只包含 Host 手牌
    const hostBle = getLocalBleState(room, 'user_host');
    expect(hostBle.selfHandCards.length).toBe(5);

    // 验证 Guest 视角获得的 BLE Payload：只包含 Guest 手牌，绝不泄漏 Host 手牌
    const guestBle = getLocalBleState(room, 'user_guest');
    expect(guestBle.selfHandCards.length).toBe(5);
    expect(guestBle.selfHandCards).not.toEqual(hostBle.selfHandCards);

    // 编码成极紧凑二进制（远低于 BLE 185 字节单包 MTU）
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

    // 未知用户查询
    const unknownBle = getLocalBleState(room, 'malicious_unknown_user');
    expect(unknownBle.selfSeatIndex).toBe(0xff);
    expect(unknownBle.selfHandCards).toEqual([]); // 必须为空，严禁泄露房主手牌
  });

  it('should correctly round-trip UTF-8 lastActionText, sceneEvent, turnOrderSeats, and finished revealedCards', () => {
    const room = createLocalRoom('user_host', '老球霸');
    handleLocalCommand(room, {
      type: 'update_settings',
      actorUserId: 'user_host',
      cardsPerPlayer: 7,
    });
    expect(room.settings.cardsPerPlayer).toBe(7);

    // 罚牌生成带中文字符和 Emoji 的 actionText 与 sceneEvent
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
    expect(bleState.lastActionText).toBeDefined();
    expect(bleState.lastActionText).toContain('老球霸 犯规，罚抽 1 张扑克牌');
    expect(bleState.sceneEventKind).toBe('draw_penalty');

    // 二进制往返
    const bin = encodeBleRoomState(bleState);
    const decoded = decodeBleRoomState(bin);
    expect(decoded.cardsPerPlayer).toBe(7);
    expect(decoded.lastActionText).toBe(bleState.lastActionText);
    expect(decoded.sceneEventKind).toBe('draw_penalty');
    expect(decoded.turnOrderSeats).toEqual([0]);
  });
});
