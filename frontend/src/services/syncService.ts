/**
 * Sync service for queuing actions when offline and syncing when back online.
 */
import { db, type PendingAction } from '../db';

type ActionType = 'scrobble' | 'now_playing' | 'sync_spotify';

/**
 * Queue an action to be performed when online.
 */
export async function queueAction(
  type: ActionType,
  payload: unknown
): Promise<void> {
  const action: PendingAction = {
    type,
    payload,
    createdAt: new Date(),
    retries: 0,
  };

  await db.pendingActions.add(action);
}

/**
 * Get the count of pending actions.
 */
export async function getPendingCount(): Promise<number> {
  return db.pendingActions.count();
}

/**
 * Get all pending actions.
 */
export async function getPendingActions(): Promise<PendingAction[]> {
  return db.pendingActions.orderBy('createdAt').toArray();
}

/**
 * Process all pending actions.
 * Returns the number of successfully processed actions.
 */
export async function processPendingActions(): Promise<{
  processed: number;
  failed: number;
}> {
  const actions = await getPendingActions();
  let processed = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      await executeAction(action);
      await db.pendingActions.delete(action.id!);
      processed++;
    } catch (error) {
      console.error(`Failed to process action ${action.type}:`, error);

      // Increment retry count
      await db.pendingActions.update(action.id!, {
        retries: action.retries + 1,
      });

      // Remove if too many retries
      if (action.retries >= 3) {
        await db.pendingActions.delete(action.id!);
        failed++;
      }
    }
  }

  return { processed, failed };
}

/**
 * Execute a single action.
 */
async function executeAction(action: PendingAction): Promise<void> {
  switch (action.type) {
    case 'scrobble':
      await executeScrobble(action.payload as ScrobblePayload);
      break;
    case 'now_playing':
      await executeNowPlaying(action.payload as NowPlayingPayload);
      break;
    case 'sync_spotify':
      await executeSyncSpotify();
      break;
    default:
      console.warn(`Unknown action type: ${action.type}`);
  }
}

interface ScrobblePayload {
  trackId: string;
  timestamp: string;
}

interface NowPlayingPayload {
  trackId: string;
}

async function executeScrobble(payload: ScrobblePayload): Promise<void> {
  const response = await fetch('/api/v1/lastfm/scrobble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      track_id: payload.trackId,
      timestamp: payload.timestamp,
    }),
  });

  if (!response.ok) {
    throw new Error(`Scrobble failed: ${response.statusText}`);
  }
}

async function executeNowPlaying(payload: NowPlayingPayload): Promise<void> {
  const response = await fetch('/api/v1/lastfm/now-playing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: payload.trackId }),
  });

  if (!response.ok) {
    throw new Error(`Now playing failed: ${response.statusText}`);
  }
}

async function executeSyncSpotify(): Promise<void> {
  const response = await fetch('/api/v1/spotify/sync', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Spotify sync failed: ${response.statusText}`);
  }
}

/**
 * Clear all pending actions.
 */
export async function clearPendingActions(): Promise<void> {
  await db.pendingActions.clear();
}

/**
 * Initialize online/offline listeners.
 * Call this once when the app starts.
 */
export function initSyncListeners(): () => void {
  const handleOnline = async () => {
    console.log('Back online, processing pending actions...');
    const result = await processPendingActions();
    console.log(`Processed ${result.processed} actions, ${result.failed} failed`);
  };

  window.addEventListener('online', handleOnline);

  // Process any pending actions on startup if online
  if (navigator.onLine) {
    processPendingActions().catch(console.error);
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
