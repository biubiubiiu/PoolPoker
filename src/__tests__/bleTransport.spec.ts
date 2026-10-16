import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLE_PROTOCOL_VERSION,
  BleGameStatus,
  type BleRoomState,
  ballsToMask,
  decodeBleAction,
  encodeBleRoomState,
} from '../../shared/types/bleProtocol';
import { BleTransport } from '../services/bleTransport';

// Mock @tauri-apps/api/core and event
const mockInvokes: Array<{ cmd: string; args: any }> = [];
let eventListeners: Record<string, (event: any) => void> = {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    mockInvokes.push({ cmd, args });
    return {};
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, callback: any) => {
    eventListeners[event] = callback;
    return () => {
      delete eventListeners[event];
    };
  }),
}));

describe('BleTransport Virtual Socket Layer', () => {
  beforeEach(() => {
    mockInvokes.length = 0;
    eventListeners = {};
  });

  it('should initialize and listen to ble state updates', async () => {
    const transport = new BleTransport('user_1');
    await transport.init();
    expect(transport.connected).toBe(true);
    expect(eventListeners['ble://state_updated']).toBeDefined();

    let emittedRoom: any = null;
    transport.on('room_updated', (room) => {
      emittedRoom = room;
    });

    // 构造下行紧凑 BLE 状态
    const mockState: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 1,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: ballsToMask([8]),
      roundCount: 1,
      deckRemaining: 44,
      selfHandCards: [0], // ♠A
      players: [
        {
          userIdHash: 1,
          userId: 'user_1',
          cardCount: 1,
          isHost: true,
          online: true,
          isWinner: false,
          totalScore: 0,
        },
      ],
    };

    const bytes = encodeBleRoomState(mockState);
    // 模拟底层 Tauri 推送下行事件
    eventListeners['ble://state_updated']({ payload: Array.from(bytes) });

    expect(emittedRoom).not.toBeNull();
    expect(emittedRoom.status).toBe('playing');
    expect(emittedRoom.pocketedBallNumbers).toEqual([8]);
    expect(emittedRoom.players[0].cards[0].rank).toBe('A');

    transport.destroy();
    expect(transport.connected).toBe(false);
  });

  it('should encode business emit actions into compact binary for Tauri invoke', async () => {
    const transport = new BleTransport('user_1');
    await transport.init();

    // 1. 创建房间
    await transport.emit('create_room', { roomCode: '9999', name: '老球霸' });
    expect(mockInvokes[0].cmd).toBe('ble_start_host');
    expect(mockInvokes[0].args.roomCode).toBe('9999');

    // 2. 开局动作
    await transport.emit('start_game');
    const startAction = mockInvokes.find((inv) => inv.cmd === 'ble_send_action');
    expect(startAction).toBeDefined();
    // 验证发给 Tauri 的 payload 是紧凑字节数组
    expect(Array.isArray(startAction?.args.payload)).toBe(true);
    expect(startAction?.args.payload[0]).toBe(BLE_PROTOCOL_VERSION);
  });

  it('should support connect, disconnect, timeout and execute callbacks correctly', async () => {
    const transport = new BleTransport('my_real_user_id');
    const callbackMock = vi.fn();

    // connect & timeout chain
    const chain = transport.timeout(3000).connect();
    expect(chain).toBe(transport);

    // emit with callback
    await transport.emit('pocket_ball', { cardId: '♠-8', ballNumber: 8 }, callbackMock);

    const pocketAction = mockInvokes.find((inv) => inv.cmd === 'ble_send_action');
    expect(pocketAction).toBeDefined();
    expect(pocketAction?.args.cardId).toBe('♠-8');
    const decodedAction = decodeBleAction(new Uint8Array(pocketAction?.args.payload));
    expect(decodedAction.ballNumber).toBe(8);
    // 回调应被执行以解除 pendingAction
    expect(callbackMock).toHaveBeenCalledWith({ success: true });

    // disconnect
    transport.disconnect();
    expect(transport.connected).toBe(false);
  });

  it('should accurately restore host, self user ID, pocketed cards, and last action text', async () => {
    const transport = new BleTransport('guest_user_456');
    await transport.init();

    let emittedRoom: any = null;
    transport.on('room_updated', (room) => {
      emittedRoom = room;
    });

    const mockState: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 5,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: ballsToMask([1, 8]),
      roundCount: 2,
      deckRemaining: 30,
      selfSeatIndex: 1, // 当前玩家在 1 号位 (客端)
      hostSeatIndex: 0, // 房主在 0 号位
      selfHandCards: [13, 26], // ♦A, ♣A
      lastActionText: '老球霸 进球 ♠8',
      players: [
        {
          userIdHash: 11,
          userId: 'host_user_123',
          name: '老球霸',
          cardCount: 3,
          pocketedCards: [7], // 进过 ♠8
          isHost: true,
          online: true,
          isWinner: false,
          totalScore: 10,
          roundScoreDelta: 5,
        },
        {
          userIdHash: 22,
          userId: 'guest_user_456',
          name: '挑战者',
          cardCount: 2,
          pocketedCards: [],
          isHost: false,
          online: true,
          isWinner: false,
          totalScore: -10,
          roundScoreDelta: -5,
        },
      ],
    };

    const bytes = encodeBleRoomState(mockState);
    eventListeners['ble://state_updated']({ payload: Array.from(bytes) });

    expect(emittedRoom).not.toBeNull();
    // 验证席位0被正确标记为房主，且 hostUserId 与其一致
    expect(emittedRoom.hostUserId).toBe(emittedRoom.players[0].userId);
    expect(emittedRoom.players[0].isHost).toBe(true);
    expect(emittedRoom.players[0].pocketedCards.length).toBe(1);

    // 验证客端玩家的真实 userId 和手牌被准确映射还原
    expect(emittedRoom.players[1].userId).toBe('guest_user_456');
    expect(emittedRoom.players[1].isHost).toBe(false);
    expect(emittedRoom.players[1].cards.length).toBe(2);
    expect(emittedRoom.players[1].cards[0].rank).toBe('A');

    // 验证动作与结算数据
    expect(emittedRoom.lastActionText).toBe('老球霸 进球 ♠8');
    expect(emittedRoom.lastRoundScores).toHaveLength(2);
    expect(emittedRoom.lastRoundScores[0].delta).toBe(5);
    expect(emittedRoom.lastRoundScores[1].delta).toBe(-5);
  });

  it('should correctly handle update_settings from settings.cardsPerPlayer and encode it', async () => {
    const transport = new BleTransport('host_123');
    await transport.init();

    await transport.emit('update_settings', {
      roomCode: '8848',
      settings: { cardsPerPlayer: 7 },
    });

    const settingsAction = mockInvokes.find((inv) => inv.cmd === 'ble_send_action' && inv.args.payload[3] === 10);
    expect(settingsAction).toBeDefined();
    // byte 6 对应 cardsPerPlayer
    expect(settingsAction?.args.payload[6]).toBe(7);
  });

  it('should support rejoin_room to restore state after webview reload', async () => {
    const transport = new BleTransport('host_123');
    await transport.init();

    const mockState: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 3,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: ballsToMask([1]),
      roundCount: 1,
      deckRemaining: 40,
      cardsPerPlayer: 6,
      selfSeatIndex: 0,
      hostSeatIndex: 0,
      selfHandCards: [0, 1],
      players: [
        {
          userIdHash: 1,
          userId: 'host_123',
          name: '老球霸',
          cardCount: 2,
          isHost: true,
          online: true,
          isWinner: false,
          totalScore: 0,
        },
      ],
    };
    const bytes = encodeBleRoomState(mockState);

    // Mock ble_rejoin_room 返回真实字节数组
    const invokeSpy = vi.spyOn(await import('@tauri-apps/api/core'), 'invoke');
    invokeSpy.mockImplementation(async (cmd: string, args: any) => {
      mockInvokes.push({ cmd, args });
      if (cmd === 'ble_rejoin_room') {
        return Array.from(bytes);
      }
      return {};
    });

    let reloadedRoom: any = null;
    transport.on('room_updated', (room) => {
      reloadedRoom = room;
    });

    const callbackMock = vi.fn();
    await transport.emit(
      'rejoin_room',
      { roomCode: '8848', userId: 'host_123', sessionToken: 'token_123' },
      callbackMock
    );

    expect(callbackMock).toHaveBeenCalledWith(expect.objectContaining({ success: true, roomCode: '8848' }));
    expect(reloadedRoom).not.toBeNull();
    expect(reloadedRoom.settings.cardsPerPlayer).toBe(6);
    expect(reloadedRoom.players[0].cards).toHaveLength(2);
  });
});
