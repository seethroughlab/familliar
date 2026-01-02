/**
 * Lyric Pulse Visualizer.
 *
 * Displays current lyric line with pulsing glow effect synced to audio.
 * Demonstrates the Visualizer API hooks: useLyricTiming, useBeatSync, useAudioAnalyser.
 */
import { useAudioAnalyser, useLyricTiming, useBeatSync } from '../hooks';
import { registerVisualizer, type VisualizerProps } from '../types';

export function LyricPulse({ lyrics, currentTime, track, features }: VisualizerProps) {
  const audioData = useAudioAnalyser(true);

  // Use the lyric timing hook for current/next lines
  const { currentLine, nextLine, progress, hasLyrics } = useLyricTiming(lyrics, currentTime);

  // Use beat sync for BPM-aligned animations
  const { beatProgress, onBeat } = useBeatSync(features?.bpm, currentTime);

  const bass = audioData?.bass || 0;
  const mid = audioData?.mid || 0;
  const averageFrequency = audioData?.averageFrequency || 0;
  const intensity = averageFrequency / 255;

  // Dynamic styles based on audio + beat sync
  const beatPulse = onBeat ? 1.15 : 1 + beatProgress * 0.05;
  const glowIntensity = 10 + bass * 40;
  const scale = beatPulse * (1 + bass * 0.1);
  const hue = 260 + mid * 60; // Purple to cyan

  return (
    <div className="w-full h-full bg-[#0a0015] flex flex-col items-center justify-center overflow-hidden relative">
      {/* Background pulse effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at center, hsl(${hue}, 80%, ${20 + intensity * 20}%) 0%, transparent 70%)`,
        }}
      />

      {/* Frequency bars at edges */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 h-16 items-end">
        {audioData?.frequencyData && Array.from({ length: 32 }, (_, i) => {
          const value = audioData.frequencyData[i * 4] / 255;
          return (
            <div
              key={i}
              className="w-2 rounded-t transition-all duration-75"
              style={{
                height: `${value * 100}%`,
                backgroundColor: `hsl(${260 + (i / 32) * 60}, 80%, 50%)`,
                opacity: 0.5,
              }}
            />
          );
        })}
      </div>

      {/* Main lyric display */}
      <div className="z-10 text-center px-8 max-w-4xl">
        {hasLyrics ? (
          <>
            {/* Current line */}
            <div
              className="text-4xl md:text-6xl font-bold mb-8 transition-all duration-100"
              style={{
                transform: `scale(${scale})`,
                textShadow: `0 0 ${glowIntensity}px hsl(${hue}, 100%, 50%), 0 0 ${glowIntensity * 2}px hsl(${hue}, 100%, 50%)`,
                color: `hsl(${hue}, 80%, ${60 + intensity * 20}%)`,
              }}
            >
              {currentLine?.text || (
                <span className="text-zinc-600 text-2xl">Waiting for lyrics...</span>
              )}
            </div>

            {/* Progress bar */}
            {currentLine && (
              <div className="w-64 h-1 bg-zinc-800 rounded-full mx-auto mb-8">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: `hsl(${hue}, 80%, 50%)`,
                    boxShadow: `0 0 10px hsl(${hue}, 100%, 50%)`,
                  }}
                />
              </div>
            )}

            {/* Next line preview */}
            {nextLine && (
              <div className="text-xl text-zinc-500 opacity-60">
                {nextLine.text}
              </div>
            )}
          </>
        ) : (
          <>
            {/* No lyrics - show track info with pulse */}
            <div
              className="text-5xl md:text-7xl font-bold mb-4 transition-all duration-100"
              style={{
                transform: `scale(${scale})`,
                textShadow: `0 0 ${glowIntensity}px hsl(${hue}, 100%, 50%)`,
                color: `hsl(${hue}, 80%, ${60 + intensity * 20}%)`,
              }}
            >
              {track?.title || 'No Track'}
            </div>
            <div
              className="text-2xl text-zinc-400 transition-all duration-100"
              style={{
                textShadow: `0 0 ${glowIntensity / 2}px hsl(${hue}, 100%, 50%)`,
              }}
            >
              {track?.artist || 'Unknown Artist'}
            </div>
            <div className="text-sm text-zinc-600 mt-8">
              No lyrics available for this track
            </div>
          </>
        )}
      </div>

      {/* Ambient particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-pulse"
            style={{
              left: `${10 + i * 9}%`,
              top: `${20 + (i % 3) * 25}%`,
              backgroundColor: `hsl(${260 + i * 10}, 80%, 50%)`,
              opacity: 0.3 + intensity * 0.5,
              transform: `scale(${1 + bass})`,
              animation: `pulse ${2 + i * 0.2}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Register the visualizer
registerVisualizer(
  {
    id: 'lyric-pulse',
    name: 'Lyric Pulse',
    description: 'Current lyrics with pulsing glow',
    usesMetadata: true,
  },
  LyricPulse
);
