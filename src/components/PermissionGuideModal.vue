<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'retry'): void;
}>();

function detectDefaultTab(): 'ios' | 'android' | 'desktop' | 'mac_safari' | 'wechat' {
  if (typeof navigator === 'undefined') return 'ios';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('micromessenger')) return 'wechat';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('macintosh') && ua.includes('safari') && !ua.includes('chrome')) return 'mac_safari';
  return 'desktop';
}

const activeTab = ref<'ios' | 'android' | 'desktop' | 'mac_safari' | 'wechat'>(detectDefaultTab());

function onRetry() {
  emit('retry');
  emit('close');
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    @click.self="emit('close')"
    role="dialog"
    aria-modal="true"
    aria-labelledby="permission-guide-title"
  >
    <div class="relative w-full max-w-md rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-gray-900 to-emerald-950 p-5 text-gray-200 shadow-2xl space-y-4">
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 id="permission-guide-title" class="flex items-center gap-2 text-base font-bold text-emerald-300">
          <i class="fa-solid fa-location-dot text-amber-400"></i>
          如何开启定位权限
        </h3>
        <button
          type="button"
          @click="emit('close')"
          aria-label="关闭指引"
          class="rounded-lg p-1 text-gray-400 hover:text-white transition cursor-pointer"
        >
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>

      <!-- 为什么无法自动弹窗说明 -->
      <div class="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200/90 leading-relaxed">
        <p class="font-semibold flex items-center gap-1.5 text-amber-300 mb-1">
          <i class="fa-solid fa-circle-info"></i>
          为什么点击「重新定位」没有弹出系统窗口？
        </p>
        <p>根据现代浏览器安全规范，一旦之前拒绝过定位，网页便<strong>无法再次自动唤起系统授权弹窗</strong>。必须在浏览器或系统设置中手动开启，开启后返回页面即可自动生效。</p>
      </div>

      <!-- 平台切换 Tab -->
      <div class="flex gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
        <button
          type="button"
          @click="activeTab = 'ios'"
          :class="[
            'px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer',
            activeTab === 'ios' ? 'bg-emerald-500 text-black font-bold shadow' : 'bg-black/40 text-gray-300 hover:bg-black/60'
          ]"
        >
          iPhone / iPad
        </button>
        <button
          type="button"
          @click="activeTab = 'android'"
          :class="[
            'px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer',
            activeTab === 'android' ? 'bg-emerald-500 text-black font-bold shadow' : 'bg-black/40 text-gray-300 hover:bg-black/60'
          ]"
        >
          Android
        </button>
        <button
          type="button"
          @click="activeTab = 'desktop'"
          :class="[
            'px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer',
            activeTab === 'desktop' ? 'bg-emerald-500 text-black font-bold shadow' : 'bg-black/40 text-gray-300 hover:bg-black/60'
          ]"
        >
          电脑 Chrome/Edge
        </button>
        <button
          type="button"
          @click="activeTab = 'mac_safari'"
          :class="[
            'px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer',
            activeTab === 'mac_safari' ? 'bg-emerald-500 text-black font-bold shadow' : 'bg-black/40 text-gray-300 hover:bg-black/60'
          ]"
        >
          Mac Safari
        </button>
        <button
          type="button"
          @click="activeTab = 'wechat'"
          :class="[
            'px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer',
            activeTab === 'wechat' ? 'bg-emerald-500 text-black font-bold shadow' : 'bg-black/40 text-gray-300 hover:bg-black/60'
          ]"
        >
          微信内
        </button>
      </div>

      <!-- 内容区 -->
      <div class="space-y-3 text-xs leading-relaxed max-h-[46vh] overflow-y-auto pr-1">
        <!-- iOS Tab -->
        <template v-if="activeTab === 'ios'">
          <div class="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
            <h4 class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-brands fa-apple text-sm"></i>
              Safari 浏览器设置步骤：
            </h4>
            <ol class="space-y-2 list-decimal list-inside text-gray-300">
              <li>点击地址栏左侧（或底部）的 <span class="text-amber-300 font-bold">「大小」</span> 或 <span class="text-amber-300 font-bold">「aA」</span> 按钮。</li>
              <li>在菜单中点击 <span class="text-emerald-400 font-bold">「网站设置」</span>（Website Settings）。</li>
              <li>找到 <span class="text-white font-bold">「位置」</span>，将其修改为 <span class="text-emerald-400 font-bold">「允许」</span>。</li>
              <li>返回本页面，将自动重新获取定位。</li>
            </ol>
            <div class="mt-2 pt-2 border-t border-white/10 text-[11px] text-gray-400 space-y-1">
              <p class="font-semibold text-gray-300">💡 若网站设置中无定位选项：</p>
              <p>请进入手机系统<strong>「设置」>「隐私与安全性」>「定位服务」>「Safari 网站」</strong>，勾选<strong>「使用 App 期间」</strong>并开启<strong>「精确位置」</strong>。</p>
            </div>
          </div>
        </template>

        <!-- Android Tab -->
        <template v-if="activeTab === 'android'">
          <div class="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
            <h4 class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-brands fa-android text-sm"></i>
              Android 浏览器设置步骤：
            </h4>
            <ol class="space-y-2 list-decimal list-inside text-gray-300">
              <li>点击地址栏左侧的 <span class="text-amber-300 font-bold">锁形图标 🔒</span> 或 <span class="text-amber-300 font-bold">页面设置图标</span>。</li>
              <li>点击 <span class="text-emerald-400 font-bold">「权限」</span>。</li>
              <li>找到并开启 <span class="text-emerald-400 font-bold">「位置信息」</span> 开关。</li>
              <li>返回本页面点击「重新定位」。</li>
            </ol>
            <div class="mt-2 pt-2 border-t border-white/10 text-[11px] text-gray-400 space-y-1">
              <p class="font-semibold text-gray-300">💡 若浏览器未获系统定位权限：</p>
              <p>请前往手机系统<strong>「设置」>「应用管理」> 选择当前浏览器 >「权限」</strong>，确保允许使用<strong>「位置信息」</strong>。</p>
            </div>
          </div>
        </template>

        <!-- 电脑端 Chrome/Edge Tab -->
        <template v-if="activeTab === 'desktop'">
          <div class="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
            <h4 class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-brands fa-chrome text-sm"></i>
              电脑端 Chrome / Edge / 360 等设置：
            </h4>
            <ol class="space-y-2 list-decimal list-inside text-gray-300">
              <li>点击浏览器顶部地址栏最左侧的 <span class="text-amber-300 font-bold">图标（锁形 🔒 / 设置 ⚙️）</span>。</li>
              <li>在下拉面板中找到 <span class="text-white font-bold">「位置信息」</span>。</li>
              <li>将选项改为 <span class="text-emerald-400 font-bold">「允许」</span>，或点击 <span class="text-amber-300 font-bold">「重置权限」</span>。</li>
              <li>刷新页面或点击下方「已开启，立即重试」。</li>
            </ol>
          </div>
        </template>

        <!-- Mac Safari Tab -->
        <template v-if="activeTab === 'mac_safari'">
          <div class="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
            <h4 class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-brands fa-safari text-sm"></i>
              Mac Safari 设置步骤：
            </h4>
            <ol class="space-y-2 list-decimal list-inside text-gray-300">
              <li>点击屏幕左上角菜单栏的 <span class="text-amber-300 font-bold">「Safari 浏览器」</span>。</li>
              <li>选择 <span class="text-emerald-400 font-bold">「此网站的设置…」</span>。</li>
              <li>在弹出的设置卡片中，找到 <span class="text-white font-bold">「位置」</span> 并设为 <span class="text-emerald-400 font-bold">「允许」</span>。</li>
              <li>切回页面即可自动获取位置。</li>
            </ol>
          </div>
        </template>

        <!-- 微信内置浏览器 Tab -->
        <template v-if="activeTab === 'wechat'">
          <div class="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
            <h4 class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-brands fa-weixin text-sm"></i>
              微信内置浏览器：
            </h4>
            <ol class="space-y-2 list-decimal list-inside text-gray-300">
              <li>点击右上角的 <span class="text-amber-300 font-bold">「···」</span> 菜单。</li>
              <li>选择 <span class="text-emerald-400 font-bold">「在默认浏览器中打开」</span>（如系统自带 Safari 或 Chrome）。</li>
              <li>在系统浏览器中即可直接弹出权限允许对话框。</li>
            </ol>
          </div>
        </template>
      </div>

      <!-- 底部操作按钮 -->
      <div class="flex items-center justify-end gap-3 border-t border-white/10 pt-3">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 bg-white/5 hover:bg-white/10 transition cursor-pointer"
        >
          关闭
        </button>
        <button
          type="button"
          @click="onRetry"
          class="px-4 py-2 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition shadow cursor-pointer flex items-center gap-1.5"
        >
          <i class="fa-solid fa-rotate-right"></i>
          已开启，立即重试
        </button>
      </div>
    </div>
  </div>
</template>
