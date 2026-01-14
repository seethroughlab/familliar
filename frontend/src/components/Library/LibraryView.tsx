/**
 * LibraryView - Main container for library browsing.
 *
 * Manages browser selection, track selection, and filters.
 * Renders the selected browser with BrowserProps.
 * Persists view state in URL for reload support.
 */
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryViewStore } from '../../stores/libraryViewStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { BrowserPicker } from './BrowserPicker';
import { SelectionToolbar } from './SelectionToolbar';
import { ArtistDetail } from './ArtistDetail';
import {
  getBrowser,
  DEFAULT_BROWSER_ID,
  type LibraryFilters,
  type ArtistSummary,
  type AlbumSummary,
} from './types';

// Import browsers to register them
import './browsers';

interface LibraryViewProps {
  /** Initial search query from parent */
  initialSearch?: string;
}

export function LibraryView({ initialSearch }: LibraryViewProps) {
  const { setQueue } = usePlayerStore();
  const { selectedBrowserId, setSelectedBrowserId } = useLibraryViewStore();
  const { setEditingTrackId } = useSelectionStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Browser selection - read from URL, fall back to persisted preference
  const currentBrowserId = searchParams.get('view') || selectedBrowserId;

  const setCurrentBrowserId = useCallback(
    (browserId: string) => {
      // Persist the selection to localStorage
      setSelectedBrowserId(browserId);

      // Also update the URL
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (browserId === DEFAULT_BROWSER_ID) {
          next.delete('view');
        } else {
          next.set('view', browserId);
        }
        return next;
      });
    },
    [setSearchParams, setSelectedBrowserId]
  );

  // Filters - read from URL
  const filters: LibraryFilters = useMemo(() => {
    return {
      search: initialSearch || searchParams.get('search') || undefined,
      artist: searchParams.get('artist') || undefined,
      album: searchParams.get('album') || undefined,
      yearFrom: searchParams.get('yearFrom') ? Number(searchParams.get('yearFrom')) : undefined,
      yearTo: searchParams.get('yearTo') ? Number(searchParams.get('yearTo')) : undefined,
      energyMin: searchParams.get('energyMin') ? Number(searchParams.get('energyMin')) : undefined,
      energyMax: searchParams.get('energyMax') ? Number(searchParams.get('energyMax')) : undefined,
      valenceMin: searchParams.get('valenceMin') ? Number(searchParams.get('valenceMin')) : undefined,
      valenceMax: searchParams.get('valenceMax') ? Number(searchParams.get('valenceMax')) : undefined,
    };
  }, [searchParams, initialSearch]);

  const setFilters = useCallback(
    (newFilters: LibraryFilters) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        // Clear old filter params
        next.delete('artist');
        next.delete('album');
        next.delete('yearFrom');
        next.delete('yearTo');
        next.delete('energyMin');
        next.delete('energyMax');
        next.delete('valenceMin');
        next.delete('valenceMax');
        // Set new ones
        if (newFilters.artist) next.set('artist', newFilters.artist);
        if (newFilters.album) next.set('album', newFilters.album);
        if (newFilters.yearFrom) next.set('yearFrom', String(newFilters.yearFrom));
        if (newFilters.yearTo) next.set('yearTo', String(newFilters.yearTo));
        if (newFilters.energyMin !== undefined) next.set('energyMin', String(newFilters.energyMin));
        if (newFilters.energyMax !== undefined) next.set('energyMax', String(newFilters.energyMax));
        if (newFilters.valenceMin !== undefined) next.set('valenceMin', String(newFilters.valenceMin));
        if (newFilters.valenceMax !== undefined) next.set('valenceMax', String(newFilters.valenceMax));
        return next;
      });
    },
    [setSearchParams]
  );

  // Track selection - we need to pass tracks but we don't have them at this level
  // The browser component fetches its own data, so we track selection by ID only
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [tracksCache] = useState<Map<string, import('../../types').Track>>(new Map());

  // Artist detail view state - read from URL
  const selectedArtist = searchParams.get('artistDetail');

  const selectTrack = useCallback((trackId: string, multi: boolean) => {
    setSelectedTrackIds((prev) => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
        return next;
      } else {
        if (prev.size === 1 && prev.has(trackId)) {
          return new Set();
        }
        return new Set([trackId]);
      }
    });
  }, []);

  const selectAll = useCallback(() => {
    // This would need track data from the browser - for now, it's a no-op
    // The browser can implement its own select-all
    console.log('Select all - needs implementation in browser');
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTrackIds(new Set());
  }, []);

  const getSelectedTracks = useCallback(() => {
    const tracks: import('../../types').Track[] = [];
    for (const id of selectedTrackIds) {
      const track = tracksCache.get(id);
      if (track) {
        tracks.push(track);
      }
    }
    return tracks;
  }, [selectedTrackIds, tracksCache]);

  // Navigation handlers - switch to track list and apply filter
  // Note: Must update both filters AND view in a single setSearchParams call
  // to avoid React batching issues where one overwrites the other
  const handleGoToArtist = useCallback(
    (artistName: string) => {
      // Open artist detail view - persist in URL
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('artistDetail', artistName);
        return next;
      });
    },
    [setSearchParams]
  );

  const handleBackFromArtist = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('artistDetail');
      return next;
    });
  }, [setSearchParams]);

  const handleGoToAlbum = useCallback(
    (artistName: string, albumName: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        // Clear artist detail view - we're navigating to album
        next.delete('artistDetail');
        next.delete('artist');
        next.delete('album');
        next.delete('yearFrom');
        next.delete('yearTo');
        next.delete('energyMin');
        next.delete('energyMax');
        next.delete('valenceMin');
        next.delete('valenceMax');
        // Explicitly switch to track-list to show album tracks
        next.set('view', 'track-list');
        next.set('artist', artistName);
        next.set('album', albumName);
        return next;
      });
    },
    [setSearchParams]
  );

  const handleGoToYear = useCallback(
    (year: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('artist');
        next.delete('album');
        next.delete('yearFrom');
        next.delete('yearTo');
        next.delete('energyMin');
        next.delete('energyMax');
        next.delete('valenceMin');
        next.delete('valenceMax');
        // Explicitly switch to track-list to show filtered tracks
        next.set('view', 'track-list');
        next.set('yearFrom', String(year));
        next.set('yearTo', String(year));
        return next;
      });
    },
    [setSearchParams]
  );

  const handleGoToYearRange = useCallback(
    (yearFrom: number, yearTo: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('artist');
        next.delete('album');
        next.delete('yearFrom');
        next.delete('yearTo');
        next.delete('energyMin');
        next.delete('energyMax');
        next.delete('valenceMin');
        next.delete('valenceMax');
        // Explicitly switch to track-list to show filtered tracks
        next.set('view', 'track-list');
        next.set('yearFrom', String(yearFrom));
        next.set('yearTo', String(yearTo));
        return next;
      });
    },
    [setSearchParams]
  );

  const handleGoToMood = useCallback(
    (energyMin: number, energyMax: number, valenceMin: number, valenceMax: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        // Clear old filter params
        next.delete('artist');
        next.delete('album');
        next.delete('yearFrom');
        next.delete('yearTo');
        next.delete('energyMin');
        next.delete('energyMax');
        next.delete('valenceMin');
        next.delete('valenceMax');
        // Explicitly switch to track-list to show filtered tracks
        next.set('view', 'track-list');
        // Set mood filters
        next.set('energyMin', String(energyMin));
        next.set('energyMax', String(energyMax));
        next.set('valenceMin', String(valenceMin));
        next.set('valenceMax', String(valenceMax));
        return next;
      });
    },
    [setSearchParams]
  );

  const handleFilterChange = useCallback(
    (newFilters: Partial<LibraryFilters>) => {
      setFilters({ ...filters, ...newFilters });
    },
    [filters, setFilters]
  );

  // Playback handlers
  const handlePlayTrack = useCallback((trackId: string) => {
    // This is handled by the browser component directly
    console.log('Play track:', trackId);
  }, []);

  const handlePlayTrackAt = useCallback((trackId: string, index: number) => {
    // This is handled by the browser component directly
    console.log('Play track at:', trackId, index);
  }, []);

  const handleQueueTrack = useCallback((trackId: string) => {
    // TODO: Implement queue functionality
    console.log('Queue track:', trackId);
  }, []);

  const handleEditTrack = useCallback((trackId: string) => {
    setEditingTrackId(trackId);
  }, [setEditingTrackId]);

  const handlePlaySelected = useCallback(() => {
    const tracks = getSelectedTracks();
    if (tracks.length > 0) {
      setQueue(tracks, 0);
      clearSelection();
    }
  }, [getSelectedTracks, setQueue, clearSelection]);

  // Get the current browser component
  const currentBrowser = getBrowser(currentBrowserId);
  const BrowserComponent = currentBrowser?.component;

  // Placeholder data for artists/albums (Phase 2 will populate these)
  const artists: ArtistSummary[] = [];
  const albums: AlbumSummary[] = [];

  // Show artist detail view if an artist is selected
  if (selectedArtist) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          <ArtistDetail
            artistName={selectedArtist}
            onBack={handleBackFromArtist}
            onGoToAlbum={handleGoToAlbum}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Selection toolbar (appears when tracks selected) */}
      <SelectionToolbar
        selectedCount={selectedTrackIds.size}
        onClear={clearSelection}
        onPlaySelected={handlePlaySelected}
        getSelectedTracks={getSelectedTracks}
      />

      {/* Browser picker toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/50">
        <BrowserPicker
          currentBrowserId={currentBrowserId}
          onSelectBrowser={setCurrentBrowserId}
        />
      </div>

      {/* Filter breadcrumbs */}
      {(filters.artist || filters.album || filters.yearFrom || filters.energyMin !== undefined) && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800/50">
          <span className="text-zinc-400">Viewing:</span>
          {filters.artist && (
            <button
              onClick={() => setFilters({ artist: filters.artist })}
              className="px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-white"
            >
              {filters.artist}
            </button>
          )}
          {filters.album && (
            <>
              <span className="text-zinc-500">/</span>
              <span className="px-2 py-0.5 bg-zinc-700 rounded text-white">
                {filters.album}
              </span>
            </>
          )}
          {filters.yearFrom && (
            <span className="px-2 py-0.5 bg-zinc-700 rounded text-white">
              {filters.yearFrom === filters.yearTo
                ? filters.yearFrom
                : `${filters.yearFrom}-${filters.yearTo}`}
            </span>
          )}
          {filters.energyMin !== undefined && (
            <span className="px-2 py-0.5 bg-purple-700 rounded text-white">
              Energy {Math.round(filters.energyMin * 100)}-{Math.round((filters.energyMax ?? 1) * 100)}%
              {' / '}
              Valence {Math.round((filters.valenceMin ?? 0) * 100)}-{Math.round((filters.valenceMax ?? 1) * 100)}%
            </span>
          )}
          <button
            onClick={() => setFilters({ search: filters.search })}
            className="ml-2 text-zinc-400 hover:text-white text-xs"
          >
            Clear
          </button>
        </div>
      )}

      {/* Browser content */}
      <div className="flex-1 overflow-y-auto">
        {BrowserComponent ? (
          <BrowserComponent
            tracks={[]}
            artists={artists}
            albums={albums}
            isLoading={false}
            selectedTrackIds={selectedTrackIds}
            onSelectTrack={selectTrack}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onGoToArtist={handleGoToArtist}
            onGoToAlbum={handleGoToAlbum}
            onGoToYear={handleGoToYear}
            onGoToYearRange={handleGoToYearRange}
            onGoToMood={handleGoToMood}
            onPlayTrack={handlePlayTrack}
            onPlayTrackAt={handlePlayTrackAt}
            onQueueTrack={handleQueueTrack}
            onEditTrack={handleEditTrack}
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        ) : (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            Browser not found: {currentBrowserId}
          </div>
        )}
      </div>
    </div>
  );
}
