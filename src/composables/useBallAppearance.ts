import { computed, type InjectionKey, inject, provide, type Ref, readonly } from 'vue';

function createBallAppearance(theme: Readonly<Ref<string>>) {
  return readonly({ theme });
}

const ballAppearanceKey: InjectionKey<ReturnType<typeof createBallAppearance>> = Symbol('ballAppearance');

/** Share the active ball appearance theme without creating another mutable source of truth. */
export function provideBallAppearance(theme: Readonly<Ref<string>> = computed(() => 'xingpai')) {
  provide(ballAppearanceKey, createBallAppearance(theme));
}

export function useBallAppearance() {
  return inject(ballAppearanceKey, () => createBallAppearance(computed(() => 'xingpai')), true);
}
