import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Play, MoreVertical, Trash2, Loader2,
  ChevronDown, ChevronUp, ListMusic
} from 'lucide-react';
import { playlistsApi } from '../../api/client';
import type { Playlist, SmartPlaylist } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import { PlaylistDetail } from './PlaylistDetail';
import { SmartPlaylistList } from '../SmartPlaylists/SmartPlaylistList';

type ViewMode = 'list' | 'detail';

interface SelectedPlaylist {
  type: 'static' | 'smart';
  id: string;
}

export function PlaylistsView() {
  const queryClient = useQueryClient();
  const { setQueue } = usePlayerStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedPlaylist, setSelectedPlaylist] = useState<SelectedPlaylist | null>(null);
  const [showAiPlaylists, setShowAiPlaylists] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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
    setViewMode('detail');
  };

  const handleSelectSmartPlaylist = (_playlist: SmartPlaylist) => {
    // Smart playlists use the SmartPlaylistList component directly
    // Detail view with recommendations is only for AI-generated static playlists
  };

  const handleBack = () => {
    setViewMode('list');
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
                      className="p-2 bg-purple-600 hover:bg-purple-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
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
                        className="p-1 hover:bg-zinc-700 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
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
