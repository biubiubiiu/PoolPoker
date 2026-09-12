<script setup lang="ts">
import type { Card } from '@shared/types/game';
import { ref, watch } from 'vue';
import PokerCardProp from './PokerCardProp.vue';

const props = defineProps<{
  cards: Card[];
  pocketedBallNumbers: number[];
  elevatedCardIds?: string[];
  discardingCardId?: string | null;
  disabled?: boolean;
  playedCards?: Card[];
}>();
const emit = defineEmits<(e: 'card-click', card: Card) => void>();
const expanded = ref(false);

const newlyEliminatedCardIds = ref<Set<string>>(new Set());

watch(
  () => props.pocketedBallNumbers,
  (newPocketed, oldPocketed) => {
    if (!oldPocketed || !newPocketed) return;
    const addedBalls = newPocketed.filter((b) => !oldPocketed.includes(b));
    if (addedBalls.length === 0) return;

    // 查找自己手牌中匹配新进球号的卡片
    const matched = props.cards.filter((c) => addedBalls.includes(c.ballNumber));
    if (matched.length > 0) {
      const nextSet = new Set(newlyEliminatedCardIds.value);
      for (const c of matched) {
        nextSet.add(c.id);
      }
      newlyEliminatedCardIds.value = nextSet;

      setTimeout(() => {
        const cleanedSet = new Set(newlyEliminatedCardIds.value);
        for (const c of matched) {
          cleanedSet.delete(c.id);
        }
        newlyEliminatedCardIds.value = cleanedSet;
      }, 1800);
    }
  },
  { deep: true }
);

const style = (i: number) => {
  const offset = i - (props.cards.length - 1) / 2;
  return {
    transform:
      expanded.value || props.cards.length > 6
        ? 'none'
        : `translateY(${Math.abs(offset) * 3}px) rotate(${offset * 3.5}deg)`,
    zIndex: i + 1,
  };
};
</script>

<template>
  <div class="hand-dock-tray">
    <!-- Dock 顶部轻量状态指示 -->
    <div class="dock-header">
      <div class="dock-summary">
        <span class="dock-title">我的手牌</span>
        <span class="dock-count-badge">
          待打 <b>{{ cards.filter(c => !pocketedBallNumbers.includes(c.ballNumber)).length }}</b> 张
        </span>
        <span v-if="cards.some(c => pocketedBallNumbers.includes(c.ballNumber))" class="dock-free-badge">
          免打 {{ cards.filter(c => pocketedBallNumbers.includes(c.ballNumber)).length }} 张
        </span>
        <span v-if="playedCards && playedCards.length > 0" class="dock-played-badge">
          已出 {{ playedCards.length }}
        </span>
      </div>
      <button
        v-if="cards.length > 1"
        type="button"
        class="expand-hand"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收拢手牌' : '展开手牌' }}
      </button>
    </div>

    <!-- 卡牌流转扇面 / 滑轨 -->
    <div class="hand-scroll" :class="{ expanded, 'many-cards': cards.length > 6 }">
      <TransitionGroup name="deal" tag="div" class="cards-fan-arc">
        <div v-for="(card, i) in cards" :key="card.id" class="fan-card-wrapper" :style="style(i)">
          <PokerCardProp
            :card="card"
            :isDimmed="pocketedBallNumbers.includes(card.ballNumber)"
            :isElevated="elevatedCardIds?.includes(card.id)"
            :isDiscarding="discardingCardId === card.id"
            :isNewlyEliminated="newlyEliminatedCardIds.has(card.id)"
            :disabled="disabled"
            @click="emit('card-click', $event)"
          />
        </div>
      </TransitionGroup>
    </div>
    <p v-if="!cards.length" class="empty-hand">🎉 手牌已全部清空！</p>
  </div>
</template>

<style scoped>
.hand-dock-tray {
  position: relative;
  width: 100%;
  max-width: 580px;
  margin: 0 auto;
  background: rgba(12, 26, 20, 0.78);
  border: 1px solid rgba(212, 185, 130, 0.22);
  border-radius: 20px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  padding: 8px 12px 12px;
  transition: all 0.3s ease;
}

.dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 2px;
}

.dock-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.dock-title {
  font-size: 12px;
  font-weight: 700;
  color: #e5e7eb;
  letter-spacing: 0.04em;
}

.dock-count-badge {
  font-size: 11px;
  color: #a7f3d0;
  background: rgba(6, 78, 59, 0.65);
  border: 1px solid rgba(16, 185, 129, 0.35);
  padding: 1px 7px;
  border-radius: 9999px;
}

.dock-count-badge b {
  color: #fef08a;
  font-weight: 900;
}

.dock-free-badge {
  font-size: 10px;
  color: #9ca3af;
}

.dock-played-badge {
  font-size: 10px;
  color: #6ee7b7;
  opacity: 0.8;
}

.expand-hand {
  font-size: 11px;
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.expand-hand:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.hand-scroll {
  overflow: visible;
  padding: 10px 8px 2px;
  scrollbar-width: thin;
  scrollbar-color: #3b5240 transparent;
}

.cards-fan-arc {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: max-content;
  min-width: 100%;
  padding-top: 12px;
}

.fan-card-wrapper {
  margin-left: -22px;
  transform-origin: bottom center;
  transition: transform 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.fan-card-wrapper:first-child {
  margin-left: 0;
}

.expanded,
.many-cards {
  overflow-x: auto;
  overflow-y: clip;
  justify-content: flex-start;
}

.expanded .fan-card-wrapper,
.many-cards .fan-card-wrapper {
  margin-left: 8px;
}

.fan-card-wrapper:hover {
  z-index: 30 !important;
}

.fan-card-wrapper:focus-within {
  z-index: 30 !important;
}

.deal-enter-active {
  transition: transform 550ms, opacity 400ms;
}

.deal-enter-from {
  transform: translate(80px, -100px) rotate(20deg) !important;
  opacity: 0;
}

.empty-hand {
  text-align: center;
  color: #d7cba9;
  padding: 18px;
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 370px) {
  .fan-card-wrapper {
    margin-left: -28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fan-card-wrapper,
  .deal-enter-active {
    transition: none;
  }
}
</style>
