/**
 * AlbumGrid Browser - Shows albums in a responsive grid with artwork.
 *
 * Uses infinite scroll to load albums progressively as you scroll.
 * Clicking an album filters the library to show its tracks.
 */
import { useState, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Grid3X3, Music, Loader2 } from 'lucide-react';
import { libraryApi, tracksApi } from '../../../api/client';
import { registerBrowser, type BrowserProps } from '../types';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import { useArtworkPrefetchOnVisible } from '../../../hooks/useArtworkPrefetch';

const PAGE_SIZE = 50;

// Register this browser
registerBrowser(
  {
    id: 'album-grid',
    name: 'Albums',
    description: 'Browse albums in a visual grid with artwork',
    icon: 'Grid3X3',
    category: 'traditional',
    requiresFeatures: false,
    requiresEmbeddings: false,
  },
  AlbumGrid
);

export function AlbumGrid({
  filters,
  onGoToAlbum,
}: BrowserProps) {
  const [sortBy, setSortBy] = useState<'name' | 'year' | 'artist' | 'track_count'>('name');

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['library-albums', { search: filters.search, artist: filters.artist, sortBy }],
    queryFn: ({ pageParam = 1 }) =>
      libraryApi.listAlbums({
        search: filters.search,
        artist: filters.artist,
        sort_by: sortBy,
        page: pageParam,
        page_size: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / PAGE_SIZE);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useIntersectionObserver({
    onIntersect: handleLoadMore,
    enabled: hasNextPage && !isFetchingNextPage,
  });

  // Flatten all pages into a single array
  const allAlbums = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

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
        <div className="text-red-500">Error loading albums</div>
      </div>
    );
  }

  if (!allAlbums.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <Grid3X3 className="w-12 h-12 mb-4 opacity-50" />
        <p>No albums found</p>
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
            { value: 'artist', label: 'Artist' },
            { value: 'year', label: 'Year' },
            { value: 'track_count', label: 'Tracks' },
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
          {allAlbums.length} of {total} album{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Album grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {allAlbums.map((album) => (
          <AlbumCard
            key={`${album.artist}-${album.name}`}
            album={album}
            onClick={() => onGoToAlbum(album.artist, album.name)}
          />
        ))}
      </div>

      {/* Loading indicator and sentinel for infinite scroll */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      )}

      {/* Invisible sentinel element that triggers loading when scrolled into view */}
      {hasNextPage && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}

interface AlbumCardProps {
  album: {
    name: string;
    artist: string;
    year: number | null;
    track_count: number;
    first_track_id: string;
  };
  onClick: () => void;
}

function AlbumCard({ album, onClick }: AlbumCardProps) {
  const [imageError, setImageError] = useState(false);

  // Prefetch artwork when this card becomes visible
  const prefetchRef = useArtworkPrefetchOnVisible(
    album.artist,
    album.name,
    album.first_track_id
  );

  return (
    <button
      ref={prefetchRef}
      onClick={onClick}
      className="group text-left bg-zinc-800/30 rounded-lg overflow-hidden hover:bg-zinc-800 transition-colors"
    >
      {/* Album artwork */}
      <div className="aspect-square bg-zinc-700 relative overflow-hidden">
        {!imageError ? (
          <img
            src={tracksApi.getArtworkUrl(album.first_track_id, 'thumb')}
            alt={album.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-12 h-12 text-zinc-500" />
          </div>
        )}

        {/* Track count badge */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-xs text-white">
          {album.track_count} track{album.track_count !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Album info */}
      <div className="p-3">
        <div className="font-medium text-white truncate" title={album.name}>
          {album.name}
        </div>
        <div className="text-sm text-zinc-400 truncate" title={album.artist}>
          {album.artist}
        </div>
        {album.year && (
          <div className="text-xs text-zinc-500 mt-1">{album.year}</div>
        )}
      </div>
    </button>
  );
}
