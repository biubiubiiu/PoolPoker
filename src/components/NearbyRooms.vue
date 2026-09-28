<script setup lang="ts">
import type { NearbyRoom } from '@shared/types/discovery';
import { computed, ref } from 'vue';
import PermissionGuideModal from '@/components/PermissionGuideModal.vue';

const props = defineProps<{
  rooms: NearbyRoom[];
  status: string;
  enabled: boolean;
  joining: boolean;
  advertising?: boolean;
  retrying?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:enabled', value: boolean): void;
  (e: 'retry'): void;
  (e: 'join', room: NearbyRoom): void;
}>();

const showGuideModal = ref(false);
const localRetrying = ref(false);
let localRetryTimer: ReturnType<typeof setTimeout> | undefined;

const isPermissionDenied = computed(
  () =>
    props.status.includes('未获定位权限') ||
    props.status.includes('不支持定位') ||
    props.status.includes('定位需要 HTTPS')
);

const isRetryingActive = computed(() => props.retrying || localRetrying.value);

function handleRetry() {
  localRetrying.value = true;
  emit('retry');
  clearTimeout(localRetryTimer);
  localRetryTimer = setTimeout(() => {
    localRetrying.value = false;
  }, 1200);
}
</script>

<template>
  <section class="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 space-y-3" aria-label="附近房间">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-bold text-emerald-200">{{ advertising ? '允许附近玩家发现' : '面对面 · 附近房间' }}</h3>
      <label class="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input type="checkbox" :checked="enabled" @change="emit('update:enabled', ($event.target as HTMLInputElement).checked)" aria-label="附近发现" class="accent-emerald-400">
        {{ enabled ? '已开启' : '已关闭' }}
      </label>
    </div>

    <!-- 状态展示 -->
    <p class="text-xs text-gray-300" role="status">{{ status }}</p>

    <!-- 权限未获得时的详细提示与指引入口 -->
    <div v-if="isPermissionDenied && enabled && !advertising" class="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-200/90 space-y-2.5">
      <div class="flex items-start gap-2">
        <i class="fa-solid fa-triangle-exclamation text-amber-400 mt-0.5 shrink-0 text-sm" aria-hidden="true"></i>
        <div class="space-y-1">
          <p class="font-bold text-amber-300 leading-snug">为什么没有弹出授权窗口？</p>
          <p class="text-[11px] text-gray-300 leading-relaxed">
            浏览器安全限制：已拒绝过定位的网页<strong>无法再次自动唤起系统授权弹窗</strong>。请按指引在浏览器设置中允许位置访问，开启后将自动生效。
          </p>
        </div>
      </div>
      <div class="pt-0.5 flex items-center gap-2">
        <button
          type="button"
          @click="showGuideModal = true"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-black font-extrabold text-xs hover:bg-amber-300 transition shadow cursor-pointer active:scale-95"
        >
          <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
          查看如何开启权限
        </button>
      </div>
    </div>

    <!-- 附近房间列表 -->
    <template v-if="enabled && !advertising">
      <div v-for="room in rooms" :key="`${room.source}:${room.roomCode}`" class="flex items-center justify-between gap-3 rounded-lg bg-black/30 p-3" data-testid="nearby-room">
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-white">{{ room.hostName }} 的球局</p>
          <p class="text-xs text-gray-400 mt-1">房间 {{ room.roomCode }} · {{ room.playerCount }}/{{ room.maxPlayers }} 人</p>
        </div>
        <button type="button" :disabled="joining" @click="emit('join', room)" :aria-label="`加入 ${room.hostName} 的球局`" class="shrink-0 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-black disabled:opacity-50 cursor-pointer">
          {{ joining ? '加入中…' : '加入' }}
        </button>
      </div>
    </template>

    <!-- 底部操作栏 -->
    <div v-if="enabled && !advertising" class="flex items-center justify-between pt-1">
      <button
        type="button"
        :disabled="isRetryingActive"
        @click="handleRetry"
        class="inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200 underline underline-offset-4 disabled:opacity-50 cursor-pointer transition"
      >
        <i class="fa-solid" :class="isRetryingActive ? 'fa-spinner fa-spin' : 'fa-rotate-right'" aria-hidden="true"></i>
        <span>{{ isRetryingActive ? '正在重新定位…' : '重新定位' }}</span>
      </button>

      <button
        v-if="isPermissionDenied"
        type="button"
        @click="showGuideModal = true"
        class="text-xs text-amber-300/80 hover:text-amber-300 underline underline-offset-4 cursor-pointer flex items-center gap-1 transition"
      >
        <i class="fa-solid fa-gear text-[11px]" aria-hidden="true"></i>
        权限指引
      </button>
    </div>

    <!-- 开启权限指引弹窗 -->
    <PermissionGuideModal
      :open="showGuideModal"
      @close="showGuideModal = false"
      @retry="handleRetry"
    />
  </section>
</template>
