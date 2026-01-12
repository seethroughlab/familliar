/**
 * Artwork Store - Reactive state management for album artwork.
 *
 * Handles artwork request queueing, status polling, and reactive updates.
 * Components use this store to display artwork with automatic loading states.
 */
import { create } from 'zustand';
import { computeAlbumHash } from '../utils/albumHash';

// API types
interface QueueBatchResponse {
  status: string;
  queued_count: number;
  existing_count: number;
  queued_hashes: string[];
  existing_hashes: string[];
}

interface StatusBatchResponse {
  status: Record<string, boolean>;
}

// Artwork status for each album
type ArtworkStatus = 'unknown' | 'checking' | 'pending' | 'ready' | 'missing';

interface ArtworkAlbum {
  artist: string;
  album: string;
  trackId?: string;
  hash?: string;
}

interface ArtworkState {
  // Map of "artist::album" -> status
  status: Map<string, ArtworkStatus>;

  // Map of "artist::album" -> computed hash
  hashes: Map<string, string>;

  // Set of hashes currently being polled (pending downloads)
  pendingHashes: Set<string>;

  // Polling state
  isPolling: boolean;
  pollIntervalId: ReturnType<typeof setInterval> | null;

  // Actions
  requestArtwork: (albums: ArtworkAlbum[]) => Promise<void>;
  getStatus: (artist: string, album: string) => ArtworkStatus;
  getHash: (artist: string, album: string) => string | undefined;
  getArtworkUrl: (artist: string, album: string, size: 'thumb' | 'full') => string | null;

  // Internal polling methods
  startPolling: () => void;
  stopPolling: () => void;
}

// Polling configuration
const POLL_INTERVAL_MS = 2000;

// Helper to create cache key
function cacheKey(artist: string, album: string): string {
  return `${artist || 'Unknown'}::${album || 'Unknown'}`;
}

export const useArtworkStore = create<ArtworkState>((set, get) => ({
  status: new Map(),
  hashes: new Map(),
  pendingHashes: new Set(),
  isPolling: false,
  pollIntervalId: null,

  requestArtwork: async (albums: ArtworkAlbum[]) => {
    if (albums.length === 0) return;

    const state = get();
    const newAlbums: ArtworkAlbum[] = [];

    // Filter to only albums we haven't seen yet
    for (const album of albums) {
      const key = cacheKey(album.artist, album.album);
      if (!state.status.has(key)) {
        newAlbums.push(album);
        // Mark as checking immediately
        state.status.set(key, 'checking');
      }
    }

    if (newAlbums.length === 0) return;

    // Update state to show checking status
    set({ status: new Map(state.status) });

    try {
      // Compute hashes for new albums
      const hashPromises = newAlbums.map(async (album) => {
        const hash = await computeAlbumHash(album.artist, album.album);
        return { album, hash };
      });
      const albumsWithHashes = await Promise.all(hashPromises);

      // Store hash mappings
      const newHashes = new Map(get().hashes);
      for (const { album, hash } of albumsWithHashes) {
        const key = cacheKey(album.artist, album.album);
        newHashes.set(key, hash);
      }
      set({ hashes: newHashes });

      // Queue artwork downloads
      const response = await fetch('/api/v1/artwork/queue/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: newAlbums.map((a) => ({
            artist: a.artist,
            album: a.album,
            track_id: a.trackId,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to queue artwork: ${response.status}`);
      }

      const data: QueueBatchResponse = await response.json();

      // Update status based on response
      const newStatus = new Map(get().status);
      const newPending = new Set(get().pendingHashes);

      // Mark existing as ready
      for (const { album, hash } of albumsWithHashes) {
        const key = cacheKey(album.artist, album.album);
        if (data.queued_hashes.includes(hash)) {
          newStatus.set(key, 'pending');
          newPending.add(hash);
        } else {
          // Not queued = either exists or failed
          // Check if it was in existing_hashes (we need to add this to backend response)
          // For now, assume it exists if not queued
          newStatus.set(key, 'ready');
        }
      }

      set({
        status: newStatus,
        pendingHashes: newPending,
      });

      // Start polling if we have pending items
      if (newPending.size > 0) {
        get().startPolling();
      }
    } catch (error) {
      console.error('Failed to request artwork:', error);
      // Mark all as missing on error
      const newStatus = new Map(get().status);
      for (const album of newAlbums) {
        const key = cacheKey(album.artist, album.album);
        newStatus.set(key, 'missing');
      }
      set({ status: newStatus });
    }
  },

  getStatus: (artist: string, album: string): ArtworkStatus => {
    const key = cacheKey(artist, album);
    return get().status.get(key) || 'unknown';
  },

  getHash: (artist: string, album: string): string | undefined => {
    const key = cacheKey(artist, album);
    return get().hashes.get(key);
  },

  getArtworkUrl: (artist: string, album: string, size: 'thumb' | 'full'): string | null => {
    const hash = get().getHash(artist, album);
    if (!hash) return null;
    const status = get().getStatus(artist, album);
    if (status !== 'ready') return null;
    return `/api/v1/artwork/${hash}/${size}`;
  },

  // Internal: start polling for pending artwork
  startPolling: () => {
    const state = get();
    if (state.isPolling) return;

    const pollIntervalId = setInterval(async () => {
      const { pendingHashes, hashes, status } = get();

      if (pendingHashes.size === 0) {
        // Nothing pending, stop polling
        get().stopPolling();
        return;
      }

      try {
        const response = await fetch('/api/v1/artwork/status/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hashes: Array.from(pendingHashes),
          }),
        });

        if (!response.ok) return;

        const data: StatusBatchResponse = await response.json();

        // Update status for each hash
        const newStatus = new Map(status);
        const newPending = new Set(pendingHashes);

        // Find which albums correspond to which hashes
        for (const [key, hash] of hashes.entries()) {
          if (pendingHashes.has(hash)) {
            const exists = data.status[hash];
            if (exists) {
              newStatus.set(key, 'ready');
              newPending.delete(hash);
            }
            // If not exists, keep as pending (still downloading)
          }
        }

        set({
          status: newStatus,
          pendingHashes: newPending,
        });

        // Stop polling if nothing pending
        if (newPending.size === 0) {
          get().stopPolling();
        }
      } catch (error) {
        console.error('Failed to poll artwork status:', error);
      }
    }, POLL_INTERVAL_MS);

    set({ isPolling: true, pollIntervalId });
  },

  // Internal: stop polling
  stopPolling: () => {
    const { pollIntervalId } = get();
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
    set({ isPolling: false, pollIntervalId: null });
  },
}));
