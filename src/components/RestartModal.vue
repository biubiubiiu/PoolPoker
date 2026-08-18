<script setup lang="ts">
defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm'): void;
}>();
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="glass-panel rounded-3xl p-6 text-center max-w-xs w-full border border-amber-500/40 shadow-2xl space-y-4">
      <div class="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto text-2xl">
        <i class="fa-solid fa-rotate-right"></i>
      </div>
      <div>
        <h3 class="text-base font-black text-white">确认重开本局？</h3>
        <p class="text-xs text-gray-300 mt-2 leading-relaxed">
          重新开始将重置当前对局所有摸牌与打牌进度，此操作无法撤销。
        </p>
      </div>
      <div class="flex space-x-3 pt-2">
        <button @click="emit('cancel')" 
                class="flex-1 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded-xl border border-white/10 transition active:scale-95 cursor-pointer">
          取消
        </button>
        <button @click="emit('confirm')" 
                class="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-xs font-black text-white rounded-xl shadow-lg transition active:scale-95 cursor-pointer">
          确认重开
        </button>
      </div>
    </div>
  </div>
</template>
