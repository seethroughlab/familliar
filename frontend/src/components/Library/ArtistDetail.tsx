import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Play,
  Loader2,
  Music,
  Disc,
  Clock,
  Users,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { libraryApi, tracksApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';

interface Props {
  artistName: string;
  onBack: () => void;
}

export function ArtistDetail({ artistName, onBack }: Props) {
  const { setQueue } = usePlayerStore();
  const [showFullBio, setShowFullBio] = useState(false);

  const {
    data: artist,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['artist', artistName],
    queryFn: () => libraryApi.getArtist(artistName),
  });

  const handleRefreshLastfm = async () => {
    await libraryApi.getArtist(artistName, true);
    refetch();
  };

  const handlePlayAll = () => {
    if (!artist || artist.tracks.length === 0) return;

    const queueTracks = artist.tracks.map((t) => ({
      id: t.id,
      file_path: '',
      title: t.title || 'Unknown',
      artist: artist.name,
      album: t.album || null,
      album_artist: null,
      album_type: 'album' as const,
      track_number: t.track_number,
      disc_number: null,
      year: t.year,
      genre: null,
      duration_seconds: t.duration_seconds || null,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, 0);
  };

  const handlePlayAlbum = (albumName: string) => {
    if (!artist) return;

    const albumTracks = artist.tracks.filter((t) => t.album === albumName);
    if (albumTracks.length === 0) return;

    const queueTracks = albumTracks.map((t) => ({
      id: t.id,
      file_path: '',
      title: t.title || 'Unknown',
      artist: artist.name,
      album: t.album || null,
      album_artist: null,
      album_type: 'album' as const,
      track_number: t.track_number,
      disc_number: null,
      year: t.year,
      genre: null,
      duration_seconds: t.duration_seconds || null,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, 0);
  };

  const handlePlayTrack = (trackIndex: number) => {
    if (!artist || artist.tracks.length === 0) return;

    const queueTracks = artist.tracks.map((t) => ({
      id: t.id,
      file_path: '',
      title: t.title || 'Unknown',
      artist: artist.name,
      album: t.album || null,
      album_artist: null,
      album_type: 'album' as const,
      track_number: t.track_number,
      disc_number: null,
      year: t.year,
      genre: null,
      duration_seconds: t.duration_seconds || null,
      format: null,
      analysis_version: 0,
    }));
    setQueue(queueTracks, trackIndex);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins} min`;
  };

  const formatNumber = (num: number | null) => {
    if (!num) return '0';
    return num.toLocaleString();
  };

  // Strip HTML from Last.fm bio
  const stripHtml = (html: string | null) => {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>Artist not found</p>
        <button
          onClick={onBack}
          className="mt-4 text-green-500 hover:text-green-400"
        >
          Go back
        </button>
      </div>
    );
  }

  const bioText = stripHtml(showFullBio ? artist.bio_content : artist.bio_summary);

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Artist image or fallback */}
        <div className="w-32 h-32 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 relative">
          {artist.image_url ? (
            <img
              src={artist.image_url}
              alt={artist.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <img
              src={tracksApi.getArtworkUrl(artist.first_track_id, 'thumb')}
              alt={artist.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          {/* Fallback icon if both images fail */}
          <div className="absolute inset-0 flex items-center justify-center -z-10">
            <Users className="w-12 h-12 text-zinc-600" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold truncate">{artist.name}</h2>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Music className="w-4 h-4" />
              {artist.track_count} tracks
            </span>
            <span className="flex items-center gap-1">
              <Disc className="w-4 h-4" />
              {artist.album_count} albums
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatTotalDuration(artist.total_duration_seconds)}
            </span>
          </div>

          {/* Last.fm stats */}
          {artist.listeners && (
            <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
              <span>{formatNumber(artist.listeners)} Last.fm listeners</span>
              {artist.playcount && (
                <span>{formatNumber(artist.playcount)} scrobbles</span>
              )}
            </div>
          )}

          {/* Tags */}
          {artist.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {artist.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayAll}
            disabled={artist.tracks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-full transition-colors"
          >
            <Play className="w-4 h-4" fill="currentColor" />
            Play All
          </button>

          {artist.lastfm_url && (
            <a
              href={artist.lastfm_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              title="View on Last.fm"
            >
              <ExternalLink className="w-5 h-5 text-zinc-400" />
            </a>
          )}

          <button
            onClick={handleRefreshLastfm}
            disabled={isRefetching}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Refresh Last.fm data"
          >
            <RefreshCw
              className={`w-5 h-5 text-zinc-400 ${isRefetching ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Bio section */}
      {bioText && (
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{bioText}</p>
          {artist.bio_content &&
            artist.bio_content !== artist.bio_summary && (
              <button
                onClick={() => setShowFullBio(!showFullBio)}
                className="flex items-center gap-1 mt-2 text-xs text-purple-400 hover:text-purple-300"
              >
                {showFullBio ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Read more
                  </>
                )}
              </button>
            )}
        </div>
      )}

      {/* Albums section */}
      {artist.albums.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Albums in Library</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {artist.albums.map((album) => (
              <div
                key={album.name}
                className="group bg-zinc-800/50 rounded-lg overflow-hidden hover:bg-zinc-800 transition-colors cursor-pointer"
                onClick={() => handlePlayAlbum(album.name)}
              >
                <div className="aspect-square bg-zinc-700 relative">
                  <img
                    src={tracksApi.getArtworkUrl(album.first_track_id, 'thumb')}
                    alt={album.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-10 h-10" fill="currentColor" />
                  </div>
                </div>
                <div className="p-3">
                  <div className="font-medium truncate">{album.name}</div>
                  <div className="text-xs text-zinc-400">
                    {album.year && <span>{album.year} · </span>}
                    {album.track_count} tracks
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All tracks section */}
      <div>
        <h3 className="text-lg font-semibold mb-3">All Tracks</h3>
        <div className="space-y-1">
          {artist.tracks.map((track, idx) => (
            <div
              key={track.id}
              onClick={() => handlePlayTrack(idx)}
              className="group flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors"
            >
              <div className="w-8 text-center">
                <span className="group-hover:hidden text-sm text-zinc-500">
                  {track.track_number || idx + 1}
                </span>
                <Play
                  className="hidden group-hover:block w-4 h-4 mx-auto text-white"
                  fill="currentColor"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {track.title || 'Unknown Title'}
                </div>
                {track.album && (
                  <div className="text-sm text-zinc-500 truncate">
                    {track.album}
                  </div>
                )}
              </div>

              <div className="text-sm text-zinc-500">
                {formatDuration(track.duration_seconds)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Similar artists (if available) */}
      {artist.similar_artists.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Similar Artists</h3>
          <div className="flex flex-wrap gap-2">
            {artist.similar_artists.slice(0, 10).map((similar) => (
              <span
                key={similar.name}
                className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full text-sm hover:bg-zinc-700 transition-colors"
              >
                {similar.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
