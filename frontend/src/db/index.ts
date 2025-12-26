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

export interface PendingAction {
  id?: number; // Auto-increment
  type: 'scrobble' | 'now_playing' | 'sync_spotify';
  payload: unknown;
  createdAt: Date;
  retries: number;
}

export class FamiliarDB extends Dexie {
  deviceProfile!: Table<DeviceProfile>;
  chatSessions!: Table<ChatSession>;
  cachedTracks!: Table<CachedTrack>;
  offlineTracks!: Table<OfflineTrack>;
  pendingActions!: Table<PendingAction>;

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
  }
}

export const db = new FamiliarDB();
