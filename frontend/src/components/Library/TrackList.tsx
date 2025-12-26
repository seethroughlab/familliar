import { useQuery } from '@tanstack/react-query';
import { Play, Pause, Download, Check, Loader2 } from 'lucide-react';
import { tracksApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import { useOfflineTrack } from '../../hooks/useOfflineTrack';
import type { Track } from '../../types';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}

function OfflineButton({ trackId }: { trackId: string }) {
  const { isOffline, isDownloading, download, remove } = useOfflineTrack(trackId);

  if (isDownloading) {
    return (
      <button
        disabled
        className="p-1 text-zinc-500"
        title="Downloading..."
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </button>
    );
  }

  if (isOffline) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          remove();
        }}
        className="p-1 text-green-500 hover:text-red-400 transition-colors"
        title="Remove offline copy"
      >
        <Check className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        download();
      }}
      className="p-1 text-zinc-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
      title="Download for offline"
    >
      <Download className="w-4 h-4" />
    </button>
  );
}

function TrackRow({ track, index, isCurrentTrack, isPlaying, onPlay }: TrackRowProps) {
  return (
    <div
      className={`group grid grid-cols-[3rem_1fr_1fr_1fr_4rem_3rem] gap-4 px-4 py-2 rounded-md hover:bg-zinc-800/50 ${
        isCurrentTrack ? 'bg-zinc-800/50' : ''
      }`}
    >
      <div className="flex items-center justify-center">
        <span className="group-hover:hidden text-zinc-400">
          {isCurrentTrack && isPlaying ? (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="flex gap-0.5">
                <div className="w-0.5 h-3 bg-green-500 animate-pulse" />
                <div className="w-0.5 h-2 bg-green-500 animate-pulse delay-75" />
                <div className="w-0.5 h-4 bg-green-500 animate-pulse delay-150" />
              </div>
            </div>
          ) : (
            index + 1
          )}
        </span>
        <button
          onClick={onPlay}
          className="hidden group-hover:flex items-center justify-center"
        >
          {isCurrentTrack && isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4" fill="currentColor" />
          )}
        </button>
      </div>
      <div className="min-w-0">
        <div className={`truncate ${isCurrentTrack ? 'text-green-500' : ''}`}>
          {track.title || 'Unknown'}
        </div>
      </div>
      <div className="text-zinc-400 truncate">{track.artist || 'Unknown'}</div>
      <div className="text-zinc-400 truncate">{track.album || 'Unknown'}</div>
      <div className="text-zinc-400 text-right">{formatDuration(track.duration_seconds)}</div>
      <div className="flex items-center justify-center">
        <OfflineButton trackId={track.id} />
      </div>
    </div>
  );
}

interface TrackListProps {
  search?: string;
  artist?: string;
  album?: string;
}

export function TrackList({ search, artist, album }: TrackListProps) {
  const { currentTrack, isPlaying, setIsPlaying, setQueue } = usePlayerStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracks', { search, artist, album }],
    queryFn: () => tracksApi.list({ search, artist, album, page_size: 100 }),
  });

  const handlePlayTrack = (track: Track, index: number) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else if (data) {
      setQueue(data.items, index);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500">Loading tracks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-500">Error loading tracks</div>
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500">No tracks found</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-[3rem_1fr_1fr_1fr_4rem_3rem] gap-4 px-4 py-2 text-sm text-zinc-400 border-b border-zinc-800">
        <div>#</div>
        <div>Title</div>
        <div>Artist</div>
        <div>Album</div>
        <div className="text-right">Duration</div>
        <div></div>
      </div>

      {/* Tracks */}
      <div className="mt-2">
        {data.items.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrack?.id === track.id}
            isPlaying={currentTrack?.id === track.id && isPlaying}
            onPlay={() => handlePlayTrack(track, index)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 text-sm text-zinc-500">
        {data.total} tracks
      </div>
    </div>
  );
}
