/**
 * useAppNavigation - Centralized navigation hook for the app
 *
 * Provides typed navigation methods that handle URL parameters correctly,
 * ensuring consistent behavior across all navigation actions.
 */

import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TAB_PARAM_WHITELIST, type AppTab } from '../utils/urlParams';

interface NavigateToLibraryParams {
  browser?: string;
  search?: string;
  artist?: string;
  album?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  artistDetail?: string;
  albumDetailArtist?: string;
  albumDetailAlbum?: string;
  energyMin?: number;
  energyMax?: number;
  valenceMin?: number;
  valenceMax?: number;
  downloadedOnly?: boolean;
}

export function useAppNavigation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /**
   * Navigate to a tab, optionally preserving compatible params
   */
  const navigateToTab = useCallback(
    (tab: AppTab, options?: { preserveParams?: boolean }) => {
      const newParams = new URLSearchParams();

      if (options?.preserveParams) {
        // Only keep params that are valid for the target tab
        const allowedParams = new Set(TAB_PARAM_WHITELIST[tab]);
        for (const [key, value] of searchParams.entries()) {
          if (allowedParams.has(key)) {
            newParams.set(key, value);
          }
        }
      }

      const paramString = newParams.toString();
      const url = paramString ? `?${paramString}#${tab}` : `#${tab}`;
      navigate(url, { replace: true });
    },
    [navigate, searchParams]
  );

  /**
   * Navigate to the library tab with specific params
   */
  const navigateToLibrary = useCallback(
    (params: NavigateToLibraryParams) => {
      const newParams = new URLSearchParams();

      if (params.browser) newParams.set('browser', params.browser);
      if (params.search) newParams.set('search', params.search);
      if (params.artist) newParams.set('artist', params.artist);
      if (params.album) newParams.set('album', params.album);
      if (params.genre) newParams.set('genre', params.genre);
      if (params.yearFrom !== undefined) newParams.set('yearFrom', String(params.yearFrom));
      if (params.yearTo !== undefined) newParams.set('yearTo', String(params.yearTo));
      if (params.artistDetail) newParams.set('artistDetail', params.artistDetail);
      if (params.albumDetailArtist) newParams.set('albumDetailArtist', params.albumDetailArtist);
      if (params.albumDetailAlbum) newParams.set('albumDetailAlbum', params.albumDetailAlbum);
      if (params.energyMin !== undefined) newParams.set('energyMin', String(params.energyMin));
      if (params.energyMax !== undefined) newParams.set('energyMax', String(params.energyMax));
      if (params.valenceMin !== undefined) newParams.set('valenceMin', String(params.valenceMin));
      if (params.valenceMax !== undefined) newParams.set('valenceMax', String(params.valenceMax));
      if (params.downloadedOnly) newParams.set('downloadedOnly', 'true');

      const paramString = newParams.toString();
      const url = paramString ? `?${paramString}#library` : '#library';
      navigate(url);
    },
    [navigate]
  );

  /**
   * Navigate to an artist's detail page
   */
  const navigateToArtist = useCallback(
    (artistName: string) => {
      navigateToLibrary({ artistDetail: artistName });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to an album (filtered track list)
   */
  const navigateToAlbum = useCallback(
    (artist: string, album: string) => {
      navigateToLibrary({
        browser: 'track-list',
        artist,
        album,
      });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to album detail view
   */
  const navigateToAlbumDetail = useCallback(
    (artist: string, album: string) => {
      navigateToLibrary({
        albumDetailArtist: artist,
        albumDetailAlbum: album,
      });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to a year filter
   */
  const navigateToYear = useCallback(
    (year: number) => {
      navigateToLibrary({
        browser: 'track-list',
        yearFrom: year,
        yearTo: year,
      });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to a year range filter
   */
  const navigateToYearRange = useCallback(
    (from: number, to: number) => {
      navigateToLibrary({
        browser: 'track-list',
        yearFrom: from,
        yearTo: to,
      });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to a mood filter (energy/valence quadrant)
   */
  const navigateToMood = useCallback(
    (energyMin: number, energyMax: number, valenceMin: number, valenceMax: number) => {
      navigateToLibrary({
        browser: 'track-list',
        energyMin,
        energyMax,
        valenceMin,
        valenceMax,
      });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to a genre filter
   */
  const navigateToGenre = useCallback(
    (genre: string) => {
      navigateToLibrary({
        browser: 'track-list',
        genre,
      });
    },
    [navigateToLibrary]
  );

  /**
   * Navigate to a specific playlist
   */
  const navigateToPlaylist = useCallback(
    (playlistId: string) => {
      const url = `?playlist=${encodeURIComponent(playlistId)}#playlists`;
      navigate(url);
    },
    [navigate]
  );

  /**
   * Navigate to a smart playlist
   */
  const navigateToSmartPlaylist = useCallback(
    (smartPlaylistId: string) => {
      const url = `?smartPlaylist=${encodeURIComponent(smartPlaylistId)}#playlists`;
      navigate(url);
    },
    [navigate]
  );

  /**
   * Navigate to favorites view
   */
  const navigateToFavorites = useCallback(() => {
    navigate('?view=favorites#playlists');
  }, [navigate]);

  /**
   * Navigate to downloads view
   */
  const navigateToDownloads = useCallback(() => {
    navigate('?view=downloads#playlists');
  }, [navigate]);

  /**
   * Update URL params without changing tab
   */
  const updateParams = useCallback(
    (updates: Record<string, string | number | boolean | undefined | null>) => {
      const newParams = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === '') {
          newParams.delete(key);
        } else if (typeof value === 'boolean') {
          if (value) {
            newParams.set(key, 'true');
          } else {
            newParams.delete(key);
          }
        } else {
          newParams.set(key, String(value));
        }
      }

      const hash = window.location.hash || '';
      const paramString = newParams.toString();
      const url = paramString ? `?${paramString}${hash}` : hash || '/';
      navigate(url, { replace: true });
    },
    [navigate, searchParams]
  );

  /**
   * Clear specific params from the URL
   */
  const clearParams = useCallback(
    (keys: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      for (const key of keys) {
        newParams.delete(key);
      }

      const hash = window.location.hash || '';
      const paramString = newParams.toString();
      const url = paramString ? `?${paramString}${hash}` : hash || '/';
      navigate(url, { replace: true });
    },
    [navigate, searchParams]
  );

  return {
    navigateToTab,
    navigateToLibrary,
    navigateToArtist,
    navigateToAlbum,
    navigateToAlbumDetail,
    navigateToYear,
    navigateToYearRange,
    navigateToMood,
    navigateToGenre,
    navigateToPlaylist,
    navigateToSmartPlaylist,
    navigateToFavorites,
    navigateToDownloads,
    updateParams,
    clearParams,
  };
}
