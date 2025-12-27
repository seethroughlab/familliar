import { create } from 'zustand';

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

export const useContextStore = create<ContextState>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => ({
      items: [
        {
          ...item,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
        ...state.items,
      ].slice(0, 10), // Keep last 10 items
    })),

  clearItems: () => set({ items: [] }),
}));
