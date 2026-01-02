/**
 * Hook for managing track selection state.
 *
 * Supports single select, multi-select (cmd/ctrl+click), and select all.
 */
import { useState, useCallback, useMemo } from 'react';
import type { Track } from '../../../types';

interface UseTrackSelectionOptions {
  /** All available tracks that can be selected */
  tracks: Track[];
}

interface UseTrackSelectionResult {
  /** Set of currently selected track IDs */
  selectedTrackIds: Set<string>;

  /** Number of selected tracks */
  selectedCount: number;

  /** Whether any tracks are selected */
  hasSelection: boolean;

  /** Select a track (multi=true for cmd/ctrl+click behavior) */
  selectTrack: (trackId: string, multi: boolean) => void;

  /** Toggle selection for a track */
  toggleTrack: (trackId: string) => void;

  /** Select all tracks */
  selectAll: () => void;

  /** Clear all selections */
  clearSelection: () => void;

  /** Check if a specific track is selected */
  isSelected: (trackId: string) => boolean;

  /** Get all selected tracks */
  getSelectedTracks: () => Track[];
}

export function useTrackSelection({
  tracks,
}: UseTrackSelectionOptions): UseTrackSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Build a track lookup map for efficient retrieval
  const trackMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const selectTrack = useCallback((trackId: string, multi: boolean) => {
    setSelectedIds((prev) => {
      if (multi) {
        // Multi-select: toggle the clicked track
        const next = new Set(prev);
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
        return next;
      } else {
        // Single select: replace selection with just this track
        // If already the only selection, deselect
        if (prev.size === 1 && prev.has(trackId)) {
          return new Set();
        }
        return new Set([trackId]);
      }
    });
  }, []);

  const toggleTrack = useCallback((trackId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tracks.map((t) => t.id)));
  }, [tracks]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (trackId: string) => selectedIds.has(trackId),
    [selectedIds]
  );

  const getSelectedTracks = useCallback(() => {
    const selected: Track[] = [];
    for (const id of selectedIds) {
      const track = trackMap.get(id);
      if (track) {
        selected.push(track);
      }
    }
    return selected;
  }, [selectedIds, trackMap]);

  return {
    selectedTrackIds: selectedIds,
    selectedCount: selectedIds.size,
    hasSelection: selectedIds.size > 0,
    selectTrack,
    toggleTrack,
    selectAll,
    clearSelection,
    isSelected,
    getSelectedTracks,
  };
}
