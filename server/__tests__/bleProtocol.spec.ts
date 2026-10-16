import { describe, expect, it } from 'vitest';
import {
  BLE_PROTOCOL_VERSION,
  BLE_UUIDS,
  BleActionType,
  type BleClientAction,
  BleGameStatus,
  type BleRoomState,
  ballsToMask,
  bleStateToClientRoom,
  cardToIndex,
  decodeBleAction,
  decodeBleRoomState,
  encodeBleAction,
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
    // 头部4 + 状态5 + 手牌(1+5) + 玩家(1+2*5) = 4 + 5 + 6 + 11 = 26 bytes!
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

  it('should transform BleRoomState to frontend Room structure seamlessly', () => {
    const state: BleRoomState = {
      version: BLE_PROTOCOL_VERSION,
      revision: 8,
      status: BleGameStatus.PLAYING,
      pocketedBallsMask: ballsToMask([8]),
      roundCount: 1,
      deckRemaining: 44,
      selfHandCards: [0, 52], // ♠A and 小王
      players: [
        {
          userIdHash: 1,
          userId: 'user_1',
          cardCount: 2,
          isHost: true,
          online: true,
          isWinner: false,
          totalScore: 5,
        },
      ],
    };

    const clientRoom = bleStateToClientRoom(state, 'user_1', '8848');
    expect(clientRoom.code).toBe('8848');
    expect(clientRoom.status).toBe('playing');
    expect(clientRoom.pocketedBallNumbers).toEqual([8]);
    expect(clientRoom.players[0].cards.length).toBe(2);
    expect(clientRoom.players[0].cards[0].rank).toBe('A');
    expect(clientRoom.players[0].cards[1].rank).toBe('小王');
    expect(BLE_UUIDS.SERVICE).toBeDefined();
  });
});
