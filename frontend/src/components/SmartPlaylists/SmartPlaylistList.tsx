import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Plus, MoreVertical, Pencil, Trash2, RefreshCw, Play, Loader2, Upload, Download } from 'lucide-react';
import { smartPlaylistsApi } from '../../api/client';
import type { SmartPlaylist } from '../../api/client';
import { SmartPlaylistBuilder } from './SmartPlaylistBuilder';
import { usePlayerStore } from '../../stores/playerStore';
import { PlaylistExport, PlaylistImport } from '../PlaylistSharing';

interface Props {
  onSelectPlaylist?: (playlist: SmartPlaylist) => void;
}

export function SmartPlaylistList({ onSelectPlaylist }: Props) {
  const queryClient = useQueryClient();
  const [showBuilder, setShowBuilder] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<SmartPlaylist | undefined>();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const { setQueue } = usePlayerStore();

  const { data: playlists, isLoading } = useQuery({
    queryKey: ['smart-playlists'],
    queryFn: smartPlaylistsApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: smartPlaylistsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart-playlists'] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: smartPlaylistsApi.refresh,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart-playlists'] });
    },
  });

  const playMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const response = await smartPlaylistsApi.getTracks(playlistId, 500);
      return response.tracks;
    },
    onSuccess: (tracks) => {
      if (tracks.length > 0) {
        // Convert to Track type with minimal required fields
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
          year: t.year || null,
          genre: t.genre || null,
          duration_seconds: t.duration_seconds || null,
          format: null,
          analysis_version: 0,
        }));
        setQueue(queueTracks);
      }
    },
  });

  const handleEdit = (playlist: SmartPlaylist) => {
    setEditingPlaylist(playlist);
    setShowBuilder(true);
    setMenuOpen(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this smart playlist?')) {
      deleteMutation.mutate(id);
    }
    setMenuOpen(null);
  };

  const handleRefresh = (id: string) => {
    refreshMutation.mutate(id);
    setMenuOpen(null);
  };

  const handlePlay = (id: string) => {
    playMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          Smart Playlists
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-md transition-colors"
            title="Import .familiar playlist"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => {
              setEditingPlaylist(undefined);
              setShowBuilder(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* Playlist list */}
      {playlists && playlists.length > 0 ? (
        <div className="space-y-2">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="group flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              {/* Play button */}
              <button
                onClick={() => handlePlay(playlist.id)}
                disabled={playMutation.isPending}
                className="p-2 bg-green-600 hover:bg-green-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
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
                onClick={() => onSelectPlaylist?.(playlist)}
              >
                <div className="font-medium truncate">{playlist.name}</div>
                <div className="text-sm text-zinc-400 flex items-center gap-2">
                  <span>{playlist.cached_track_count} tracks</span>
                  <span className="text-zinc-600">|</span>
                  <span>{playlist.rules.length} rules</span>
                  {playlist.match_mode === 'any' && (
                    <>
                      <span className="text-zinc-600">|</span>
                      <span className="text-yellow-500/70">any match</span>
                    </>
                  )}
                </div>
              </div>

              {/* Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(menuOpen === playlist.id ? null : playlist.id)}
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
                    <div className="absolute right-0 top-8 w-40 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 py-1">
                      <button
                        onClick={() => handleEdit(playlist)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleRefresh(playlist.id)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                      </button>
                      <PlaylistExport
                        playlist={playlist}
                        onExport={() => setMenuOpen(null)}
                      />
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
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-500">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No smart playlists yet</p>
          <p className="text-sm mt-1">Create one to automatically collect tracks based on rules</p>
        </div>
      )}

      {/* Builder modal */}
      {showBuilder && (
        <SmartPlaylistBuilder
          playlist={editingPlaylist}
          onClose={() => {
            setShowBuilder(false);
            setEditingPlaylist(undefined);
          }}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <PlaylistImport
          onClose={() => setShowImport(false)}
          onImportComplete={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
