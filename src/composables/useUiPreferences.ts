import { ref, watch } from 'vue';

export const UI_PREFERENCE_STORAGE_KEY = 'poolpoker_use_new_ui';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
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
