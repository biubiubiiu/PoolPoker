import { afterEach, describe, expect, it, vi } from 'vitest';
import { _clearHookListeners, emitHookEvent, handleSystemCrash, registerHookListener } from '../../hook/eventBus';
import type { GameHookEvent } from '../../hook/types';

describe('Hook EventBus (事件总线与强异常隔离)', () => {
  afterEach(() => {
    _clearHookListeners();
  });

  it('监听器能正确捕获发射的 Hook 事件', () => {
    const received: GameHookEvent[] = [];
    registerHookListener((evt) => {
      received.push(evt);
    });

    const mockEvent: GameHookEvent = {
      id: 'test_evt_1',
      type: 'game_round_finished',
      timestamp: Date.now(),
      payload: {
        roomCode: '6666',
        roundNumber: 1,
        revision: 1,
        winners: [],
        leaders: [],
        standings: [],
        scores: [],
        nextTurnFirstPlayer: null,
        timestamp: Date.now(),
      },
    };

    emitHookEvent(mockEvent);
    expect(received.length).toBe(1);
    expect(received[0].id).toBe('test_evt_1');
  });

  it('监听器抛出同步或异步异常时，总线强隔离捕获，不中断执行，不向外抛出', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 注册抛出同步异常的监听器
    registerHookListener(() => {
      throw new Error('同步监听器崩溃');
    });

    // 注册返回 rejected Promise 的异步监听器
    registerHookListener(() => {
      return Promise.reject(new Error('异步监听器拒绝'));
    });

    // 注册一个正常监听器
    let normalExecuted = false;
    registerHookListener(() => {
      normalExecuted = true;
    });

    const mockEvent: GameHookEvent = {
      id: 'test_evt_err',
      type: 'system_crash',
      timestamp: Date.now(),
      payload: {
        error: 'crash',
        type: 'uncaughtException',
        activeRoomsCount: 0,
        timestamp: Date.now(),
      },
    };

    // 触发发射，不应当抛出任何未捕获错误
    expect(() => emitHookEvent(mockEvent)).not.toThrow();
    expect(normalExecuted).toBe(true);

    spyWarn.mockRestore();
  });

  it('handleSystemCrash 能构造合规事件并通过 emitHookEventAsync 等待异步监听器完成', async () => {
    let capturedEvent: GameHookEvent | null = null;
    let asyncFinished = false;

    registerHookListener(async (evt) => {
      capturedEvent = evt;
      await new Promise((resolve) => setTimeout(resolve, 10));
      asyncFinished = true;
    });

    await handleSystemCrash(new Error('test crash error'), 'uncaughtException');
    const evt = capturedEvent as GameHookEvent | null;
    expect(evt).not.toBeNull();
    expect(evt?.type).toBe('system_crash');
    expect(evt?.payload).toMatchObject({
      error: 'test crash error',
      type: 'uncaughtException',
    });
    expect(asyncFinished).toBe(true);
  });
});
