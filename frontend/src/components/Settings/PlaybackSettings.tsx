import { Volume2 } from 'lucide-react';
import { useAudioSettingsStore } from '../../stores/audioSettingsStore';

export function PlaybackSettings() {
  const {
    crossfadeEnabled,
    crossfadeDuration,
    setCrossfadeEnabled,
    setCrossfadeDuration,
  } = useAudioSettingsStore();

  const getDurationLabel = (duration: number): string => {
    if (duration === 0) return 'Gapless';
    return `${duration}s`;
  };

  return (
    <div className="bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-white rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Volume2 className="w-5 h-5 text-purple-400" />
          <div>
            <h4 className="font-medium text-white dark:text-white light:text-zinc-900">
              Crossfade
            </h4>
            <p className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
              Smoothly transition between tracks
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={crossfadeEnabled}
            onChange={(e) => setCrossfadeEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-zinc-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {crossfadeEnabled && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
              Duration
            </span>
            <span className="text-sm font-medium text-white dark:text-white light:text-zinc-900">
              {getDurationLabel(crossfadeDuration)}
            </span>
          </div>

          <div className="relative">
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={crossfadeDuration}
              onChange={(e) => setCrossfadeDuration(Number(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>Gapless</span>
              <span>10s</span>
            </div>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-500 light:text-zinc-500">
            {crossfadeDuration === 0
              ? 'Tracks will transition instantly without any gap'
              : `Tracks will overlap and fade for ${crossfadeDuration} second${crossfadeDuration > 1 ? 's' : ''}`}
          </p>
        </div>
      )}
    </div>
  );
}
