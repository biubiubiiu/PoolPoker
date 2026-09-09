<script setup lang="ts">
import { createRecoveryPhrase, recoveryPublicKey, signRecovery } from '@shared/recovery';
import type { AuthPairing, AuthSessionInfo } from '@shared/types/generated/wire-models';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { apiBase, authError, authFetch, authReady, authUser, isNative, loadAuth, logout } from '@/services/auth';

const props = defineProps<{ inRoom: boolean }>();
const localStorage = window.localStorage;
const location = window.location;
const URL = window.URL;
const emit = defineEmits<{ opened: []; close: []; resume: [code: string, roomId: string] }>();
const page = ref<'welcome' | 'register' | 'login' | 'account' | 'backup' | 'approve'>('welcome');
const mode = ref<'passkey' | 'pairing' | 'recovery'>('recovery');
const nickname = ref(''),
  phrase = ref(''),
  backup = ref(''),
  confirmWords = ref(''),
  proofId = ref(''),
  proofPhrase = ref('');
const error = ref(''),
  notice = ref(''),
  busy = ref(false),
  showSecret = ref(false),
  passkey = ref(false),
  server = ref(apiBase());
const pairing = ref<AuthPairing | null>(null),
  qr = ref(''),
  code = ref(''),
  approval = ref<{ id: string; name: string; code: string } | null>(null);
const sessions = ref<AuthSessionInfo[]>([]),
  keys = ref<{ id: string }[]>([]),
  activeRooms = ref<{ roomCode: string; roomId: string }[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
const loggedIn = computed(() => !!authUser.value);
const accountBound = computed(() => authUser.value?.hasRecovery || authUser.value?.passkeyCount);
const deviceName = () => (/Android|iPhone|iPad/.test(navigator.userAgent) ? '手机' : '浏览器');
async function action(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
async function refresh() {
  if (!authUser.value) return;
  const [a, b, c] = await Promise.all([
    authFetch('/api/auth/sessions'),
    authFetch('/api/auth/passkeys'),
    authFetch('/api/auth/rooms'),
  ]);
  sessions.value = a.sessions;
  keys.value = b.passkeys;
  activeRooms.value = c.rooms;
}
async function capabilities() {
  passkey.value = false;
  if (!isNative() && window.isSecureContext && window.PublicKeyCredential) {
    try {
      passkey.value = (await authFetch('/api/auth/capabilities')).passkey;
    } catch {}
  }
  mode.value = passkey.value ? 'passkey' : 'recovery';
}
async function signed(purpose: string, text: string) {
  const publicKey = recoveryPublicKey(text);
  const challenge = await authFetch('/api/auth/recovery/challenge', { purpose, publicKey });
  return { ...challenge, signature: signRecovery(text, challenge.message) };
}
async function prove() {
  if (!accountBound.value) return '';
  if (proofId.value) {
    const id = proofId.value;
    proofId.value = '';
    return id;
  }
  if (!proofPhrase.value) throw new Error('请先使用 Passkey 验证，或填写当前恢复短语');
  const response = await authFetch('/api/auth/recovery/stepup', await signed('stepup', proofPhrase.value));
  proofPhrase.value = '';
  return response.proofId;
}
async function passkeyLogin(stepup = false) {
  const request = await authFetch('/api/auth/passkeys/login/options', { stepup });
  const response = await startAuthentication({ optionsJSON: request.options });
  const result = await authFetch('/api/auth/passkeys/login/verify', {
    id: request.id,
    response,
    deviceName: deviceName(),
  });
  if (stepup) {
    proofId.value = result.proofId;
    notice.value = '验证成功，请在一分钟内完成操作';
  } else {
    page.value = code.value ? 'approve' : 'account';
    await refresh();
  }
}
async function register() {
  emit('opened');
  if (authUser.value?.kind === 'guest') await authFetch('/api/auth/guest/upgrade', { nickname: nickname.value });
  else await authFetch('/api/auth/register', { nickname: nickname.value, deviceName: deviceName() });
  page.value = 'account';
  notice.value = '账号已创建。可设置登录方式，也可以稍后开玩。';
  await refresh();
}
async function cancelPairing() {
  clearTimeout(timer);
  const p = pairing.value;
  pairing.value = null;
  if (p) await authFetch('/api/auth/pairings/cancel', { id: p.id, secret: p.secret }).catch(() => {});
}
async function poll() {
  const p = pairing.value;
  if (!p) return;
  try {
    const result = await authFetch('/api/auth/pairings/claim', { id: p.id, secret: p.secret });
    if (pairing.value?.id !== p.id) return;
    if (result.user) {
      pairing.value = null;
      page.value = 'account';
      await refresh();
      return;
    }
    timer = setTimeout(poll, 1500);
  } catch (e) {
    pairing.value = null;
    error.value = e instanceof Error ? e.message : '授权失败';
  }
}
async function startPairing() {
  await cancelPairing();
  pairing.value = await authFetch('/api/auth/pairings', { deviceName: deviceName() });
  const url = new URL(apiBase() || window.location.origin);
  url.search = '';
  url.hash = `pair=${pairing.value!.code}`;
  qr.value = await QRCode.toDataURL(url.toString(), { width: 256, margin: 2 });
  void poll();
}
watch(mode, () => {
  void cancelPairing();
});
watch(authUser, (user) => {
  if (user) {
    emit('opened');
    nickname.value = user.nickname;
    if (page.value === 'welcome' || page.value === 'login') page.value = code.value ? 'approve' : 'account';
  } else if (page.value === 'account') page.value = 'welcome';
});
watch(
  authReady,
  (ready) => {
    if (ready) void capabilities();
  },
  { immediate: true }
);
onMounted(async () => {
  if (authUser.value) {
    page.value = 'account';
    nickname.value = authUser.value.nickname;
    await refresh();
  }
  const match = location.hash.match(/^#pair=(\d{6})$/);
  if (match) {
    code.value = match[1];
    if (authUser.value) page.value = 'approve';
  }
});
onUnmounted(() => {
  void cancelPairing();
  phrase.value = '';
  backup.value = '';
  proofPhrase.value = '';
});
</script>

<template>
<section class="account-panel" aria-label="账号">
  <header><button v-if="loggedIn" class="quiet" @click="emit('close')">← 返回游戏</button><button v-else-if="page!=='welcome'" class="quiet" @click="page='welcome'; cancelPairing(); phrase=''">← 返回</button><span class="brand">🎱 PoolPoker</span></header>
  <p v-if="!authReady" role="status">正在恢复登录…</p>
  <p v-if="error || authError" role="alert" class="error">{{error || authError}}</p>
  <p v-if="notice" role="status" class="notice">{{notice}}</p>
  <template v-if="page==='welcome'">
    <div class="welcome-copy"><span class="eyebrow">球霸扑克 · 朋友的牌桌</span><h1>同一场好球，<br>换个设备继续。</h1><p>无需手机号或邮箱。<br>创建你的账号，或直接以游客开玩。</p></div>
    <div class="actions"><button :disabled="busy||!authReady" @click="page='register'">创建账号</button><button class="outline" :disabled="busy||!authReady" @click="page='login'">登录账号</button><button class="quiet" :disabled="busy||!authReady" @click="action(async()=>{await authFetch('/api/auth/guest',{deviceName:deviceName()});emit('close')})">以游客登录</button></div>
    <details><summary>服务器设置</summary><label>服务地址<input v-model="server" placeholder="留空使用当前服务器"></label><button class="outline" @click="action(async()=>{const value=server.trim().replace(/\/+$/,'');if(value&&!/^https?:\/\//.test(value))throw new Error('请填写 http:// 或 https:// 地址');localStorage.setItem('poolpoker_server_url',value);await loadAuth();location.reload()})">连接服务器</button><button class="quiet" @click="action(loadAuth)">重试连接</button></details>
  </template>
  <template v-else-if="page==='register'">
    <div class="form-copy"><h1>怎么称呼你？</h1><p>昵称可以重复，也可以随时修改。</p><label>游戏昵称<input v-model="nickname" maxlength="24" autocomplete="nickname" placeholder="请输入昵称" @keyup.enter="action(register)"></label></div>
    <div class="actions"><button :disabled="busy||!nickname.trim()" @click="action(register)">{{authUser?.kind==='guest'?'注册并保留当前牌局':'创建账号'}}</button></div>
  </template>
  <template v-else-if="page==='login'">
    <h1>登录你的账号</h1>
    <nav class="login-tabs" aria-label="登录方式"><button v-if="passkey" :aria-pressed="mode==='passkey'" @click="mode='passkey'">Passkey</button><button :aria-pressed="mode==='pairing'" @click="mode='pairing'">扫码授权</button><button :aria-pressed="mode==='recovery'" @click="mode='recovery'">恢复短语</button></nav>
    <template v-if="mode==='passkey'"><p>使用系统保存的通行密钥登录。</p><button :disabled="busy" @click="action(()=>passkeyLogin())">使用 Passkey</button></template>
    <template v-if="mode==='recovery'"><p>输入备份的 12 个单词，找回同一个账号。</p><label>恢复短语<input v-model="phrase" :type="showSecret?'text':'password'" autocomplete="off" autocapitalize="none" :spellcheck="false" placeholder="12 个单词，以空格分隔"></label><button class="quiet" @click="showSecret=!showSecret">{{showSecret?'隐藏':'显示'}}短语</button><button :disabled="busy||!phrase.trim()" @click="action(async()=>{await authFetch('/api/auth/recovery/login',{...await signed('login',phrase),deviceName:deviceName()});phrase='';page=code?'approve':'account';await refresh()})">登录账号</button></template>
    <template v-if="mode==='pairing'"><p>用已登录手机的系统相机扫描，或在旧设备“添加设备”中输入配对码。</p><img v-if="pairing" :src="qr" alt="新设备授权二维码"><strong v-if="pairing" class="pair-code">{{pairing.code}}</strong><p v-if="pairing" role="status">等待旧设备确认 · 两分钟内有效</p><button :disabled="busy" @click="action(startPairing)">{{pairing?'刷新二维码':'显示二维码与配对码'}}</button></template>
    <button v-if="isNative()" class="outline" :disabled="busy" @click="action(async()=>{mode='pairing';await startPairing();const url=new URL(apiBase());url.hash=`pair=${pairing!.code}`;await (await import('@tauri-apps/plugin-opener')).openUrl(url.toString())})">在系统浏览器登录（支持 Passkey）</button>
    <p v-if="!passkey" class="muted">当前环境不支持 Passkey，可使用恢复短语或设备授权。</p>
  </template>
  <template v-else-if="page==='account'">
    <h1>{{authUser?.nickname}}</h1><p>{{authUser?.kind==='guest'?'游客 · 注册后可设置跨设备登录':'已注册账号'}}</p><small class="muted">ID {{authUser?.id}}</small>
    <label>修改昵称<input v-model="nickname" maxlength="24"></label><button class="outline" :disabled="busy" @click="action(async()=>{await authFetch('/api/auth/me',{nickname},'PATCH');notice='昵称已更新'})">保存昵称</button>
    <button v-if="authUser?.kind==='guest'" @click="page='register'">注册并保留当前牌局</button>
    <template v-else>
      <p>恢复短语：{{authUser?.hasRecovery?'已备份':'尚未备份'}} · Passkey：{{authUser?.passkeyCount}} 个</p>
      <details v-if="accountBound"><summary>管理登录方式前验证账号</summary><button v-if="passkey" class="outline" :disabled="busy" @click="action(()=>passkeyLogin(true))">用 Passkey 验证</button><label>或输入当前恢复短语<input v-model="proofPhrase" type="password" autocomplete="off" :spellcheck="false"></label></details>
      <button class="outline" :disabled="busy" @click="action(async()=>{backup=createRecoveryPhrase();confirmWords='';page='backup'})">{{authUser?.hasRecovery?'更换恢复短语':'备份恢复短语'}}</button>
      <button v-if="passkey" class="outline" :disabled="busy" @click="action(async()=>{const request=await authFetch('/api/auth/passkeys/register/options',{proofId:await prove()});const response=await startRegistration({optionsJSON:request.options});await authFetch('/api/auth/passkeys/register/verify',{id:request.id,response});await refresh()})">添加 Passkey</button>
      <div v-for="(key,i) in keys" :key="key.id" class="device-row"><span>Passkey {{i+1}}</span><button class="quiet" :disabled="busy" @click="action(async()=>{await authFetch('/api/auth/passkeys/revoke',{id:key.id,proofId:await prove()});await refresh()})">撤销</button></div>
      <button class="outline" @click="page='approve'">添加设备</button>
    </template>
    <div v-for="r in activeRooms" :key="r.roomId" class="device-row"><span>房间 {{r.roomCode}}</span><button class="quiet" @click="emit('resume',r.roomCode,r.roomId);emit('close')">继续牌局</button></div>
    <h2>已登录设备</h2><div v-for="s in sessions" :key="s.id" class="device-row"><span>{{s.name}} {{s.current?'（当前）':''}}</span><button v-if="!s.current" class="quiet" :disabled="busy" @click="action(async()=>{await authFetch('/api/auth/sessions/revoke',{id:s.id});await refresh()})">退出</button></div>
    <p v-if="inRoom" class="muted">退出房间后才能切换账号。游客可以直接注册保留牌局。</p><button class="quiet" :disabled="busy||inRoom" @click="action(async()=>{await logout();page='welcome'})">退出当前登录</button><button class="quiet" :disabled="busy||inRoom" @click="action(async()=>{await logout(true);page='welcome'})">退出所有设备</button><button @click="emit('close')">继续开玩</button>
  </template>
  <template v-else-if="page==='backup'">
    <h1>保存恢复短语</h1><p>请抄写到安全的地方。确认保存后，此处不会再次展示。更换短语会退出旧设备。</p><ol class="words"><li v-for="(word,i) in backup.split(' ')" :key="i"><small>{{i+1}}</small>{{word}}</li></ol><label>请输入第 3 和第 9 个单词确认保存<input v-model="confirmWords" autocomplete="off" :spellcheck="false" placeholder="两个单词，以空格分隔"></label><button :disabled="busy" @click="action(async()=>{if(confirmWords.trim().toLowerCase()!==`${backup.split(' ')[2]} ${backup.split(' ')[8]}`)throw new Error('单词不匹配，请检查备份');await authFetch('/api/auth/recovery/save',{...await signed(authUser?.hasRecovery?'rotate':'setup',backup),proofId:await prove()});proofId='';backup='';page='account';await refresh()})">已保存，完成备份</button><button class="quiet" @click="backup='';proofId='';page='account'">取消</button>
  </template>
  <template v-else-if="page==='approve'">
    <h1>添加设备</h1><p>输入新设备显示的六位配对码。</p><label>配对码<input v-model="code" inputmode="numeric" maxlength="6" placeholder="六位配对码"></label><button class="outline" :disabled="busy||code.length!==6" @click="action(async()=>{approval=await authFetch('/api/auth/pairings/lookup',{code})})">核对设备</button><template v-if="approval"><p>授权 {{approval.name}} 登录 {{authUser?.nickname}}</p><strong class="pair-code">{{approval.code}}</strong><button :disabled="busy" @click="action(async()=>{await authFetch('/api/auth/pairings/approve',{id:approval!.id});approval=null;notice='已授权，请在新设备继续';page='account'})">确认授权</button></template><button class="quiet" @click="approval=null;page='account'">返回</button>
  </template>
</section>
</template>

<style scoped>
.account-panel{width:min(100%,560px);margin:0 auto;min-height:85dvh;padding:24px 20px;display:flex;flex-direction:column;gap:18px;color:#edf8f1}.account-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{color:#34e79a;font-weight:800}.welcome-copy{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:280px}.eyebrow{font-size:12px;letter-spacing:.12em;color:#73b49a}.account-panel h1{font-size:clamp(28px,6vw,40px);font-weight:800;line-height:1.35}.account-panel h2{font-size:18px;font-weight:700}.account-panel p{line-height:1.7;color:#a9bdb3}.account-panel label{display:flex;flex-direction:column;gap:10px;font-size:14px}.account-panel input{width:100%;padding:16px;background:#071510;border:1px solid #3c5649;border-radius:12px;color:#fff;min-height:52px}.account-panel button{padding:14px 20px;border-radius:999px;background:#28e794;color:#03140b;font-weight:700;cursor:pointer;min-height:46px}.account-panel button.outline{background:transparent;border:1px solid #28e794;color:#53e9a7}.account-panel button.quiet{background:transparent;color:#a3d9bd;padding:8px 12px}.account-panel button:disabled{opacity:.45;cursor:default}.account-panel button:focus-visible,.account-panel input:focus-visible{outline:2px solid #f5d177;outline-offset:3px}.actions{display:flex;flex-direction:column;gap:12px;margin-top:auto;padding-bottom:env(safe-area-inset-bottom)}.form-copy{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px}.login-tabs{display:flex;gap:4px;border-bottom:1px solid #355044}.login-tabs button{flex:1;border-radius:0;background:transparent;color:#aabfb2;padding:12px 6px;font-size:14px}.login-tabs button[aria-pressed=true]{border-bottom:3px solid #28e794;color:white}.account-panel .error{color:#ffb4a4;background:#411e1a;padding:12px;border-radius:8px}.account-panel .notice{color:#6aefb6}.muted{font-size:12px;overflow-wrap:anywhere}.pair-code{font-size:36px;letter-spacing:.22em;text-align:center}.account-panel img{width:240px;max-width:100%;align-self:center;border-radius:12px}.device-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px}.words{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.words li{padding:12px 6px;background:#10291d;border-radius:8px;font-size:14px}.words small{color:#7f9f8b;margin-right:6px}.account-panel details{padding:10px;border:1px solid #304d3e;border-radius:10px}.account-panel summary{cursor:pointer;margin-bottom:8px}
</style>
