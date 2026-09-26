<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useBallAppearance } from '@/composables/useBallAppearance';

const props = withDefaults(
  defineProps<{
    ballNumber: number;
    ballTheme?: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    size: 'md',
  }
);

const appearance = useBallAppearance();
const effectiveTheme = computed(() => props.ballTheme || appearance.theme);

const hasError = ref(false);

watch(
  () => [props.ballNumber, effectiveTheme.value],
  () => {
    hasError.value = false;
  }
);

const imageSrc = computed(() => {
  return `/assets/balls/${effectiveTheme.value}/2d/${props.ballNumber}.webp`;
});

const getBallClass = (ballNum: number) => {
  if (ballNum >= 9 && ballNum <= 15) {
    return `ball-${ballNum} ball-striped`;
  }
  return `ball-${ballNum}`;
};

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'w-3.5 h-3.5 text-[8px]';
    case 'lg':
      return 'w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] text-xs';
    default:
      return 'w-7 h-7 text-xs';
  }
});
</script>

<template>
  <div class="relative shrink-0 flex items-center justify-center select-none" :class="sizeClasses">
    <img
      v-if="!hasError"
      :src="imageSrc"
      :alt="`${ballNumber}号球`"
      class="w-full h-full object-contain pointer-events-none drop-shadow-sm"
      loading="lazy"
      @error="hasError = true"
    />
    <!-- Fallback to CSS ball if asset fails to load -->
    <div
      v-else
      :class="['w-full h-full rounded-full flex items-center justify-center font-bold text-white mini-ball shadow', getBallClass(ballNumber)]"
    >
      <span class="relative z-10 leading-none">{{ ballNumber }}</span>
    </div>
  </div>
</template>
