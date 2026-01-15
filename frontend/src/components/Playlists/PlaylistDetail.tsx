import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Loader2, Music, Sparkles, Clock, Download, Check, WifiOff, Heart, GripVertical, X, ListPlus, Trash2 } from 'lucide-react';
import { playlistsApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useFavorites } from '../../hooks/useFavorites';
import { RecommendationsPanel } from './RecommendationsPanel';
import * as offlineService from '../../services/offlineService';
import { TrackContextMenu } from '../Library/TrackContextMenu';
import type { ContextMenuState } from '../Library/types';
import { initialContextMenuState } from '../Library/types';
import type { Track } from '../../types';
import type { PlaylistDetail as PlaylistDetailType } from '../../api/client';

interface Props {
  playlistId: string;
  onBack: () => void;
}

export function PlaylistDetail({ playlistId, onBack }: Props) {
  const queryClient = useQueryClient();
  const { currentTrack, isPlaying, setQueue, addToQueue, setIsPlaying } = usePlayerStore();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const [offlineTrackIds, setOfflineTrackIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(initialContextMenuState);
  const [, setSearchParams] = useSearchParams();

  // Drag-to-reorder state
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Selection state
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  // Context menu handlers
  const handleContextMenu = useCallback((track: Track, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      track,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(initialContextMenuState);
  }, []);

  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => playlistsApi.get(playlistId),
  });

  // Check which tracks are already offline
  useEffect(() => {
    const checkOfflineStatus = async () => {
      const ids = await offlineService.getOfflineTrackIds();
      setOfflineTrackIds(new Set(ids));
    };
    checkOfflineStatus();
  }, []);

  const handleDownloadPlaylist = async () => {
    if (!playlist || playlist.tracks.length === 0) return;

    // Get tracks that need to be downloaded
    const tracksToDownload = playlist.tracks.filter(
      (t) => !offlineTrackIds.has(t.id)
    );
    if (tracksToDownload.length === 0) return;

    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: tracksToDownload.length });

    try {
      await offlineService.downloadTracksForOffline(
        tracksToDownload.map((t) => t.id),
        (progress) => {
          setDownloadProgress({
            current: progress.currentTrack,
            total: progress.totalTracks,
          });
          // Update offline IDs as tracks complete
          if (progress.currentTrackProgress === 100) {
            const completedTrack = tracksToDownload[progress.currentTrack - 1];
            if (completedTrack) {
              setOfflineTrackIds((prev) => new Set([...prev, completedTrack.id]));
            }
          }
        }
      );
      // Final update to ensure all are marked
      const ids = await offlineService.getOfflineTrackIds();
      setOfflineTrackIds(new Set(ids));
    } catch (error) {
      console.error('Failed to download playlist:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const allTracksOffline = playlist?.tracks.every(t => offlineTrackIds.has(t.id)) ?? false;
  const offlineCount = playlist?.tracks.filter(t => offlineTrackIds.has(t.id)).length ?? 0;

  const handlePlay = (startIndex = 0) => {
    if (!playlist || playlist.tracks.length === 0) return;

    // If clicking on the currently playing track, toggle play/pause
    const clickedTrack = playlist.tracks[startIndex];
    if (clickedTrack && currentTrack?.id === clickedTrack.id) {
      setIsPlaying(!isPlaying);
      return;
    }

    const queueTracks = playlist.tracks.map(t => ({
      id: t.id,
      file_path: '',
      title: t.title || 'Unknown',
      artist: t.artist || 'Unknown',
      album: t.album || null,
      album_artist: null,
      album_type: 'album' as const,
      track_number: null,
      disc_number: null,
      year: null,
      genre: null,
      duration_seconds: t.duration_seconds || null,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, startIndex);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Drag-to-reorder handlers
  const handleDragStart = useCallback((trackId: string, e: React.DragEvent) => {
    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', trackId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (targetId !== draggedTrackId) {
      setDropTargetId(targetId);
    }
  }, [draggedTrackId]);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(async (targetId: string) => {
    if (!playlist || !draggedTrackId || draggedTrackId === targetId) {
      setDraggedTrackId(null);
      setDropTargetId(null);
      return;
    }

    const tracks = [...playlist.tracks];
    const draggedIndex = tracks.findIndex(t => t.id === draggedTrackId);
    const targetIndex = tracks.findIndex(t => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTrackId(null);
      setDropTargetId(null);
      return;
    }

    // Remove dragged track and insert at target position
    const [draggedTrack] = tracks.splice(draggedIndex, 1);
    tracks.splice(targetIndex, 0, draggedTrack);

    // Optimistic update
    queryClient.setQueryData(['playlist', playlistId], (old: PlaylistDetailType | undefined) => {
      if (!old) return old;
      return { ...old, tracks };
    });

    setDraggedTrackId(null);
    setDropTargetId(null);

    // Persist to backend
    try {
      await playlistsApi.reorderTracks(playlistId, tracks.map(t => t.id));
    } catch (error) {
      console.error('Failed to reorder tracks:', error);
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
    }
  }, [playlist, draggedTrackId, playlistId, queryClient]);

  const handleDragEnd = useCallback(() => {
    setDraggedTrackId(null);
    setDropTargetId(null);
  }, []);

  // Selection handlers
  const handleTrackClick = useCallback((trackId: string, idx: number, e: React.MouseEvent) => {
    if (!playlist) return;

    if (e.shiftKey && lastClickedId) {
      // Shift-click: select range
      const lastIdx = playlist.tracks.findIndex(t => t.id === lastClickedId);
      const currentIdx = idx;
      const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
      const rangeIds = playlist.tracks.slice(start, end + 1).map(t => t.id);
      setSelectedTrackIds(new Set([...selectedTrackIds, ...rangeIds]));
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle single selection
      const newSet = new Set(selectedTrackIds);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      setSelectedTrackIds(newSet);
      setLastClickedId(trackId);
    } else {
      // Normal click: play track
      handlePlay(idx);
      setSelectedTrackIds(new Set());
      setLastClickedId(trackId);
    }
  }, [playlist, lastClickedId, selectedTrackIds]);

  // Bulk action handlers
  const handleQueueSelected = useCallback(() => {
    if (!playlist) return;
    const selectedTracks = playlist.tracks.filter(t => selectedTrackIds.has(t.id));
    selectedTracks.forEach(track => {
      addToQueue({
        id: track.id,
        file_path: '',
        title: track.title || 'Unknown',
        artist: track.artist || 'Unknown',
        album: track.album || null,
        album_artist: null,
        album_type: 'album',
        track_number: null,
        disc_number: null,
        year: null,
        genre: null,
        duration_seconds: track.duration_seconds || null,
        format: null,
        analysis_version: 0,
      });
    });
    setSelectedTrackIds(new Set());
  }, [playlist, selectedTrackIds, addToQueue]);

  const handleRemoveSelected = useCallback(async () => {
    if (!playlist) return;
    const remainingTracks = playlist.tracks.filter(t => !selectedTrackIds.has(t.id));

    // Optimistic update
    queryClient.setQueryData(['playlist', playlistId], (old: PlaylistDetailType | undefined) => {
      if (!old) return old;
      return { ...old, tracks: remainingTracks };
    });

    setSelectedTrackIds(new Set());

    // Persist by reordering with only remaining tracks
    try {
      await playlistsApi.reorderTracks(playlistId, remainingTracks.map(t => t.id));
    } catch (error) {
      console.error('Failed to remove tracks:', error);
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
    }
  }, [playlist, selectedTrackIds, playlistId, queryClient]);

  const totalDuration = playlist?.tracks.reduce(
    (sum, t) => sum + (t.duration_seconds || 0),
    0
  ) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>Playlist not found</p>
        <button
          onClick={onBack}
          className="mt-4 text-green-500 hover:text-green-400"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            {playlist.is_auto_generated && (
              <Sparkles className="w-5 h-5 text-purple-400" />
            )}
            <h2 className="text-xl font-bold">{playlist.name}</h2>
          </div>

          {playlist.description && (
            <p className="text-sm text-zinc-400 mt-1">{playlist.description}</p>
          )}

          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
            <span>{playlist.tracks.length} tracks</span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {Math.floor(totalDuration / 60)} min
            </span>
            {playlist.is_auto_generated && playlist.generation_prompt && (
              <span className="text-purple-400/70 truncate max-w-xs">
                "{playlist.generation_prompt}"
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePlay()}
            disabled={playlist.tracks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 rounded-full transition-colors"
          >
            <Play className="w-4 h-4" fill="currentColor" />
            Play
          </button>

          <button
            onClick={handleDownloadPlaylist}
            disabled={playlist.tracks.length === 0 || isDownloading || allTracksOffline}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:hover:bg-zinc-700 rounded-full transition-colors"
            title={allTracksOffline ? 'All tracks downloaded' : 'Download for offline'}
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">
                  {downloadProgress.current}/{downloadProgress.total}
                </span>
              </>
            ) : allTracksOffline ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span>Offline</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  {offlineCount > 0 ? `${offlineCount}/${playlist.tracks.length}` : 'Download'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selectedTrackIds.size > 0 && (
        <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm p-3 rounded-lg flex items-center gap-3 border border-zinc-700">
          <span className="text-sm text-zinc-300 font-medium">
            {selectedTrackIds.size} track{selectedTrackIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={handleQueueSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-md text-sm transition-colors"
          >
            <ListPlus className="w-4 h-4" />
            Add to Queue
          </button>
          <button
            onClick={handleRemoveSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-md text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
          <button
            onClick={() => setSelectedTrackIds(new Set())}
            className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Track list */}
      {playlist.tracks.length > 0 ? (
        <div className="space-y-1">
          {playlist.tracks.map((track, idx) => {
            // Convert playlist track to full Track type for context menu
            const fullTrack: Track = {
              id: track.id,
              file_path: '',
              title: track.title || null,
              artist: track.artist || null,
              album: track.album || null,
              album_artist: null,
              album_type: 'album',
              track_number: null,
              disc_number: null,
              year: null,
              genre: null,
              duration_seconds: track.duration_seconds || null,
              format: null,
              analysis_version: 0,
            };
            const isSelected = selectedTrackIds.has(track.id);
            const isDragged = draggedTrackId === track.id;
            const isDropTarget = dropTargetId === track.id;
            return (
            <div
              key={track.id}
              draggable
              onDragStart={(e) => handleDragStart(track.id, e)}
              onDragOver={(e) => handleDragOver(e, track.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(track.id)}
              onDragEnd={handleDragEnd}
              onClick={(e) => handleTrackClick(track.id, idx, e)}
              onContextMenu={(e) => handleContextMenu(fullTrack, e)}
              className={`group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all ${
                currentTrack?.id === track.id ? 'bg-zinc-800/30' : ''
              } ${isSelected ? 'bg-green-900/30 ring-1 ring-green-500/50' : ''
              } ${isDragged ? 'opacity-50' : ''
              } ${isDropTarget ? 'border-t-2 border-green-500' : ''}`}
            >
              {/* Drag handle */}
              <div className="w-4 flex-shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity">
                <GripVertical className="w-4 h-4 text-zinc-500" />
              </div>

              {/* Track number / Play button */}
              <div className="w-8 text-center">
                {currentTrack?.id === track.id && isPlaying ? (
                  <>
                    <div className="group-hover:hidden flex justify-center gap-0.5">
                      <div className="w-0.5 h-3 bg-green-500 animate-pulse" />
                      <div className="w-0.5 h-3 bg-green-500 animate-pulse [animation-delay:0.2s]" />
                      <div className="w-0.5 h-3 bg-green-500 animate-pulse [animation-delay:0.4s]" />
                    </div>
                    <Pause
                      className="hidden group-hover:block w-4 h-4 mx-auto text-white"
                      fill="currentColor"
                    />
                  </>
                ) : currentTrack?.id === track.id ? (
                  <>
                    <span className="group-hover:hidden text-sm text-green-500">{idx + 1}</span>
                    <Play
                      className="hidden group-hover:block w-4 h-4 mx-auto text-white"
                      fill="currentColor"
                    />
                  </>
                ) : (
                  <>
                    <span className="group-hover:hidden text-sm text-zinc-500">{idx + 1}</span>
                    <Play
                      className="hidden group-hover:block w-4 h-4 mx-auto text-white"
                      fill="currentColor"
                    />
                  </>
                )}
              </div>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${currentTrack?.id === track.id ? 'text-green-500' : ''}`}>
                  {track.title || 'Unknown Title'}
                </div>
                <div className="text-sm text-zinc-400 truncate">
                  {track.artist || 'Unknown Artist'}
                  {track.album && (
                    <span className="text-zinc-500"> • {track.album}</span>
                  )}
                </div>
              </div>

              {/* Favorite button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(track.id);
                }}
                className={`p-1 transition-colors ${
                  isFavorite(track.id)
                    ? 'text-pink-500 hover:text-pink-400'
                    : 'text-zinc-500 hover:text-pink-400 opacity-0 group-hover:opacity-100'
                }`}
                title={isFavorite(track.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart className="w-4 h-4" fill={isFavorite(track.id) ? 'currentColor' : 'none'} />
              </button>

              {/* Offline indicator */}
              {offlineTrackIds.has(track.id) && (
                <span title="Available offline">
                  <WifiOff className="w-4 h-4 text-green-500" />
                </span>
              )}

              {/* Duration */}
              <div className="text-sm text-zinc-500">
                {formatDuration(track.duration_seconds)}
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No tracks in this playlist</p>
        </div>
      )}

      {/* Recommendations (only for AI-generated playlists) */}
      {playlist.is_auto_generated && (
        <RecommendationsPanel playlistId={playlistId} />
      )}

      {/* Context menu */}
      {contextMenu.isOpen && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          position={contextMenu.position}
          isSelected={false}
          onClose={closeContextMenu}
          onPlay={() => {
            const idx = playlist.tracks.findIndex(t => t.id === contextMenu.track?.id);
            if (idx !== -1) handlePlay(idx);
          }}
          onQueue={() => {
            if (contextMenu.track) {
              addToQueue(contextMenu.track);
            }
          }}
          onGoToArtist={() => {
            if (contextMenu.track?.artist) {
              setSearchParams({ artist: contextMenu.track.artist });
              window.location.hash = 'library';
            }
          }}
          onGoToAlbum={() => {
            if (contextMenu.track?.artist && contextMenu.track?.album) {
              setSearchParams({ artist: contextMenu.track.artist, album: contextMenu.track.album });
              window.location.hash = 'library';
            }
          }}
          onToggleSelect={() => {
            // Not applicable in playlists
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
          onEditMetadata={() => {
            if (contextMenu.track) {
              useSelectionStore.getState().setEditingTrackId(contextMenu.track.id);
            }
          }}
        />
      )}
    </div>
  );
}
