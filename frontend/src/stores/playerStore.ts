import { create } from 'zustand';
import type { Track, QueueItem } from '../types';

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
}

let queueIdCounter = 0;
const generateQueueId = () => `queue-${++queueIdCounter}`;

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

  // Setters
  setCurrentTrack: (track) => set({ currentTrack: track }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration: duration }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  toggleRepeat: () => set((state) => ({
    repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'
  })),

  // Queue actions
  addToQueue: (track) => {
    set((state) => ({
      queue: [...state.queue, { track, queueId: generateQueueId() }],
    }));
  },

  removeFromQueue: (queueId) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.queueId !== queueId),
    }));
  },

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

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
  },
}));
