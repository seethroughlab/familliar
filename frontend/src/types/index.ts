export interface Track {
  id: string;
  file_path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  album_type: 'album' | 'compilation' | 'soundtrack';
  track_number: number | null;
  disc_number: number | null;
  year: number | null;
  genre: string | null;
  duration_seconds: number | null;
  format: string | null;
  analysis_version: number;
  features?: TrackFeatures;
}

export interface TrackFeatures {
  bpm: number | null;
  key: string | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  speechiness: number | null;
}

export interface TrackListResponse {
  items: Track[];
  total: number;
  page: number;
  page_size: number;
}

export interface LibraryStats {
  total_tracks: number;
  total_albums: number;
  total_artists: number;
  albums: number;
  compilations: number;
  soundtracks: number;
  analyzed_tracks: number;
  pending_analysis: number;
}

export interface QueueItem {
  track: Track;
  queueId: string;
}
