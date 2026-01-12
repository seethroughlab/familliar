/**
 * AlbumArtwork - Reactive album artwork component.
 *
 * Automatically requests artwork, shows loading placeholder, and updates
 * when artwork becomes available. Uses the artworkStore for state management.
 */
import { useEffect, useState } from 'react';
import { Disc } from 'lucide-react';
import { useArtworkStore } from '../stores/artworkStore';

interface AlbumArtworkProps {
  artist: string | null | undefined;
  album: string | null | undefined;
  trackId?: string;
  size?: 'thumb' | 'full';
  className?: string;
  // For backwards compatibility - if provided, use this as fallback
  fallbackTrackId?: string;
}

export function AlbumArtwork({
  artist,
  album,
  trackId,
  size = 'thumb',
  className = '',
  fallbackTrackId,
}: AlbumArtworkProps) {
  const { requestArtwork, getStatus, getArtworkUrl } = useArtworkStore();
  const [imageError, setImageError] = useState(false);

  // Normalize artist/album
  const normalizedArtist = artist || 'Unknown';
  const normalizedAlbum = album || 'Unknown';

  // Request artwork on mount and when artist/album changes
  useEffect(() => {
    if (normalizedArtist !== 'Unknown' && normalizedAlbum !== 'Unknown') {
      requestArtwork([{ artist: normalizedArtist, album: normalizedAlbum, trackId }]);
    }
  }, [normalizedArtist, normalizedAlbum, trackId, requestArtwork]);

  // Reset error state when artist/album changes
  useEffect(() => {
    setImageError(false);
  }, [normalizedArtist, normalizedAlbum]);

  const status = getStatus(normalizedArtist, normalizedAlbum);
  const artworkUrl = getArtworkUrl(normalizedArtist, normalizedAlbum, size);

  // Determine what to show
  const showPlaceholder = !artist || !album || status === 'unknown' || status === 'checking' || status === 'pending' || status === 'missing' || imageError;

  // For backwards compatibility, try the old track-based URL if we have a fallback
  const fallbackUrl = fallbackTrackId ? `/api/v1/tracks/${fallbackTrackId}/artwork?size=${size}` : null;

  if (showPlaceholder && !fallbackUrl) {
    return (
      <div className={`bg-zinc-700 flex items-center justify-center ${className}`}>
        <Disc className="w-1/3 h-1/3 text-zinc-500" />
      </div>
    );
  }

  const imageUrl = artworkUrl || fallbackUrl;

  return (
    <div className={`bg-zinc-700 relative ${className}`}>
      {imageUrl && !imageError && (
        <img
          src={imageUrl}
          alt={`${normalizedArtist} - ${normalizedAlbum}`}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
      {/* Fallback icon - shown behind the image */}
      <div className="absolute inset-0 flex items-center justify-center -z-10">
        <Disc className="w-1/3 h-1/3 text-zinc-500" />
      </div>
    </div>
  );
}

/**
 * Simpler hook for cases where you just need the URL.
 * Returns null if artwork isn't ready yet.
 */
export function useAlbumArtworkUrl(
  artist: string | null | undefined,
  album: string | null | undefined,
  size: 'thumb' | 'full' = 'thumb'
): string | null {
  const { requestArtwork, getArtworkUrl } = useArtworkStore();

  useEffect(() => {
    if (artist && album) {
      requestArtwork([{ artist, album }]);
    }
  }, [artist, album, requestArtwork]);

  return getArtworkUrl(artist || 'Unknown', album || 'Unknown', size);
}
