import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import {
  isTauriEnvironment,
  shouldShowSameOriginServer,
  UI_PREFERENCE_STORAGE_KEY,
  useUiPreferences,
} from '@/composables/useUiPreferences';

class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string) {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

const mockStorage = new LocalStorageMock();
const originalWindow = (globalThis as any).window;
const originalLocalStorage = (globalThis as any).localStorage;

(globalThis as any).window = globalThis;
(globalThis as any).localStorage = mockStorage;

describe('useUiPreferences', () => {
  beforeEach(() => {
    mockStorage.clear();
    delete (globalThis as any).__TAURI__;
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  afterAll(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  describe('Web Environment (non-Tauri)', () => {
    it('should detect non-Tauri environment', () => {
      expect(isTauriEnvironment()).toBe(false);
    });

    it('should default useNewUi to false when no localStorage record exists', () => {
      const { useNewUi, isTauri } = useUiPreferences();
      expect(isTauri).toBe(false);
      expect(useNewUi.value).toBe(false);
    });

    it('should persist user preference to localStorage when toggled', async () => {
      const { useNewUi } = useUiPreferences();
      expect(useNewUi.value).toBe(false);

      useNewUi.value = true;
      await nextTick();
      expect(mockStorage.getItem(UI_PREFERENCE_STORAGE_KEY)).toBe('true');

      useNewUi.value = false;
      await nextTick();
      expect(mockStorage.getItem(UI_PREFERENCE_STORAGE_KEY)).toBe('false');
    });

    it('should respect saved preference in localStorage on initialization', () => {
      mockStorage.setItem(UI_PREFERENCE_STORAGE_KEY, 'true');
      const { useNewUi } = useUiPreferences();
      expect(useNewUi.value).toBe(true);
    });

    it('should always show same-origin server recommendation in Web environment', () => {
      // In Web, whether in production or development, same-origin is supported
      expect(shouldShowSameOriginServer(false, false)).toBe(true);
      expect(shouldShowSameOriginServer(false, true)).toBe(true);
      expect(shouldShowSameOriginServer()).toBe(true);
    });
  });

  describe('Tauri Environment', () => {
    beforeEach(() => {
      (globalThis as any).__TAURI__ = {};
    });

    it('should detect Tauri environment via __TAURI__', () => {
      expect(isTauriEnvironment()).toBe(true);
    });

    it('should default useNewUi to true when no localStorage record exists', () => {
      const { useNewUi, isTauri } = useUiPreferences();
      expect(isTauri).toBe(true);
      expect(useNewUi.value).toBe(true);
    });

    it('should detect Tauri environment via __TAURI_INTERNALS__', () => {
      delete (globalThis as any).__TAURI__;
      (globalThis as any).__TAURI_INTERNALS__ = {};
      expect(isTauriEnvironment()).toBe(true);
      const { useNewUi, isTauri } = useUiPreferences();
      expect(isTauri).toBe(true);
      expect(useNewUi.value).toBe(true);
    });

    it('should respect user explicit preference even in Tauri environment', () => {
      mockStorage.setItem(UI_PREFERENCE_STORAGE_KEY, 'false');
      const { useNewUi } = useUiPreferences();
      expect(useNewUi.value).toBe(false);
    });

    it('should only show same-origin server in hot-reload (dev) mode on Tauri mobile, not in release package', () => {
      // In Tauri mobile release build (isDev = false), same-origin MUST NOT be shown
      expect(shouldShowSameOriginServer(true, false)).toBe(false);
      // In Tauri mobile hot-reload mode (isDev = true), same-origin is allowed
      expect(shouldShowSameOriginServer(true, true)).toBe(true);
      // Default with Tauri environment active and explicit release flag
      expect(shouldShowSameOriginServer(isTauriEnvironment(), false)).toBe(false);
    });
  });
});
