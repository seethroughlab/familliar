import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ExternalLink, Play, Disc3, User, Loader2 } from 'lucide-react';
import { playlistsApi } from '../../api/client';
import type { RecommendedArtist, RecommendedTrack } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';

interface Props {
  playlistId: string;
}

type TabType = 'artists' | 'tracks';

export function RecommendationsPanel({ playlistId }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('artists');

  const { data, isLoading, error } = useQuery({
    queryKey: ['playlist-recommendations', playlistId],
    queryFn: () => playlistsApi.getRecommendations(playlistId),
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mt-6 border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          <span className="ml-2 text-sm text-zinc-400">Loading recommendations...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Silently fail if recommendations aren't available
  }

  const hasArtists = data.artists.length > 0;
  const hasTracks = data.tracks.length > 0;

  if (!hasArtists && !hasTracks) {
    return null; // No recommendations to show
  }

  return (
    <div className="mt-6 border-t border-zinc-800 pt-4">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2 py-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Disc3 className="w-5 h-5 text-purple-400" />
          <span className="font-medium">Discover More</span>
          {data.sources_used.length > 0 && (
            <span className="text-xs text-zinc-500">
              via {data.sources_used.join(', ')}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-zinc-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-zinc-400" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-4">
          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {hasArtists && (
              <button
                onClick={() => setActiveTab('artists')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'artists'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <User className="w-4 h-4 inline-block mr-1.5" />
                Artists ({data.artists.length})
              </button>
            )}
            {hasTracks && (
              <button
                onClick={() => setActiveTab('tracks')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'tracks'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Disc3 className="w-4 h-4 inline-block mr-1.5" />
                Tracks ({data.tracks.length})
              </button>
            )}
          </div>

          {/* Content */}
          {activeTab === 'artists' && hasArtists && (
            <ArtistsList artists={data.artists} />
          )}
          {activeTab === 'tracks' && hasTracks && (
            <TracksList tracks={data.tracks} />
          )}
        </div>
      )}
    </div>
  );
}

function ArtistsList({ artists }: { artists: RecommendedArtist[] }) {
  return (
    <div className="space-y-2">
      {artists.map((artist, idx) => (
        <div
          key={`${artist.name}-${idx}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
        >
          {/* Artist image */}
          {artist.image_url ? (
            <img
              src={artist.image_url}
              alt={artist.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
              <User className="w-5 h-5 text-zinc-400" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{artist.name}</div>
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              {artist.local_track_count > 0 ? (
                <span className="text-green-400">
                  {artist.local_track_count} tracks in library
                </span>
              ) : (
                <span>Not in library</span>
              )}
              <span className="text-zinc-600">|</span>
              <span>{Math.round(artist.match_score * 100)}% match</span>
            </div>
          </div>

          {/* External link */}
          {artist.external_url && (
            <a
              href={artist.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
              title="View on Last.fm"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function TracksList({ tracks }: { tracks: RecommendedTrack[] }) {
  const { setQueue } = usePlayerStore();

  const handlePlay = (track: RecommendedTrack) => {
    if (track.local_track_id) {
      // Play the local track
      setQueue([{
        id: track.local_track_id,
        file_path: '',
        title: track.title,
        artist: track.artist,
        album: null,
        album_artist: null,
        album_type: 'album' as const,
        track_number: null,
        disc_number: null,
        year: null,
        genre: null,
        duration_seconds: null,
        format: null,
        analysis_version: 0,
      }]);
    }
  };

  return (
    <div className="space-y-2">
      {tracks.map((track, idx) => (
        <div
          key={`${track.artist}-${track.title}-${idx}`}
          className="group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
        >
          {/* Play button or placeholder */}
          {track.local_track_id ? (
            <button
              onClick={() => handlePlay(track)}
              className="p-2 bg-green-600 hover:bg-green-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Play className="w-3 h-3" fill="currentColor" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
              <Disc3 className="w-4 h-4 text-zinc-400" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{track.title}</div>
            <div className="text-sm text-zinc-400 truncate">{track.artist}</div>
          </div>

          {/* Match indicator and external link */}
          <div className="flex items-center gap-2">
            {track.local_track_id ? (
              <span className="text-xs text-green-400">In library</span>
            ) : (
              <span className="text-xs text-zinc-500">
                {Math.round(track.match_score * 100)}% match
              </span>
            )}
            {track.external_url && !track.local_track_id && (
              <a
                href={track.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                title="View on Last.fm"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
