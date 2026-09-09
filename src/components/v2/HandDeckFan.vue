<script setup lang="ts">
import type { Card } from '@shared/types/game';
import { ref } from 'vue';
import PokerCardProp from './PokerCardProp.vue';

const props = defineProps<{
  cards: Card[];
  pocketedBallNumbers: number[];
  elevatedCardIds?: string[];
  discardingCardId?: string | null;
  disabled?: boolean;
}>();
const emit = defineEmits<(e: 'card-click', card: Card) => void>();
const expanded = ref(false);
const style = (i: number) => {
  const offset = i - (props.cards.length - 1) / 2;
  return {
    transform:
      expanded.value || props.cards.length > 6
        ? 'none'
        : `translateY(${Math.abs(offset) * 3}px) rotate(${offset * 4}deg)`,
    zIndex: i + 1,
  };
};
</script>
<template>
  <div class="hand-deck-container">
    <button v-if="cards.length > 1" class="expand-hand" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收拢手牌' : '展开手牌' }}</button>
    <div class="hand-scroll" :class="{ expanded, 'many-cards': cards.length > 6 }">
      <TransitionGroup name="deal" tag="div" class="cards-fan-arc">
        <div v-for="(card, i) in cards" :key="card.id" class="fan-card-wrapper" :style="style(i)">
          <PokerCardProp :card="card" :isDimmed="pocketedBallNumbers.includes(card.ballNumber)"
            :isElevated="elevatedCardIds?.includes(card.id)" :isDiscarding="discardingCardId === card.id" :disabled="disabled"
            @click="emit('card-click', $event)" />
        </div>
      </TransitionGroup>
    </div>
    <p v-if="!cards.length" class="empty-hand">手牌已清空</p>
  </div>
</template>
<style scoped>
.hand-deck-container { position: relative; width: 100%; perspective: 900px; }
.expand-hand { position: absolute; top: -24px; right: 18px; font-size: 11px; color: #b6b9a7; min-height: 32px; padding: 0 6px; z-index: 1; }
.hand-scroll { overflow: visible; padding: 24px 20px 14px; scrollbar-width: thin; scrollbar-color: #627765 transparent; }
.cards-fan-arc { display: flex; align-items: end; justify-content: center; width: max-content; min-width: 100%; }
.fan-card-wrapper { margin-left: -27px; transform-origin: bottom center; transition: transform 350ms; }
.fan-card-wrapper:first-child { margin-left: 0; }
.expanded,.many-cards { overflow-x: auto; overflow-y: clip; }
.expanded .fan-card-wrapper, .many-cards .fan-card-wrapper { margin-left: 8px; }
.fan-card-wrapper:focus-within { z-index: 30 !important; }
.deal-enter-active { transition: transform 550ms, opacity 400ms; }
.deal-enter-from { transform: translate(80px,-100px) rotate(20deg) !important; opacity: 0; }
.empty-hand { text-align: center; color: #d7cba9; padding: 28px; font-size: 14px; }
@media(max-width:370px) { .fan-card-wrapper { margin-left: -34px; } }
@media(prefers-reduced-motion:reduce) { .fan-card-wrapper,.deal-enter-active { transition: none; } }
</style>
