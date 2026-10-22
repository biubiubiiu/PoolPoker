import { type ComputedRef, computed, type Ref } from 'vue';
import { BleOfflineSyncStrategy } from './bleSyncStrategy';
import { OnlineSyncStrategy } from './onlineSyncStrategy';
import type { GameRoomSyncStrategy } from './types';

export * from './bleSyncStrategy';
export * from './onlineSyncStrategy';
export * from './types';

/**
 * 策略实现必须保持无状态（stateless）：
 * 下面两个单例在所有房间与调用方之间共享，任何实例字段都会造成跨会话状态串用。
 * 若未来确实需要持有状态，请改为在 createGameRoomSyncStrategy 内 new 新实例。
 */
const onlineStrategyInstance = new OnlineSyncStrategy();
const bleStrategyInstance = new BleOfflineSyncStrategy();

export function createGameRoomSyncStrategy(isBle: boolean): GameRoomSyncStrategy {
  return isBle ? bleStrategyInstance : onlineStrategyInstance;
}

export function useGameRoomSyncStrategy(isBleOfflineMode: Ref<boolean>): ComputedRef<GameRoomSyncStrategy> {
  return computed(() => createGameRoomSyncStrategy(isBleOfflineMode.value));
}
