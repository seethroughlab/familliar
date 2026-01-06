/**
 * TrackList Browser - Traditional track list view.
 *
 * Wraps TrackList with BrowserProps interface for the pluggable browser system.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Pause, Download, Check, Loader2, Heart, Music, FolderOpen } from 'lucide-react';
import { tracksApi, favoritesApi } from '../../../api/client';
import { usePlayerStore } from '../../../stores/playerStore';
import { useColumnStore, getVisibleColumns } from '../../../stores/columnStore';
import { COLUMN_DEFINITIONS, getColumnDef, getAnalysisColumns } from '../columnDefinitions';
import { useOfflineTrack } from '../../../hooks/useOfflineTrack';
import { registerBrowser, type BrowserProps, type ContextMenuState, initialContextMenuState } from '../types';
import { TrackContextMenu } from '../TrackContextMenu';
import type { Track } from '../../../types';

// Register this browser
registerBrowser(
  {
    id: 'track-list',
    name: 'Tracks',
    description: 'Traditional track list with sortable columns',
    icon: 'List',
    category: 'traditional',
    requiresFeatures: false,
    requiresEmbeddings: false,
  },
  TrackListBrowser
);

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

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  onPlay: () => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  visibleColumnIds: string[];
  gridColumns: string;
}

// Mobile card component for small screens
function MobileTrackCard({
  track,
  index,
  isCurrentTrack,
  isPlaying,
  isSelected,
  onPlay,
  onClick,
  onContextMenu,
}: {
  track: Track;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  onPlay: () => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      data-testid="track-row"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-zinc-800/30 ${
        isSelected
          ? 'bg-purple-500/20'
          : isCurrentTrack
          ? 'bg-zinc-800/50'
          : 'hover:bg-zinc-800/50'
      }`}
    >
      {/* Play button / index */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center">
        <span className="group-hover:hidden text-zinc-400 text-sm">
          {isCurrentTrack && isPlaying ? (
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3 bg-green-500 animate-pulse" />
              <div className="w-0.5 h-2 bg-green-500 animate-pulse delay-75" />
              <div className="w-0.5 h-4 bg-green-500 animate-pulse delay-150" />
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

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <div className={`truncate font-medium ${isCurrentTrack ? 'text-green-500' : 'text-white'}`}>
          {track.title || 'Unknown'}
        </div>
        <div className="text-sm text-zinc-400 truncate">
          {track.artist || 'Unknown Artist'}
          {track.album && <span className="text-zinc-500"> • {track.album}</span>}
        </div>
      </div>

      {/* Duration */}
      <div className="text-sm text-zinc-400 flex-shrink-0">
        {formatDuration(track.duration_seconds)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <FavoriteButton trackId={track.id} />
        <OfflineButton trackId={track.id} />
      </div>
    </div>
  );
}

function TrackRow({
  track,
  index,
  isCurrentTrack,
  isPlaying,
  isSelected,
  onPlay,
  onClick,
  onContextMenu,
  visibleColumnIds,
  gridColumns,
}: TrackRowProps) {
  return (
    <div
      data-testid="track-row"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group grid gap-4 px-4 py-2 rounded-md cursor-pointer ${
        isSelected
          ? 'bg-purple-500/20 hover:bg-purple-500/30'
          : isCurrentTrack
          ? 'bg-zinc-800/50 hover:bg-zinc-800/70'
          : 'hover:bg-zinc-800/50'
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
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
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
        const displayValue =
          colDef.format && rawValue != null ? colDef.format(rawValue) : rawValue ?? '-';

        return (
          <div
            key={colId}
            className={`text-zinc-400 truncate ${
              colDef.align === 'right'
                ? 'text-right'
                : colDef.align === 'center'
                ? 'text-center'
                : ''
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

export function TrackListBrowser({
  filters,
  selectedTrackIds,
  onSelectTrack,
  onQueueTrack,
  onGoToArtist,
  onGoToAlbum,
}: BrowserProps) {
  const { currentTrack, isPlaying, setIsPlaying, setQueue } = usePlayerStore();
  const columns = useColumnStore((state) => state.columns);
  const reorderColumns = useColumnStore((state) => state.reorderColumns);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(initialContextMenuState);

  // Drag & drop state for columns
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
    queryKey: [
      'tracks',
      {
        search: filters.search,
        artist: filters.artist,
        album: filters.album,
        yearFrom: filters.yearFrom,
        yearTo: filters.yearTo,
        energyMin: filters.energyMin,
        energyMax: filters.energyMax,
        valenceMin: filters.valenceMin,
        valenceMax: filters.valenceMax,
        include_features: needsFeatures,
      },
    ],
    queryFn: () =>
      tracksApi.list({
        search: filters.search,
        artist: filters.artist,
        album: filters.album,
        year_from: filters.yearFrom,
        year_to: filters.yearTo,
        energy_min: filters.energyMin,
        energy_max: filters.energyMax,
        valence_min: filters.valenceMin,
        valence_max: filters.valenceMax,
        page_size: 100,
        include_features: needsFeatures,
      }),
  });

  const handlePlayTrack = useCallback(
    (track: Track, index: number) => {
      if (currentTrack?.id === track.id) {
        setIsPlaying(!isPlaying);
      } else if (data) {
        setQueue(data.items, index);
      }
    },
    [currentTrack, isPlaying, setIsPlaying, data, setQueue]
  );

  const handleRowClick = useCallback(
    (track: Track, e: React.MouseEvent) => {
      // If not multi-select click, play the track
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
        // Single click without modifier - just select (don't play)
        onSelectTrack(track.id, false);
      } else {
        // Multi-select
        onSelectTrack(track.id, true);
      }
    },
    [onSelectTrack]
  );

  const handleRowDoubleClick = useCallback(
    (track: Track, index: number) => {
      handlePlayTrack(track, index);
    },
    [handlePlayTrack]
  );

  const handleContextMenu = useCallback((track: Track, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      track,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(initialContextMenuState);
  }, []);

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
    const hasFilters = filters.search || filters.artist || filters.album;
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
      {/* Mobile view - card layout (visible below md breakpoint) */}
      <div className="md:hidden">
        {data.items.map((track, index) => (
          <MobileTrackCard
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrack?.id === track.id}
            isPlaying={currentTrack?.id === track.id && isPlaying}
            isSelected={selectedTrackIds.has(track.id)}
            onPlay={() => handlePlayTrack(track, index)}
            onClick={(e) => {
              if (e.detail === 2) {
                handleRowDoubleClick(track, index);
              } else {
                handleRowClick(track, e);
              }
            }}
            onContextMenu={(e) => handleContextMenu(track, e)}
          />
        ))}
        {/* Mobile footer */}
        <div className="px-4 py-4 text-sm text-zinc-500">{data.total} tracks</div>
      </div>

      {/* Desktop view - grid layout (visible at md and above) */}
      <div className="hidden md:block">
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
                  colDef.align === 'right'
                    ? 'text-right'
                    : colDef.align === 'center'
                    ? 'text-center'
                    : ''
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
              isSelected={selectedTrackIds.has(track.id)}
              onPlay={() => handlePlayTrack(track, index)}
              onClick={(e) => {
                if (e.detail === 2) {
                  handleRowDoubleClick(track, index);
                } else {
                  handleRowClick(track, e);
                }
              }}
              onContextMenu={(e) => handleContextMenu(track, e)}
              visibleColumnIds={visibleColumnIds}
              gridColumns={gridColumns}
            />
          ))}
        </div>

        {/* Desktop footer */}
        <div className="px-4 py-4 text-sm text-zinc-500">{data.total} tracks</div>
      </div>

      {/* Context menu */}
      {contextMenu.isOpen && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          position={contextMenu.position}
          isSelected={selectedTrackIds.has(contextMenu.track.id)}
          onClose={closeContextMenu}
          onPlay={() => {
            const index = data.items.findIndex((t) => t.id === contextMenu.track?.id);
            if (contextMenu.track && index !== -1) {
              handlePlayTrack(contextMenu.track, index);
            }
          }}
          onQueue={() => {
            if (contextMenu.track) {
              onQueueTrack(contextMenu.track.id);
            }
          }}
          onGoToArtist={() => {
            if (contextMenu.track?.artist) {
              onGoToArtist(contextMenu.track.artist);
            }
          }}
          onGoToAlbum={() => {
            if (contextMenu.track?.artist && contextMenu.track?.album) {
              onGoToAlbum(contextMenu.track.artist, contextMenu.track.album);
            }
          }}
          onToggleSelect={() => {
            if (contextMenu.track) {
              onSelectTrack(contextMenu.track.id, true);
            }
          }}
          onAddToPlaylist={() => {
            // TODO: Open playlist picker modal
            console.log('Add to playlist:', contextMenu.track?.id);
          }}
          onMakePlaylist={() => {
            if (contextMenu.track) {
              const track = contextMenu.track;
              const message = `Make me a playlist based on "${track.title || 'this track'}" by ${track.artist || 'Unknown Artist'}`;
              window.dispatchEvent(new CustomEvent('trigger-chat', { detail: { message } }));
            }
          }}
        />
      )}
    </div>
  );
}
