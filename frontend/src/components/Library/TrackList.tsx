import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Pause, Download, Check, Loader2, Heart, Music, FolderOpen } from 'lucide-react';
import { tracksApi, favoritesApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import { useColumnStore, getVisibleColumns } from '../../stores/columnStore';
import { COLUMN_DEFINITIONS, getColumnDef, getAnalysisColumns } from './columnDefinitions';
import { useOfflineTrack } from '../../hooks/useOfflineTrack';
import type { Track } from '../../types';

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  visibleColumnIds: string[];
  gridColumns: string;
}

function OfflineButton({ trackId }: { trackId: string }) {
  const { isOffline, isDownloading, downloadProgress, download, remove } = useOfflineTrack(trackId);

  if (isDownloading) {
    return (
      <div
        className="relative p-1 text-purple-400"
        title={`Downloading... ${downloadProgress}%`}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {downloadProgress > 0 && downloadProgress < 100 && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-medium">
            {downloadProgress}%
          </span>
        )}
      </div>
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

function FavoriteButton({ trackId }: { trackId: string }) {
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check favorite status on first render
  const checkStatus = async () => {
    if (isFavorite !== null) return;
    try {
      const status = await favoritesApi.check(trackId);
      setIsFavorite(status.is_favorite);
    } catch {
      // Silently fail - user may not be logged in
    }
  };

  // Lazy load the status
  if (isFavorite === null) {
    checkStatus();
  }

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoading) return;

    setIsLoading(true);
    try {
      const result = await favoritesApi.toggle(trackId);
      setIsFavorite(result.is_favorite);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={toggleFavorite}
      disabled={isLoading}
      className={`p-1 transition-colors ${
        isFavorite
          ? 'text-pink-500 hover:text-pink-400'
          : 'text-zinc-500 hover:text-pink-400 opacity-0 group-hover:opacity-100'
      } ${isLoading ? 'animate-pulse' : ''}`}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} />
    </button>
  );
}

function TrackRow({ track, index, isCurrentTrack, isPlaying, onPlay, visibleColumnIds, gridColumns }: TrackRowProps) {
  return (
    <div
      data-testid="track-row"
      onClick={onPlay}
      className={`group grid gap-4 px-4 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer ${
        isCurrentTrack ? 'bg-zinc-800/50' : ''
      }`}
      style={{ gridTemplateColumns: gridColumns }}
    >
      {/* Index / Play button column */}
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
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          className="hidden group-hover:flex items-center justify-center"
        >
          {isCurrentTrack && isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4" fill="currentColor" />
          )}
        </button>
      </div>

      {/* Title column (always visible) */}
      <div className="min-w-0">
        <div className={`truncate ${isCurrentTrack ? 'text-green-500' : ''}`}>
          {track.title || 'Unknown'}
        </div>
      </div>

      {/* Dynamic columns */}
      {visibleColumnIds.map((colId) => {
        const colDef = getColumnDef(colId);
        if (!colDef) return null;

        const rawValue = colDef.getValue(track);
        const displayValue = colDef.format && rawValue != null
          ? colDef.format(rawValue)
          : rawValue ?? '-';

        return (
          <div
            key={colId}
            className={`text-zinc-400 truncate ${
              colDef.align === 'right' ? 'text-right' :
              colDef.align === 'center' ? 'text-center' : ''
            }`}
          >
            {displayValue}
          </div>
        );
      })}

      {/* Favorite button */}
      <div className="flex items-center justify-center">
        <FavoriteButton trackId={track.id} />
      </div>

      {/* Offline button */}
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
  const columns = useColumnStore((state) => state.columns);
  const reorderColumns = useColumnStore((state) => state.reorderColumns);

  // Drag & drop state
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Get visible column IDs in order
  const visibleColumnIds = useMemo(() => getVisibleColumns(columns), [columns]);

  // Check if any analysis columns are visible
  const analysisColumnIds = useMemo(
    () => new Set(getAnalysisColumns().map((c) => c.id)),
    []
  );
  const needsFeatures = useMemo(
    () => visibleColumnIds.some((id) => analysisColumnIds.has(id)),
    [visibleColumnIds, analysisColumnIds]
  );

  // Build grid template columns
  const gridColumns = useMemo(() => {
    const cols: string[] = ['3rem']; // Index column
    cols.push('1fr'); // Title (always visible)

    for (const colId of visibleColumnIds) {
      const colDef = COLUMN_DEFINITIONS.find((d) => d.id === colId);
      cols.push(colDef?.width || '1fr');
    }

    cols.push('3rem', '3rem'); // Favorite, Offline
    return cols.join(' ');
  }, [visibleColumnIds]);

  // Drag handlers for column reordering
  const handleDragStart = (colId: string) => {
    setDraggedColId(colId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (draggedColId && draggedColId !== colId) {
      setDropTargetId(colId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (draggedColId && draggedColId !== targetColId) {
      // Find indices in the full columns array (not just visible)
      const fromIndex = columns.findIndex((c) => c.id === draggedColId);
      const toIndex = columns.findIndex((c) => c.id === targetColId);
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderColumns(fromIndex, toIndex);
      }
    }
    setDraggedColId(null);
    setDropTargetId(null);
  };

  const handleDragEnd = () => {
    setDraggedColId(null);
    setDropTargetId(null);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracks', { search, artist, album, include_features: needsFeatures }],
    queryFn: () => tracksApi.list({
      search,
      artist,
      album,
      page_size: 100,
      include_features: needsFeatures,
    }),
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
    // Different messages based on whether there's a filter applied
    const hasFilters = search || artist || album;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        {hasFilters ? (
          <>
            <Music className="w-12 h-12 mb-4 opacity-50" />
            <p>No tracks match your search</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </>
        ) : (
          <>
            <FolderOpen className="w-12 h-12 mb-4 opacity-50" />
            <p>Your library is empty</p>
            <p className="text-sm mt-1">Add music folders in Settings to get started</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="grid gap-4 px-4 py-2 text-sm text-zinc-400 border-b border-zinc-800"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <div>#</div>
        <div>Title</div>
        {visibleColumnIds.map((colId) => {
          const colDef = getColumnDef(colId);
          if (!colDef) return null;
          const isDragging = draggedColId === colId;
          const isDropTarget = dropTargetId === colId;
          return (
            <div
              key={colId}
              draggable
              onDragStart={() => handleDragStart(colId)}
              onDragOver={(e) => handleDragOver(e, colId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, colId)}
              onDragEnd={handleDragEnd}
              className={`cursor-grab select-none ${
                colDef.align === 'right' ? 'text-right' :
                colDef.align === 'center' ? 'text-center' : ''
              } ${isDragging ? 'opacity-50' : ''} ${
                isDropTarget ? 'border-l-2 border-green-500' : ''
              }`}
              title={`${colDef.label} (drag to reorder)`}
            >
              {colDef.shortLabel || colDef.label}
            </div>
          );
        })}
        <div></div>
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
            visibleColumnIds={visibleColumnIds}
            gridColumns={gridColumns}
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
