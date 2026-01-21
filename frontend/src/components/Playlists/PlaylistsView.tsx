import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles, Play, MoreVertical, Trash2, Loader2,
  ChevronDown, ChevronUp, ListMusic, Heart
} from 'lucide-react';
import { playlistsApi } from '../../api/client';
import type { Playlist, SmartPlaylist } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import { PlaylistDetail } from './PlaylistDetail';
import { FavoritesDetail } from './FavoritesDetail';
import { SmartPlaylistList, SmartPlaylistDetail } from '../SmartPlaylists';
import { NewReleasesView } from '../NewReleases';
import { useFavorites } from '../../hooks/useFavorites';

type ViewMode = 'list' | 'detail' | 'favorites' | 'smart-detail';

interface SelectedPlaylist {
  type: 'static' | 'smart';
  id: string;
}

interface Props {
  selectedPlaylistId?: string | null;
  onPlaylistViewed?: () => void;
}

export function PlaylistsView({ selectedPlaylistId, onPlaylistViewed }: Props = {}) {
  const queryClient = useQueryClient();
  const { setQueue } = usePlayerStore();
  const { total: favoritesCount } = useFavorites();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get playlist ID and view from URL
  const urlPlaylistId = searchParams.get('playlist');
  const urlView = searchParams.get('view');

  // Derive view mode from URL params
  const getViewModeFromUrl = useCallback((): ViewMode => {
    if (urlView === 'favorites') return 'favorites';
    if (urlPlaylistId) return 'detail';
    return 'list';
  }, [urlPlaylistId, urlView]);

  const [viewMode, setViewModeState] = useState<ViewMode>(getViewModeFromUrl);
  const [selectedPlaylist, setSelectedPlaylistState] = useState<SelectedPlaylist | null>(
    urlPlaylistId ? { type: 'static', id: urlPlaylistId } : null
  );
  const [selectedSmartPlaylist, setSelectedSmartPlaylist] = useState<SmartPlaylist | null>(null);
  const [showAiPlaylists, setShowAiPlaylists] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Sync URL params to state when they change
  useEffect(() => {
    const newViewMode = getViewModeFromUrl();
    setViewModeState(newViewMode);
    if (urlPlaylistId) {
      setSelectedPlaylistState({ type: 'static', id: urlPlaylistId });
    } else if (newViewMode === 'list') {
      setSelectedPlaylistState(null);
    }
  }, [urlPlaylistId, urlView, getViewModeFromUrl]);

  // Helper to update URL and state together
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    if (mode === 'favorites') {
      setSearchParams({ view: 'favorites' });
    } else if (mode === 'list') {
      // Clear playlist-related params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('playlist');
      newParams.delete('view');
      setSearchParams(newParams);
    }
  }, [searchParams, setSearchParams]);

  const setSelectedPlaylist = useCallback((playlist: SelectedPlaylist | null) => {
    setSelectedPlaylistState(playlist);
    if (playlist) {
      setSearchParams({ playlist: playlist.id });
      setViewModeState('detail');
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('playlist');
      newParams.delete('view');
      setSearchParams(newParams);
      setViewModeState('list');
    }
  }, [searchParams, setSearchParams]);

  // Auto-navigate to playlist when selectedPlaylistId is provided (e.g., from LLM creation)
  useEffect(() => {
    if (selectedPlaylistId) {
      setSelectedPlaylist({ type: 'static', id: selectedPlaylistId });
      setShowAiPlaylists(true);
      onPlaylistViewed?.();
    }
  }, [selectedPlaylistId, onPlaylistViewed, setSelectedPlaylist]);

  // Fetch AI-generated playlists (static playlists)
  const { data: aiPlaylists, isLoading: loadingAi } = useQuery({
    queryKey: ['playlists', 'ai'],
    queryFn: () => playlistsApi.list(true),
    select: (data) => data.filter(p => p.is_auto_generated),
  });

  const deleteMutation = useMutation({
    mutationFn: playlistsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });

  const playMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const playlist = await playlistsApi.get(playlistId);
      return playlist.tracks;
    },
    onSuccess: (tracks) => {
      if (tracks.length > 0) {
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
          duration_seconds: t.duration_seconds || null,
          format: null,
          analysis_version: 0,
        }));
        setQueue(queueTracks);
      }
    },
  });

  const handleSelectPlaylist = (playlist: Playlist) => {
    setSelectedPlaylist({ type: 'static', id: playlist.id });
  };

  const handleSelectSmartPlaylist = (playlist: SmartPlaylist) => {
    setSelectedSmartPlaylist(playlist);
    setViewModeState('smart-detail');
  };

  const handleBack = () => {
    setSelectedPlaylist(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this playlist?')) {
      deleteMutation.mutate(id);
    }
    setMenuOpen(null);
  };

  const handlePlay = (id: string) => {
    playMutation.mutate(id);
  };

  // Show favorites view
  if (viewMode === 'favorites') {
    return (
      <FavoritesDetail onBack={handleBack} />
    );
  }

  // Show smart playlist detail view
  if (viewMode === 'smart-detail' && selectedSmartPlaylist) {
    return (
      <SmartPlaylistDetail
        playlist={selectedSmartPlaylist}
        onBack={() => {
          setSelectedSmartPlaylist(null);
          setViewModeState('list');
        }}
      />
    );
  }

  // Show detail view if a playlist is selected
  if (viewMode === 'detail' && selectedPlaylist?.type === 'static') {
    return (
      <PlaylistDetail
        playlistId={selectedPlaylist.id}
        onBack={handleBack}
      />
    );
  }

  const hasAiPlaylists = aiPlaylists && aiPlaylists.length > 0;

  return (
    <div className="space-y-6">
      {/* Favorites Section - Always at top */}
      <button
        onClick={() => setViewMode('favorites')}
        className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-pink-500/10 to-purple-500/10 hover:from-pink-500/20 hover:to-purple-500/20 rounded-lg border border-pink-500/20 transition-colors"
      >
        <div className="p-2 rounded-full bg-pink-500/20">
          <Heart className="w-5 h-5 text-pink-500" fill="currentColor" />
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold">Favorites</div>
          <div className="text-sm text-zinc-400">{favoritesCount} tracks</div>
        </div>
      </button>

      {/* AI-Generated Playlists Section */}
      {hasAiPlaylists && (
        <div>
          <button
            onClick={() => setShowAiPlaylists(!showAiPlaylists)}
            className="w-full flex items-center justify-between px-2 py-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span className="font-semibold">AI Playlists</span>
              <span className="text-sm text-zinc-500">({aiPlaylists.length})</span>
            </div>
            {showAiPlaylists ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          {showAiPlaylists && (
            <div className="mt-2 space-y-2">
              {loadingAi ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                </div>
              ) : (
                aiPlaylists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="group flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    {/* Play button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlay(playlist.id);
                      }}
                      disabled={playMutation.isPending}
                      className="p-2 bg-purple-600 hover:bg-purple-500 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    >
                      {playMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" fill="currentColor" />
                      )}
                    </button>

                    {/* Info */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleSelectPlaylist(playlist)}
                    >
                      <div className="font-medium truncate flex items-center gap-2">
                        {playlist.name}
                      </div>
                      <div className="text-sm text-zinc-400 flex items-center gap-2">
                        <span>{playlist.track_count} tracks</span>
                        {playlist.generation_prompt && (
                          <>
                            <span className="text-zinc-600">|</span>
                            <span className="truncate max-w-xs text-purple-400/70">
                              "{playlist.generation_prompt}"
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(menuOpen === playlist.id ? null : playlist.id);
                        }}
                        className="p-1 hover:bg-zinc-700 rounded-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="w-5 h-5 text-zinc-400" />
                      </button>

                      {menuOpen === playlist.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpen(null)}
                          />
                          <div className="absolute right-0 top-8 w-32 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 py-1">
                            <button
                              onClick={() => handleDelete(playlist.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2 text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* New Releases Section */}
      <NewReleasesView />

      {/* Smart Playlists Section */}
      <SmartPlaylistList onSelectPlaylist={handleSelectSmartPlaylist} />

      {/* Empty state */}
      {!hasAiPlaylists && !loadingAi && (
        <div className="text-center py-8 text-zinc-500 border-t border-zinc-800 mt-4 pt-8">
          <ListMusic className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No AI-generated playlists yet</p>
          <p className="text-sm mt-1">Ask Familiar to create a playlist for you</p>
        </div>
      )}
    </div>
  );
}
