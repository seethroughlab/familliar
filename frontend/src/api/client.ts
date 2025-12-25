import axios from 'axios';
import type { Track, TrackListResponse, LibraryStats } from '../types';

const api = axios.create({
  baseURL: '/api/v1',
});

export const tracksApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    artist?: string;
    album?: string;
    genre?: string;
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
};

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

  sync: async (includeTopTracks = true): Promise<SpotifySyncResponse> => {
    const { data } = await api.post('/spotify/sync', null, {
      params: { include_top_tracks: includeTopTracks },
    });
    return data;
  },

  disconnect: async (): Promise<{ status: string }> => {
    const { data } = await api.post('/spotify/disconnect');
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

export const libraryApi = {
  getStats: async (): Promise<LibraryStats> => {
    const { data } = await api.get('/library/stats');
    return data;
  },

  scan: async (full = false): Promise<{ status: string; message: string }> => {
    const { data } = await api.post('/library/scan', null, {
      params: { full },
    });
    return data;
  },

  getScanStatus: async (): Promise<{ status: string; message: string }> => {
    const { data } = await api.get('/library/scan/status');
    return data;
  },
};

export default api;
