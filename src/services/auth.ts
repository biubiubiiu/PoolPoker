import type { AuthUser } from '@shared/types/generated/wire-models';
import { ref } from 'vue';

export const authUser = ref<AuthUser | null>(null);
export const authReady = ref(false);
export const authGeneration = ref(0);
export const authError = ref('');
export const isNative = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
let nativeToken = '';
let authScope = 0;
export const apiBase = () => (localStorage.getItem('poolpoker_server_url') ?? '').replace(/\/+$/, '');
export async function authFetch(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const base = apiBase();
  const scope = authScope;
  const headers: Record<string, string> = { 'X-PoolPoker-Request': '1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isNative()) {
    headers['X-PoolPoker-Native'] = '1';
    if (nativeToken) headers.Authorization = `Bearer ${nativeToken}`;
  }
  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  const response = isNative()
    ? await (await import('@tauri-apps/plugin-http')).fetch(`${base}${path}`, init)
    : await fetch(`${base}${path}`, init);
  const result = await response.json();
  if (scope !== authScope || base !== apiBase()) throw new Error('登录上下文已改变，请重试');
  if (!response.ok) {
    if (response.status === 401) authUser.value = null;
    throw new Error(result.message ?? '请求失败');
  }
  authError.value = '';
  if (result.token && isNative()) {
    nativeToken = result.token;
    await (await import('@tauri-apps/api/core')).invoke('save_auth_token', { server: base, token: nativeToken });
  }
  if (scope !== authScope || base !== apiBase()) throw new Error('登录上下文已改变，请重试');
  if (result.user && !['/api/auth/me', '/api/auth/guest/upgrade'].includes(path)) authGeneration.value++;
  if (result.user) {
    authUser.value = result.user;
    localStorage.setItem('billiards_user_id', result.user.id);
    localStorage.setItem('billiards_player_name', result.user.nickname);
  }
  return result;
}
export async function loadAuth() {
  const scope = ++authScope;
  const base = apiBase();
  authReady.value = false;
  authError.value = '';
  try {
    nativeToken = '';
    if (isNative()) {
      const saved = await (await import('@tauri-apps/api/core')).invoke<string>('load_auth_token', { server: base });
      if (scope !== authScope || base !== apiBase()) return;
      nativeToken = saved;
    }
    await authFetch('/api/auth/me');
  } catch (e) {
    if (scope !== authScope) return;
    authUser.value = null;
    if (e instanceof Error && e.message !== '请重新登录') authError.value = e.message;
  } finally {
    if (scope === authScope) authReady.value = true;
  }
}
export async function logout(all = false) {
  ++authScope;
  await authFetch(`/api/auth/${all ? 'logout-all' : 'logout'}`, {});
  nativeToken = '';
  authUser.value = null;
  if (isNative())
    await (await import('@tauri-apps/api/core')).invoke('save_auth_token', { server: apiBase(), token: '' });
  localStorage.removeItem('billiards_room_code');
  localStorage.removeItem('billiards_room_id');
  localStorage.removeItem('billiards_session_token');
}
export function clientId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
