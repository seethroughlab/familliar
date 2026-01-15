import { useQuery } from '@tanstack/react-query';
import { Users, Music, ExternalLink, Loader2 } from 'lucide-react';
import { tracksApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import type { Track } from '../../types';

interface DiscoverSectionProps {
  trackId: string;
  onNavigateToArtist?: (artistName: string) => void;
  onClose?: () => void;
}

export function DiscoverSection({ trackId, onNavigateToArtist, onClose }: DiscoverSectionProps) {
  const { setQueue, addToQueue } = usePlayerStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['track-discover', trackId],
    queryFn: () => tracksApi.getDiscover(trackId, 6, 8),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <p>Unable to load discovery data</p>
      </div>
    );
  }

  const { similar_tracks, similar_artists, bandcamp_artist_url, bandcamp_track_url } = data;

  const inLibrary = similar_artists.filter(a => a.in_library);
  const toDiscover = similar_artists.filter(a => !a.in_library);

  const handlePlaySimilar = (_track: Track, index: number) => {
    // Play this track and queue the rest
    setQueue(similar_tracks as Track[], index);
  };

  const handleQueueSimilar = (track: Track) => {
    addToQueue(track as Track);
  };

  return (
    <div className="h-full overflow-y-auto p-6 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Similar Tracks in Library */}
        {similar_tracks.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Music className="w-5 h-5 text-emerald-500" />
              Similar Tracks in Your Library
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {similar_tracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg group transition-colors"
                >
                  <button
                    onClick={() => handlePlaySimilar(track as Track, idx)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="font-medium truncate group-hover:text-white">
                      {track.title || 'Unknown'}
                    </div>
                    <div className="text-sm text-zinc-400 truncate">
                      {track.artist || 'Unknown'}
                    </div>
                  </button>
                  <button
                    onClick={() => handleQueueSimilar(track as Track)}
                    className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Queue
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Similar Artists in Library */}
        {inLibrary.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Similar Artists in Your Library
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {inLibrary.map((artist) => (
                <button
                  key={artist.name}
                  onClick={() => {
                    if (onNavigateToArtist) {
                      onNavigateToArtist(artist.name);
                      onClose?.();
                    }
                  }}
                  className="flex flex-col items-center p-4 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors group"
                >
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-16 h-16 rounded-full object-cover mb-2"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center mb-2">
                      <Users className="w-6 h-6 text-zinc-500" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-center truncate w-full group-hover:text-white">
                    {artist.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {artist.track_count} {artist.track_count === 1 ? 'track' : 'tracks'}
                  </span>
                  <span className="text-xs text-emerald-500">
                    {Math.round(artist.match_score * 100)}% match
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Discover Similar Artists */}
        {toDiscover.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-teal-500" />
              Discover Similar Artists
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {toDiscover.map((artist) => (
                <div
                  key={artist.name}
                  className="flex flex-col items-center p-4 bg-zinc-800/50 rounded-lg"
                >
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-16 h-16 rounded-full object-cover mb-2 opacity-75"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center mb-2">
                      <Users className="w-6 h-6 text-zinc-500" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-center truncate w-full text-zinc-300">
                    {artist.name}
                  </span>
                  <span className="text-xs text-zinc-500 mb-2">
                    {Math.round(artist.match_score * 100)}% match
                  </span>
                  <div className="flex gap-1">
                    {artist.bandcamp_url && (
                      <a
                        href={artist.bandcamp_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs bg-teal-600/20 text-teal-400 hover:bg-teal-600/40 rounded transition-colors"
                      >
                        Bandcamp
                      </a>
                    )}
                    {artist.lastfm_url && (
                      <a
                        href={artist.lastfm_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded transition-colors"
                      >
                        Last.fm
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* External Links for Current Track */}
        {(bandcamp_artist_url || bandcamp_track_url) && (
          <section className="pt-4 border-t border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Find on Bandcamp</h3>
            <div className="flex gap-2">
              {bandcamp_track_url && (
                <a
                  href={bandcamp_track_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 rounded-lg transition-colors text-sm"
                >
                  Search for this track
                </a>
              )}
              {bandcamp_artist_url && (
                <a
                  href={bandcamp_artist_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 rounded-lg transition-colors text-sm"
                >
                  More by {data.artist}
                </a>
              )}
            </div>
          </section>
        )}

        {/* Empty state */}
        {similar_tracks.length === 0 && similar_artists.length === 0 && (
          <div className="text-center text-zinc-500 py-12">
            <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No discovery data available for this track yet.</p>
            <p className="text-sm mt-2">
              Try playing a track that has been analyzed with audio embeddings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
