import axios from 'axios';
import type { Track, TrackListResponse, LibraryStats } from '../types';
import { getSelectedProfileId, clearSelectedProfile } from '../services/profileService';

const api = axios.create({
  baseURL: '/api/v1',
});

// Add X-Profile-ID header to all requests (if a profile is selected)
api.interceptors.request.use(async (config) => {
  try {
    const profileId = await getSelectedProfileId();
    if (profileId) {
      config.headers['X-Profile-ID'] = profileId;
    }
  } catch (error) {
    // Log but don't block requests if profile check fails
    console.error('Failed to get profile ID:', error);
  }
  return config;
});

// Handle 401 errors - profile may have been deleted
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Check if this is an "invalid profile" error
    if (
      error.response?.status === 401 &&
      (error.response?.data?.detail?.includes('re-register') ||
       error.response?.data?.detail?.includes('Invalid profile'))
    ) {
      // Clear the invalid profile selection
      await clearSelectedProfile();
      // The app should redirect to profile selector
      // Dispatch a custom event that App.tsx can listen for
      window.dispatchEvent(new CustomEvent('profile-invalidated'));
    }

    return Promise.reject(error);
  }
);

// Legacy aliases for backwards compatibility
export const getOrCreateDeviceProfile = getSelectedProfileId;
export const clearDeviceProfile = clearSelectedProfile;

export const tracksApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    artist?: string;
    album?: string;
    genre?: string;
    year_from?: number;
    year_to?: number;
    energy_min?: number;
    energy_max?: number;
    valence_min?: number;
    valence_max?: number;
    include_features?: boolean;
  }): Promise<TrackListResponse> => {
    const { data } = await api.get('/tracks', { params });
    return data;
  },

  get: async (id: string): Promise<Track> => {
    const { data } = await api.get(`/tracks/${id}`);
    return data;
  },

  getSimilar: async (id: string, limit = 10): Promise<Track[]> => {
    const { data } = await api.get(`/tracks/${id}/similar`, {
      params: { limit },
    });
    return data;
  },

  getStreamUrl: (id: string): string => {
    return `/api/v1/tracks/${id}/stream`;
  },

  getArtworkUrl: (id: string, size: 'full' | 'thumb' = 'full'): string => {
    return `/api/v1/tracks/${id}/artwork?size=${size}`;
  },

  getLyrics: async (id: string): Promise<LyricsResponse> => {
    const { data } = await api.get(`/tracks/${id}/lyrics`);
    return data;
  },

  enrich: async (id: string): Promise<{ status: string; message: string }> => {
    const { data } = await api.post(`/tracks/${id}/enrich`);
    return data;
  },

  // Metadata editing
  getMetadata: async (id: string): Promise<TrackMetadataResponse> => {
    const { data } = await api.get(`/tracks/${id}/metadata`);
    return data;
  },

  updateMetadata: async (
    id: string,
    update: TrackMetadataUpdate
  ): Promise<TrackMetadataResponse> => {
    const { data } = await api.patch(`/tracks/${id}/metadata`, update);
    return data;
  },
};

// Track metadata types
export interface TrackMetadataUpdate {
  // Core metadata
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  album_artist?: string | null;
  track_number?: number | null;
  disc_number?: number | null;
  year?: number | null;
  genre?: string | null;

  // Extended metadata
  composer?: string | null;
  conductor?: string | null;
  lyricist?: string | null;
  grouping?: string | null;
  comment?: string | null;

  // Sort fields
  sort_artist?: string | null;
  sort_album?: string | null;
  sort_title?: string | null;

  // Lyrics
  lyrics?: string | null;

  // User overrides for analysis values
  user_overrides?: Record<string, number | string | null>;

  // Whether to write changes to the audio file
  write_to_file?: boolean;
}

export interface TrackMetadataResponse {
  id: string;
  file_path: string;

  // Core metadata
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  disc_number: number | null;
  year: number | null;
  genre: string | null;

  // Extended metadata
  composer: string | null;
  conductor: string | null;
  lyricist: string | null;
  grouping: string | null;
  comment: string | null;

  // Sort fields
  sort_artist: string | null;
  sort_album: string | null;
  sort_title: string | null;

  // Lyrics
  lyrics: string | null;

  // User overrides
  user_overrides: Record<string, number | string | null>;

  // Audio info
  duration_seconds: number | null;
  format: string | null;

  // Analysis features (with user overrides applied)
  features: {
    bpm: number | null;
    key: string | null;
    energy: number | null;
    danceability: number | null;
    valence: number | null;
    acousticness: number | null;
    instrumentalness: number | null;
    speechiness: number | null;
  } | null;

  // Write status (only present after update)
  file_write_status?: string | null;
  file_write_error?: string | null;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResponse {
  synced: boolean;
  lines: LyricLine[];
  plain_text: string;
  source: string;
}

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  spotify_user_id: string | null;
  last_sync: string | null;
  stats: {
    total_favorites: number;
    matched: number;
    unmatched: number;
    match_rate: number;
  } | null;
}

export interface SpotifySyncResponse {
  status: string;
  message: string;
  stats?: {
    fetched: number;
    new: number;
    matched: number;
    unmatched: number;
  };
  progress?: SpotifySyncProgress | null;
}

export interface SpotifySyncProgress {
  phase: string;
  tracks_fetched: number;
  tracks_processed: number;
  tracks_total: number;
  new_favorites: number;
  matched: number;
  unmatched: number;
  current_track: string | null;
  started_at: string | null;
  errors: string[];
}

export interface StoreSearchLink {
  name: string;
  url: string;
}

export interface UnmatchedTrack {
  spotify_id: string;
  name: string | null;
  artist: string | null;
  album: string | null;
  added_at: string | null;
  popularity: number | null;
  search_links: Record<string, StoreSearchLink>;
}

export const spotifyApi = {
  getStatus: async (): Promise<SpotifyStatus> => {
    const { data } = await api.get('/spotify/status');
    return data;
  },

  getAuthUrl: async (): Promise<{ auth_url: string; state: string }> => {
    const { data } = await api.get('/spotify/auth');
    return data;
  },

  sync: async (includeTopTracks = true, favoriteMatched = false): Promise<SpotifySyncResponse> => {
    const { data } = await api.post('/spotify/sync', null, {
      params: { include_top_tracks: includeTopTracks, favorite_matched: favoriteMatched },
      timeout: 300000, // 5 minute timeout for large libraries
    });
    return data;
  },

  disconnect: async (): Promise<{ status: string }> => {
    const { data } = await api.post('/spotify/disconnect');
    return data;
  },

  getSyncStatus: async (): Promise<SpotifySyncResponse> => {
    const { data } = await api.get('/spotify/sync/status');
    return data;
  },

  getUnmatched: async (params?: {
    limit?: number;
    sort_by?: 'popularity' | 'added_at';
  }): Promise<UnmatchedTrack[]> => {
    const { data } = await api.get('/spotify/unmatched', { params });
    return data;
  },
};

export interface VideoSearchResult {
  video_id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail_url: string;
  url: string;
}

export interface VideoStatus {
  has_video: boolean;
  download_status: string | null;
  progress: number | null;
  error: string | null;
}

export const videosApi = {
  search: async (trackId: string, limit = 5): Promise<VideoSearchResult[]> => {
    const { data } = await api.get(`/videos/${trackId}/search`, {
      params: { limit },
    });
    return data;
  },

  getStatus: async (trackId: string): Promise<VideoStatus> => {
    const { data } = await api.get(`/videos/${trackId}/status`);
    return data;
  },

  download: async (trackId: string, videoUrl: string): Promise<{ status: string; message: string }> => {
    const { data } = await api.post(`/videos/${trackId}/download`, {
      video_url: videoUrl,
    });
    return data;
  },

  getStreamUrl: (trackId: string): string => {
    return `/api/v1/videos/${trackId}/stream`;
  },

  delete: async (trackId: string): Promise<{ status: string }> => {
    const { data } = await api.delete(`/videos/${trackId}`);
    return data;
  },
};

export interface LastfmStatus {
  configured: boolean;
  connected: boolean;
  username: string | null;
}

export const lastfmApi = {
  getStatus: async (): Promise<LastfmStatus> => {
    const { data } = await api.get('/lastfm/status');
    return data;
  },

  getAuthUrl: async (): Promise<{ auth_url: string }> => {
    const { data } = await api.get('/lastfm/auth');
    return data;
  },

  callback: async (token: string): Promise<{ status: string; username: string }> => {
    const { data } = await api.post('/lastfm/callback', null, {
      params: { token },
    });
    return data;
  },

  disconnect: async (): Promise<{ status: string }> => {
    const { data } = await api.post('/lastfm/disconnect');
    return data;
  },

  updateNowPlaying: async (trackId: string): Promise<{ status: string; message: string }> => {
    const { data } = await api.post('/lastfm/now-playing', { track_id: trackId });
    return data;
  },

  scrobble: async (trackId: string, timestamp?: number): Promise<{ status: string; message: string }> => {
    const { data } = await api.post('/lastfm/scrobble', {
      track_id: trackId,
      timestamp,
    });
    return data;
  },
};

export interface ClapStatus {
  enabled: boolean;
  reason: string;
  ram_gb: number | null;
  ram_sufficient: boolean;
  env_override: boolean;
  explicit_setting: boolean | null;
}

export interface AppSettingsResponse {
  spotify_client_id: string | null;
  spotify_client_secret: string | null;
  lastfm_api_key: string | null;
  lastfm_api_secret: string | null;
  anthropic_api_key: string | null;
  spotify_configured: boolean;
  lastfm_configured: boolean;
  // Metadata enrichment
  auto_enrich_metadata: boolean;
  enrich_overwrite_existing: boolean;
  // Analysis settings
  clap_embeddings_enabled: boolean | null;
  clap_status: ClapStatus;
}

export interface AppSettingsUpdate {
  spotify_client_id?: string;
  spotify_client_secret?: string;
  lastfm_api_key?: string;
  lastfm_api_secret?: string;
  anthropic_api_key?: string;
  // Metadata enrichment
  auto_enrich_metadata?: boolean;
  enrich_overwrite_existing?: boolean;
  // Analysis settings
  clap_embeddings_enabled?: boolean | null;
}

export const appSettingsApi = {
  get: async (): Promise<AppSettingsResponse> => {
    const { data } = await api.get('/settings');
    return data;
  },

  update: async (settings: AppSettingsUpdate): Promise<AppSettingsResponse> => {
    const { data } = await api.put('/settings', settings);
    return data;
  },

  clearSpotify: async (): Promise<{ status: string }> => {
    const { data } = await api.delete('/settings/spotify');
    return data;
  },

  clearLastfm: async (): Promise<{ status: string }> => {
    const { data } = await api.delete('/settings/lastfm');
    return data;
  },
};

export interface ImportResult {
  status: string;
  message: string;
  import_path: string | null;
  files_found: number;
  files: string[];
}

export interface RecentImport {
  name: string;
  path: string;
  file_count: number;
  created_at: string | null;
}

// Unified Sync Types
export type SyncPhase = 'idle' | 'discovering' | 'reading' | 'features' | 'embeddings' | 'complete' | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  phase_message: string;

  // Discovery/scan metrics
  files_discovered: number;
  files_processed: number;
  files_total: number;
  new_tracks: number;
  updated_tracks: number;
  unchanged_tracks: number;
  relocated_tracks: number;
  marked_missing: number;
  recovered: number;

  // Analysis metrics
  tracks_analyzed: number;
  tracks_pending_analysis: number;
  tracks_total: number;
  analysis_percent: number;

  // Overall
  started_at: string | null;
  current_item: string | null;
  last_heartbeat: string | null;
  errors: string[];
}

export interface SyncStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'already_running';
  message: string;
  progress: SyncProgress | null;
}

// Library Browser Types
export interface ArtistSummary {
  name: string;
  track_count: number;
  album_count: number;
  first_track_id: string;
}

export interface ArtistListResponse {
  items: ArtistSummary[];
  total: number;
  page: number;
  page_size: number;
}

// Artist Detail
export interface ArtistAlbum {
  name: string;
  year: number | null;
  track_count: number;
  first_track_id: string;
}

export interface ArtistTrack {
  id: string;
  title: string | null;
  album: string | null;
  track_number: number | null;
  duration_seconds: number | null;
  year: number | null;
}

export interface ArtistDetailResponse {
  name: string;
  track_count: number;
  album_count: number;
  total_duration_seconds: number;

  // From Last.fm
  bio_summary: string | null;
  bio_content: string | null;
  image_url: string | null;
  lastfm_url: string | null;
  listeners: number | null;
  playcount: number | null;
  tags: string[];
  similar_artists: Array<{
    name: string;
    url?: string;
    image?: Array<{ size: string; '#text': string }>;
  }>;

  // Library content
  albums: ArtistAlbum[];
  tracks: ArtistTrack[];
  first_track_id: string;

  // Cache status
  lastfm_fetched: boolean;
  lastfm_error: string | null;
}

export interface AlbumSummary {
  name: string;
  artist: string;
  year: number | null;
  track_count: number;
  first_track_id: string;
}

export interface AlbumListResponse {
  items: AlbumSummary[];
  total: number;
  page: number;
  page_size: number;
}

// Year Distribution (for Timeline browser)
export interface YearCount {
  year: number;
  track_count: number;
  album_count: number;
  artist_count: number;
}

export interface YearDistributionResponse {
  years: YearCount[];
  total_with_year: number;
  total_without_year: number;
  min_year: number | null;
  max_year: number | null;
}

// Mood Distribution (for MoodGrid browser)
export interface MoodCell {
  energy_min: number;
  energy_max: number;
  valence_min: number;
  valence_max: number;
  track_count: number;
  sample_track_ids: string[];
}

export interface MoodDistributionResponse {
  cells: MoodCell[];
  grid_size: number;
  total_with_mood: number;
  total_without_mood: number;
}

// Music Map (for MusicMap browser)
export interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  track_count: number;
  first_track_id: string;
}

export interface MapEdge {
  source: string;
  target: string;
  weight: number;
}

export interface MusicMapResponse {
  nodes: MapNode[];
  edges: MapEdge[];
  entity_type: string;
  total_entities: number;
}

// Ego-centric Music Map
export interface EgoMapCenter {
  name: string;
  track_count: number;
  first_track_id: string;
}

export interface EgoMapArtist {
  name: string;
  x: number;
  y: number;
  distance: number;
  track_count: number;
  first_track_id: string;
}

export interface EgoMapResponse {
  center: EgoMapCenter;
  artists: EgoMapArtist[];
  mode: string;
  total_artists: number;
}

// 3D Music Map
export interface MapNode3D {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  track_count: number;
  first_track_id: string;
  representative_track_id?: string; // Track closest to artist's audio centroid
}

export interface MusicMap3DResponse {
  nodes: MapNode3D[];
  entity_type: string;
  total_entities: number;
}

export const libraryApi = {
  getStats: async (): Promise<LibraryStats> => {
    const { data } = await api.get('/library/stats');
    return data;
  },

  listArtists: async (params?: {
    search?: string;
    sort_by?: 'name' | 'track_count' | 'album_count';
    page?: number;
    page_size?: number;
  }): Promise<ArtistListResponse> => {
    const { data } = await api.get('/library/artists', { params });
    return data;
  },

  getArtist: async (
    artistName: string,
    refreshLastfm = false
  ): Promise<ArtistDetailResponse> => {
    const { data } = await api.get(
      `/library/artists/${encodeURIComponent(artistName)}`,
      { params: { refresh_lastfm: refreshLastfm } }
    );
    return data;
  },

  listAlbums: async (params?: {
    artist?: string;
    search?: string;
    sort_by?: 'name' | 'year' | 'track_count' | 'artist';
    page?: number;
    page_size?: number;
  }): Promise<AlbumListResponse> => {
    const { data } = await api.get('/library/albums', { params });
    return data;
  },

  getYearDistribution: async (): Promise<YearDistributionResponse> => {
    const { data } = await api.get('/library/years');
    return data;
  },

  getMoodDistribution: async (gridSize = 10): Promise<MoodDistributionResponse> => {
    const { data } = await api.get('/library/mood-distribution', {
      params: { grid_size: gridSize },
    });
    return data;
  },

  getMusicMap: async (params?: {
    entity_type?: 'artists' | 'albums';
    limit?: number;
  }): Promise<MusicMapResponse> => {
    const { data } = await api.get('/library/map', { params });
    return data;
  },

  getEgoMap: async (params: {
    center: string;
    limit?: number;
    mode?: 'radial';
  }): Promise<EgoMapResponse> => {
    const { data } = await api.get('/library/map/ego', {
      params: {
        center: params.center,
        limit: params.limit ?? 200,
        mode: params.mode ?? 'radial',
      },
    });
    return data;
  },

  get3DMap: async (params?: {
    entity_type?: 'artists' | 'albums';
  }): Promise<MusicMap3DResponse> => {
    const { data } = await api.get('/library/map/3d', {
      params: {
        entity_type: params?.entity_type ?? 'artists',
      },
    });
    return data;
  },

  sync: async (options: {
    rereadUnchanged?: boolean;
  } = {}): Promise<SyncStatus> => {
    const { data } = await api.post('/library/sync', null, {
      params: {
        reread_unchanged: options.rereadUnchanged ?? false,
      },
    });
    return data;
  },

  getSyncStatus: async (): Promise<SyncStatus> => {
    const { data } = await api.get('/library/sync/status');
    return data;
  },

  cancelSync: async (): Promise<{ status: string; message: string }> => {
    const { data } = await api.post('/library/sync/cancel');
    return data;
  },

  importMusic: async (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/library/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });
    return data;
  },

  getRecentImports: async (limit = 10): Promise<RecentImport[]> => {
    const { data } = await api.get('/library/imports/recent', {
      params: { limit },
    });
    return data;
  },

  getArtistImageUrl: (
    artistName: string,
    size: 'small' | 'medium' | 'large' | 'extralarge' = 'large'
  ): string => {
    return `/api/v1/library/artists/${encodeURIComponent(artistName)}/image?size=${size}`;
  },
};

// Smart Playlists
export interface SmartPlaylistRule {
  field: string;
  operator: string;
  value?: unknown;
}

export interface SmartPlaylist {
  id: string;
  name: string;
  description: string | null;
  rules: SmartPlaylistRule[];
  match_mode: 'all' | 'any';
  order_by: string;
  order_direction: 'asc' | 'desc';
  max_tracks: number | null;
  cached_track_count: number;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmartPlaylistCreate {
  name: string;
  description?: string;
  rules: SmartPlaylistRule[];
  match_mode?: 'all' | 'any';
  order_by?: string;
  order_direction?: 'asc' | 'desc';
  max_tracks?: number;
}

export interface SmartPlaylistTracksResponse {
  playlist: SmartPlaylist;
  tracks: Array<{
    id: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    duration_seconds: number | null;
    genre: string | null;
    year: number | null;
  }>;
  total: number;
}

export interface AvailableFields {
  track_fields: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  analysis_fields: Array<{
    name: string;
    type: string;
    description: string;
    range?: [number, number];
  }>;
  operators: {
    string: string[];
    number: string[];
    date: string[];
    list: string[];
  };
}

export interface PlaylistImportResult {
  playlist_id: string;
  playlist_name: string;
  total_tracks: number;
  matched_tracks: number;
  unmatched_tracks: number;
  tracks: Array<{
    title: string;
    artist: string;
    matched: boolean;
    matched_track_id: string | null;
    confidence: number;
  }>;
}

export const playlistSharingApi = {
  importPlaylist: async (file: File): Promise<PlaylistImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/playlists/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};

export const smartPlaylistsApi = {
  list: async (): Promise<SmartPlaylist[]> => {
    const { data } = await api.get('/smart-playlists');
    return data;
  },

  get: async (id: string): Promise<SmartPlaylist> => {
    const { data } = await api.get(`/smart-playlists/${id}`);
    return data;
  },

  create: async (playlist: SmartPlaylistCreate): Promise<SmartPlaylist> => {
    const { data } = await api.post('/smart-playlists', playlist);
    return data;
  },

  update: async (id: string, playlist: Partial<SmartPlaylistCreate>): Promise<SmartPlaylist> => {
    const { data } = await api.put(`/smart-playlists/${id}`, playlist);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/smart-playlists/${id}`);
  },

  getTracks: async (id: string, limit = 100, offset = 0): Promise<SmartPlaylistTracksResponse> => {
    const { data } = await api.get(`/smart-playlists/${id}/tracks`, {
      params: { limit, offset },
    });
    return data;
  },

  refresh: async (id: string): Promise<SmartPlaylist> => {
    const { data } = await api.post(`/smart-playlists/${id}/refresh`);
    return data;
  },

  getAvailableFields: async (): Promise<AvailableFields> => {
    const { data } = await api.get('/smart-playlists/fields/available');
    return data;
  },
};

// Playlists API (static playlists with track IDs)
export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_auto_generated: boolean;
  generation_prompt: string | null;
  track_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  description: string | null;
  is_auto_generated: boolean;
  generation_prompt: string | null;
  tracks: Array<{
    id: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    duration_seconds: number | null;
    position: number;
  }>;
  created_at: string;
  updated_at: string;
}

export interface PlaylistCreate {
  name: string;
  description?: string;
  track_ids: string[];
  is_auto_generated?: boolean;
  generation_prompt?: string;
}

export interface RecommendedArtist {
  name: string;
  source: string;
  match_score: number;
  image_url: string | null;
  external_url: string | null;
  local_track_count: number;
}

export interface RecommendedTrack {
  title: string;
  artist: string;
  source: string;
  match_score: number;
  external_url: string | null;
  local_track_id: string | null;
}

export interface PlaylistRecommendations {
  artists: RecommendedArtist[];
  tracks: RecommendedTrack[];
  sources_used: string[];
}

export const playlistsApi = {
  list: async (includeAuto = true): Promise<Playlist[]> => {
    const { data } = await api.get('/playlists', {
      params: { include_auto: includeAuto },
    });
    return data;
  },

  get: async (id: string): Promise<PlaylistDetail> => {
    const { data } = await api.get(`/playlists/${id}`);
    return data;
  },

  create: async (playlist: PlaylistCreate): Promise<PlaylistDetail> => {
    const { data } = await api.post('/playlists', playlist);
    return data;
  },

  update: async (id: string, playlist: { name?: string; description?: string }): Promise<Playlist> => {
    const { data } = await api.put(`/playlists/${id}`, playlist);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/playlists/${id}`);
  },

  addTracks: async (id: string, trackIds: string[]): Promise<PlaylistDetail> => {
    const { data } = await api.post(`/playlists/${id}/tracks`, trackIds);
    return data;
  },

  removeTrack: async (id: string, trackId: string): Promise<void> => {
    await api.delete(`/playlists/${id}/tracks/${trackId}`);
  },

  getRecommendations: async (
    id: string,
    params?: { artist_limit?: number; track_limit?: number }
  ): Promise<PlaylistRecommendations> => {
    const { data } = await api.get(`/playlists/${id}/recommendations`, { params });
    return data;
  },
};

// Profile API
export interface ProfileResponse {
  id: string;
  name: string;
  color: string | null;
  avatar_url: string | null;
  created_at: string;
  has_spotify: boolean;
  has_lastfm: boolean;
}

export interface ProfileCreate {
  name: string;
  color?: string;
}

export const profilesApi = {
  list: async (): Promise<ProfileResponse[]> => {
    const { data } = await api.get('/profiles');
    return data;
  },

  create: async (profile: ProfileCreate): Promise<ProfileResponse> => {
    const { data } = await api.post('/profiles', profile);
    return data;
  },

  get: async (id: string): Promise<ProfileResponse> => {
    const { data } = await api.get(`/profiles/${id}`);
    return data;
  },

  getMe: async (): Promise<ProfileResponse> => {
    const { data } = await api.get('/profiles/me');
    return data;
  },

  update: async (id: string, profile: Partial<ProfileCreate>): Promise<ProfileResponse> => {
    const { data } = await api.put(`/profiles/${id}`, profile);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/profiles/${id}`);
  },

  uploadAvatar: async (id: string, file: File): Promise<ProfileResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(`/profiles/${id}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  deleteAvatar: async (id: string): Promise<ProfileResponse> => {
    const { data } = await api.delete(`/profiles/${id}/avatar`);
    return data;
  },

  getAvatarUrl: (id: string): string => {
    return `/api/v1/profiles/${id}/avatar`;
  },
};

// Favorites API
export interface FavoriteTrack {
  id: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  genre: string | null;
  year: number | null;
  favorited_at: string;
}

export interface FavoritesListResponse {
  favorites: FavoriteTrack[];
  total: number;
}

export interface FavoriteStatusResponse {
  track_id: string;
  is_favorite: boolean;
}

export const favoritesApi = {
  list: async (limit = 100, offset = 0): Promise<FavoritesListResponse> => {
    const { data } = await api.get('/favorites', { params: { limit, offset } });
    return data;
  },

  add: async (trackId: string): Promise<FavoriteStatusResponse> => {
    const { data } = await api.post(`/favorites/${trackId}`);
    return data;
  },

  remove: async (trackId: string): Promise<FavoriteStatusResponse> => {
    const { data } = await api.delete(`/favorites/${trackId}`);
    return data;
  },

  check: async (trackId: string): Promise<FavoriteStatusResponse> => {
    const { data } = await api.get(`/favorites/${trackId}`);
    return data;
  },

  toggle: async (trackId: string): Promise<FavoriteStatusResponse> => {
    const { data } = await api.post(`/favorites/${trackId}/toggle`);
    return data;
  },
};

// Play Tracking API
export interface PlayRecordResponse {
  track_id: string;
  play_count: number;
  total_play_seconds: number;
}

export interface PlayStatsResponse {
  total_plays: number;
  total_play_seconds: number;
  unique_tracks: number;
  top_tracks: Array<{
    id: string;
    title: string | null;
    artist: string | null;
    play_count: number;
    total_play_seconds: number;
    last_played_at: string | null;
  }>;
}

export const playTrackingApi = {
  recordPlay: async (trackId: string, durationSeconds?: number): Promise<PlayRecordResponse> => {
    const { data } = await api.post(`/tracks/${trackId}/played`, {
      duration_seconds: durationSeconds,
    });
    return data;
  },

  getStats: async (limit = 10): Promise<PlayStatsResponse> => {
    const { data } = await api.get('/tracks/stats/plays', { params: { limit } });
    return data;
  },
};

// Library Organization API
export interface OrganizeTemplate {
  name: string;
  template: string;
  example: string;
}

export interface OrganizeResult {
  track_id: string;
  old_path: string;
  new_path: string | null;
  status: 'moved' | 'skipped' | 'error';
  message: string;
}

export interface OrganizeStats {
  total: number;
  moved: number;
  skipped: number;
  errors: number;
  results: OrganizeResult[];
}

export const organizerApi = {
  getTemplates: async (): Promise<{ templates: OrganizeTemplate[] }> => {
    const { data } = await api.get('/library/organize/templates');
    return data;
  },

  preview: async (template: string, limit = 100): Promise<OrganizeStats> => {
    const { data } = await api.post('/library/organize/preview', { template, limit });
    return data;
  },

  run: async (template: string, dryRun = true): Promise<OrganizeStats> => {
    const { data } = await api.post('/library/organize/run', { template, dry_run: dryRun });
    return data;
  },

  previewTrack: async (trackId: string, template: string): Promise<OrganizeResult> => {
    const { data } = await api.get(`/library/organize/track/${trackId}/preview`, {
      params: { template },
    });
    return data;
  },

  organizeTrack: async (trackId: string, template: string, dryRun = false): Promise<OrganizeResult> => {
    const { data } = await api.post(`/library/organize/track/${trackId}`, {
      template,
      dry_run: dryRun,
    });
    return data;
  },
};

// Health/System Status API
export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string | null;
  details: Record<string, unknown> | null;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceStatus[];
  warnings: string[];
  deployment_mode: 'docker' | 'local';
  version: string;
}

export interface WorkerTask {
  id: string;
  name: string;
  args: unknown[];
  started_at: string | null;
}

export interface WorkerInfo {
  name: string;
  status: string;
  active_tasks: WorkerTask[];
  processed_total: number;
  concurrency: number | null;
}

export interface QueueStats {
  name: string;
  pending: number;
}

export interface TaskFailure {
  task: string;
  error: string;
  track: string | null;
  timestamp: string;
}

export interface WorkerStatus {
  workers: WorkerInfo[];
  queues: QueueStats[];
  analysis_progress: {
    total: number;
    analyzed: number;
    pending: number;
    percent: number;
  };
  recent_failures: TaskFailure[];
}

export const healthApi = {
  getSystemHealth: async (): Promise<SystemHealth> => {
    const { data } = await api.get('/health/system');
    return data;
  },

  getWorkerStatus: async (): Promise<WorkerStatus> => {
    const { data } = await api.get('/health/workers');
    return data;
  },
};

// Diagnostics API
export interface DiagnosticsExport {
  exported_at: string;
  version: string;
  deployment_mode: string;
  system_info: Record<string, unknown>;
  system_health: Record<string, unknown>;
  library_stats: Record<string, unknown>;
  recent_failures: Array<Record<string, unknown>>;
  recent_logs: Array<Record<string, unknown>>;
  settings_summary: Record<string, unknown>;
}

export const diagnosticsApi = {
  export: async (): Promise<DiagnosticsExport> => {
    const { data } = await api.get('/diagnostics/export');
    return data;
  },
};

// New Releases API
export interface NewReleasePurchaseLink {
  name: string;
  url: string;
}

export interface NewRelease {
  id: string;
  artist_name: string;
  release_name: string;
  release_type: string | null;
  release_date: string | null;
  artwork_url: string | null;
  external_url: string | null;
  track_count: number | null;
  source: 'spotify' | 'musicbrainz';
  local_album_match: boolean;
  dismissed: boolean;
  discovered_at: string;
  purchase_links: Record<string, NewReleasePurchaseLink>;
}

export interface NewReleasesListResponse {
  releases: NewRelease[];
  total: number;
  limit: number;
  offset: number;
}

export interface NewReleasesProgress {
  status: 'running' | 'completed' | 'error';
  phase: string;
  message: string;
  profile_id: string | null;
  artists_total: number;
  artists_checked: number;
  releases_found: number;
  releases_new: number;
  current_artist: string | null;
  started_at: string | null;
  errors: string[];
}

export interface NewReleasesStatus {
  total_releases_found: number;
  new_releases_available: number;
  artists_in_library: number;
  artists_checked: number;
  last_check_at: string | null;
  progress: NewReleasesProgress | null;
}

export interface NewReleasesCheckResponse {
  task_id: string;
  status: string;
  message: string;
}

export const newReleasesApi = {
  list: async (params?: {
    limit?: number;
    offset?: number;
    include_dismissed?: boolean;
    include_owned?: boolean;
  }): Promise<NewReleasesListResponse> => {
    const { data } = await api.get('/new-releases', { params });
    return data;
  },

  getStatus: async (): Promise<NewReleasesStatus> => {
    const { data } = await api.get('/new-releases/status');
    return data;
  },

  check: async (params?: {
    days_back?: number;
    force?: boolean;
  }): Promise<NewReleasesCheckResponse> => {
    const { data } = await api.post('/new-releases/check', null, { params });
    return data;
  },

  dismiss: async (releaseId: string): Promise<{ status: string; message: string }> => {
    const { data } = await api.post(`/new-releases/${releaseId}/dismiss`);
    return data;
  },
};

// Artwork prefetch API
export interface ArtworkQueueRequest {
  artist: string;
  album: string;
  track_id?: string;
}

export interface ArtworkQueueResponse {
  status: string;
  album_hash: string;
  message: string;
}

export interface ArtworkQueueBatchResponse {
  status: string;
  queued_count: number;
  existing_count: number;
  queued_hashes: string[];
}

export const artworkApi = {
  /**
   * Queue a single album for artwork download.
   * Returns immediately - artwork is fetched in background.
   */
  queue: async (request: ArtworkQueueRequest): Promise<ArtworkQueueResponse> => {
    const { data } = await api.post('/artwork/queue', request);
    return data;
  },

  /**
   * Queue multiple albums for artwork download.
   * Duplicates and existing artworks are filtered automatically.
   */
  queueBatch: async (
    items: ArtworkQueueRequest[]
  ): Promise<ArtworkQueueBatchResponse> => {
    const { data } = await api.post('/artwork/queue/batch', { items });
    return data;
  },

  /**
   * Check if artwork exists for an artist/album.
   * Uses HEAD request for efficiency.
   */
  checkExists: async (artist: string, album: string): Promise<boolean> => {
    try {
      await api.head(`/artwork/check/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`);
      return true;
    } catch {
      return false;
    }
  },
};

export default api;
