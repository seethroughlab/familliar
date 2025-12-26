/**
 * Player state persistence service.
 * Saves and loads player state from IndexedDB.
 */
import { db, type PersistedPlayerState } from '../db';
import type { Track, QueueItem } from '../types';

const PLAYER_STATE_ID = 'player-state' as const;

/**
 * Save player state to IndexedDB.
 */
export async function savePlayerState(state: {
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  queue: QueueItem[];
  queueIndex: number;
  currentTrack: Track | null;
}): Promise<void> {
  const persistedState: PersistedPlayerState = {
    id: PLAYER_STATE_ID,
    volume: state.volume,
    shuffle: state.shuffle,
    repeat: state.repeat,
    queueTrackIds: state.queue.map((item) => item.track.id),
    queueIndex: state.queueIndex,
    currentTrackId: state.currentTrack?.id || null,
    updatedAt: new Date(),
  };

  await db.playerState.put(persistedState);
}

/**
 * Load player state from IndexedDB.
 */
export async function loadPlayerState(): Promise<PersistedPlayerState | null> {
  const state = await db.playerState.get(PLAYER_STATE_ID);
  return state || null;
}

/**
 * Fetch tracks by IDs from API.
 */
export async function fetchTracksByIds(trackIds: string[]): Promise<Track[]> {
  if (trackIds.length === 0) return [];

  try {
    // Fetch each track individually (could be optimized with a batch endpoint)
    const tracks: Track[] = [];
    for (const id of trackIds) {
      try {
        const response = await fetch(`/api/v1/tracks/${id}`);
        if (response.ok) {
          const track = await response.json();
          tracks.push(track);
        }
      } catch {
        // Skip tracks that can't be fetched
        console.warn(`Failed to fetch track ${id}`);
      }
    }
    return tracks;
  } catch (error) {
    console.error('Failed to fetch tracks:', error);
    return [];
  }
}

/**
 * Clear persisted player state.
 */
export async function clearPlayerState(): Promise<void> {
  await db.playerState.delete(PLAYER_STATE_ID);
}

/**
 * Debounced save function to avoid too many writes.
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSavePlayerState(state: {
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  queue: QueueItem[];
  queueIndex: number;
  currentTrack: Track | null;
}): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    savePlayerState(state).catch(console.error);
    saveTimeout = null;
  }, 500); // Debounce by 500ms
}
