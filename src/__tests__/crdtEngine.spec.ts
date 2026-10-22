import { describe, expect, it } from 'vitest';
import { reduceGameState } from '../services/crdt/deterministicEngine';
import { CrdtEventStorage, type StorageAdapter } from '../services/crdt/eventLogStorage';
import { createGameEvent, createGenesisSnapshot, deriveGenesisCards } from '../services/crdt/gameEvents';

describe('CRDT Event-Sourced Engine for PoolPoker', () => {
  const players = [
    { userId: 'user_host_a', name: '房主A' },
    { userId: 'user_member_b', name: '成员B' },
    { userId: 'user_member_c', name: '成员C' },
  ];

  it('generates 100% deterministic card shuffles and hands from the same deckSeed across isolated devices', () => {
    const genesis1 = createGenesisSnapshot('8848', players, 5, 12345678);
    const genesis2 = createGenesisSnapshot('8848', players, 5, 12345678);

    const result1 = deriveGenesisCards(genesis1);
    const result2 = deriveGenesisCards(genesis2);

    expect(result1.shuffledDeck.map((c) => c.id)).toEqual(result2.shuffledDeck.map((c) => c.id));
    expect(result1.playerInitialHands.get('user_host_a')?.map((c) => c.id)).toEqual(
      result2.playerInitialHands.get('user_host_a')?.map((c) => c.id)
    );
    expect(result1.playerInitialHands.get('user_member_b')?.map((c) => c.id)).toEqual(
      result2.playerInitialHands.get('user_member_b')?.map((c) => c.id)
    );
    expect(result1.drawDeck.length).toBe(54 - 3 * 5); // 39 剩余牌
  });

  it('USER SCENARIO: Host locks screen, B and C pocket balls independently while partitioned, merging preserves BOTH balls without conflict', () => {
    const genesis = createGenesisSnapshot('8848', players, 5, 99999);

    // 1. 房主锁屏 (休眠)...
    // 2. 成员 B 亮屏，在完全离线状态下记入 3 号球
    const eventB1 = createGameEvent(genesis.gameId, 'user_member_b', 'POCKET_BALL', 0, {
      ballNumber: 3,
    });
    // 成员 B 锁屏...

    // 3. 成员 C 亮屏，在完全不知 B 操作的状态下记入 8 号球
    const eventC1 = createGameEvent(genesis.gameId, 'user_member_c', 'POCKET_BALL', 0, {
      ballNumber: 8,
    });
    // 成员 C 锁屏...

    // 4. 稍后两人同时亮屏，BLE 瞬时互换事件集合
    const eventsOnB = [eventB1, eventC1];
    const eventsOnC = [eventC1, eventB1]; // 乱序

    const stateOnB = reduceGameState(genesis, eventsOnB);
    const stateOnC = reduceGameState(genesis, eventsOnC);

    // 两端计算结果必须 100% 一致！
    expect(stateOnB.pocketedBallNumbers).toEqual([3, 8]);
    expect(stateOnC.pocketedBallNumbers).toEqual([3, 8]);
    expect(stateOnB.appliedEventsCount).toBe(2);
    expect(stateOnC.appliedEventsCount).toBe(2);

    // 双方手牌计算结果完全对齐
    expect(stateOnB.players[0].cards.map((c) => c.id)).toEqual(stateOnC.players[0].cards.map((c) => c.id));
    expect(stateOnB.players[1].cards.map((c) => c.id)).toEqual(stateOnC.players[1].cards.map((c) => c.id));
  });

  it('guarantees out-of-order convergence across any permutation of events', () => {
    const genesis = createGenesisSnapshot('8848', players, 5, 42);

    const e1 = createGameEvent(genesis.gameId, 'user_member_b', 'POCKET_BALL', 0, { ballNumber: 1 });
    const e2 = createGameEvent(genesis.gameId, 'user_member_c', 'POCKET_BALL', 1, { ballNumber: 5 });
    const e3 = createGameEvent(genesis.gameId, 'user_host_a', 'ACCIDENTAL_POCKET', 2, { ballNumber: 7 });
    const e4 = createGameEvent(genesis.gameId, 'user_member_b', 'DRAW_PENALTY', 3);

    const perm1 = [e1, e2, e3, e4];
    const perm2 = [e4, e2, e1, e3];
    const perm3 = [e3, e1, e4, e2];

    const s1 = reduceGameState(genesis, perm1);
    const s2 = reduceGameState(genesis, perm2);
    const s3 = reduceGameState(genesis, perm3);

    expect(s1.pocketedBallNumbers).toEqual([1, 5, 7]);
    expect(s2.pocketedBallNumbers).toEqual(s1.pocketedBallNumbers);
    expect(s3.pocketedBallNumbers).toEqual(s1.pocketedBallNumbers);

    // 罚牌抽取的卡牌完全一致
    expect(s1.players[1].cards.length).toEqual(s2.players[1].cards.length);
    expect(s2.players[1].cards.length).toEqual(s3.players[1].cards.length);
  });

  it('handles retract_ball cleanly by cancelling target event without disturbing other concurrent events', () => {
    const genesis = createGenesisSnapshot('8848', players, 5, 777);

    // B 进了 4 号球
    const e1 = createGameEvent(genesis.gameId, 'user_member_b', 'POCKET_BALL', 0, { ballNumber: 4 });
    // C 进了 9 号球
    const e2 = createGameEvent(genesis.gameId, 'user_member_c', 'POCKET_BALL', 1, { ballNumber: 9 });
    // B 发现 4 号球看错了，申请悔球撤销 e1
    const e3 = createGameEvent(genesis.gameId, 'user_member_b', 'RETRACT_EVENT', 2, {
      retractTargetId: e1.eventId,
    });

    const state = reduceGameState(genesis, [e1, e2, e3]);

    // 4 号球被撤回，不在落袋集合中；9 号球完全不受影响保留！
    expect(state.pocketedBallNumbers).toEqual([9]);
    expect(state.appliedEventsCount).toBe(1); // 仅 e2 生效
  });

  it('correctly detects victory when all cards of a player match pocketed balls', () => {
    const genesis = createGenesisSnapshot('8848', players, 2, 888);
    const cards = deriveGenesisCards(genesis);
    const bHand = cards.playerInitialHands.get('user_member_b') || [];

    // 打落 B 手牌中的所有球号
    const events = bHand.map((card, idx) =>
      createGameEvent(genesis.gameId, 'user_member_b', 'POCKET_BALL', idx, {
        ballNumber: card.ballNumber,
      })
    );

    const state = reduceGameState(genesis, events);
    expect(state.status).toBe('finished');
    expect(state.winners.some((w) => w.userId === 'user_member_b')).toBe(true);
  });

  it('persists and merges event logs idempotently', () => {
    const map = new Map<string, string>();
    const memStorage: StorageAdapter = {
      getItem: (k) => map.get(k) || null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };
    const storage = new CrdtEventStorage(memStorage);

    const genesis = createGenesisSnapshot('8848', players, 5, 100);
    storage.saveGenesis(genesis);

    const e1 = createGameEvent(genesis.gameId, 'user_member_b', 'POCKET_BALL', 0, { ballNumber: 2 });
    const e2 = createGameEvent(genesis.gameId, 'user_member_c', 'POCKET_BALL', 1, { ballNumber: 6 });

    // 第一次合并
    const res1 = storage.mergeEvents(genesis.gameId, [e1]);
    expect(res1.newlyAdded.length).toBe(1);
    expect(res1.merged.length).toBe(1);

    // 第二次合并包含重复的 e1 和新的 e2
    const res2 = storage.mergeEvents(genesis.gameId, [e1, e2]);
    expect(res2.newlyAdded.length).toBe(1); // 仅 e2 为新增
    expect(res2.merged.length).toBe(2);

    // 验证落盘持久化
    const savedGenesis = storage.getGenesis(genesis.gameId);
    expect(savedGenesis?.gameId).toBe(genesis.gameId);
    expect(storage.getEvents(genesis.gameId).length).toBe(2);
  });
});
