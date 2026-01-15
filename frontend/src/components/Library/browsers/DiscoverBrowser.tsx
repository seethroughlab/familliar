/**
 * DiscoverBrowser - Music discovery dashboard.
 *
 * Aggregates discovery features:
 * - New releases from library artists
 * - Recommended artists based on listening patterns
 * - Unmatched Spotify favorites
 */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Disc,
  Users,
  Music,
  Sparkles,
  ExternalLink,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { libraryApi } from '../../../api/client';
import { registerBrowser, type BrowserProps } from '../types';

// Register this browser
registerBrowser(
  {
    id: 'discover',
    name: 'Discover',
    description: 'New releases, recommendations, and music to explore',
    icon: 'Sparkles',
    category: 'discovery',
    requiresFeatures: false,
    requiresEmbeddings: false,
  },
  DiscoverBrowser
);

export function DiscoverBrowser({ onGoToArtist }: BrowserProps) {
  const [, setSearchParams] = useSearchParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['library-discover'],
    queryFn: () =>
      libraryApi.getDiscover({
        releases_limit: 8,
        recommendations_limit: 12,
        favorites_limit: 6,
      }),
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

  const {
    new_releases,
    new_releases_total,
    recommended_artists,
    unmatched_favorites,
    unmatched_total,
    recently_added_count,
  } = data;

  const inLibraryArtists = recommended_artists.filter((a) => a.in_library);
  const toDiscoverArtists = recommended_artists.filter((a) => !a.in_library);

  const handleGoToArtist = (artistName: string) => {
    if (onGoToArtist) {
      onGoToArtist(artistName);
    } else {
      setSearchParams({ artistDetail: artistName });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-8">
      {/* Stats banner */}
      <div className="flex gap-4 text-sm text-zinc-400">
        {recently_added_count > 0 && (
          <span className="flex items-center gap-1">
            <Music className="w-4 h-4" />
            {recently_added_count} tracks added recently
          </span>
        )}
        {new_releases_total > 0 && (
          <span className="flex items-center gap-1">
            <Disc className="w-4 h-4" />
            {new_releases_total} new releases
          </span>
        )}
        {unmatched_total > 0 && (
          <span className="flex items-center gap-1">
            <Sparkles className="w-4 h-4" />
            {unmatched_total} tracks to get
          </span>
        )}
      </div>

      {/* New Releases */}
      {new_releases.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Disc className="w-5 h-5 text-purple-500" />
              New Releases from Your Artists
            </h3>
            {new_releases_total > new_releases.length && (
              <button className="text-sm text-zinc-400 hover:text-white flex items-center gap-1">
                View all {new_releases_total}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {new_releases.map((release) => (
              <div
                key={release.id}
                className="bg-zinc-800/50 rounded-lg overflow-hidden group"
              >
                {release.image_url ? (
                  <img
                    src={release.image_url}
                    alt={`${release.artist} - ${release.album}`}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-zinc-700 flex items-center justify-center">
                    <Disc className="w-12 h-12 text-zinc-500" />
                  </div>
                )}
                <div className="p-3">
                  <div className="font-medium truncate">{release.album}</div>
                  <div className="text-sm text-zinc-400 truncate">
                    {release.artist}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-zinc-500">
                      {release.release_date?.slice(0, 10) || release.source}
                    </span>
                    {release.bandcamp_url && (
                      <a
                        href={release.bandcamp_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs bg-teal-600/20 text-teal-400 hover:bg-teal-600/40 rounded transition-colors"
                      >
                        Bandcamp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Artists in Library */}
      {inLibraryArtists.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            More From Artists You Love
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {inLibraryArtists.map((artist) => (
              <button
                key={artist.name}
                onClick={() => handleGoToArtist(artist.name)}
                className="flex flex-col items-center p-3 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors group"
              >
                {artist.image_url ? (
                  <img
                    src={artist.image_url}
                    alt={artist.name}
                    className="w-14 h-14 rounded-full object-cover mb-2"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center mb-2">
                    <Users className="w-5 h-5 text-zinc-500" />
                  </div>
                )}
                <span className="text-sm font-medium text-center truncate w-full group-hover:text-white">
                  {artist.name}
                </span>
                <span className="text-xs text-zinc-500">
                  {artist.track_count} tracks
                </span>
                <span className="text-xs text-zinc-600">
                  via {artist.based_on_artist}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Artists to Discover */}
      {toDiscoverArtists.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-teal-500" />
            Artists to Discover
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {toDiscoverArtists.map((artist) => (
              <div
                key={artist.name}
                className="flex flex-col items-center p-3 bg-zinc-800/50 rounded-lg"
              >
                {artist.image_url ? (
                  <img
                    src={artist.image_url}
                    alt={artist.name}
                    className="w-14 h-14 rounded-full object-cover mb-2 opacity-75"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center mb-2">
                    <Users className="w-5 h-5 text-zinc-500" />
                  </div>
                )}
                <span className="text-sm font-medium text-center truncate w-full text-zinc-300">
                  {artist.name}
                </span>
                <span className="text-xs text-zinc-600 mb-2">
                  via {artist.based_on_artist}
                </span>
                <div className="flex gap-1">
                  {artist.bandcamp_url && (
                    <a
                      href={artist.bandcamp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 text-xs bg-teal-600/20 text-teal-400 hover:bg-teal-600/40 rounded transition-colors"
                    >
                      Bandcamp
                    </a>
                  )}
                  {artist.lastfm_url && (
                    <a
                      href={artist.lastfm_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded transition-colors"
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

      {/* Unmatched Spotify Favorites */}
      {unmatched_favorites.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-500" />
              Get These From Spotify
            </h3>
            {unmatched_total > unmatched_favorites.length && (
              <span className="text-sm text-zinc-500">
                {unmatched_total} total
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {unmatched_favorites.map((fav) => (
              <div
                key={fav.spotify_track_id}
                className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg"
              >
                {fav.image_url ? (
                  <img
                    src={fav.image_url}
                    alt={`${fav.artist} - ${fav.album}`}
                    className="w-12 h-12 rounded object-cover opacity-75"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-zinc-700 flex items-center justify-center">
                    <Music className="w-5 h-5 text-zinc-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{fav.name}</div>
                  <div className="text-xs text-zinc-400 truncate">
                    {fav.artist}
                  </div>
                  {fav.bandcamp_url && (
                    <a
                      href={fav.bandcamp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1 px-2 py-0.5 text-xs bg-teal-600/20 text-teal-400 hover:bg-teal-600/40 rounded transition-colors"
                    >
                      Find on Bandcamp
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {new_releases.length === 0 &&
        recommended_artists.length === 0 &&
        unmatched_favorites.length === 0 && (
          <div className="text-center text-zinc-500 py-12">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No discoveries yet</p>
            <p className="text-sm mt-2">
              Play some music to get personalized recommendations,
              <br />
              or connect Spotify to import your favorites.
            </p>
          </div>
        )}
    </div>
  );
}
