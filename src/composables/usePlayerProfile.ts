import { computed, ref, watch } from 'vue';
import { authFetch, authUser } from '@/services/auth';

export function usePlayerProfile() {
  const userId = computed(() => authUser.value?.id || '');
  // 玩家个人设置
  const playerName = ref<string>(localStorage.getItem('billiards_player_name') || '');
  const rawBallConfigKey = localStorage.getItem('billiards_ball_config_key');
  const initialBallConfigKey = rawBallConfigKey && rawBallConfigKey !== 'default' ? rawBallConfigKey : 'xingpai';
  localStorage.setItem('billiards_ball_config_key', initialBallConfigKey);
  const selectedBallConfigKey = ref<string>(initialBallConfigKey);

  let nameTimer: ReturnType<typeof setTimeout>;
  watch(
    () => authUser.value?.nickname,
    (name) => {
      if (name) playerName.value = name;
    }
  );
  watch(playerName, (val) => {
    clearTimeout(nameTimer);
    if (authUser.value && val.trim() && val.trim() !== authUser.value.nickname)
      nameTimer = setTimeout(() => {
        void authFetch('/api/auth/me', { nickname: val.trim() }, 'PATCH').catch(() => {
          playerName.value = authUser.value?.nickname || '';
        });
      }, 400);
    const trimmed = val.trim();
    if (trimmed) {
      localStorage.setItem('billiards_player_name', trimmed);
    } else {
      localStorage.removeItem('billiards_player_name');
    }
  });

  watch(selectedBallConfigKey, (val) => {
    localStorage.setItem('billiards_ball_config_key', val);
  });

  const getFinalPlayerName = (): string => {
    const trimmed = playerName.value.trim();
    if (trimmed) {
      localStorage.setItem('billiards_player_name', trimmed);
      return trimmed;
    }
    return authUser.value?.nickname || '球友';
  };

  return {
    userId,
    playerName,
    selectedBallConfigKey,
    getFinalPlayerName,
  };
}
