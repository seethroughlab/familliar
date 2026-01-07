/**
 * Hook for managing favorites with optimistic updates.
 * Uses React Query as single source of truth for favorites state.
 */
import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { favoritesApi, type FavoriteTrack, type FavoritesListResponse } from '../api/client';

export interface UseFavoritesResult {
  /** Set of favorite track IDs for O(1) lookup */
  favoriteIds: Set<string>;
  /** Check if a track is favorited */
  isFavorite: (trackId: string) => boolean;
  /** Toggle favorite status (optimistic update) */
  toggle: (trackId: string) => void;
  /** List of favorite tracks with metadata */
  favorites: FavoriteTrack[];
  /** Total count of favorites */
  total: number;
  /** Loading state */
  isLoading: boolean;
}

/**
 * Hook for managing favorites with shared state and optimistic updates.
 * Fetches all favorites once and provides O(1) lookups for heart icon state.
 */
export function useFavorites(): UseFavoritesResult {
  const queryClient = useQueryClient();

  // Fetch all favorites (source of truth)
  const { data, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => favoritesApi.list(10000, 0), // Get all favorites
    staleTime: 30000, // Consider fresh for 30s
  });

  // Derive a Set for O(1) lookups
  const favoriteIds = useMemo(
    () => new Set(data?.favorites.map((f) => f.id) ?? []),
    [data]
  );

  // Check if a track is favorited
  const isFavorite = useCallback(
    (trackId: string) => favoriteIds.has(trackId),
    [favoriteIds]
  );

  // Toggle mutation with optimistic updates
  const toggleMutation = useMutation({
    mutationFn: favoritesApi.toggle,
    onMutate: async (trackId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<FavoritesListResponse>(['favorites']);

      // Optimistically update
      queryClient.setQueryData<FavoritesListResponse>(['favorites'], (old) => {
        if (!old) return old;

        const isCurrentlyFavorite = old.favorites.some((f) => f.id === trackId);

        if (isCurrentlyFavorite) {
          // Remove from favorites
          return {
            ...old,
            favorites: old.favorites.filter((f) => f.id !== trackId),
            total: old.total - 1,
          };
        } else {
          // Add to favorites (with placeholder data - will be refreshed)
          const newFavorite: FavoriteTrack = {
            id: trackId,
            title: null,
            artist: null,
            album: null,
            duration_seconds: null,
            genre: null,
            year: null,
            favorited_at: new Date().toISOString(),
          };
          return {
            ...old,
            favorites: [newFavorite, ...old.favorites],
            total: old.total + 1,
          };
        }
      });

      return { previous };
    },
    onError: (_err, _trackId, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['favorites'], context.previous);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  return {
    favoriteIds,
    isFavorite,
    toggle: toggleMutation.mutate,
    favorites: data?.favorites ?? [],
    total: data?.total ?? 0,
    isLoading,
  };
}
