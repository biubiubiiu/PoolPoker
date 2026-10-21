import { ref, watch } from 'vue';

export const UI_PREFERENCE_STORAGE_KEY = 'poolpoker_use_new_ui';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

/**
 * 决定是否在服务器设置中显示「默认服务器（同源推荐）」选项。
 * 移动端/Tauri环境仅在热重载（开发）模式下支持同源选项；release 包不展示该选项。
 * 网页端始终展示同源选项。
 */
export function shouldShowSameOriginServer(
  isTauri: boolean = isTauriEnvironment(),
  isDev: boolean = Boolean(import.meta.env?.DEV)
): boolean {
  if (isTauri) {
    return isDev;
  }
  return true;
}

export function useUiPreferences() {
  const isTauri = isTauriEnvironment();

  let initial = isTauri;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(UI_PREFERENCE_STORAGE_KEY);
    if (stored !== null) {
      initial = stored === 'true';
    }
  }

  const useNewUi = ref<boolean>(initial);

  watch(useNewUi, (val) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(UI_PREFERENCE_STORAGE_KEY, String(val));
    }
  });

  return {
    useNewUi,
    isTauri,
  };
}
