/**
 * Hook for managing offline album download state.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  downloadTracksForOffline,
  removeOfflineTrack,
  getOfflineTrackIds,
} from '../services/offlineService';

interface AlbumTrack {
  id: string;
}

interface UseOfflineAlbumResult {
  /** Number of tracks already downloaded */
  offlineCount: number;
  /** Total number of tracks in the album */
  totalCount: number;
  /** Whether all tracks are downloaded */
  isFullyOffline: boolean;
  /** Whether some but not all tracks are downloaded */
  isPartiallyOffline: boolean;
  /** Whether a download is in progress */
  isDownloading: boolean;
  /** Current track being downloaded (1-indexed) */
  currentTrack: number;
  /** Progress of current track download (0-100) */
  currentTrackProgress: number;
  /** Overall album download progress (0-100) */
  overallProgress: number;
  /** Any error that occurred */
  error: string | null;
  /** Download all tracks that aren't already offline */
  download: () => Promise<void>;
  /** Remove all offline tracks for this album */
  remove: () => Promise<void>;
}

/**
 * Hook to manage offline status for an entire album.
 */
export function useOfflineAlbum(tracks: AlbumTrack[]): UseOfflineAlbumResult {
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [currentTrackProgress, setCurrentTrackProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const trackIds = useMemo(() => tracks.map((t) => t.id), [tracks]);

  // Check initial offline status for all tracks
  useEffect(() => {
    let mounted = true;

    async function checkOfflineStatus() {
      const allOfflineIds = await getOfflineTrackIds();
      const offlineSet = new Set(allOfflineIds);

      if (mounted) {
        // Only keep IDs that are in this album
        const albumOfflineIds = new Set(
          trackIds.filter((id) => offlineSet.has(id))
        );
        setOfflineIds(albumOfflineIds);
      }
    }

    checkOfflineStatus();

    return () => {
      mounted = false;
    };
  }, [trackIds]);

  const offlineCount = offlineIds.size;
  const totalCount = tracks.length;
  const isFullyOffline = totalCount > 0 && offlineCount === totalCount;
  const isPartiallyOffline = offlineCount > 0 && offlineCount < totalCount;

  const download = useCallback(async () => {
    if (isDownloading || isFullyOffline || tracks.length === 0) return;

    setIsDownloading(true);
    setError(null);
    setCurrentTrack(0);
    setCurrentTrackProgress(0);
    setOverallProgress(0);

    // Only download tracks that aren't already offline
    const tracksToDownload = trackIds.filter((id) => !offlineIds.has(id));

    if (tracksToDownload.length === 0) {
      setIsDownloading(false);
      return;
    }

    try {
      const result = await downloadTracksForOffline(
        tracksToDownload,
        (progress) => {
          setCurrentTrack(progress.currentTrack);
          setCurrentTrackProgress(progress.currentTrackProgress);
          setOverallProgress(progress.overallPercentage);
        }
      );

      // Refresh offline status
      const allOfflineIds = await getOfflineTrackIds();
      const offlineSet = new Set(allOfflineIds);
      const albumOfflineIds = new Set(
        trackIds.filter((id) => offlineSet.has(id))
      );
      setOfflineIds(albumOfflineIds);

      if (result.failed > 0) {
        setError(`${result.failed} track(s) failed to download`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, isFullyOffline, tracks.length, trackIds, offlineIds]);

  const remove = useCallback(async () => {
    if (offlineCount === 0) return;

    try {
      // Remove all tracks that are offline for this album
      const tracksToRemove = trackIds.filter((id) => offlineIds.has(id));

      for (const trackId of tracksToRemove) {
        await removeOfflineTrack(trackId);
      }

      setOfflineIds(new Set());
      setOverallProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    }
  }, [trackIds, offlineIds, offlineCount]);

  return {
    offlineCount,
    totalCount,
    isFullyOffline,
    isPartiallyOffline,
    isDownloading,
    currentTrack,
    currentTrackProgress,
    overallProgress,
    error,
    download,
    remove,
  };
}
