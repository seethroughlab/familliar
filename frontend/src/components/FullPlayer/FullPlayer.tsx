import { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Music,
  Waves,
  Video,
  Type,
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { tracksApi } from '../../api/client';
import { AudioVisualizer } from '../Visualizer/AudioVisualizer';
import { LyricsDisplay } from './LyricsDisplay';
import { VideoPlayer } from './VideoPlayer';

type ViewMode = 'visualizer' | 'video' | 'lyrics';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface FullPlayerProps {
  onClose: () => void;
}

export function FullPlayer({ onClose }: FullPlayerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('visualizer');
  const [imageError, setImageError] = useState(false);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    setVolume,
    playNext,
    playPrevious,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
  } = usePlayerStore();

  const { seek, togglePlayPause } = useAudioEngine();

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  if (!currentTrack) {
    return null;
  }

  const artworkUrl = tracksApi.getArtworkUrl(currentTrack.id);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* View mode toggle */}
        <div className="flex gap-1 bg-white/10 rounded-lg p-1">
          <button
            onClick={() => setViewMode('visualizer')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'visualizer'
                ? 'bg-white/20 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Visualizer"
          >
            <Waves className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('video')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'video'
                ? 'bg-white/20 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Music Video"
          >
            <Video className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('lyrics')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'lyrics'
                ? 'bg-white/20 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Lyrics"
          >
            <Type className="w-5 h-5" />
          </button>
        </div>

        <div className="w-10" /> {/* Spacer for balance */}
      </div>

      {/* Main content area */}
      <div className="flex-1 relative overflow-hidden">
        {viewMode === 'visualizer' && (
          <AudioVisualizer mode="combined" className="absolute inset-0" />
        )}

        {viewMode === 'video' && (
          <VideoPlayer trackId={currentTrack.id} />
        )}

        {viewMode === 'lyrics' && (
          <LyricsDisplay trackId={currentTrack.id} />
        )}

        {/* Album art overlay (bottom left) */}
        <div className="absolute bottom-32 left-8 z-10">
          {imageError ? (
            <div className="w-24 h-24 bg-zinc-800 rounded-lg flex items-center justify-center shadow-2xl">
              <Music className="w-12 h-12 text-zinc-600" />
            </div>
          ) : (
            <img
              src={artworkUrl}
              alt="Album art"
              className="w-24 h-24 rounded-lg shadow-2xl object-cover"
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black via-black/95 to-transparent p-6 pt-16">
        {/* Track info */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold truncate">{currentTrack.title || 'Unknown'}</h2>
          <p className="text-lg text-zinc-400">{currentTrack.artist || 'Unknown'}</p>
          <p className="text-sm text-zinc-500">{currentTrack.album || ''}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div
            className="h-1.5 bg-zinc-700 rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-white rounded-full relative group-hover:bg-green-500 transition-colors"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
            </div>
          </div>
          <div className="flex justify-between text-sm text-zinc-400 mt-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleShuffle}
            className={`p-3 rounded-full transition-colors ${
              shuffle ? 'text-green-500' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={playPrevious}
            className="p-3 hover:bg-white/10 rounded-full transition-colors"
          >
            <SkipBack className="w-7 h-7" fill="currentColor" />
          </button>

          <button
            onClick={togglePlayPause}
            className="p-5 bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8" fill="currentColor" />
            ) : (
              <Play className="w-8 h-8" fill="currentColor" />
            )}
          </button>

          <button
            onClick={playNext}
            className="p-3 hover:bg-white/10 rounded-full transition-colors"
          >
            <SkipForward className="w-7 h-7" fill="currentColor" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-3 rounded-full transition-colors ${
              repeat !== 'off' ? 'text-green-500' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Repeat className="w-5 h-5" />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
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
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-32 accent-white"
          />
        </div>
      </div>
    </div>
  );
}
