import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Play,
  Pause,
  Loader2,
  Music,
  Clock,
  Heart,
  Download,
  Check,
} from 'lucide-react';
import { libraryApi } from '../../api/client';
import { AlbumArtwork } from '../AlbumArtwork';
import { usePlayerStore } from '../../stores/playerStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useFavorites } from '../../hooks/useFavorites';
import { useOfflineTrack } from '../../hooks/useOfflineTrack';
import { useOfflineAlbum } from '../../hooks/useOfflineAlbum';
import { TrackContextMenu } from './TrackContextMenu';
import type { ContextMenuState } from './types';
import { initialContextMenuState } from './types';
import type { Track } from '../../types';
import { DiscoverySection, type DiscoveryItem, type DiscoveryGroup } from '../shared';

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
  const { isFavorite, toggle } = useFavorites();
  const favorited = isFavorite(trackId);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(trackId);
      }}
      className={`p-1 transition-colors ${
        favorited
          ? 'text-pink-500 hover:text-pink-400'
          : 'text-zinc-500 hover:text-pink-400 opacity-0 group-hover:opacity-100'
      }`}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart className="w-4 h-4" fill={favorited ? 'currentColor' : 'none'} />
    </button>
  );
}

interface AlbumTrack {
  id: string;
}

function AlbumOfflineButton({ tracks }: { tracks: AlbumTrack[] }) {
  const {
    offlineCount,
    totalCount,
    isFullyOffline,
    isPartiallyOffline,
    isDownloading,
    currentTrack,
    overallProgress,
    download,
    remove,
  } = useOfflineAlbum(tracks);

  if (isDownloading) {
    return (
      <button
        className="flex items-center gap-2 px-4 py-2 bg-zinc-700 rounded-full transition-colors"
        title={`Downloading track ${currentTrack} of ${totalCount}...`}
      >
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
        <span className="text-sm">{overallProgress}%</span>
      </button>
    );
  }

  if (isFullyOffline) {
    return (
      <button
        onClick={remove}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-full transition-colors"
        title="Remove offline copies"
      >
        <Check className="w-4 h-4 text-green-500" />
        <span className="text-sm">Downloaded</span>
      </button>
    );
  }

  return (
    <button
      onClick={download}
      className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-full transition-colors"
      title={isPartiallyOffline ? `Download remaining ${totalCount - offlineCount} tracks` : 'Download album for offline'}
    >
      <Download className="w-4 h-4" />
      <span className="text-sm">
        {isPartiallyOffline ? `${offlineCount}/${totalCount}` : 'Download'}
      </span>
    </button>
  );
}

interface Props {
  artistName: string;
  albumName: string;
  onBack: () => void;
  onGoToArtist?: (artistName: string) => void;
  onGoToAlbum?: (artistName: string, albumName: string) => void;
  onGoToYear?: (year: number) => void;
  onGoToGenre?: (genre: string) => void;
}

export function AlbumDetail({
  artistName,
  albumName,
  onBack,
  onGoToArtist,
  onGoToAlbum,
  onGoToYear,
  onGoToGenre,
}: Props) {
  const { currentTrack, isPlaying, setQueue, addToQueue, setIsPlaying } =
    usePlayerStore();
  const [contextMenu, setContextMenu] =
    useState<ContextMenuState>(initialContextMenuState);

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

  const { data: album, isLoading } = useQuery({
    queryKey: ['album', artistName, albumName],
    queryFn: () => libraryApi.getAlbum(artistName, albumName),
  });

  const handlePlayAll = () => {
    if (!album || album.tracks.length === 0) return;

    const queueTracks = album.tracks.map((t) => ({
      id: t.id,
      file_path: '',
      title: t.title || 'Unknown',
      artist: album.artist,
      album: album.name,
      album_artist: album.album_artist,
      album_type: 'album' as const,
      track_number: t.track_number,
      disc_number: t.disc_number,
      year: album.year,
      genre: album.genre,
      duration_seconds: t.duration_seconds,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, 0);
  };

  const handlePlayTrack = (trackIndex: number) => {
    if (!album || album.tracks.length === 0) return;

    const clickedTrack = album.tracks[trackIndex];
    if (clickedTrack && currentTrack?.id === clickedTrack.id) {
      setIsPlaying(!isPlaying);
      return;
    }

    const queueTracks = album.tracks.map((t) => ({
      id: t.id,
      file_path: '',
      title: t.title || 'Unknown',
      artist: album.artist,
      album: album.name,
      album_artist: album.album_artist,
      album_type: 'album' as const,
      track_number: t.track_number,
      disc_number: t.disc_number,
      year: album.year,
      genre: album.genre,
      duration_seconds: t.duration_seconds,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, trackIndex);
  };

  const handlePlayOtherAlbum = async (artistName: string, albumName: string) => {
    try {
      const otherAlbum = await libraryApi.getAlbum(artistName, albumName);
      if (otherAlbum.tracks.length === 0) return;

      const queueTracks = otherAlbum.tracks.map((t) => ({
        id: t.id,
        file_path: '',
        title: t.title || 'Unknown',
        artist: otherAlbum.artist,
        album: otherAlbum.name,
        album_artist: otherAlbum.album_artist,
        album_type: 'album' as const,
        track_number: t.track_number,
        disc_number: t.disc_number,
        year: otherAlbum.year,
        genre: otherAlbum.genre,
        duration_seconds: t.duration_seconds,
        format: null,
        analysis_version: 0,
      }));
      setQueue(queueTracks, 0);
    } catch (error) {
      console.error('Failed to play album:', error);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins} min`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>Album not found</p>
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
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Album artwork */}
        <div className="w-40 h-40 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
          <AlbumArtwork
            artist={album.artist}
            album={album.name}
            trackId={album.first_track_id}
            size="full"
            className="w-full h-full"
          />
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold truncate">{album.name}</h2>

          {/* Artist link */}
          <button
            onClick={() => onGoToArtist?.(album.artist)}
            className="text-lg text-zinc-400 hover:text-white hover:underline transition-colors"
          >
            {album.artist}
          </button>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
            {album.year && (
              <button
                onClick={() => onGoToYear?.(album.year!)}
                className="flex items-center gap-1 hover:text-white hover:underline transition-colors"
              >
                {album.year}
              </button>
            )}
            <span className="flex items-center gap-1">
              <Music className="w-4 h-4" />
              {album.track_count} tracks
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatTotalDuration(album.total_duration_seconds)}
            </span>
          </div>

          {/* Genre */}
          {album.genre && (
            <div className="mt-2">
              <button
                onClick={() => onGoToGenre?.(album.genre!)}
                className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              >
                {album.genre}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayAll}
            disabled={album.tracks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-full transition-colors"
          >
            <Play className="w-4 h-4" fill="currentColor" />
            Play
          </button>
          <AlbumOfflineButton tracks={album.tracks} />
        </div>
      </div>

      {/* Tracks */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Tracks</h3>
        <div className="space-y-1">
          {album.tracks.map((track, idx) => {
            const fullTrack: Track = {
              id: track.id,
              file_path: '',
              title: track.title || null,
              artist: album.artist,
              album: album.name,
              album_artist: album.album_artist,
              album_type: 'album',
              track_number: track.track_number,
              disc_number: track.disc_number,
              year: album.year,
              genre: album.genre,
              duration_seconds: track.duration_seconds,
              format: null,
              analysis_version: 0,
            };
            return (
              <div
                key={track.id}
                onClick={() => handlePlayTrack(idx)}
                onContextMenu={(e) => handleContextMenu(fullTrack, e)}
                className={`group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors ${
                  currentTrack?.id === track.id ? 'bg-zinc-800/30' : ''
                }`}
              >
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
                      <span className="group-hover:hidden text-sm text-green-500">
                        {track.track_number || idx + 1}
                      </span>
                      <Play
                        className="hidden group-hover:block w-4 h-4 mx-auto text-white"
                        fill="currentColor"
                      />
                    </>
                  ) : (
                    <>
                      <span className="group-hover:hidden text-sm text-zinc-500">
                        {track.track_number || idx + 1}
                      </span>
                      <Play
                        className="hidden group-hover:block w-4 h-4 mx-auto text-white"
                        fill="currentColor"
                      />
                    </>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className={`font-medium truncate ${currentTrack?.id === track.id ? 'text-green-500' : ''}`}
                  >
                    {track.title || 'Unknown Title'}
                  </div>
                </div>

                <div className="text-sm text-zinc-500">
                  {formatDuration(track.duration_seconds)}
                </div>

                <FavoriteButton trackId={track.id} />
                <OfflineButton trackId={track.id} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Discovery section - More from Artist + Similar Albums */}
      {(album.other_albums_by_artist.length > 0 || album.similar_albums.length > 0 || album.discover_albums.length > 0) && (() => {
        const sections: DiscoveryGroup[] = [];

        // More from Artist section
        if (album.other_albums_by_artist.length > 0) {
          sections.push({
            id: 'more-from-artist',
            title: `More from ${album.artist}`,
            type: 'album',
            items: album.other_albums_by_artist.map((other) => ({
              id: other.first_track_id,
              name: other.name,
              subtitle: [other.year, `${other.track_count} tracks`].filter(Boolean).join(' · '),
              inLibrary: true,
              artist: other.artist,
              album: other.name,
            })),
          });
        }

        // Similar Albums section (combining in-library and external)
        const similarItems: DiscoveryItem[] = [
          ...album.similar_albums.map((similar) => ({
            id: similar.first_track_id,
            name: similar.name,
            subtitle: similar.artist,
            matchScore: similar.similarity_score,
            inLibrary: true,
            artist: similar.artist,
            album: similar.name,
          })),
          ...album.discover_albums.map((discover) => ({
            name: discover.name,
            subtitle: discover.artist,
            imageUrl: discover.image_url || undefined,
            inLibrary: false,
            externalLinks: {
              bandcamp: discover.bandcamp_url || undefined,
              lastfm: discover.lastfm_url || undefined,
            },
          })),
        ];

        if (similarItems.length > 0) {
          sections.push({
            id: 'similar-albums',
            title: 'Similar Albums',
            type: 'album',
            items: similarItems,
          });
        }

        return (
          <DiscoverySection
            title="Discover"
            sections={sections}
            collapsible
            onItemClick={(item) => item.inLibrary && item.artist && onGoToAlbum?.(item.artist, item.name)}
            onPlay={(item) => item.artist && handlePlayOtherAlbum(item.artist, item.name)}
          />
        );
      })()}

      {/* Context menu */}
      {contextMenu.isOpen && contextMenu.track && (
        <TrackContextMenu
          track={contextMenu.track}
          position={contextMenu.position}
          isSelected={false}
          onClose={closeContextMenu}
          onPlay={() => {
            const idx = album.tracks.findIndex(
              (t) => t.id === contextMenu.track?.id
            );
            if (idx !== -1) handlePlayTrack(idx);
          }}
          onQueue={() => {
            if (contextMenu.track) {
              addToQueue(contextMenu.track);
            }
          }}
          onGoToArtist={() => {
            onGoToArtist?.(album.artist);
          }}
          onGoToAlbum={() => {
            // Already on this album
          }}
          onToggleSelect={() => {
            // Not applicable in album detail
          }}
          onAddToPlaylist={() => {
            
          }}
          onMakePlaylist={() => {
            if (contextMenu.track) {
              const track = contextMenu.track;
              const message = `Make me a playlist based on "${track.title || 'this track'}" by ${track.artist || 'Unknown Artist'}`;
              window.dispatchEvent(
                new CustomEvent('trigger-chat', { detail: { message } })
              );
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
