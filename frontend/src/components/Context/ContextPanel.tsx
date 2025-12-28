import { useState } from 'react';
import { Music, ExternalLink, BarChart3, Heart, Disc, ListPlus, Check, X } from 'lucide-react';
import { useContextStore } from '../../stores/contextStore';
import type { ContextTrack, BandcampResult, SpotifyFavorite, LibraryStats, SpotifySyncStats } from '../../stores/contextStore';
import { usePlayerStore } from '../../stores/playerStore';
import { playlistsApi } from '../../api/client';

export function ContextPanel() {
  const items = useContextStore((state) => state.items);
  const clearItems = useContextStore((state) => state.clearItems);

  // Debug: Log when component renders and what items it sees
  console.log('[ContextPanel] Rendering with', items.length, 'items');

  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-zinc-500 text-center">
        <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="mt-4">Context panel shows results from your conversation.</p>
        <p className="text-sm mt-2">Start a conversation in the chat to see results here.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">Recent Results</h3>
        <button
          onClick={clearItems}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Clear all
        </button>
      </div>

      {items.map((item) => (
        <div key={item.id} className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            {item.type === 'tracks' && <Music className="w-4 h-4" />}
            {item.type === 'bandcamp' && <Disc className="w-4 h-4" />}
            {item.type === 'favorites' && <Heart className="w-4 h-4" />}
            {(item.type === 'stats' || item.type === 'spotify_stats') && <BarChart3 className="w-4 h-4" />}
            <span>{item.title}</span>
          </div>

          {item.type === 'tracks' && (
            <TrackResults tracks={item.data as ContextTrack[]} />
          )}
          {item.type === 'bandcamp' && (
            <BandcampResults results={item.data as BandcampResult[]} />
          )}
          {item.type === 'favorites' && (
            <FavoriteResults favorites={item.data as SpotifyFavorite[]} />
          )}
          {item.type === 'stats' && (
            <LibraryStatsDisplay stats={item.data as LibraryStats} />
          )}
          {item.type === 'spotify_stats' && (
            <SpotifyStatsDisplay stats={item.data as SpotifySyncStats} />
          )}
        </div>
      ))}
    </div>
  );
}

function TrackResults({ tracks }: { tracks: ContextTrack[] }) {
  const { setQueue } = usePlayerStore();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (tracks.length === 0) {
    return <p className="text-sm text-zinc-500">No tracks found</p>;
  }

  const playAll = () => {
    const queueTracks = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album || '',
      file_path: '',
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
    setQueue(queueTracks, 0);
  };

  const playTrack = (_track: ContextTrack, index: number) => {
    const queueTracks = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album || '',
      file_path: '',
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
    setQueue(queueTracks, index);
  };

  const saveAsPlaylist = async () => {
    if (!playlistName.trim()) return;
    setSaving(true);
    try {
      await playlistsApi.create({
        name: playlistName.trim(),
        track_ids: tracks.map(t => t.id),
      });
      setSaved(true);
      setShowSaveForm(false);
      setPlaylistName('');
      // Reset saved state after a few seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save playlist:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={playAll}
          className="text-xs text-green-500 hover:text-green-400"
        >
          Play all ({tracks.length})
        </button>
        <span className="text-zinc-600">·</span>
        {saved ? (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved!
          </span>
        ) : showSaveForm ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              placeholder="Playlist name..."
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 w-32"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAsPlaylist();
                if (e.key === 'Escape') setShowSaveForm(false);
              }}
            />
            <button
              onClick={saveAsPlaylist}
              disabled={saving || !playlistName.trim()}
              className="text-xs text-green-500 hover:text-green-400 disabled:text-zinc-600 p-1"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="text-xs text-zinc-500 hover:text-zinc-400 p-1"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
          >
            <ListPlus className="w-3 h-3" /> Save as playlist
          </button>
        )}
      </div>
      <div className="max-h-[50vh] overflow-y-auto space-y-1">
        {tracks.map((track, i) => (
          <div
            key={track.id}
            onClick={() => playTrack(track, i)}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center">
              <Music className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{track.title}</p>
              <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BandcampResults({ results }: { results: BandcampResult[] }) {
  if (results.length === 0) {
    return <p className="text-sm text-zinc-500">No results found</p>;
  }

  return (
    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
      {results.map((result, i) => (
        <a
          key={i}
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-teal-600 to-teal-800 rounded flex items-center justify-center">
            <Disc className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-sm text-white truncate">{result.name}</p>
              <ExternalLink className="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-zinc-500 truncate">{result.artist}</p>
            {result.genre && (
              <p className="text-xs text-zinc-600">{result.genre}</p>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

function FavoriteResults({ favorites }: { favorites: SpotifyFavorite[] }) {
  const { setQueue } = usePlayerStore();

  if (favorites.length === 0) {
    return <p className="text-sm text-zinc-500">No favorites found</p>;
  }

  // Check if these are matched (have id) or unmatched (only spotify_id)
  const matched = favorites.filter((f) => f.id);
  const unmatched = favorites.filter((f) => !f.id && f.spotify_id);

  const playMatched = () => {
    const queueTracks = matched.map((f) => ({
      id: f.id!,
      title: f.title || f.name || 'Unknown',
      artist: f.artist || 'Unknown',
      album: f.album || '',
      file_path: '',
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
    if (queueTracks.length > 0) {
      setQueue(queueTracks, 0);
    }
  };

  return (
    <div className="space-y-2">
      {matched.length > 0 && (
        <>
          <button
            onClick={playMatched}
            className="text-xs text-green-500 hover:text-green-400"
          >
            Play matched ({matched.length})
          </button>
          <div className="max-h-[40vh] overflow-y-auto space-y-1">
            {matched.map((fav) => (
              <div
                key={fav.id || fav.spotify_id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <Heart className="w-4 h-4 text-green-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{fav.title || fav.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{fav.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {unmatched.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500 mb-2">Not in library ({unmatched.length})</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {unmatched.map((fav) => (
              <div
                key={fav.spotify_id}
                className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50"
              >
                <Heart className="w-4 h-4 text-zinc-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-400 truncate">{fav.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{fav.artist}</p>
                </div>
                {fav.spotify_url && (
                  <a
                    href={fav.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:text-green-500"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LibraryStatsDisplay({ stats }: { stats: LibraryStats }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-zinc-800 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-white">{stats.total_tracks.toLocaleString()}</p>
        <p className="text-xs text-zinc-500">Tracks</p>
      </div>
      <div className="bg-zinc-800 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-white">{stats.total_artists.toLocaleString()}</p>
        <p className="text-xs text-zinc-500">Artists</p>
      </div>
      <div className="bg-zinc-800 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-white">{stats.total_albums.toLocaleString()}</p>
        <p className="text-xs text-zinc-500">Albums</p>
      </div>
      {stats.top_genres.length > 0 && (
        <div className="col-span-3 bg-zinc-800 rounded-lg p-3">
          <p className="text-xs text-zinc-500 mb-2">Top Genres</p>
          <div className="flex flex-wrap gap-1">
            {stats.top_genres.slice(0, 5).map((g) => (
              <span key={g.genre} className="text-xs bg-zinc-700 px-2 py-1 rounded">
                {g.genre} ({g.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpotifyStatsDisplay({ stats }: { stats: SpotifySyncStats }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
      {stats.connected ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Total Favorites</span>
            <span className="text-sm font-medium">{stats.total_favorites}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Matched</span>
            <span className="text-sm font-medium text-green-500">{stats.matched}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Unmatched</span>
            <span className="text-sm font-medium text-zinc-500">{stats.unmatched}</span>
          </div>
          <div className="pt-2 border-t border-zinc-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Match Rate</span>
              <span className="text-sm font-bold text-white">{stats.match_rate}%</span>
            </div>
            <div className="mt-2 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${stats.match_rate}%` }}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-500">Spotify not connected</p>
      )}
    </div>
  );
}
