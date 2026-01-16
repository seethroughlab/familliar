/**
 * Offline service for managing track downloads and offline playback.
 */
import { db, type OfflineTrack, type OfflineArtwork, type CachedTrack } from '../db';
import { computeAlbumHash } from '../utils/albumHash';

/**
 * Progress callback type for download tracking.
 */
export type DownloadProgressCallback = (progress: {
  loaded: number;
  total: number;
  percentage: number;
}) => void;

/**
 * Download a track for offline playback with optional progress tracking.
 * Also downloads album artwork if track metadata is available.
 */
export async function downloadTrackForOffline(
  trackId: string,
  onProgress?: DownloadProgressCallback
): Promise<void> {
  // Check if already downloaded
  const existing = await db.offlineTracks.get(trackId);
  if (existing) {
    onProgress?.({ loaded: 1, total: 1, percentage: 100 });
    return;
  }

  // Fetch the audio file with progress tracking
  const response = await fetch(`/api/v1/tracks/${trackId}/stream`);
  if (!response.ok) {
    throw new Error(`Failed to download track: ${response.statusText}`);
  }

  let blob: Blob;

  // Use streaming if available and progress callback provided
  if (onProgress && response.body) {
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (total > 0) {
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;
        onProgress({
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100),
        });
      }

      blob = new Blob(chunks, {
        type: response.headers.get('content-type') || 'audio/mpeg',
      });
    } else {
      // No content-length header, can't track progress
      blob = await response.blob();
      onProgress({ loaded: blob.size, total: blob.size, percentage: 100 });
    }
  } else {
    blob = await response.blob();
  }

  // Store in IndexedDB
  const offlineTrack: OfflineTrack = {
    id: trackId,
    audio: blob,
    cachedAt: new Date(),
  };

  await db.offlineTracks.put(offlineTrack);

  // Also download artwork if we have track metadata
  const trackInfo = await db.cachedTracks.get(trackId);
  if (trackInfo?.artist && trackInfo?.album) {
    // Best-effort artwork download - don't fail if artwork unavailable
    try {
      await downloadArtworkForOffline(trackInfo.artist, trackInfo.album);
    } catch {
      // Artwork download failed, continue without it
    }
  }
}

/**
 * Get an offline track's audio blob.
 */
export async function getOfflineTrack(trackId: string): Promise<Blob | null> {
  const track = await db.offlineTracks.get(trackId);
  return track?.audio || null;
}

/**
 * Check if a track is available offline.
 */
export async function isTrackOffline(trackId: string): Promise<boolean> {
  const count = await db.offlineTracks.where('id').equals(trackId).count();
  return count > 0;
}

/**
 * Remove a track from offline storage.
 */
export async function removeOfflineTrack(trackId: string): Promise<void> {
  await db.offlineTracks.delete(trackId);
}

/**
 * Download artwork for an album for offline use.
 * Returns the hash if successful, null if artwork unavailable.
 */
export async function downloadArtworkForOffline(
  artist: string,
  album: string
): Promise<string | null> {
  const hash = await computeAlbumHash(artist, album);

  // Check if already downloaded
  const existing = await db.offlineArtwork.get(hash);
  if (existing) {
    return hash;
  }

  // Try to fetch thumb size (smaller, sufficient for offline)
  const response = await fetch(`/api/v1/artwork/${hash}/thumb`);
  if (!response.ok) {
    // Artwork not available - not an error, just unavailable
    return null;
  }

  const blob = await response.blob();

  // Store in IndexedDB
  const offlineArtwork: OfflineArtwork = {
    hash,
    artwork: blob,
    cachedAt: new Date(),
  };

  await db.offlineArtwork.put(offlineArtwork);
  return hash;
}

/**
 * Get offline artwork blob by hash.
 */
export async function getOfflineArtwork(hash: string): Promise<Blob | null> {
  const artwork = await db.offlineArtwork.get(hash);
  return artwork?.artwork || null;
}

/**
 * Get offline artwork by artist/album.
 */
export async function getOfflineArtworkByAlbum(
  artist: string,
  album: string
): Promise<Blob | null> {
  const hash = await computeAlbumHash(artist, album);
  return getOfflineArtwork(hash);
}

/**
 * Check if artwork is available offline.
 */
export async function isArtworkOffline(hash: string): Promise<boolean> {
  const count = await db.offlineArtwork.where('hash').equals(hash).count();
  return count > 0;
}

/**
 * Create an object URL for offline artwork.
 */
export function createOfflineArtworkUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Get all offline track IDs.
 */
export async function getOfflineTrackIds(): Promise<string[]> {
  const tracks = await db.offlineTracks.toArray();
  return tracks.map((t) => t.id);
}

/**
 * Get storage usage for offline tracks and artwork.
 */
export async function getOfflineStorageUsage(): Promise<{
  count: number;
  sizeBytes: number;
  sizeFormatted: string;
  artworkCount: number;
  artworkSizeBytes: number;
}> {
  const tracks = await db.offlineTracks.toArray();
  const artwork = await db.offlineArtwork.toArray();

  const trackSizeBytes = tracks.reduce((total, track) => total + track.audio.size, 0);
  const artworkSizeBytes = artwork.reduce((total, art) => total + art.artwork.size, 0);

  return {
    count: tracks.length,
    sizeBytes: trackSizeBytes + artworkSizeBytes,
    sizeFormatted: formatBytes(trackSizeBytes + artworkSizeBytes),
    artworkCount: artwork.length,
    artworkSizeBytes,
  };
}

/**
 * Clear all offline tracks and artwork.
 */
export async function clearAllOfflineTracks(): Promise<void> {
  await db.offlineTracks.clear();
  await db.offlineArtwork.clear();
}

/**
 * Get a URL for playing an offline track.
 * Creates an object URL from the stored blob.
 */
export function createOfflineTrackUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke an offline track URL to free memory.
 */
export function revokeOfflineTrackUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get storage quota information.
 */
export async function getStorageQuota(): Promise<{
  used: number;
  quota: number;
  usedFormatted: string;
  quotaFormatted: string;
  percentUsed: number;
} | null> {
  if (!navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;

    return {
      used,
      quota,
      usedFormatted: formatBytes(used),
      quotaFormatted: formatBytes(quota),
      percentUsed: quota > 0 ? Math.round((used / quota) * 100) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Get detailed info for all offline tracks including metadata from cache.
 */
export interface OfflineTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  sizeBytes: number;
  sizeFormatted: string;
  cachedAt: Date;
}

export async function getOfflineTracksWithInfo(): Promise<OfflineTrackInfo[]> {
  const offlineTracks = await db.offlineTracks.toArray();
  const cachedTracks = await db.cachedTracks.toArray();

  // Create a map for fast lookup
  const trackInfoMap = new Map<string, CachedTrack>();
  cachedTracks.forEach((t) => trackInfoMap.set(t.id, t));

  return offlineTracks.map((track) => {
    const info = trackInfoMap.get(track.id);
    return {
      id: track.id,
      title: info?.title || 'Unknown Title',
      artist: info?.artist || 'Unknown Artist',
      album: info?.album || 'Unknown Album',
      sizeBytes: track.audio.size,
      sizeFormatted: formatBytes(track.audio.size),
      cachedAt: track.cachedAt,
    };
  });
}

/**
 * Download multiple tracks with overall progress.
 */
export async function downloadTracksForOffline(
  trackIds: string[],
  onProgress?: (progress: {
    currentTrack: number;
    totalTracks: number;
    currentTrackProgress: number;
    overallPercentage: number;
  }) => void
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < trackIds.length; i++) {
    const trackId = trackIds[i];

    try {
      await downloadTrackForOffline(trackId, (progress) => {
        onProgress?.({
          currentTrack: i + 1,
          totalTracks: trackIds.length,
          currentTrackProgress: progress.percentage,
          overallPercentage: Math.round(
            ((i + progress.percentage / 100) / trackIds.length) * 100
          ),
        });
      });
      succeeded++;
    } catch (error) {
      console.error(`Failed to download track ${trackId}:`, error);
      failed++;
    }
  }

  return { succeeded, failed };
}
