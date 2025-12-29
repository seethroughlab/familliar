import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AudioSettingsState {
  // Crossfade duration in seconds (0 = gapless without fade, max 10)
  crossfadeDuration: number;

  // Whether crossfade is enabled
  crossfadeEnabled: boolean;

  // Actions
  setCrossfadeDuration: (duration: number) => void;
  setCrossfadeEnabled: (enabled: boolean) => void;
}

export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set) => ({
      crossfadeDuration: 3,
      crossfadeEnabled: true,

      setCrossfadeDuration: (duration) =>
        set({
          crossfadeDuration: Math.max(0, Math.min(10, duration)),
        }),

      setCrossfadeEnabled: (enabled) => set({ crossfadeEnabled: enabled }),
    }),
    {
      name: 'familiar-audio-settings',
    }
  )
);
