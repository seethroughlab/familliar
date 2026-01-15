import { useQuery } from '@tanstack/react-query';
import { Music, Loader2, Play, Pause } from 'lucide-react';
import { tracksApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';
import type { Track } from '../../types';
import { DiscoverySection } from '../shared';

interface DiscoverSectionProps {
  trackId: string;
  onNavigateToArtist?: (artistName: string) => void;
  onClose?: () => void;
}

export function DiscoverSection({ trackId, onNavigateToArtist, onClose }: DiscoverSectionProps) {
  const { currentTrack, isPlaying, setQueue, addToQueue, setIsPlaying } = usePlayerStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['track-discover', trackId],
    queryFn: () => tracksApi.getDiscover(trackId, 6, 8),
    staleTime: 5 * 60 * 1000,
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

  const handlePlaySimilar = (track: Track, index: number) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(similar_tracks as Track[], index);
    }
  };

  const handleQueueSimilar = (track: Track) => {
    addToQueue(track as Track);
  };

  const handleNavigateToArtist = (artistName: string) => {
    if (onNavigateToArtist) {
      onNavigateToArtist(artistName);
      onClose?.();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 pb-32">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Similar Tracks - custom component for play/queue functionality */}
        {similar_tracks.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">
              Similar Tracks
            </h3>
            <div className="space-y-1">
              {similar_tracks.map((track, idx) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors ${
                      isCurrentTrack ? 'bg-zinc-800/30' : ''
                    }`}
                  >
                    <button
                      onClick={() => handlePlaySimilar(track as Track, idx)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-opacity ${
                        isCurrentTrack
                          ? 'bg-green-600 opacity-100'
                          : 'bg-green-600 hover:bg-green-500 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isCurrentTrack && isPlaying ? (
                        <Pause className="w-3.5 h-3.5" fill="currentColor" />
                      ) : (
                        <Play className="w-3.5 h-3.5" fill="currentColor" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm truncate ${isCurrentTrack ? 'text-green-500' : ''}`}>
                        {track.title || 'Unknown'}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        {track.artist || 'Unknown'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleQueueSimilar(track as Track)}
                      className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Queue
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Similar Artists - using shared component */}
        {similar_artists.length > 0 && (
          <DiscoverySection
            title="Similar Artists"
            type="artist"
            collapsible
            items={similar_artists.map((artist) => ({
              name: artist.name,
              subtitle: artist.in_library
                ? `${artist.track_count} ${artist.track_count === 1 ? 'track' : 'tracks'}`
                : undefined,
              imageUrl: artist.image_url || undefined,
              matchScore: artist.match_score,
              inLibrary: artist.in_library,
              externalLinks: artist.in_library ? undefined : {
                bandcamp: artist.bandcamp_url || undefined,
                lastfm: artist.lastfm_url || undefined,
              },
            }))}
            onItemClick={(item) => item.inLibrary && handleNavigateToArtist(item.name)}
          />
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
                  className="px-3 py-1.5 bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 rounded transition-colors text-sm"
                >
                  Search for this track
                </a>
              )}
              {bandcamp_artist_url && (
                <a
                  href={bandcamp_artist_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 rounded transition-colors text-sm"
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
