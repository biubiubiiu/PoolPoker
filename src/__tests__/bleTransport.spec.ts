import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLE_PROTOCOL_VERSION, BleGameStatus, type BleRoomState, ballsToMask } from '../../shared/types/bleProtocol';
import { BleTransport, resetSharedHostEngine, setStoredDeviceId } from '../services/bleTransport';

const mockInvokes: Array<{ cmd: string; args?: any }> = [];
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
    resetSharedHostEngine();
    mockInvokes.length = 0;
    eventListeners = {};
  });

  it('should initialize and support event listeners', async () => {
    const transport = new BleTransport('user_1');
    transport.init();
    expect(transport.connected).toBe(true);

    let emittedRoom: any = null;
    transport.on('room_updated', (room) => {
      emittedRoom = room;
    });

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

    transport.handleIncomingState({
      code: '8848',
      revision: 1,
      hostUserId: 'user_1',
      hostSocketId: 'ble_user_1',
      settings: { cardsPerPlayer: 5, includeBlackEight: true, maxPlayers: 8 },
      status: 'playing',
      roundCount: 1,
      deckCount: 44,
      logs: [],
      winners: [],
      pocketedBallNumbers: [8],
      turnOrder: ['user_1'],
      lastRoundScores: [],
      players: [
        {
          id: 'ble_user_1',
          userId: 'user_1',
          name: '我',
          avatar: '🎱',
          isHost: true,
          online: true,
          cardCount: 1,
          cards: [{ id: 'ble_0', suit: '♠', suitType: 'spade', color: 'black', rank: 'A', ballNumber: 1 }],
          pocketedCards: [],
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
      ],
    });

    expect(emittedRoom).not.toBeNull();
    expect(emittedRoom.status).toBe('playing');
    expect(emittedRoom.pocketedBallNumbers).toEqual([8]);

    transport.destroy();
    expect(transport.connected).toBe(false);
  });

  it('should create room and interact with LocalHostEngine end-to-end', async () => {
    const transport = new BleTransport('host_123', '老球霸');
    transport.init();

    let currentRoom: any = null;
    transport.on('room_updated', (room) => {
      currentRoom = room;
    });

    const createCallback = vi.fn();
    await transport.emit('create_room', { roomCode: '8848', name: '老球霸' }, createCallback);

    expect(createCallback).toHaveBeenCalledWith(expect.objectContaining({ success: true, roomCode: '8848' }));
    expect(currentRoom).not.toBeNull();
    expect(currentRoom.code).toBe('8848');
    expect(currentRoom.hostUserId).toBe('host_123');
    expect(currentRoom.status).toBe('waiting');

    // 房主开局
    await transport.emit('start_game');
    expect(currentRoom.status).toBe('playing');
    expect(currentRoom.players[0].cards.length).toBe(5);

    // 房主出牌
    const firstCard = currentRoom.players[0].cards[0];
    await transport.emit('pocket_ball', { cardId: firstCard.id, ballNumber: firstCard.ballNumber });
    expect(currentRoom.pocketedBallNumbers).toContain(firstCard.ballNumber);
  });

  it('should support connect, disconnect, timeout and callbacks', async () => {
    const transport = new BleTransport('my_real_user_id');
    const callbackMock = vi.fn();

    const chain = transport.timeout(3000).connect();
    expect(chain).toBe(transport);

    await transport.emit('pocket_ball', { cardId: '♠-8', ballNumber: 8 }, callbackMock);
    expect(callbackMock).toHaveBeenCalledWith({ success: true });

    transport.disconnect();
    expect(transport.connected).toBe(false);
  });

  it('should support rejoin_room to restore state seamlessly', async () => {
    const hostTransport = new BleTransport('host_user', '房主');
    await hostTransport.emit('create_room', { roomCode: '6666', name: '房主' });
    await hostTransport.emit('start_game');

    // 另一个实例或刷新后的新 Transport 执行 rejoin
    const reloadTransport = new BleTransport('host_user', '房主');
    let restoredRoom: any = null;
    reloadTransport.on('room_updated', (room) => {
      restoredRoom = room;
    });

    const rejoinCallback = vi.fn();
    await reloadTransport.emit('rejoin_room', { roomCode: '6666', userId: 'host_user' }, rejoinCallback);

    expect(rejoinCallback).toHaveBeenCalledWith(expect.objectContaining({ success: true, roomCode: '6666' }));
    expect(restoredRoom).not.toBeNull();
    expect(restoredRoom.code).toBe('6666');
    expect(restoredRoom.status).toBe('playing');
  });

  it('should extract deviceId from discoverySource when joining a room', async () => {
    const guestTransport = new BleTransport('guest_user', '客端');
    await guestTransport.init();

    const joinCallback = vi.fn();
    await guestTransport.emit(
      'join_room',
      {
        roomCode: '8848',
        name: '客端',
        discoverySource: { type: 'ble', deviceId: 'bt_table_123' },
      },
      joinCallback
    );

    expect(joinCallback).toHaveBeenCalledWith(null, expect.objectContaining({ success: true, roomCode: '8848' }));
    expect(mockInvokes.some((i) => i.cmd === 'ble_connect_peripheral' && i.args?.deviceId === 'bt_table_123')).toBe(
      true
    );
  });

  it('should unicast tailored states to specific peerId without sending host private hand to BLE', async () => {
    const hostTransport = new BleTransport('host_user', '房主');
    await hostTransport.init();
    await hostTransport.emit('create_room', { roomCode: '8848', name: '房主' });

    mockInvokes.length = 0;

    // 模拟原生从机连接
    if (eventListeners['ble://client_connected']) {
      eventListeners['ble://client_connected']({ payload: { peer_id: 'peer_guest_99' } });
    }

    // 检查 ble_notify_state_to_clients 的调用
    const notifyCalls = mockInvokes.filter((i) => i.cmd === 'ble_notify_state_to_clients');
    expect(notifyCalls.length).toBeGreaterThan(0);
    for (const call of notifyCalls) {
      expect(call.args?.targetPeerId).toBe('peer_guest_99');
    }
  });

  it('should handle leave_room by stopping advertising for host and disconnecting for guest', async () => {
    // 房主退出
    const hostTransport = new BleTransport('host_user', '房主');
    await hostTransport.init();
    await hostTransport.emit('create_room', { roomCode: '8848', name: '房主' });

    mockInvokes.length = 0;
    const hostLeaveCb = vi.fn();
    await hostTransport.emit('leave_room', {}, hostLeaveCb);

    expect(hostLeaveCb).toHaveBeenCalledWith({ success: true });
    expect(mockInvokes.some((i) => i.cmd === 'ble_stop_advertising')).toBe(true);

    // 客机退出
    const guestTransport = new BleTransport('guest_user', '客端');
    await guestTransport.init();
    await guestTransport.emit('join_room', { roomCode: '8848', deviceId: 'dev_host' });

    mockInvokes.length = 0;
    const guestLeaveCb = vi.fn();
    await guestTransport.emit('leave_room', {}, guestLeaveCb);

    expect(guestLeaveCb).toHaveBeenCalledWith({ success: true });
    expect(mockInvokes.some((i) => i.cmd === 'ble_disconnect_peripheral')).toBe(true);
  });

  it('should support rejoin_room for remote guest using persisted deviceId', async () => {
    const guestTransport = new BleTransport('remote_guest', '远程球友');
    await guestTransport.init();

    // 预先存入上次连接的设备 ID
    setStoredDeviceId('persisted_host_device');

    mockInvokes.length = 0;
    const rejoinCb = vi.fn();
    await guestTransport.emit('rejoin_room', { roomCode: '8848', userId: 'remote_guest' }, rejoinCb);

    expect(rejoinCb).toHaveBeenCalledWith(expect.objectContaining({ success: true, roomCode: '8848' }));
    expect(
      mockInvokes.some((i) => i.cmd === 'ble_connect_peripheral' && i.args?.deviceId === 'persisted_host_device')
    ).toBe(true);
  });

  it('should encode targetSeatIndex into action when guest issues referee action', async () => {
    const guestTransport = new BleTransport('guest_1', '客端1');
    await guestTransport.init();

    // 模拟客机已缓存房间视图 (包含 host 和 guest)
    guestTransport.handleIncomingState({
      code: '8848',
      revision: 1,
      hostUserId: 'host_0',
      hostSocketId: 'ble_host_0',
      settings: { cardsPerPlayer: 5, includeBlackEight: true, maxPlayers: 8 },
      status: 'playing',
      roundCount: 1,
      deckCount: 44,
      logs: [],
      winners: [],
      pocketedBallNumbers: [],
      turnOrder: ['host_0', 'guest_1'],
      lastRoundScores: [],
      players: [
        {
          id: 'ble_host_0',
          userId: 'host_0',
          name: '房主',
          avatar: '🎱',
          isHost: true,
          online: true,
          cardCount: 5,
          cards: [],
          pocketedCards: [],
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
        {
          id: 'ble_guest_1',
          userId: 'guest_1',
          name: '客端1',
          avatar: '🎱',
          isHost: false,
          online: true,
          cardCount: 5,
          cards: [],
          pocketedCards: [],
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
      ],
    });

    mockInvokes.length = 0;
    // 客机发起对房主 (host_0) 的罚牌
    await guestTransport.emit('referee_draw_penalty', { targetUserId: 'host_0' });

    const sendCmd = mockInvokes.find((i) => i.cmd === 'ble_send_command_to_host');
    expect(sendCmd).toBeDefined();
    // 检查字节数组：第 7 字节应该编码了 targetSeatIndex = 0 (房主下标)
    const payloadBytes = sendCmd?.args?.payload;
    expect(payloadBytes).toBeDefined();
    expect(payloadBytes[7]).toBe(0); // 席位 0
  });

  it('should handle peripheral_disconnected on guest, emit disconnect event, and reject subsequent actions', async () => {
    const guestTransport = new BleTransport('guest_dc', '断线球友');
    await guestTransport.init();
    await guestTransport.emit('join_room', { roomCode: '8848', deviceId: 'test_host_peripheral' });
    expect(guestTransport.connected).toBe(true);

    let disconnectedReason: any = null;
    guestTransport.on('disconnect', (reason) => {
      disconnectedReason = reason;
    });

    // 触发原生外设物理断线事件
    const disconnListener = eventListeners['ble://peripheral_disconnected'];
    expect(disconnListener).toBeDefined();
    disconnListener({ payload: { peer_id: 'test_host_peripheral' } });

    expect(guestTransport.connected).toBe(false);
    expect(disconnectedReason).toBe('transport close');

    // 此时尝试发送游戏操作，必须被拦截并返回断线提示，严禁误报成功
    const actionCb = vi.fn();
    await guestTransport.emit('draw_penalty', {}, actionCb);
    expect(actionCb).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('与房主蓝牙连接已断开'),
      })
    );
  });

  it('should restore isHost, roomCode, and state update callback on host rejoin_room', async () => {
    const hostTransport = new BleTransport('host_lead', '权威房主');
    await hostTransport.init();
    await hostTransport.emit('create_room', { roomCode: '9999', name: '权威房主' });
    await hostTransport.emit('start_game');

    // 模拟应用刷新／组件重新挂载，新建一个 BleTransport 实例
    const reloadedHost = new BleTransport('host_lead', '权威房主');
    await reloadedHost.init();
    // 新实例初始状态不是 host
    expect((reloadedHost as any).isHost).toBe(false);

    let updatedRoom: any = null;
    reloadedHost.on('room_updated', (room) => {
      updatedRoom = room;
    });

    const rejoinCb = vi.fn();
    await reloadedHost.emit('rejoin_room', { roomCode: '9999', userId: 'host_lead' }, rejoinCb);
    expect(rejoinCb).toHaveBeenCalledWith(expect.objectContaining({ success: true, roomCode: '9999' }));
    expect((reloadedHost as any).isHost).toBe(true);
    expect(updatedRoom).not.toBeNull();
    expect(updatedRoom.players[0].cards.length).toBe(5);

    // 恢复房主后执行罚牌操作：必须直接进入本地权威状态机，使手牌从 5 张增至 6 张
    await reloadedHost.emit('draw_penalty', {});
    expect(updatedRoom.players[0].cards.length).toBe(6);

    // 验证重新开启了蓝牙桌台广播
    expect(mockInvokes.some((i) => i.cmd === 'ble_start_advertising' && i.args?.roomCode === '9999')).toBe(true);
  });

  it('should strictly ignore in-flight state_received packets after leave_room', async () => {
    const guestTransport = new BleTransport('guest_leave', '离场客人');
    await guestTransport.init();
    await guestTransport.emit('join_room', { roomCode: '7777', deviceId: 'host_mac_1' });

    let updatedCount = 0;
    guestTransport.on('room_updated', () => {
      updatedCount++;
    });

    // 退出房间
    const leaveCb = vi.fn();
    await guestTransport.emit('leave_room', {}, leaveCb);
    expect(leaveCb).toHaveBeenCalledWith({ success: true });
    // 退出房间后大厅处于可用状态，但已离开具体房间
    expect(guestTransport.connected).toBe(true);
    expect((guestTransport as any).currentRoomCode).toBe('');

    // 模拟退出后网络/蓝牙栈中迟到的在途状态广播包
    const stateListener = eventListeners['ble://state_received'];
    expect(stateListener).toBeDefined();

    const mockState: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 2,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: 0,
      roundCount: 1,
      deckRemaining: 40,
      selfHandCards: [1],
      players: [
        {
          userIdHash: 123,
          userId: 'guest_leave',
          cardCount: 1,
          isHost: false,
          online: true,
          isWinner: false,
          totalScore: 0,
        },
      ],
    };
    const { encodeBleRoomState } = await import('../../shared/types/bleProtocol');
    const encoded = Array.from(encodeBleRoomState(mockState));

    // 迟到包到达
    stateListener({ payload: encoded });

    // 验证迟到包被彻底过滤，没有触发 room_updated，也没有重新产生 cachedRoom
    expect(updatedCount).toBe(0);
    expect((guestTransport as any).cachedRoom).toBeNull();
  });

  it('should allow connect() recovery after leave_room or disconnect', async () => {
    const transport = new BleTransport('guest_reconn', '重连测试');
    await transport.init();

    // 1. 模拟退出房间后调用 connect()
    await transport.emit('leave_room', {});
    expect(transport.connected).toBe(true);

    transport.connect();
    expect(transport.connected).toBe(true);

    // 2. 模拟物理断线后调用 connect()
    const disconnListener = eventListeners['ble://peripheral_disconnected'];
    expect(disconnListener).toBeDefined();
    disconnListener({ payload: { peer_id: 'mac_disconn_1' } });
    expect(transport.connected).toBe(false);

    // 调用 connect 必须成功恢复连接状态
    transport.connect();
    expect(transport.connected).toBe(true);
  });

  it('should not emit connect event or trigger duplicate ble_connect_peripheral upon peripheral_connected', async () => {
    const guestTransport = new BleTransport('guest_dedup', '防重测客端');
    await guestTransport.init();

    const connectSpy = vi.fn();
    guestTransport.on('connect', connectSpy);

    // 首次加入房间，调用一次 ble_connect_peripheral
    mockInvokes.length = 0;
    await guestTransport.emit('join_room', { roomCode: '8848', deviceId: 'host_hw_addr_1' });
    expect(mockInvokes.filter((i) => i.cmd === 'ble_connect_peripheral').length).toBe(1);

    // 原生层返回连接成功事件
    const connListener = eventListeners['ble://peripheral_connected'];
    expect(connListener).toBeDefined();

    connectSpy.mockClear();
    mockInvokes.length = 0;
    // 注入物理连接成功事件
    connListener({ payload: { peer_id: 'host_hw_addr_1' } });

    // 校验：peripheral_connected 严禁再次触发 'connect' 本地事件
    expect(connectSpy).not.toHaveBeenCalled();

    // 即使上层触发 rejoin_room，检测到物理链路已连接，也严禁重复调用 ble_connect_peripheral
    const rejoinCb = vi.fn();
    await guestTransport.emit('rejoin_room', { roomCode: '8848', deviceId: 'host_hw_addr_1' }, rejoinCb);
    expect(rejoinCb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockInvokes.filter((i) => i.cmd === 'ble_connect_peripheral').length).toBe(0);
  });

  it('should sync guest identity via CLIENT_JOIN and notify kicked guest via HOST_EVENT_NOTIFY', async () => {
    const hostTransport = new BleTransport('host_u', '房主大王');
    await hostTransport.init();
    let hostRoom: any = null;
    hostTransport.on('room_updated', (r) => {
      hostRoom = r;
    });
    await hostTransport.emit('create_room', { roomCode: '1234', name: '房主大王' });

    // 模拟从机连接并发送 CLIENT_JOIN
    eventListeners['ble://client_connected']?.({ payload: { peer_id: 'ble_peer_mac_9' } });
    const { encodeBleJoin, decodeBleHostEvent, BleHostEventCode } = await import('../../shared/types/bleProtocol');
    const joinPayload = Array.from(
      encodeBleJoin({
        version: BLE_PROTOCOL_VERSION,
        userId: 'guest_real_uid',
        name: '赵敏',
        avatar: '🌸',
      })
    );
    eventListeners['ble://command_received']?.({
      payload: { peer_id: 'ble_peer_mac_9', payload: joinPayload },
    });

    expect(hostRoom.players).toHaveLength(2);
    expect(hostRoom.players[1].userId).toBe('guest_real_uid');
    expect(hostRoom.players[1].name).toBe('赵敏');
    expect(hostRoom.players[1].avatar).toBe('🌸');

    // 房主踢出该玩家，应向 ble_peer_mac_9 单播 KICKED 事件帧
    mockInvokes.length = 0;
    const kickCb = vi.fn();
    await hostTransport.emit('kick_player', { targetUserId: 'guest_real_uid' }, kickCb);
    expect(kickCb).toHaveBeenCalledWith({ success: true });
    expect(hostRoom.players).toHaveLength(1);

    const kickNotify = mockInvokes.find(
      (i) => i.cmd === 'ble_notify_state_to_clients' && i.args?.targetPeerId === 'ble_peer_mac_9'
    );
    expect(kickNotify).toBeDefined();
    const decodedEvent = decodeBleHostEvent(new Uint8Array(kickNotify?.args?.payload));
    expect(decodedEvent.code).toBe(BleHostEventCode.KICKED);
  });
});
