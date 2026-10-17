import { describe, expect, it } from 'vitest';
import {
  BLE_PROTOCOL_VERSION,
  BLE_UUIDS,
  BleActionType,
  type BleClientAction,
  BleGameStatus,
  BleHostEventCode,
  type BleRoomState,
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
} from '../../shared/types/bleProtocol';

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
      avatar: '🐉',
    });
    const decodedJoin = decodeBleJoin(joinBytes);
    expect(decodedJoin.userId).toBe('user_abc_123');
    expect(decodedJoin.name).toBe('张无忌');
    expect(decodedJoin.avatar).toBe('🐉');

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
          avatar: '👑',
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
          avatar: '🎱',
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
    expect(clientRoom.players[0].avatar).toBe('👑');
    expect(clientRoom.players[1].cards.length).toBe(1);
    expect(clientRoom.players[1].cards[0].rank).toBe('K');
    expect(BLE_UUIDS.SERVICE).toBeDefined();
  });
});
