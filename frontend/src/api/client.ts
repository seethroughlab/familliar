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
