import { describe, expect, it } from 'vitest';
import {
  BLE_CHUNK_SIZE,
  BLE_PROTOCOL_VERSION,
  BLE_UUIDS,
  BleActionType,
  type BleClientAction,
  BleGameStatus,
  type BleHostEvent,
  BleHostEventCode,
  type BleRoomState,
} from '../../shared/types/bleProtocol';
import {
  BleChunkReassembler,
  ballsToMask,
  bleStateToClientRoom,
  cardToIndex,
  decodeBleAction,
  decodeBleHostEvent,
  decodeBleJoin,
  decodeBleRoomState,
  encodeBleAction,
  encodeBleHostEvent,
  encodeBleJoin,
  encodeBleRoomState,
  indexToCard,
  maskToBalls,
  splitIntoBleChunks,
} from '../../shared/utils/bleCodec';

describe('BLE Compact Binary Wire Protocol', () => {
  it('should round-trip card mapping for all 54 cards', () => {
    for (let i = 0; i < 54; i++) {
      const card = indexToCard(i, 'test');
      const recoveredIdx = cardToIndex(card);
      expect(recoveredIdx).toBe(i);
    }
  });

  it('should accurately encode and decode pocketed ball bitmask', () => {
    const balls = [1, 3, 8, 14, 15];
    const mask = ballsToMask(balls);
    const recovered = maskToBalls(mask);
    expect(recovered).toEqual(balls);
  });

  it('should encode and decode BleClientAction under 8 bytes with protocol version', () => {
    const action: BleClientAction = {
      version: BLE_PROTOCOL_VERSION,
      revision: 42,
      actionType: BleActionType.POCKET_BALL,
      ballNumber: 8,
      cardIndex: 7, // ♠ 8
    };

    const encoded = encodeBleAction(action);
    expect(encoded.length).toBe(8);
    expect(encoded[0]).toBe(BLE_PROTOCOL_VERSION);

    const decoded = decodeBleAction(encoded);
    expect(decoded.version).toBe(BLE_PROTOCOL_VERSION);
    expect(decoded.revision).toBe(42);
    expect(decoded.actionType).toBe(BleActionType.POCKET_BALL);
    expect(decoded.ballNumber).toBe(8);
    expect(decoded.cardIndex).toBe(7);
  });

  it('should encode and decode CLIENT_JOIN and HOST_EVENT_NOTIFY frames', () => {
    const joinBytes = encodeBleJoin({
      version: BLE_PROTOCOL_VERSION,
      userId: 'user_abc_123',
      name: '张无忌',
    });
    const decodedJoin = decodeBleJoin(joinBytes);
    expect(decodedJoin.userId).toBe('user_abc_123');
    expect(decodedJoin.name).toBe('张无忌');

    const eventBytes = encodeBleHostEvent({
      version: BLE_PROTOCOL_VERSION,
      code: BleHostEventCode.KICKED,
    });
    const decodedEvent = decodeBleHostEvent(eventBytes);
    expect(decodedEvent.code).toBe(BleHostEventCode.KICKED);
  });

  it('should compress full room state into ultra-compact payload (< 50 bytes) with versioning', () => {
    const state: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 12,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: ballsToMask([1, 8, 15]),
      roundCount: 3,
      deckRemaining: 34,
      selfHandCards: [0, 13, 26, 52, 53], // 5 cards
      players: [
        {
          userIdHash: 101,
          userId: 'user_101',
          cardCount: 5,
          isHost: true,
          online: true,
          isWinner: false,
          totalScore: 12,
        },
        {
          userIdHash: 102,
          userId: 'user_102',
          cardCount: 4,
          isHost: false,
          online: true,
          isWinner: false,
          totalScore: -12,
        },
      ],
    };

    const encoded = encodeBleRoomState(state);
    expect(encoded.length).toBeLessThan(50);
    expect(encoded[0]).toBe(BLE_PROTOCOL_VERSION);

    const decoded = decodeBleRoomState(encoded);
    expect(decoded.version).toBe(BLE_PROTOCOL_VERSION);
    expect(decoded.revision).toBe(12);
    expect(decoded.status).toBe(BleGameStatus.PLAYING);
    expect(maskToBalls(decoded.pocketedBallsMask)).toEqual([1, 8, 15]);
    expect(decoded.roundCount).toBe(3);
    expect(decoded.deckRemaining).toBe(34);
    expect(decoded.selfHandCards).toEqual([0, 13, 26, 52, 53]);
    expect(decoded.players.length).toBe(2);
    expect(decoded.players[0].isHost).toBe(true);
    expect(decoded.players[0].totalScore).toBe(12);
    expect(decoded.players[1].totalScore).toBe(-12);
  });

  it('should transform BleRoomState to frontend Room structure with turnOrder, sceneEvent, wins, and revealedCards', () => {
    const state: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 300, // > 255 16-bit revision
      status: BleGameStatus.FINISHED,
      pocketedBallsMask: ballsToMask([8]),
      roundCount: 2,
      deckRemaining: 44,
      selfSeatIndex: 0,
      selfHandCards: [0, 52], // ♠A and 小王
      turnOrderSeats: [1, 0],
      sceneEventKind: 'pocket_ball',
      sceneEventTargetSeat: 0,
      sceneEventBallNumber: 8,
      players: [
        {
          userIdHash: 1,
          userId: 'user_1',
          name: '房主',
          wins: 3,
          cardCount: 2,
          isHost: true,
          online: true,
          isWinner: true,
          totalScore: 5,
          pocketedCards: [7],
          revealedCards: [0, 52],
        },
        {
          userIdHash: 2,
          userId: 'user_2',
          name: '客机',
          wins: 1,
          cardCount: 1,
          isHost: false,
          online: true,
          isWinner: false,
          totalScore: -5,
          pocketedCards: [],
          revealedCards: [12], // ♠K
        },
      ],
    };

    const bin = encodeBleRoomState(state);
    const decoded = decodeBleRoomState(bin);
    expect(decoded.revision).toBe(300);

    const clientRoom = bleStateToClientRoom(decoded, 'user_1', '8848');
    expect(clientRoom.code).toBe('8848');
    expect(clientRoom.status).toBe('finished');
    expect(clientRoom.pocketedBallNumbers).toEqual([8]);
    expect(clientRoom.turnOrder).toEqual([clientRoom.players[1].userId, 'user_1']);
    expect(clientRoom.sceneEvent?.kind).toBe('pocket_ball');
    expect(clientRoom.sceneEvent?.ballNumber).toBe(8);
    expect(clientRoom.players[0].wins).toBe(3);
    expect(clientRoom.players[1].cards.length).toBe(1);
    expect(clientRoom.players[1].cards[0].rank).toBe('K');
    expect(BLE_UUIDS.SERVICE).toBeDefined();
  });

  it('should encode and decode LEAVE_ROOM action', () => {
    const action: BleClientAction = {
      version: BLE_PROTOCOL_VERSION,
      revision: 7,
      actionType: BleActionType.LEAVE_ROOM,
    };
    const encoded = encodeBleAction(action);
    const decoded = decodeBleAction(encoded);
    expect(decoded.actionType).toBe(BleActionType.LEAVE_ROOM);
    expect(decoded.revision).toBe(7);
  });

  it('should chunk state exceeding BLE_CHUNK_SIZE into multiple frames and reassemble accurately', () => {
    // 构造一个 8 人满员、带有长中文昵称和多张牌的完整对局状态（原始体积 > 250 字节）
    const largeState: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 88,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: ballsToMask([1, 2, 3, 8]),
      roundCount: 1,
      deckRemaining: 14,
      cardsPerPlayer: 5,
      selfSeatIndex: 0,
      hostSeatIndex: 0,
      selfHandCards: [0, 1, 2, 3, 4],
      turnOrderSeats: [0, 1, 2, 3, 4, 5, 6, 7],
      lastActionText: '🎯 房主大球霸 打进 8号球，消去卡牌 [♠8]',
      players: Array.from({ length: 8 }, (_, idx) => ({
        userIdHash: idx + 1,
        userId: `user_uid_${idx + 100}`,
        name: `绝世高手_${idx}号`,
        cardCount: 5,
        isHost: idx === 0,
        online: true,
        isWinner: false,
        totalScore: idx * 10,
        pocketedCards: idx === 0 ? [7] : [],
      })),
    };

    const fullBinary = encodeBleRoomState(largeState);
    expect(fullBinary.length).toBeGreaterThan(250); // 确认确实超过了 250 字节的单帧阈值

    // 拆分分包 (指定单包总长上限 145 字节)
    const chunks = splitIntoBleChunks(fullBinary, 42, BLE_CHUNK_SIZE + 5);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(BLE_CHUNK_SIZE + 5);
      expect(chunk[0]).toBe(BLE_PROTOCOL_VERSION);
      expect(chunk[1]).toBe(0x12); // HOST_STATE_CHUNK
      expect(chunk[2]).toBe(42); // transferId
    }

    // 重组
    const reassembler = new BleChunkReassembler();
    let reassembled: Uint8Array | null = null;
    for (let i = 0; i < chunks.length; i++) {
      const res = reassembler.processPacket(chunks[i]);
      if (i < chunks.length - 1) {
        expect(res).toBeNull();
      } else {
        reassembled = res;
      }
    }

    expect(reassembled).not.toBeNull();
    expect(reassembled).toEqual(fullBinary);
    if (!reassembled) throw new Error('Expected reassembled payload');

    // 解码还原状态并验证无损
    const recoveredState = decodeBleRoomState(reassembled);
    expect(recoveredState.revision).toBe(88);
    expect(recoveredState.players).toHaveLength(8);
    expect(recoveredState.players[7].name).toBe('绝世高手_7号');
    expect(recoveredState.lastActionText).toBe('🎯 房主大球霸 打进 8号球，消去卡牌 [♠8]');
  });

  it('should discard stale transfer chunks when a newer transferId arrives', () => {
    // 构造超过单包上限 9 字节的数据（例如 12 字节），确保切分为多个 chunk
    const payloadA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const payloadB = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);

    // 5 字节协议头 + 4 字节数据切片 = 单包上限 9 字节
    const chunksA = splitIntoBleChunks(payloadA, 1, 9);
    const chunksB = splitIntoBleChunks(payloadB, 2, 9);
    expect(chunksA.length).toBeGreaterThan(1);
    expect(chunksB.length).toBeGreaterThan(1);

    const reassembler = new BleChunkReassembler();
    // 喂入 A 的第 1 片 (未完成)
    expect(reassembler.processPacket(chunksA[0])).toBeNull();

    // 突然到了新一轮 transferId = 2 的第 1 片 (A 被废弃)
    expect(reassembler.processPacket(chunksB[0])).toBeNull();
    // 喂入 B 的后续分片直至全部完成
    let resultB: Uint8Array | null = null;
    for (let i = 1; i < chunksB.length; i++) {
      resultB = reassembler.processPacket(chunksB[i]);
    }
    expect(resultB).toEqual(payloadB);
  });

  it('should encode and decode HOST_EVENT_NOTIFY with LEAVE_ACK', () => {
    const evt: BleHostEvent = {
      version: BLE_PROTOCOL_VERSION,
      code: BleHostEventCode.LEAVE_ACK,
      roomCode: 8848,
    };
    const binary = encodeBleHostEvent(evt);
    const decoded = decodeBleHostEvent(binary);
    expect(decoded.code).toBe(BleHostEventCode.LEAVE_ACK);
    expect(decoded.roomCode).toBe(8848);
  });

  it('should safely truncate overlong UTF-8 lastActionText and player names without overflowing 1-byte length headers', () => {
    const overlongLog = '🎉 恭喜获胜！'.repeat(30); // > 400 UTF-8 bytes
    const overlongName = '超长昵称测试球王'.repeat(5); // > 100 UTF-8 bytes
    const state: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 512,
      status: BleGameStatus.FINISHED,
      pocketedBallsMask: ballsToMask([8]),
      roundCount: 2,
      deckRemaining: 0,
      selfHandCards: [],
      lastActionText: overlongLog,
      players: [
        {
          userIdHash: 1,
          userId: 'u_1',
          name: overlongName,
          cardCount: 0,
          isHost: true,
          online: true,
          isWinner: true,
          totalScore: 20,
        },
      ],
    };

    const encoded = encodeBleRoomState(state);
    const decoded = decodeBleRoomState(encoded);
    expect(decoded.revision).toBe(512);
    expect(new TextEncoder().encode(decoded.lastActionText || '').length).toBeLessThanOrEqual(180);
    expect(new TextEncoder().encode(decoded.players[0].name || '').length).toBeLessThanOrEqual(48);
    expect(overlongLog.startsWith(decoded.lastActionText || '')).toBe(true);
    expect(overlongName.startsWith(decoded.players[0].name || '')).toBe(true);
  });
});
