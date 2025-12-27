import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Generate UUID that works in non-secure contexts (HTTP)
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback for non-secure contexts
    }
  }
  // Fallback UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export interface ContextTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  duration_seconds?: number;
  year?: number;
}

export interface BandcampResult {
  type: string;
  name: string;
  artist: string;
  url: string;
  genre?: string;
  release_date?: string;
  based_on?: {
    spotify_track?: string;
    spotify_artist?: string;
  };
}

export interface SpotifyFavorite {
  id?: string;
  spotify_id?: string;
  title?: string;
  name?: string;
  artist?: string;
  album?: string;
  spotify_url?: string;
  added_at?: string;
  spotify_added_at?: string;
}

export interface LibraryStats {
  total_tracks: number;
  total_artists: number;
  total_albums: number;
  top_genres: Array<{ genre: string; count: number }>;
}

export interface SpotifySyncStats {
  total_favorites: number;
  matched: number;
  unmatched: number;
  match_rate: number;
  last_sync: string | null;
  connected: boolean;
}

export interface ContextItem {
  id: string;
  type: 'tracks' | 'bandcamp' | 'favorites' | 'stats' | 'spotify_stats';
  title: string;
  timestamp: Date;
  data: ContextTrack[] | BandcampResult[] | SpotifyFavorite[] | LibraryStats | SpotifySyncStats;
}

interface ContextState {
  items: ContextItem[];
  addItem: (item: Omit<ContextItem, 'id' | 'timestamp'>) => void;
  clearItems: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        console.log('[ContextStore] addItem called:', item.type, item.title, 'current items:', get().items.length);
        const newItem: ContextItem = {
          ...item,
          id: generateId(),
          timestamp: new Date(),
        };
        const currentItems = get().items;
        const newItems = [newItem, ...currentItems].slice(0, 10);
        console.log('[ContextStore] Setting new items count:', newItems.length);
        set({ items: newItems });
        console.log('[ContextStore] After set, items:', get().items.length);
      },

      clearItems: () => set({ items: [] }),
    }),
    {
      name: 'familiar-context',
      // Convert Date objects on rehydration
      onRehydrateStorage: () => (state) => {
        if (state?.items) {
          state.items = state.items.map((item) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          }));
        }
      },
    }
  )
);
