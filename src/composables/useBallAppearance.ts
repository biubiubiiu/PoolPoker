import type { BallConfig } from '@shared/types/game';
import { computed, type InjectionKey, inject, provide, type Ref, readonly } from 'vue';

function createBallAppearance(theme: Readonly<Ref<string>>, colors: Readonly<Ref<BallConfig['colors'] | undefined>>) {
  return readonly({ theme, colors });
}

const ballAppearanceKey: InjectionKey<ReturnType<typeof createBallAppearance>> = Symbol('ballAppearance');

/** Share the existing room-derived appearance without creating another mutable source of truth. */
export function provideBallAppearance(
  theme: Readonly<Ref<string>>,
  colors: Readonly<Ref<BallConfig['colors'] | undefined>>
) {
  provide(ballAppearanceKey, createBallAppearance(theme, colors));
}

export function useBallAppearance() {
  return inject(
    ballAppearanceKey,
    () =>
      createBallAppearance(
        computed(() => 'xingpai'),
        computed(() => undefined)
      ),
    true
  );
}
