import { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music, Maximize2, Users } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { tracksApi } from '../../api/client';

interface PlayerBarProps {
  onExpandClick?: () => void;
  onSessionClick?: () => void;
  isInSession?: boolean;
  sessionParticipantCount?: number;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function AlbumArt({ trackId }: { trackId: string }) {
  const [hasError, setHasError] = useState(false);
  const artworkUrl = tracksApi.getArtworkUrl(trackId);

  if (hasError) {
    return (
      <div className="w-12 h-12 bg-zinc-800 rounded flex-shrink-0 flex items-center justify-center">
        <Music className="w-6 h-6 text-zinc-600" />
      </div>
    );
  }

  return (
    <img
      src={artworkUrl}
      alt="Album art"
      className="w-12 h-12 bg-zinc-800 rounded flex-shrink-0 object-cover"
      onError={() => setHasError(true)}
    />
  );
}

export function PlayerBar({
  onExpandClick,
  onSessionClick,
  isInSession = false,
  sessionParticipantCount = 0,
}: PlayerBarProps) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    setVolume,
    playNext,
    playPrevious,
  } = usePlayerStore();

  const { seek, togglePlayPause } = useAudioEngine();

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  if (!currentTrack) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center text-zinc-500">
        No track selected
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-zinc-900 border-t border-zinc-800">
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center gap-4">
        {/* Track info - clickable to expand */}
        <button
          onClick={onExpandClick}
          className="flex items-center gap-3 w-64 min-w-0 text-left hover:bg-zinc-800/50 rounded-lg p-1 -ml-1 transition-colors group"
        >
          <AlbumArt trackId={currentTrack.id} />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{currentTrack.title || 'Unknown'}</div>
            <div className="text-sm text-zinc-400 truncate">{currentTrack.artist || 'Unknown'}</div>
          </div>
          <Maximize2 className="w-4 h-4 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-center gap-4">
            <button
              onClick={playPrevious}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={togglePlayPause}
              className="p-3 bg-white text-black rounded-full hover:scale-105 transition-transform"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" fill="currentColor" />
              ) : (
                <Play className="w-5 h-5" fill="currentColor" />
              )}
            </button>
            <button
              onClick={playNext}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xl flex items-center gap-2">
            <span className="text-xs text-zinc-400 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <div
              className="flex-1 h-1 bg-zinc-700 rounded-full cursor-pointer group"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-white rounded-full relative group-hover:bg-green-500 transition-colors"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-xs text-zinc-400 w-10">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Session button */}
        {onSessionClick && (
          <button
            onClick={onSessionClick}
            className={`relative p-2 rounded-md transition-colors ${
              isInSession
                ? 'bg-green-600/20 text-green-500 hover:bg-green-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
            title={isInSession ? `In session (${sessionParticipantCount} listeners)` : 'Start listening session'}
          >
            <Users className="w-5 h-5" />
            {isInSession && sessionParticipantCount > 1 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                {sessionParticipantCount}
              </span>
            )}
          </button>
        )}

        {/* Volume */}
        <div className="flex items-center gap-2 w-32">
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
          >
            {volume === 0 ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full accent-white"
          />
        </div>
      </div>
    </div>
  );
}
