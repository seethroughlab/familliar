/**
 * Library view preference store with localStorage persistence.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_BROWSER_ID } from '../components/Library/types';

interface LibraryViewState {
  // Current browser ID (e.g., 'artist-list', 'album-grid', 'track-list')
  selectedBrowserId: string;

  // Actions
  setSelectedBrowserId: (id: string) => void;
}

export const useLibraryViewStore = create<LibraryViewState>()(
  persist(
    (set) => ({
      selectedBrowserId: DEFAULT_BROWSER_ID,

      setSelectedBrowserId: (id: string) => set({ selectedBrowserId: id }),
    }),
    {
      name: 'familiar-library-view',
    }
  )
);
