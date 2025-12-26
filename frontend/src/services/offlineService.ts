/**
 * Offline service for managing track downloads and offline playback.
 */
import { db, type OfflineTrack } from '../db';

/**
 * Download a track for offline playback.
 */
export async function downloadTrackForOffline(trackId: string): Promise<void> {
  // Check if already downloaded
  const existing = await db.offlineTracks.get(trackId);
  if (existing) {
    return;
  }

  // Fetch the audio file
  const response = await fetch(`/api/v1/tracks/${trackId}/stream`);
  if (!response.ok) {
    throw new Error(`Failed to download track: ${response.statusText}`);
  }

  const blob = await response.blob();

  // Store in IndexedDB
  const offlineTrack: OfflineTrack = {
    id: trackId,
    audio: blob,
    cachedAt: new Date(),
  };

  await db.offlineTracks.put(offlineTrack);
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
 * Get all offline track IDs.
 */
export async function getOfflineTrackIds(): Promise<string[]> {
  const tracks = await db.offlineTracks.toArray();
  return tracks.map((t) => t.id);
}

/**
 * Get storage usage for offline tracks.
 */
export async function getOfflineStorageUsage(): Promise<{
  count: number;
  sizeBytes: number;
  sizeFormatted: string;
}> {
  const tracks = await db.offlineTracks.toArray();
  const sizeBytes = tracks.reduce((total, track) => total + track.audio.size, 0);

  return {
    count: tracks.length,
    sizeBytes,
    sizeFormatted: formatBytes(sizeBytes),
  };
}

/**
 * Clear all offline tracks.
 */
export async function clearAllOfflineTracks(): Promise<void> {
  await db.offlineTracks.clear();
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
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
