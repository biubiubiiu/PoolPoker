import { ref } from 'vue';

const isSoundEnabled = ref(localStorage.getItem('poolpoker_sound_enabled') === 'true');
const isHapticEnabled = ref(localStorage.getItem('poolpoker_haptic_enabled') === 'true');
let context: AudioContext | null = null;

function unlockAudio() {
  if (!isSoundEnabled.value) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch {
    /* Audio is an optional enhancement. */
  }
}

function tone(from: number, to: number, duration: number, volume: number) {
  if (!isSoundEnabled.value || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(now);
  oscillator.stop(now + duration);
}

export function useGameAudio() {
  const triggerHaptic = () => {
    if (isHapticEnabled.value) navigator.vibrate?.(18);
  };
  return {
    isSoundEnabled,
    isHapticEnabled,
    unlockAudio,
    toggleSound: () => {
      isSoundEnabled.value = !isSoundEnabled.value;
      localStorage.setItem('poolpoker_sound_enabled', String(isSoundEnabled.value));
      unlockAudio();
    },
    toggleHaptic: () => {
      isHapticEnabled.value = !isHapticEnabled.value;
      localStorage.setItem('poolpoker_haptic_enabled', String(isHapticEnabled.value));
      triggerHaptic();
    },
    triggerHaptic,
    playBallHitSound: () => tone(1800, 650, 0.055, 0.07),
    playPocketDropSound: () => {
      tone(180, 65, 0.16, 0.14);
      triggerHaptic();
    },
    playCardSlideSound: () => tone(620, 320, 0.09, 0.035),
    playCardDimSound: () => tone(380, 210, 0.12, 0.035),
  };
}
