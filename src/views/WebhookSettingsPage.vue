<script setup lang="ts">
import type { GameHookEventType, HookDestination, HookRule, RobotConfig } from '@shared/types/generated/wire-models';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

interface EventCatalogField {
  key: string;
  label: string;
  type: string;
  description: string;
}

interface EventCatalogItem {
  type: GameHookEventType;
  name: string;
  category: string;
  description: string;
  fields: EventCatalogField[];
  mockPayload: Record<string, unknown>;
}

const WECOM_REGEX = /^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[a-zA-Z0-9_-]+$/;

// 默认经典纯文本模板
const DEFAULT_TEXT_TEMPLATES: Record<GameHookEventType, string> = {
  game_round_finished: `房间号：{{roomCode}}
{{#each scores}}成员{{name}}：{{sign delta}}（累计{{totalScore}}）
{{/each}}`.trim(),
  game_start: `【对局开始】房间号：{{roomCode}}，第 {{roundNumber}} 局已开球！
开球手：{{shooter.name}}
手牌数：每人 {{cardsPerPlayer}} 张
参赛阵容：{{#each players}}{{name}} {{/each}}`.trim(),
  system_crash: `⚠️【系统异常警报】
💥 异常类型：{{type}}
❌ 错误详情：{{error}}
📊 活跃房间数：{{activeRoomsCount}} 间
📍 堆栈摘要：
{{stack}}`.trim(),
};

// 当前激活 Tab
const activeTab = ref<'rules' | 'destinations' | 'catalog'>('rules');

// 全局加载与操作状态
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const cooldown = ref(0);
const msgBanner = ref<{ type: 'ok' | 'err'; text: string } | null>(null);

// 核心配置
const config = ref<RobotConfig>({
  version: 1,
  destinations: [
    {
      id: 'default_wecom',
      name: '企业微信 Webhook',
      type: 'wecom',
      url: '',
      mentionedList: ['shyren'],
    },
  ],
  rules: [
    {
      id: 'rule_round_finished',
      name: '本局结算战报',
      enabled: true,
      eventType: 'game_round_finished',
      actionType: 'send_wecom',
      destinationId: 'default_wecom',
      templateType: 'custom',
      msgType: 'text',
      customTemplate: DEFAULT_TEXT_TEMPLATES.game_round_finished,
    },
  ],
});

// 当前正在编辑的规则 ID
const selectedRuleId = ref<string>('rule_round_finished');

// 目录缓存
const catalogList = ref<EventCatalogItem[]>([]);

const customTextareaRef = ref<HTMLTextAreaElement | null>(null);

// 实时预览内容与报错
const previewText = ref('');
const previewError = ref('');
const previewMsgType = ref<'text' | 'markdown'>('text');

// 目标编辑弹窗状态
const destModalOpen = ref(false);
const editingDest = ref<{
  id: string;
  name: string;
  url: string;
  mentionedListStr: string;
  isNew: boolean;
}>({
  id: '',
  name: '',
  url: '',
  mentionedListStr: '',
  isNew: false,
});

// 当前选中的规则
const currentRule = computed<HookRule | null>(() => {
  return config.value.rules.find((r) => r.id === selectedRuleId.value) || config.value.rules[0] || null;
});

// 当前选中规则对应发送目标
const currentDest = computed<HookDestination | null>(() => {
  if (!currentRule.value) return config.value.destinations[0] || null;
  return (
    config.value.destinations.find((d) => d.id === currentRule.value?.destinationId) ||
    config.value.destinations[0] ||
    null
  );
});

// 校验当前目标 URL
const isUrlValid = computed(() => {
  const url = currentDest.value?.url?.trim() || '';
  if (!url) return true;
  return WECOM_REGEX.test(url);
});

// 动态变量快捷标签
const snippetChips = computed(() => {
  const eventType = currentRule.value?.eventType || 'game_round_finished';
  if (eventType === 'game_start') {
    return [
      { label: '房间号', snippet: '{{roomCode}}' },
      { label: '局数', snippet: '{{roundNumber}}' },
      { label: '开球手', snippet: '{{shooter.name}}' },
      { label: '发牌数', snippet: '{{cardsPerPlayer}}' },
      { label: '参赛人数', snippet: '{{playerCount}}' },
      { label: '选手循环', snippet: '{{#each players}}\n• {{name}}\n{{/each}}' },
    ];
  }
  if (eventType === 'system_crash') {
    return [
      { label: '错误信息', snippet: '{{error}}' },
      { label: '异常类型', snippet: '{{type}}' },
      { label: '活跃房间数', snippet: '{{activeRoomsCount}}' },
      { label: '堆栈摘要', snippet: '{{stack}}' },
    ];
  }

  return [
    { label: '房间号', snippet: '{{roomCode}}' },
    { label: '局数', snippet: '{{roundNumber}}' },
    { label: '胜者', snippet: '{{#each winners}}{{name}} {{/each}}' },
    { label: '得分明细', snippet: '{{#each scores}}成员{{name}}：{{sign delta}}（累计{{totalScore}}）\n{{/each}}' },
    {
      label: '积分排行',
      snippet: '{{#each standings}}\n> {{rankBadge rank}} {{name}}: {{sign delta}} (总分{{totalScore}})\n{{/each}}',
    },
    { label: '下局开球', snippet: '{{nextTurnFirstPlayer.name}}' },
    { label: '正负分', snippet: '{{sign delta}}' },
    { label: '名次奖牌', snippet: '{{rankBadge rank}}' },
  ];
});

function showToast(text: string, type: 'ok' | 'err' = 'ok') {
  msgBanner.value = { type, text };
  if (type === 'ok') {
    setTimeout(() => {
      if (msgBanner.value?.text === text) {
        msgBanner.value = null;
      }
    }, 4000);
  }
}

// 目标引用计数计算
function getDestinationRefCount(destId: string): number {
  return config.value.rules.filter((r) => r.destinationId === destId).length;
}

async function fetchConfig() {
  loading.value = true;
  try {
    const res = await fetch('/api/webhook-config');
    const data = await res.json();
    if (data.success) {
      config.value = data.config;
      // 保证每条规则的 customTemplate 都有内容
      for (const rule of config.value.rules) {
        if (!rule.customTemplate?.trim()) {
          rule.customTemplate = DEFAULT_TEXT_TEMPLATES[rule.eventType] || DEFAULT_TEXT_TEMPLATES.game_round_finished;
          rule.templateType = 'custom';
        }
      }
      if (config.value.rules.length > 0 && !config.value.rules.some((r) => r.id === selectedRuleId.value)) {
        selectedRuleId.value = config.value.rules[0].id;
      }
    }
  } catch (err) {
    showToast(`获取配置失败: ${err instanceof Error ? err.message : String(err)}`, 'err');
  } finally {
    loading.value = false;
    updatePreview();
  }
}

async function fetchCatalog() {
  try {
    const res = await fetch('/api/hook/catalog');
    const data = await res.json();
    if (data.success) {
      catalogList.value = data.catalog || [];
    }
  } catch (err) {
    console.warn('获取事件目录失败', err);
  }
}

// 防抖实时预览
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function updatePreview() {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(async () => {
    const rule = currentRule.value;
    if (!rule) return;

    const templateToPreview = rule.customTemplate?.trim()
      ? rule.customTemplate
      : DEFAULT_TEXT_TEMPLATES[rule.eventType] || '';
    previewMsgType.value = rule.msgType || 'text';

    if (!templateToPreview.trim()) {
      previewText.value = '(模板内容为空)';
      previewError.value = '';
      return;
    }

    try {
      const res = await fetch('/api/webhook/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: templateToPreview,
          eventType: rule.eventType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        previewText.value = data.rendered;
        previewError.value = '';
      } else {
        previewError.value = data.error || '渲染预览失败';
      }
    } catch (e) {
      previewError.value = `请求异常: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, 180);
}

watch(
  () => [
    currentRule.value?.id,
    currentRule.value?.eventType,
    currentRule.value?.customTemplate,
    currentRule.value?.msgType,
  ],
  () => {
    updatePreview();
  },
  { deep: true }
);

function handleEventTypeChange(newType: GameHookEventType) {
  if (!currentRule.value) return;
  const oldType = currentRule.value.eventType;
  currentRule.value.eventType = newType;

  // 如果模板未修改或等于旧类型的默认模板，则同步重置为新类型的默认纯文本模板
  if (
    !currentRule.value.customTemplate?.trim() ||
    currentRule.value.customTemplate === DEFAULT_TEXT_TEMPLATES[oldType]
  ) {
    currentRule.value.customTemplate = DEFAULT_TEXT_TEMPLATES[newType];
    currentRule.value.msgType = 'text';
  }
  updatePreview();
}

function handleResetDefaultTemplate() {
  if (!currentRule.value) return;
  currentRule.value.customTemplate = DEFAULT_TEXT_TEMPLATES[currentRule.value.eventType];
  currentRule.value.msgType = 'text';
  updatePreview();
  showToast('已重置为默认经典纯文本模板', 'ok');
}

function insertSnippet(snippet: string) {
  if (!currentRule.value) return;
  const textarea = customTextareaRef.value;
  if (!textarea) {
    currentRule.value.customTemplate = (currentRule.value.customTemplate || '') + snippet;
    return;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = currentRule.value.customTemplate || '';
  currentRule.value.customTemplate = text.substring(0, start) + snippet + text.substring(end);

  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + snippet.length, start + snippet.length);
    updatePreview();
  }, 0);
}

// 规则管理操作：新建、复制、删除
function handleAddRule() {
  const newId = `rule_${Date.now()}`;
  const defaultDestId = config.value.destinations[0]?.id || 'default_wecom';
  const newRule: HookRule = {
    id: newId,
    name: `新规则 ${config.value.rules.length + 1}`,
    enabled: true,
    eventType: 'game_round_finished',
    actionType: 'send_wecom',
    destinationId: defaultDestId,
    templateType: 'custom',
    msgType: 'text',
    customTemplate: DEFAULT_TEXT_TEMPLATES.game_round_finished,
  };
  config.value.rules.push(newRule);
  selectedRuleId.value = newId;
  showToast(`已创建「${newRule.name}」`, 'ok');
}

function handleDuplicateRule(rule: HookRule) {
  const newId = `rule_${Date.now()}`;
  const copy: HookRule = {
    ...JSON.parse(JSON.stringify(rule)),
    id: newId,
    name: `${rule.name || '推送规则'} (副本)`,
    templateType: 'custom',
  };
  config.value.rules.push(copy);
  selectedRuleId.value = newId;
  showToast(`已复制生成「${copy.name}」`, 'ok');
}

function handleDeleteRule(ruleId: string) {
  if (config.value.rules.length <= 1) {
    showToast('至少需要保留一条推送规则', 'err');
    return;
  }
  const idx = config.value.rules.findIndex((r) => r.id === ruleId);
  if (idx !== -1) {
    const deletedName = config.value.rules[idx].name;
    config.value.rules.splice(idx, 1);
    if (selectedRuleId.value === ruleId) {
      selectedRuleId.value = config.value.rules[0]?.id || '';
    }
    showToast(`已删除规则「${deletedName}」`, 'ok');
  }
}

// 目标管理操作：弹窗编辑、保存、删除
function openAddDestModal() {
  editingDest.value = {
    id: `dest_${Date.now()}`,
    name: `企业微信群 ${config.value.destinations.length + 1}`,
    url: '',
    mentionedListStr: '',
    isNew: true,
  };
  destModalOpen.value = true;
}

function openEditDestModal(dest: HookDestination) {
  editingDest.value = {
    id: dest.id,
    name: dest.name,
    url: dest.url,
    mentionedListStr: (dest.mentionedList || []).join(', '),
    isNew: false,
  };
  destModalOpen.value = true;
}

function handleSaveDestModal() {
  const url = editingDest.value.url.trim();
  if (url && !WECOM_REGEX.test(url)) {
    showToast('Webhook 地址格式错误，必须为企业微信官方接口 (qyapi.weixin.qq.com)', 'err');
    return;
  }

  const mentionedList = editingDest.value.mentionedListStr
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (editingDest.value.isNew) {
    const newDest: HookDestination = {
      id: editingDest.value.id,
      name: editingDest.value.name.trim() || '未命名 Webhook',
      type: 'wecom',
      url,
      mentionedList,
    };
    config.value.destinations.push(newDest);
    showToast(`已添加 Webhook 目标「${newDest.name}」`, 'ok');
  } else {
    const target = config.value.destinations.find((d) => d.id === editingDest.value.id);
    if (target) {
      target.name = editingDest.value.name.trim() || '未命名 Webhook';
      target.url = url;
      target.mentionedList = mentionedList;
      showToast(`已更新 Webhook 目标「${target.name}」`, 'ok');
    }
  }

  destModalOpen.value = false;
}

function handleDeleteDest(destId: string) {
  const refCount = getDestinationRefCount(destId);
  if (refCount > 0) {
    const refRuleNames = config.value.rules
      .filter((r) => r.destinationId === destId)
      .map((r) => `「${r.name || r.id}」`)
      .join('、');
    showToast(`该 Webhook 目标正在被规则 ${refRuleNames} 使用，请先解绑再删除`, 'err');
    return;
  }

  if (config.value.destinations.length <= 1) {
    showToast('至少需要保留一个 Webhook 目标', 'err');
    return;
  }

  config.value.destinations = config.value.destinations.filter((d) => d.id !== destId);
  showToast('已删除 Webhook 目标', 'ok');
}

async function handleSave() {
  if (!isUrlValid.value) {
    showToast('Webhook 地址格式错误，请填写正确的企业微信 Webhook 地址', 'err');
    return;
  }

  // 保证规则的 actionType 与 templateType 规范
  for (const rule of config.value.rules) {
    rule.actionType = 'send_wecom';
    rule.templateType = 'custom';
  }

  saving.value = true;
  try {
    const res = await fetch('/api/webhook-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: config.value }),
    });
    const data = await res.json();
    if (data.success) {
      config.value = data.config;
      showToast('设置已保存并生效', 'ok');
    } else {
      showToast(data.message || '保存设置失败', 'err');
    }
  } catch (err) {
    showToast(`保存失败: ${err instanceof Error ? err.message : String(err)}`, 'err');
  } finally {
    saving.value = false;
  }
}

async function handleTestSend() {
  if (!currentRule.value) {
    showToast('请先选择一条推送规则', 'err');
    return;
  }

  if (!currentDest.value?.url?.trim()) {
    showToast('请先填写 Webhook 地址', 'err');
    return;
  }
  if (!isUrlValid.value) {
    showToast('Webhook 地址格式错误，无法发送', 'err');
    return;
  }

  testing.value = true;
  try {
    const res = await fetch('/api/webhook/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config.value,
        destinationId: currentDest.value.id,
        ruleId: currentRule.value.id,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || '测试战报发送成功！', 'ok');
      cooldown.value = 10;
      const interval = setInterval(() => {
        cooldown.value -= 1;
        if (cooldown.value <= 0) clearInterval(interval);
      }, 1000);
    } else {
      showToast(data.message || '发送测试战报失败', 'err');
    }
  } catch (err) {
    showToast(`网络异常: ${err instanceof Error ? err.message : String(err)}`, 'err');
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  document.title = 'Webhook 配置 - PoolPoker';
  fetchConfig();
  fetchCatalog();
});
</script>

<template>
  <div class="min-h-screen bg-[#07130c] text-white flex flex-col px-4 sm:px-6 lg:px-8 py-6 select-none font-sans max-w-7xl mx-auto w-full">
    <!-- 顶部导航栏 -->
    <header class="flex items-center justify-between pb-4 border-b border-white/10 gap-3">
      <div class="flex items-center gap-3">
        <RouterLink
          to="/"
          class="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0"
          title="返回游戏大厅"
        >
          <i class="fa-solid fa-arrow-left"></i>
        </RouterLink>
        <div>
          <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>🎱</span>
            <span>Webhook 配置</span>
          </h1>
        </div>
      </div>

      <!-- 保存操作 -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="handleSave"
          :disabled="saving || !isUrlValid"
          class="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-emerald-950 font-bold text-xs sm:text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i>
          <i v-else class="fa-solid fa-floppy-disk"></i>
          <span>{{ saving ? '保存中...' : '保存设置' }}</span>
        </button>
      </div>
    </header>

    <!-- 顶层 Tab 导航 -->
    <nav class="flex items-center gap-2 pt-4 pb-2 border-b border-white/10 overflow-x-auto text-sm">
      <button
        type="button"
        @click="activeTab = 'rules'"
        :class="[
          'px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 border whitespace-nowrap',
          activeTab === 'rules'
            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow'
            : 'bg-black/20 border-transparent text-white/60 hover:text-white hover:border-white/10'
        ]"
      >
        <i class="fa-solid fa-list-check"></i>
        <span>推送规则</span>
        <span class="px-1.5 py-0.2 rounded-md bg-white/10 text-[11px] font-mono text-white/80">
          {{ config.rules.length }}
        </span>
      </button>

      <button
        type="button"
        @click="activeTab = 'destinations'"
        :class="[
          'px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 border whitespace-nowrap',
          activeTab === 'destinations'
            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow'
            : 'bg-black/20 border-transparent text-white/60 hover:text-white hover:border-white/10'
        ]"
      >
        <i class="fa-solid fa-tower-broadcast"></i>
        <span>发送目标管理</span>
        <span class="px-1.5 py-0.2 rounded-md bg-white/10 text-[11px] font-mono text-white/80">
          {{ config.destinations.length }}
        </span>
      </button>

      <button
        type="button"
        @click="activeTab = 'catalog'"
        :class="[
          'px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 border whitespace-nowrap',
          activeTab === 'catalog'
            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow'
            : 'bg-black/20 border-transparent text-white/60 hover:text-white hover:border-white/10'
        ]"
      >
        <i class="fa-solid fa-book-bookmark"></i>
        <span>事件目录</span>
      </button>
    </nav>

    <!-- 全局提示条 -->
    <div
      v-if="msgBanner"
      :class="[
        'mt-4 p-3.5 rounded-xl text-sm font-medium flex items-center justify-between transition-all duration-200 shadow-md',
        msgBanner.type === 'ok'
          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
          : 'bg-rose-500/20 border border-rose-500/40 text-rose-200'
      ]"
    >
      <div class="flex items-center gap-2.5">
        <i :class="msgBanner.type === 'ok' ? 'fa-solid fa-circle-check text-emerald-400' : 'fa-solid fa-circle-exclamation text-rose-400'"></i>
        <span>{{ msgBanner.text }}</span>
      </div>
      <button
        type="button"
        @click="msgBanner = null"
        class="opacity-60 hover:opacity-100 text-xs ml-4"
      >
        ✕
      </button>
    </div>

    <!-- TAB 1: 推送规则与配置编辑 -->
    <main v-if="activeTab === 'rules'" class="flex flex-col gap-6 my-6 flex-1">
      <!-- 规则卡片选择栏 -->
      <section class="bg-emerald-950/60 border border-emerald-500/25 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl flex flex-col gap-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-white flex items-center gap-2">
              <i class="fa-solid fa-bolt text-emerald-400"></i>
              <span>规则列表 ({{ config.rules.length }})</span>
            </span>
            <span class="text-xs text-white/40">点击卡片切换编辑</span>
          </div>

          <button
            type="button"
            @click="handleAddRule"
            class="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <i class="fa-solid fa-plus"></i>
            <span>新建 Hook</span>
          </button>
        </div>

        <!-- 规则卡片列表 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="rule in config.rules"
            :key="rule.id"
            @click="selectedRuleId = rule.id"
            :class="[
              'p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 relative',
              selectedRuleId === rule.id
                ? 'bg-emerald-500/15 border-emerald-400/80 shadow-md shadow-emerald-900/40'
                : 'bg-black/30 border-white/10 hover:border-emerald-500/30 hover:bg-black/40'
            ]"
          >
            <!-- 头部：名称与状态 -->
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-col min-w-0">
                <span class="font-bold text-sm text-white truncate">{{ rule.name || '未命名规则' }}</span>
                <div class="flex items-center gap-1.5 mt-1">
                  <!-- 触发时机 Badge -->
                  <span
                    :class="[
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      rule.eventType === 'game_start'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : rule.eventType === 'system_crash'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    ]"
                  >
                    {{ rule.eventType === 'game_start' ? '🎯 对局开始' : rule.eventType === 'system_crash' ? '⚠️ 系统异常' : '🏁 本局结算' }}
                  </span>
                  <!-- 格式 Badge -->
                  <span class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-white/10 text-white/60">
                    {{ rule.msgType === 'markdown' ? 'Markdown' : '纯文本' }}
                  </span>
                </div>
              </div>

              <!-- 启停开关 -->
              <div class="flex items-center gap-2" @click.stop>
                <input
                  type="checkbox"
                  v-model="rule.enabled"
                  class="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  :title="rule.enabled ? '已启用，点击停用' : '已停用，点击启用'"
                />
              </div>
            </div>

            <!-- 底部：目标与操作按钮 -->
            <div class="flex items-center justify-between text-xs pt-2 border-t border-white/10">
              <span class="text-white/50 text-[11px] truncate max-w-[130px]">
                🤖 {{ config.destinations.find(d => d.id === rule.destinationId)?.name || '未选目标' }}
              </span>

              <div class="flex items-center gap-1" @click.stop>
                <button
                  type="button"
                  @click="handleDuplicateRule(rule)"
                  class="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white"
                  title="复制规则"
                >
                  <i class="fa-solid fa-copy text-xs"></i>
                </button>
                <button
                  type="button"
                  @click="handleDeleteRule(rule.id)"
                  class="p-1.5 hover:bg-rose-500/20 rounded text-white/50 hover:text-rose-400"
                  title="删除规则"
                >
                  <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 双栏编辑区：左栏规则与模板，右栏实时预览 -->
      <div v-if="currentRule" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- 左栏：规则设置与模板内容 (7列) -->
        <div class="lg:col-span-7 flex flex-col gap-6">
          <!-- 卡片 1: 基础属性与推送目标 -->
          <section class="bg-emerald-950/60 border border-emerald-500/25 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col gap-4">
            <div class="flex items-center justify-between pb-2 border-b border-white/10">
              <h2 class="text-sm font-bold text-emerald-300 flex items-center gap-2">
                <i class="fa-solid fa-sliders text-emerald-400"></i>
                <span>编辑规则：{{ currentRule.name }}</span>
              </h2>
              <div class="flex items-center gap-2">
                <span class="text-xs text-white/50">启用：</span>
                <input
                  type="checkbox"
                  v-model="currentRule.enabled"
                  class="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>
            </div>

            <!-- 规则名称与触发时机 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="text-xs font-semibold text-emerald-300/80 mb-1.5 block">规则名称</label>
                <input
                  v-model="currentRule.name"
                  type="text"
                  placeholder="如：每局结算战报"
                  class="w-full bg-black/40 border border-white/15 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-white/25 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label class="text-xs font-semibold text-emerald-300/80 mb-1.5 block">触发时机</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    @click="handleEventTypeChange('game_round_finished')"
                    :class="[
                      'py-2 px-2.5 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5',
                      currentRule.eventType === 'game_round_finished'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow'
                        : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                    ]"
                  >
                    <span>🏁</span>
                    <span>本局结算</span>
                  </button>
                  <button
                    type="button"
                    @click="handleEventTypeChange('game_start')"
                    :class="[
                      'py-2 px-2.5 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5',
                      currentRule.eventType === 'game_start'
                        ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow'
                        : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                    ]"
                  >
                    <span>🎯</span>
                    <span>对局开始</span>
                  </button>
                  <button
                    type="button"
                    @click="handleEventTypeChange('system_crash')"
                    :class="[
                      'py-2 px-2.5 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-1.5',
                      currentRule.eventType === 'system_crash'
                        ? 'bg-rose-500/20 border-rose-400 text-rose-300 shadow'
                        : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                    ]"
                  >
                    <span>⚠️</span>
                    <span>系统异常</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 推送目标选择 -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs font-semibold text-emerald-300/80 block">推送目标 Webhook</label>
                <button
                  type="button"
                  @click="activeTab = 'destinations'"
                  class="text-[11px] text-emerald-400 hover:underline"
                >
                  管理 Webhook 目标
                </button>
              </div>

              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  v-for="dest in config.destinations"
                  :key="dest.id"
                  type="button"
                  @click="currentRule.destinationId = dest.id"
                  :class="[
                    'py-1.5 px-3 rounded-lg text-xs font-medium border transition-all',
                    currentRule.destinationId === dest.id
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                  ]"
                >
                  {{ dest.name }}
                </button>
              </div>
            </div>

            <!-- 目标 Webhook 链接直接快速编辑 -->
            <div v-if="currentDest">
              <label class="text-xs font-semibold text-emerald-300/80 mb-1 block">
                Webhook 地址 ({{ currentDest.name }})
              </label>
              <textarea
                v-model="currentDest.url"
                placeholder="粘贴企业微信 Webhook 地址，例如 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                rows="2"
                class="w-full bg-black/40 border rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-white/25 focus:outline-none transition-colors resize-none font-mono"
                :class="isUrlValid ? 'border-white/15 focus:border-emerald-400' : 'border-rose-500/60 focus:border-rose-400'"
              ></textarea>
              <p v-if="!isUrlValid" class="text-xs text-rose-400 mt-1 flex items-center gap-1.5">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>地址格式错误，必须为企业微信官方合法接口 (qyapi.weixin.qq.com)</span>
              </p>
            </div>
          </section>

          <!-- 卡片 2: 模板编辑区（直接展示模板内容） -->
          <section class="bg-emerald-950/60 border border-emerald-500/25 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col gap-4">
            <div class="flex items-center justify-between pb-2 border-b border-white/10 flex-wrap gap-2">
              <div>
                <h2 class="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <i class="fa-solid fa-file-pen text-emerald-400"></i>
                  <span>战报模板内容</span>
                </h2>
                <p class="text-xs text-white/50 mt-0.5">
                  默认经典纯文本格式，可直接修改文本或插入变量
                </p>
              </div>

              <div class="flex items-center gap-2.5">
                <!-- 格式选择 -->
                <div class="flex items-center gap-1 text-xs">
                  <span class="text-white/40 text-[11px]">格式：</span>
                  <select
                    v-model="currentRule.msgType"
                    class="bg-black/40 border border-white/15 rounded-lg text-xs px-2 py-1 text-emerald-300 focus:outline-none"
                  >
                    <option value="text">纯文本 (Text)</option>
                    <option value="markdown">Markdown 卡片</option>
                  </select>
                </div>

                <!-- 恢复默认 -->
                <button
                  type="button"
                  @click="handleResetDefaultTemplate"
                  class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors"
                  title="恢复为系统默认经典纯文本"
                >
                  恢复默认模板
                </button>
              </div>
            </div>

            <!-- 可用变量快速插入 Chips -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs text-emerald-300/70 font-semibold">点击插入变量：</span>
              <div class="flex flex-wrap gap-1.5 p-2 bg-black/20 rounded-xl border border-white/5">
                <button
                  v-for="(chip, idx) in snippetChips"
                  :key="idx"
                  type="button"
                  @click="insertSnippet(chip.snippet)"
                  class="px-2 py-1 rounded-md bg-emerald-950/80 hover:bg-emerald-800 border border-emerald-500/30 text-[11px] text-emerald-200 transition-colors"
                  :title="`插入 ${chip.snippet}`"
                >
                  + {{ chip.label }}
                </button>
              </div>
            </div>

            <!-- 模板编辑输入框 -->
            <div class="relative">
              <textarea
                ref="customTextareaRef"
                v-model="currentRule.customTemplate"
                rows="8"
                class="w-full bg-black/50 border border-white/15 focus:border-emerald-400 rounded-xl p-3.5 text-xs sm:text-sm text-emerald-100 font-mono focus:outline-none transition-colors"
                placeholder="编写你的战报组装模板..."
              ></textarea>
            </div>

            <!-- 语法报错提示 -->
            <div v-if="previewError" class="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <i class="fa-solid fa-circle-exclamation"></i>
              <span>{{ previewError }}</span>
            </div>
          </section>

          <!-- 底部保存按钮 -->
          <div class="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              @click="handleSave"
              :disabled="saving || !isUrlValid"
              class="flex-1 py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-emerald-950 font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i>
              <i v-else class="fa-solid fa-check"></i>
              <span>{{ saving ? '保存中...' : '保存设置' }}</span>
            </button>
          </div>
        </div>

        <!-- 右栏：实时预览与测试发送 (5列) -->
        <div class="lg:col-span-5 flex flex-col gap-6 sticky top-6">
          <section class="bg-emerald-950/60 border border-emerald-500/25 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col gap-4">
            <div class="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <h2 class="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <i class="fa-solid fa-eye text-emerald-400"></i>
                  <span>战报预览</span>
                </h2>
                <p class="text-xs text-white/50 mt-0.5">
                  使用示例数据实时渲染
                </p>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {{ previewMsgType === 'markdown' ? 'Markdown' : '纯文本' }}
              </span>
            </div>

            <!-- 企微聊天气泡模拟器 -->
            <div class="bg-[#1e2329] border border-white/10 rounded-2xl p-4 shadow-inner flex flex-col gap-3 min-h-[220px]">
              <div class="flex items-center justify-between text-xs pb-2 border-b border-white/10 text-white/60">
                <span class="flex items-center gap-1.5 font-medium">
                  <span>💬</span>
                  <span>{{ currentDest?.name || '企业微信群' }}</span>
                </span>
                <span class="text-[11px] text-white/40 font-mono">刚刚</span>
              </div>

              <!-- 消息气泡 -->
              <div class="flex items-start gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow">
                  🎱
                </div>

                <div class="flex flex-col gap-1 max-w-[85%]">
                  <span class="text-[11px] text-white/40">PoolPoker 战报助手</span>
                  <div class="bg-[#2c323b] text-white text-xs sm:text-sm rounded-xl p-3 shadow-md whitespace-pre-wrap break-all leading-relaxed font-sans">
                    <!-- 提及成员标记 -->
                    <div
                      v-if="previewMsgType === 'text' && currentDest?.mentionedList?.length"
                      class="text-blue-400 mb-1 font-medium text-xs"
                    >
                      @{{ currentDest.mentionedList.join(' @') }}
                    </div>

                    <!-- 渲染正文 -->
                    <div>{{ previewText }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 测试发送按钮 -->
            <div class="flex flex-col gap-2 pt-2">
              <button
                type="button"
                @click="handleTestSend"
                :disabled="testing || cooldown > 0 || !currentDest?.url?.trim() || !isUrlValid"
                class="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed border border-white/15 text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2"
              >
                <i v-if="testing" class="fa-solid fa-spinner fa-spin text-emerald-400"></i>
                <i v-else class="fa-solid fa-paper-plane text-emerald-400"></i>
                <span>{{ cooldown > 0 ? `测试中 (${cooldown}s)` : '发送测试战报' }}</span>
              </button>
              <p class="text-[11px] text-white/40 text-center">
                向所选群发送一条测试消息，不修改正式保存的配置
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>

    <!-- TAB 2: 发送目标管理 -->
    <main v-else-if="activeTab === 'destinations'" class="flex flex-col gap-6 my-6 flex-1">
      <section class="bg-emerald-950/60 border border-emerald-500/25 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col gap-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <i class="fa-solid fa-tower-broadcast text-emerald-400"></i>
              <span>企业微信 Webhook 发送目标</span>
            </h2>
            <p class="text-xs text-white/50 mt-1">
              配置 Webhook 推送目标，各条推送规则可选用不同 Webhook 目标
            </p>
          </div>

          <button
            type="button"
            @click="openAddDestModal"
            class="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-emerald-950 font-bold text-xs flex items-center gap-1.5 shadow"
          >
            <i class="fa-solid fa-plus"></i>
            <span>新建目标</span>
          </button>
        </div>

        <!-- 目标卡片列表 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="dest in config.destinations"
            :key="dest.id"
            class="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="font-bold text-white text-sm flex items-center gap-2">
                  <span>{{ dest.name }}</span>
                  <span
                    :class="[
                      'text-[10px] px-1.5 py-0.5 rounded',
                      dest.url?.trim() ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    ]"
                  >
                    {{ dest.url?.trim() ? '地址已配置' : '未配置地址' }}
                  </span>
                </span>

                <!-- 引用数 Badge -->
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  被 {{ getDestinationRefCount(dest.id) }} 条规则引用
                </span>
              </div>

              <!-- 地址展示 -->
              <p class="text-xs font-mono text-white/60 bg-black/40 p-2 rounded-lg break-all select-all">
                {{ dest.url?.trim() || '（尚未填写 Webhook 地址）' }}
              </p>

              <!-- 提及成员 -->
              <div v-if="dest.mentionedList?.length" class="text-xs text-emerald-300/80 mt-2 flex items-center gap-1">
                <i class="fa-solid fa-at text-[10px]"></i>
                <span>默认提及：{{ dest.mentionedList.join(', ') }}</span>
              </div>
            </div>

            <!-- 目标操作 -->
            <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                @click="openEditDestModal(dest)"
                class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium"
              >
                编辑
              </button>
              <button
                type="button"
                @click="handleDeleteDest(dest.id)"
                :disabled="getDestinationRefCount(dest.id) > 0"
                class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                :title="getDestinationRefCount(dest.id) > 0 ? '已有规则正在使用，无法删除' : '删除该 Webhook'"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- TAB 3: 事件目录与可用变量 -->
    <main v-else-if="activeTab === 'catalog'" class="flex flex-col gap-6 my-6 flex-1">
      <section class="bg-emerald-950/60 border border-emerald-500/25 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col gap-6">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <i class="fa-solid fa-book-bookmark text-emerald-400"></i>
            <span>支持的游戏事件目录</span>
          </h2>
          <p class="text-xs text-white/50 mt-1">
            查看对局支持触发的事件类型，以及可在模板中使用的动态数据字段
          </p>
        </div>

        <div class="flex flex-col gap-6">
          <div
            v-for="item in catalogList"
            :key="item.type"
            class="bg-black/30 border border-white/10 rounded-xl p-5 flex flex-col gap-4"
          >
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <span>{{ item.name }}</span>
                </h3>
                <p class="text-xs text-white/60 mt-0.5">{{ item.description }}</p>
              </div>
            </div>

            <!-- 字段列表 -->
            <div>
              <span class="text-xs font-semibold text-white/70 block mb-2">可用变量说明：</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div
                  v-for="field in item.fields"
                  :key="field.key"
                  class="bg-black/40 p-2.5 rounded-lg border border-white/5 flex flex-col gap-1"
                >
                  <span class="font-mono text-emerald-300 text-[11px] font-bold" v-text="'{{ ' + field.key + ' }}'"></span>
                  <span class="text-white/80 font-medium">{{ field.label }}</span>
                  <span class="text-white/40 text-[10px] leading-tight">{{ field.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 弹窗：编辑/新建发送目标 -->
    <div
      v-if="destModalOpen"
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="destModalOpen = false"
    >
      <div class="bg-[#0b1d14] border border-emerald-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between pb-2 border-b border-white/10">
          <h3 class="font-bold text-base text-white">
            {{ editingDest.isNew ? '新建发送目标' : '编辑发送目标' }}
          </h3>
          <button type="button" @click="destModalOpen = false" class="text-white/40 hover:text-white">✕</button>
        </div>

        <div class="flex flex-col gap-3">
          <div>
            <label class="text-xs font-semibold text-emerald-300/80 mb-1 block">Webhook 名称</label>
            <input
              v-model="editingDest.name"
              type="text"
              placeholder="例如：技术交流群 Webhook"
              class="w-full bg-black/40 border border-white/15 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none"
            />
          </div>

          <div>
            <label class="text-xs font-semibold text-emerald-300/80 mb-1 block">企业微信 Webhook 地址</label>
            <textarea
              v-model="editingDest.url"
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              rows="3"
              class="w-full bg-black/40 border border-white/15 focus:border-emerald-400 rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none resize-none"
            ></textarea>
          </div>

          <div>
            <label class="text-xs font-semibold text-emerald-300/80 mb-1 block">默认提醒成员 (用逗号隔开，全部填 @all)</label>
            <input
              v-model="editingDest.mentionedListStr"
              type="text"
              placeholder="例如：shyren, @all"
              class="w-full bg-black/40 border border-white/15 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            @click="destModalOpen = false"
            class="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold"
          >
            取消
          </button>
          <button
            type="button"
            @click="handleSaveDestModal"
            class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-bold shadow"
          >
            保存目标
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
