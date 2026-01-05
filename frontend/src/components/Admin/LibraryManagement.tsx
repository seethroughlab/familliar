/**
 * Library management component for Admin page.
 * Provides controls for scanning, importing, and managing the music library.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HardDrive,
  FileAudio,
  Trash2,
} from 'lucide-react';
import { LibraryOrganizer } from '../Settings/LibraryOrganizer';

// Check if a timestamp is stale (older than threshold in seconds)
function isStale(timestamp: string | null | undefined, thresholdSeconds: number = 120): boolean {
  if (!timestamp) return false;
  try {
    const heartbeatTime = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - heartbeatTime) > (thresholdSeconds * 1000);
  } catch {
    return false;
  }
}

interface SyncProgress {
  phase: string;
  phase_message: string;
  files_discovered: number;
  files_processed: number;
  files_total: number;
  new_tracks: number;
  updated_tracks: number;
  unchanged_tracks: number;
  marked_missing: number;
  recovered: number;
  tracks_analyzed: number;
  tracks_pending_analysis: number;
  analysis_percent: number;
  current_item: string | null;
  started_at: string | null;
  last_heartbeat?: string | null;
  errors: string[];
}

interface SyncStatus {
  status: string;
  message: string;
  progress: SyncProgress | null;
}

interface LibraryStats {
  total_tracks: number;
  total_albums: number;
  total_artists: number;
  analyzed_tracks: number;
  pending_analysis: number;
}

interface MissingTrack {
  id: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  file_path: string;
  status: string;
  days_missing: number;
}

// Calculate overall sync progress percentage across 4 phases
function getOverallProgress(progress: SyncProgress): number {
  const phase = progress.phase;

  if (phase === 'discovering') {
    return 5; // Discovery is quick (0-5%)
  }
  if (phase === 'reading') {
    const readProgress = progress.files_total > 0
      ? (progress.files_processed / progress.files_total) * 100
      : 0;
    // Reading is 5-30% of overall
    return 5 + (readProgress * 0.25);
  }
  if (phase === 'features') {
    // Features phase is 30-65%
    return 30 + (progress.analysis_percent * 0.35);
  }
  if (phase === 'embeddings') {
    // Embeddings phase is 65-100%
    return 65 + (progress.analysis_percent * 0.35);
  }
  if (phase === 'complete') {
    return 100;
  }
  return 0;
}

export function LibraryManagement() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null);
  const [missingTracks, setMissingTracks] = useState<MissingTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync options
  const [rereadUnchanged, setRereadUnchanged] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const [syncRes, statsRes, missingRes] = await Promise.all([
        fetch('/api/v1/library/sync/status'),
        fetch('/api/v1/library/stats'),
        fetch('/api/v1/library/missing'),
      ]);

      if (syncRes.ok) {
        const data = await syncRes.json();
        setSyncStatus(data);
        setSyncing(data.status === 'running' || data.status === 'started');
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setLibraryStats(data);
      }

      if (missingRes.ok) {
        const data = await missingRes.json();
        setMissingTracks(data.tracks?.slice(0, 10) || []);
      }

      setError(null);
    } catch (err) {
      console.error('Failed to fetch library status:', err);
      setError('Failed to fetch library status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll more frequently when sync is running
  const isActive = syncing;

  useEffect(() => {
    fetchStatus();
    // Poll every 2s while sync running, otherwise every 5s
    const interval = setInterval(fetchStatus, isActive ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, isActive]);

  const startSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const params = new URLSearchParams({
        reread_unchanged: String(rereadUnchanged),
      });
      const response = await fetch(`/api/v1/library/sync?${params}`, {
        method: 'POST',
      });

      if (response.ok) {
        // Immediately update local state to show syncing
        setSyncStatus(prev => prev ? { ...prev, status: 'running' } : prev);
        fetchStatus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to start sync');
        setSyncing(false);
      }
    } catch {
      setError('Failed to start sync');
      setSyncing(false);
    }
  };

  const deleteMissingTrack = async (trackId: string) => {
    if (!confirm('Permanently delete this track from the database?')) return;

    try {
      const response = await fetch(`/api/v1/library/missing/${trackId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setMissingTracks(tracks => tracks.filter(t => t.id !== trackId));
      }
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  };

  const cancelSync = async () => {
    try {
      const response = await fetch('/api/v1/library/sync/cancel', {
        method: 'POST',
      });

      if (response.ok) {
        setSyncing(false);
        fetchStatus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to cancel sync');
      }
    } catch {
      setError('Failed to cancel sync');
    }
  };

  // Check if sync appears stuck (no heartbeat update in 2+ minutes)
  const syncIsStuck = syncStatus?.status === 'running' &&
    syncStatus?.progress?.last_heartbeat &&
    isStale(syncStatus.progress.last_heartbeat);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Library Stats */}
      <section className="bg-zinc-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <HardDrive className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium text-white">Library Statistics</h2>
            <p className="text-sm text-zinc-500">Overview of your music collection</p>
          </div>
        </div>

        {libraryStats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{libraryStats.total_tracks.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Tracks</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{libraryStats.total_albums.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Albums</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{libraryStats.total_artists.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Artists</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{libraryStats.analyzed_tracks.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">Analyzed</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Library Sync */}
      <section className="bg-zinc-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <RefreshCw className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium text-white">Library Sync</h2>
            <p className="text-sm text-zinc-500">Scan for files and analyze audio features</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Sync options */}
          <div className="flex flex-col gap-3">
            {/* Toggles */}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rereadUnchanged}
                  onChange={(e) => setRereadUnchanged(e.target.checked)}
                  disabled={syncing}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-zinc-900"
                />
                <span className="text-zinc-300">Re-read unchanged files</span>
                <span className="text-zinc-500" title="Re-extract metadata from all files, even if they haven't changed">(?)</span>
              </label>
            </div>

            {/* Sync button */}
            <button
              onClick={startSync}
              disabled={syncing}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium"
            >
              {syncing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              Sync Library
            </button>
          </div>

          {/* Sync Progress */}
          {syncStatus?.progress && syncStatus.status === 'running' && (
            <div className={`rounded-lg p-4 space-y-3 ${syncIsStuck ? 'bg-amber-900/30 border border-amber-700' : 'bg-zinc-800'}`}>
              {/* Stuck warning */}
              {syncIsStuck && (
                <div className="flex items-center gap-2 text-amber-400 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Sync appears to be stuck</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Phase: {syncStatus.progress.phase}</span>
                <span className="text-sm text-zinc-400">{syncStatus.progress.phase_message}</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${syncIsStuck ? 'bg-amber-500' : 'bg-purple-500'}`}
                  style={{
                    width: `${getOverallProgress(syncStatus.progress)}%`
                  }}
                />
              </div>

              {/* Current item */}
              {syncStatus.progress.current_item && (
                <div className="text-xs text-zinc-500 truncate">
                  {syncStatus.progress.current_item}
                </div>
              )}

              {/* Stats */}
              <div className="flex gap-4 text-xs text-zinc-400">
                <span className="text-green-400">+{syncStatus.progress.new_tracks} new</span>
                <span className="text-blue-400">{syncStatus.progress.updated_tracks} updated</span>
                <span className="text-yellow-400">{syncStatus.progress.recovered} recovered</span>
                <span className="text-purple-400">{syncStatus.progress.tracks_analyzed} analyzed</span>
                {syncStatus.progress.marked_missing > 0 && (
                  <span className="text-red-400">{syncStatus.progress.marked_missing} missing</span>
                )}
              </div>

              {/* Cancel button */}
              <button
                onClick={cancelSync}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  syncIsStuck
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                }`}
              >
                <XCircle className="w-4 h-4" />
                {syncIsStuck ? 'Cancel Stuck Sync' : 'Cancel Sync'}
              </button>
            </div>
          )}

          {/* Last sync result */}
          {syncStatus?.status === 'completed' && syncStatus?.progress && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Sync Complete</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1">{syncStatus.message}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Missing Tracks */}
      {missingTracks.length > 0 && (
        <section className="bg-zinc-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="font-medium text-white">Missing Tracks</h2>
              <p className="text-sm text-zinc-500">Files that could not be found</p>
            </div>
            <span className="text-sm text-amber-400">{missingTracks.length} tracks</span>
          </div>

          <div className="space-y-2">
            {missingTracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg"
              >
                <FileAudio className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    {track.title || 'Unknown Title'}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {track.artist || 'Unknown Artist'} - {track.album || 'Unknown Album'}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {track.days_missing}d ago
                </div>
                <button
                  onClick={() => deleteMissingTrack(track.id)}
                  className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 rounded transition-colors"
                  title="Delete from library"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Library Organization */}
      <section className="bg-zinc-900 rounded-xl p-6">
        <LibraryOrganizer />
      </section>

      {/* Info */}
      <p className="text-sm text-zinc-500 text-center">
        Library syncs automatically on startup and every 2 hours.
      </p>
    </div>
  );
}
