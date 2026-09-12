<script setup lang="ts">
import type { Card } from '@shared/types/game';
import { computed } from 'vue';

const props = defineProps<{
  card: Card;
  isDimmed?: boolean;
  isElevated?: boolean;
  isDiscarding?: boolean;
  isNewlyEliminated?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<(e: 'click', card: Card) => void>();
const red = computed(() => props.card.color === 'red');
const joker = computed(() => props.card.ballNumber >= 14);
</script>
<template>
  <button
    class="poker-prop-card"
    :class="{
      'is-dimmed': isDimmed,
      'is-elevated': isElevated,
      'is-discarding': isDiscarding,
      'is-newly-eliminated': isNewlyEliminated,
      'red-ink': red
    }"
    :disabled="disabled"
    :aria-label="`${card.rank}${card.suit}，${card.ballNumber}号球，${isDimmed ? '免打牌' : '点击出牌'}`"
    @click="emit('click', card)"
  >
    <span class="card-face">
      <span class="card-corner">
        <strong>{{ joker ? '王' : card.rank }}</strong>
        <span>{{ joker ? '✦' : card.suit }}</span>
        <span class="corner-ball" :class="{ 'is-free': isDimmed }">{{ card.ballNumber }}</span>
      </span>
      <span class="card-suit" aria-hidden="true">{{ joker ? '✦' : card.suit }}</span>
      <span class="card-mark" :class="`ball-${card.ballNumber}`"><span>{{ card.ballNumber }}</span></span>
      <span v-if="isDimmed" class="free-label">免打</span>
      <span class="opposite-corner" aria-hidden="true">{{ joker ? '王' : card.rank }}{{ joker ? '✦' : card.suit }}</span>

      <!-- 进球联动消牌印章动画 -->
      <span v-if="isNewlyEliminated" class="eliminated-stamp" aria-hidden="true">
        <span>免打</span>
      </span>
    </span>
  </button>
</template>
<style scoped>
.poker-prop-card { width: 82px; height: 124px; flex-shrink: 0; color: #20352d; cursor: pointer; position: relative; border-radius: 7px; transform-style: preserve-3d; transition: transform 480ms cubic-bezier(.2,.8,.2,1), opacity 400ms, box-shadow 400ms; text-align: left; }
.card-face { display: block; position: absolute; inset: 0; overflow: hidden; border-radius: 7px; background: repeating-linear-gradient(100deg,#fff0 0 2px,#bfaa8520 3px 3.4px), linear-gradient(145deg,#fffcf1,#eee5d2); border: 1px solid #ffffe9; box-shadow: 0 2px 0 #ab9e83, 0 3px 0 #d8cdb4, 0 9px 15px #030b0980; }
.red-ink { color: #a53632; }
.card-corner { position: absolute; top: 7px; left: 7px; display: flex; flex-direction: column; align-items: center; font: 18px/.95 Georgia,serif; gap: 3px; }
.card-corner strong { font-size: 22px; }
.corner-ball { width: 17px; height: 17px; display: grid; place-items: center; border: 1px solid #9b947c; border-radius: 50%; font: 600 10px/1 Georgia,serif; color: #35443b; margin-top: 4px; }
.corner-ball.is-free { color: #777c72; text-decoration: line-through; }
.card-suit { position: absolute; right: 11px; top: 33px; font: 44px/1 Georgia,serif; }
.card-mark { position: absolute; width: 27px; height: 27px; bottom: 13px; left: 12px; border-radius: 50%; display: grid; place-items: center; box-shadow: inset -3px -3px 4px #0006,0 2px 3px #0003; transition: filter 400ms; }
.card-mark span { border-radius: 50%; background: #fff9e8; color: #1f2a22; font: bold 11px Georgia,serif; width: 16px; height: 16px; display: grid; place-items: center; }
.opposite-corner { position: absolute; bottom: 6px; right: 6px; transform: rotate(180deg); font: bold 14px Georgia,serif; }
.free-label { position: absolute; left: 9px; bottom: 3px; font-size: 8px; color: #52645b; }
.is-dimmed .card-mark { filter: grayscale(1); }
.is-dimmed .card-mark::after { content: ''; position: absolute; width: 32px; height: 2px; background: #5c6e63; transform: rotate(-45deg); }
.is-elevated { transform: translateY(-18px); }
.is-discarding { transform: translate(30px,-170px) rotate(16deg) scale(.72); opacity: 0; pointer-events: none; }
.is-newly-eliminated {
  animation: eliminate-pulse 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  z-index: 35 !important;
}
.eliminated-stamp {
  position: absolute;
  top: 48%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-14deg);
  border: 2px dashed #b45309;
  background: rgba(254, 243, 199, 0.92);
  color: #92400e;
  padding: 2px 6px;
  border-radius: 6px;
  font: 900 13px/1.2 'PingFang SC', system-ui, sans-serif;
  letter-spacing: 0.1em;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  animation: stamp-in 0.35s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
@keyframes stamp-in {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.8) rotate(-35deg);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(-14deg);
  }
}
@keyframes eliminate-pulse {
  0% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 0 rgba(245, 158, 11, 0);
  }
  20% {
    transform: translateY(-22px) scale(1.09);
    box-shadow: 0 0 25px rgba(245, 158, 11, 0.9), 0 0 50px rgba(16, 185, 129, 0.6);
  }
  60% {
    transform: translateY(-14px) scale(1.04);
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.5);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 0 rgba(245, 158, 11, 0);
  }
}
.poker-prop-card:focus-visible { outline: 3px solid #d9ba75; outline-offset: 4px; }
@media (hover:hover) { .poker-prop-card:hover:not(:disabled) { transform: translateY(-18px) rotate(0); } }
@media (max-height:700px) { .poker-prop-card { width: 72px; height: 108px; } .card-suit { font-size: 36px; top: 28px; } }
@media (prefers-reduced-motion:reduce) { .poker-prop-card { transition-duration: 1ms; } .is-discarding { transform: none; } .is-newly-eliminated { animation: none; } }
</style>
