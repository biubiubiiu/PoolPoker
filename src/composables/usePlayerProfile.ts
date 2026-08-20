import { ref, watch } from 'vue';

export function usePlayerProfile() {
  // 玩家固定的唯一 userId (持久化存在 localStorage)
  let savedUserId = localStorage.getItem('billiards_user_id');
  if (!savedUserId) {
    savedUserId = `u_${Math.random().toString(36).substring(2, 10)}${Date.now()}`;
    localStorage.setItem('billiards_user_id', savedUserId);
  }
  const userId = ref<string>(savedUserId);

  // 玩家个人设置
  const playerName = ref<string>(localStorage.getItem('billiards_player_name') || '');
  const avatars = ['🎱', '🎯', '🔥', '⚡️', '🏆', '💎'];
  const selectedAvatar = ref<string>(localStorage.getItem('billiards_player_avatar') || '🎱');
  const selectedBallConfigKey = ref<string>(localStorage.getItem('billiards_ball_config_key') || 'default');

  watch(playerName, (val) => {
    const trimmed = val.trim();
    if (trimmed) {
      localStorage.setItem('billiards_player_name', trimmed);
    } else {
      localStorage.removeItem('billiards_player_name');
    }
  });

  watch(selectedAvatar, (val) => {
    localStorage.setItem('billiards_player_avatar', val);
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
    return `球友${Math.floor(Math.random() * 900 + 100)}`;
  };

  return {
    userId,
    playerName,
    avatars,
    selectedAvatar,
    selectedBallConfigKey,
    getFinalPlayerName,
  };
}
