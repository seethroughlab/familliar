/**
 * ArtistList Browser - Shows artists with track/album counts.
 *
 * Clicking an artist filters the library to show their tracks.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Music, Disc, ChevronRight, Loader2 } from 'lucide-react';
import { libraryApi, tracksApi } from '../../../api/client';
import { registerBrowser, type BrowserProps } from '../types';

// Register this browser
registerBrowser(
  {
    id: 'artist-list',
    name: 'Artists',
    description: 'Browse by artist with track and album counts',
    icon: 'Users',
    category: 'traditional',
    requiresFeatures: false,
    requiresEmbeddings: false,
  },
  ArtistList
);

export function ArtistList({
  filters,
  onGoToArtist,
}: BrowserProps) {
  const [sortBy, setSortBy] = useState<'name' | 'track_count' | 'album_count'>('name');

  const { data, isLoading, error } = useQuery({
    queryKey: ['library-artists', { search: filters.search, sortBy }],
    queryFn: () =>
      libraryApi.listArtists({
        search: filters.search,
        sort_by: sortBy,
        page_size: 200,
      }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-500">Error loading artists</div>
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <Users className="w-12 h-12 mb-4 opacity-50" />
        <p>No artists found</p>
        {filters.search && (
          <p className="text-sm mt-1">Try adjusting your search</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-zinc-400">Sort by:</span>
        <div className="flex gap-1">
          {[
            { value: 'name', label: 'Name' },
            { value: 'track_count', label: 'Tracks' },
            { value: 'album_count', label: 'Albums' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value as typeof sortBy)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === option.value
                  ? 'bg-purple-500/30 text-purple-300'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-zinc-500">
          {data.total} artist{data.total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Artist list */}
      <div className="space-y-1">
        {data.items.map((artist) => (
          <ArtistRow
            key={artist.name}
            artist={artist}
            onClick={() => onGoToArtist(artist.name)}
          />
        ))}
      </div>
    </div>
  );
}

interface ArtistRowProps {
  artist: {
    name: string;
    track_count: number;
    album_count: number;
    first_track_id: string;
  };
  onClick: () => void;
}

function ArtistRow({ artist, onClick }: ArtistRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800 transition-colors text-left group"
    >
      {/* Artist artwork (from first track) */}
      <div className="w-12 h-12 rounded-lg bg-zinc-700 overflow-hidden flex-shrink-0">
        <img
          src={tracksApi.getArtworkUrl(artist.first_track_id, 'thumb')}
          alt={artist.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Hide broken image, show fallback
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="w-full h-full flex items-center justify-center">
          <Users className="w-6 h-6 text-zinc-500" />
        </div>
      </div>

      {/* Artist info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{artist.name}</div>
        <div className="flex items-center gap-3 text-sm text-zinc-400 mt-0.5">
          <span className="flex items-center gap-1">
            <Music className="w-3.5 h-3.5" />
            {artist.track_count} track{artist.track_count !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Disc className="w-3.5 h-3.5" />
            {artist.album_count} album{artist.album_count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
    </button>
  );
}
