import { create } from 'zustand';
import type { Track, QueueItem } from '../types';
import {
  debouncedSavePlayerState,
  loadPlayerState,
  fetchTracksByIds,
} from '../services/playerPersistence';

type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // Current playback
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  // Playback modes
  shuffle: boolean;
  repeat: RepeatMode;

  // Queue
  queue: QueueItem[];
  queueIndex: number;
  history: Track[];

  // Hydration
  isHydrated: boolean;

  // Actions
  setCurrentTrack: (track: Track | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  // Queue actions
  addToQueue: (track: Track) => void;
  removeFromQueue: (queueId: string) => void;
  clearQueue: () => void;
  playTrack: (track: Track) => void;
  playNext: () => void;
  playPrevious: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;

  // Hydration
  hydrate: () => Promise<void>;
}

let queueIdCounter = 0;
const generateQueueId = () => `queue-${++queueIdCounter}`;

// Helper to persist state after changes
const persistState = () => {
  const state = usePlayerStore.getState();
  debouncedSavePlayerState({
    volume: state.volume,
    shuffle: state.shuffle,
    repeat: state.repeat,
    queue: state.queue,
    queueIndex: state.queueIndex,
    currentTrack: state.currentTrack,
  });
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  shuffle: false,
  repeat: 'off',
  queue: [],
  queueIndex: -1,
  history: [],
  isHydrated: false,

  // Setters
  setCurrentTrack: (track) => {
    set({ currentTrack: track });
    persistState();
  },
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration: duration }),
  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)) });
    persistState();
  },
  toggleShuffle: () => {
    set((state) => ({ shuffle: !state.shuffle }));
    persistState();
  },
  toggleRepeat: () => {
    set((state) => ({
      repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'
    }));
    persistState();
  },

  // Queue actions
  addToQueue: (track) => {
    set((state) => ({
      queue: [...state.queue, { track, queueId: generateQueueId() }],
    }));
    persistState();
  },

  removeFromQueue: (queueId) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.queueId !== queueId),
    }));
    persistState();
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 });
    persistState();
  },

  playTrack: (track) => {
    const state = get();
    // Add current track to history
    if (state.currentTrack) {
      set((s) => ({
        history: [...s.history.slice(-49), s.currentTrack!],
      }));
    }
    set({
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
    });
    persistState();
  },

  playNext: () => {
    const state = get();
    if (state.queue.length === 0) {
      set({ isPlaying: false });
      return;
    }

    const nextIndex = state.queueIndex + 1;
    if (nextIndex < state.queue.length) {
      const nextItem = state.queue[nextIndex];
      if (state.currentTrack) {
        set((s) => ({
          history: [...s.history.slice(-49), s.currentTrack!],
        }));
      }
      set({
        currentTrack: nextItem.track,
        queueIndex: nextIndex,
        isPlaying: true,
        currentTime: 0,
      });
      persistState();
    } else {
      set({ isPlaying: false });
    }
  },

  playPrevious: () => {
    const state = get();
    // If we're more than 3 seconds in, restart current track
    if (state.currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    // Otherwise go to previous in history
    if (state.history.length > 0) {
      const prevTrack = state.history[state.history.length - 1];
      set((s) => ({
        currentTrack: prevTrack,
        history: s.history.slice(0, -1),
        isPlaying: true,
        currentTime: 0,
        queueIndex: Math.max(-1, s.queueIndex - 1),
      }));
      persistState();
    }
  },

  setQueue: (tracks, startIndex = 0) => {
    const queueItems = tracks.map((track) => ({
      track,
      queueId: generateQueueId(),
    }));
    set({
      queue: queueItems,
      queueIndex: startIndex,
      currentTrack: tracks[startIndex] || null,
      isPlaying: tracks.length > 0,
      currentTime: 0,
    });
    persistState();
  },

  // Hydrate state from IndexedDB
  hydrate: async () => {
    try {
      const persisted = await loadPlayerState();
      if (!persisted) {
        set({ isHydrated: true });
        return;
      }

      // Fetch tracks if we have queue track IDs
      let queue: QueueItem[] = [];
      let currentTrack: Track | null = null;

      if (persisted.queueTrackIds.length > 0) {
        const tracks = await fetchTracksByIds(persisted.queueTrackIds);
        queue = tracks.map((track) => ({
          track,
          queueId: generateQueueId(),
        }));

        // Find current track in queue
        if (persisted.currentTrackId && persisted.queueIndex >= 0) {
          currentTrack = queue[persisted.queueIndex]?.track || null;
        }
      }

      set({
        volume: persisted.volume,
        shuffle: persisted.shuffle,
        repeat: persisted.repeat,
        queue,
        queueIndex: persisted.queueIndex,
        currentTrack,
        isPlaying: false, // Don't auto-play on hydration
        isHydrated: true,
      });
    } catch (error) {
      console.error('Failed to hydrate player state:', error);
      set({ isHydrated: true });
    }
  },
}));
