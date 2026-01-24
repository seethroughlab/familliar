import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Download, Music, Trash2, HardDrive } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useDownloadedTracks } from '../../hooks/useDownloadedTracks';
import { removeOfflineTrack } from '../../services/offlineService';
import { TrackContextMenu } from '../Library/TrackContextMenu';
import type { ContextMenuState } from '../Library/types';
import { initialContextMenuState } from '../Library/types';
import type { Track } from '../../types';

interface Props {
  onBack: () => void;
}

export function DownloadsDetail({ onBack }: Props) {
  const { currentTrack, isPlaying, setQueue, addToQueue, setIsPlaying } = usePlayerStore();
  const { tracks, total, totalSizeFormatted, refresh } = useDownloadedTracks();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(initialContextMenuState);
  const [, setSearchParams] = useSearchParams();

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

  const handlePlay = (startIndex = 0) => {
    if (tracks.length === 0) return;

    // If clicking on the currently playing track, toggle play/pause
    const clickedTrack = tracks[startIndex];
    if (clickedTrack && currentTrack?.id === clickedTrack.id) {
      setIsPlaying(!isPlaying);
      return;
    }

    const queueTracks = tracks.map(t => ({
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
      duration_seconds: null,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, startIndex);
  };

  const handleRemoveFromDownloads = async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeOfflineTrack(trackId);
      await refresh();
    } catch (error) {
      console.error('Failed to remove track from downloads:', error);
    }
  };

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
            <Download className="w-5 h-5 text-green-500" />
            <h2 className="text-xl font-bold">Downloads</h2>
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
            <span>{total} tracks</span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-4 h-4" />
              {totalSizeFormatted}
            </span>
          </div>
        </div>

        <button
          onClick={() => handlePlay()}
          disabled={tracks.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 rounded-full transition-colors"
        >
          <Play className="w-4 h-4" fill="currentColor" />
          Play
        </button>
      </div>

      {/* Track list */}
      {tracks.length > 0 ? (
        <div className="space-y-1">
          {tracks.map((track, idx) => {
            // Convert offline track to full Track type for context menu
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
              duration_seconds: null,
              format: null,
              analysis_version: 0,
            };
            return (
              <div
                key={track.id}
                onClick={() => handlePlay(idx)}
                onContextMenu={(e) => handleContextMenu(fullTrack, e)}
                className={`group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors ${
                  currentTrack?.id === track.id ? 'bg-zinc-800/30' : ''
                }`}
              >
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

                {/* Size */}
                <div className="text-xs text-zinc-500">
                  {track.sizeFormatted}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => handleRemoveFromDownloads(track.id, e)}
                  className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove from downloads"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No downloaded tracks yet</p>
          <p className="text-sm mt-1">Download tracks from playlists or the library for offline playback</p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu.isOpen && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          position={contextMenu.position}
          isSelected={false}
          onClose={closeContextMenu}
          onPlay={() => {
            const idx = tracks.findIndex(t => t.id === contextMenu.track?.id);
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
            // Not applicable in downloads
          }}
          onAddToPlaylist={() => {
            // TODO: Open playlist picker modal
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
