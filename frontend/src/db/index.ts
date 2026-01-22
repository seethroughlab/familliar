/**
 * Dexie database for local device storage.
 *
 * Stores device profile info, chat history, and offline data.
 */
import Dexie, { type Table } from 'dexie';

export interface DeviceProfile {
  id: 'device-profile'; // Single record with fixed ID
  profileId: string; // UUID from backend
  deviceId: string; // UUID for this device
  createdAt: Date;
}

// Chat types
export interface ChatToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'running' | 'complete';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ChatToolCall[];
  timestamp: Date;
}

export interface ChatSession {
  id: string; // UUID
  profileId: string; // UUID from backend
  title: string; // Auto-generated from first user message
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// PWA Offline types
export interface CachedTrack {
  id: string; // Track UUID
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  genre: string | null;
  year: number | null;
  durationSeconds: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  cachedAt: Date;
}

export interface OfflineTrack {
  id: string; // Track UUID
  audio: Blob;
  cachedAt: Date;
}

export interface OfflineArtwork {
  hash: string; // Album hash (from computeAlbumHash)
  artwork: Blob;
  cachedAt: Date;
}

export interface PendingAction {
  id?: number; // Auto-increment
  profileId: string; // Profile that queued this action
  type: 'scrobble' | 'now_playing' | 'sync_spotify';
  payload: unknown;
  createdAt: Date;
  retries: number;
}

// Cached profile for offline support
export interface CachedProfile {
  id: string;
  name: string;
  color: string | null;
  avatar_url: string | null;
  has_spotify: boolean;
  has_lastfm: boolean;
  cachedAt: Date;
}

// Player state persistence
export interface PersistedPlayerState {
  id: string; // Profile ID (was fixed 'player-state', now per-profile)
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  queueTrackIds: string[]; // Just store track IDs, not full objects
  queueIndex: number;
  currentTrackId: string | null;
  shuffleOrder: number[]; // Randomized queue indices when shuffle is on
  shuffleIndex: number; // Current position in shuffleOrder (-1 when off)
  updatedAt: Date;
}

export class FamiliarDB extends Dexie {
  deviceProfile!: Table<DeviceProfile>;
  chatSessions!: Table<ChatSession>;
  cachedTracks!: Table<CachedTrack>;
  offlineTracks!: Table<OfflineTrack>;
  offlineArtwork!: Table<OfflineArtwork>;
  pendingActions!: Table<PendingAction>;
  playerState!: Table<PersistedPlayerState>;
  cachedProfiles!: Table<CachedProfile>;

  constructor() {
    super('FamiliarDB');

    this.version(1).stores({
      deviceProfile: 'id',
    });

    // Version 2: Add chat history
    this.version(2).stores({
      deviceProfile: 'id',
      chatSessions: 'id, profileId, updatedAt',
    });

    // Version 3: Add PWA offline support
    this.version(3).stores({
      deviceProfile: 'id',
      chatSessions: 'id, profileId, updatedAt',
      cachedTracks: 'id, artist, album, cachedAt',
      offlineTracks: 'id, cachedAt',
      pendingActions: '++id, type, createdAt',
    });

    // Version 4: Add player state persistence
    this.version(4).stores({
      deviceProfile: 'id',
      chatSessions: 'id, profileId, updatedAt',
      cachedTracks: 'id, artist, album, cachedAt',
      offlineTracks: 'id, cachedAt',
      pendingActions: '++id, type, createdAt',
      playerState: 'id',
    });

    // Version 5: Add profile context to pendingActions and playerState
    this.version(5).stores({
      deviceProfile: 'id',
      chatSessions: 'id, profileId, updatedAt',
      cachedTracks: 'id, artist, album, cachedAt',
      offlineTracks: 'id, cachedAt',
      pendingActions: '++id, profileId, type, createdAt',
      playerState: 'id', // id is now profileId
    });

    // Version 6: Add offline artwork storage
    this.version(6).stores({
      deviceProfile: 'id',
      chatSessions: 'id, profileId, updatedAt',
      cachedTracks: 'id, artist, album, cachedAt',
      offlineTracks: 'id, cachedAt',
      offlineArtwork: 'hash, cachedAt',
      pendingActions: '++id, profileId, type, createdAt',
      playerState: 'id',
    });

    // Version 7: Add cached profiles for offline support
    this.version(7).stores({
      deviceProfile: 'id',
      chatSessions: 'id, profileId, updatedAt',
      cachedTracks: 'id, artist, album, cachedAt',
      offlineTracks: 'id, cachedAt',
      offlineArtwork: 'hash, cachedAt',
      pendingActions: '++id, profileId, type, createdAt',
      playerState: 'id',
      cachedProfiles: 'id, cachedAt',
    });
  }
}

export const db = new FamiliarDB();
