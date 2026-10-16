import { beforeEach, describe, expect, it } from 'vitest';
import { BleActionType, encodeBleAction } from '../../shared/types/bleProtocol';
import { LocalHostEngine } from '../services/localHostEngine';

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
});
