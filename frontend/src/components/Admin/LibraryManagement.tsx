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
  Music,
  Clock,
  FileAudio,
  Trash2,
  Search,
  AlertCircle,
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

interface ScanProgress {
  phase: string;
  files_discovered: number;
  files_processed: number;
  files_total: number;
  new_tracks: number;
  updated_tracks: number;
  unchanged_tracks: number;
  marked_missing: number;
  still_missing: number;
  recovered: number;
  current_file: string | null;
  started_at: string | null;
  last_heartbeat?: string | null;
  errors: string[];
  warnings: string[];
}

interface ScanStatus {
  status: string;
  message: string;
  progress: ScanProgress | null;
  warnings: string[];
}

interface AnalysisStatus {
  status: 'idle' | 'running' | 'stuck' | 'complete';
  total: number;
  analyzed: number;
  pending: number;
  failed: number;
  percent: number;
  current_file?: string;
  heartbeat?: string;
  error?: string;
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

export function LibraryManagement() {
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null);
  const [missingTracks, setMissingTracks] = useState<MissingTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [scanRes, analysisRes, statsRes, missingRes] = await Promise.all([
        fetch('/api/v1/library/scan/status'),
        fetch('/api/v1/library/analysis/status'),
        fetch('/api/v1/library/stats'),
        fetch('/api/v1/library/missing'),
      ]);

      if (scanRes.ok) {
        const data = await scanRes.json();
        setScanStatus(data);
        setScanning(data.status === 'running' || data.status === 'started');
      }

      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setAnalysisStatus(data);
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

  // Poll more frequently when scan or analysis is running
  const isActive = scanning || analysisStatus?.status === 'running';

  useEffect(() => {
    fetchStatus();
    // Poll every 2s while scan/analysis running, otherwise every 5s
    const interval = setInterval(fetchStatus, isActive ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, isActive]);

  const startScan = async (full: boolean = false) => {
    try {
      setScanning(true);
      const response = await fetch(`/api/v1/library/scan?full=${full}`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchStatus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to start scan');
        setScanning(false);
      }
    } catch {
      setError('Failed to start scan');
      setScanning(false);
    }
  };

  const startAnalysis = async () => {
    try {
      setStartingAnalysis(true);
      setError(null);
      const response = await fetch('/api/v1/library/analysis/start?limit=500', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'started') {
          // Refresh status after a moment
          setTimeout(fetchStatus, 1000);
        }
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to start analysis');
      }
    } catch {
      setError('Failed to start analysis');
    } finally {
      setStartingAnalysis(false);
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

  const cancelScan = async () => {
    try {
      const response = await fetch('/api/v1/library/scan/cancel', {
        method: 'POST',
      });

      if (response.ok) {
        setScanning(false);
        fetchStatus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to cancel scan');
      }
    } catch {
      setError('Failed to cancel scan');
    }
  };

  const cancelAnalysis = async () => {
    try {
      const response = await fetch('/api/v1/library/analysis/cancel', {
        method: 'POST',
      });

      if (response.ok) {
        fetchStatus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to cancel analysis');
      }
    } catch {
      setError('Failed to cancel analysis');
    }
  };

  // Check if scan appears stuck (no heartbeat update in 2+ minutes)
  const scanIsStuck = scanStatus?.status === 'running' &&
    scanStatus?.progress?.last_heartbeat &&
    isStale(scanStatus.progress.last_heartbeat);

  // Check if analysis appears stuck
  const analysisIsStuck = analysisStatus?.status === 'running' &&
    analysisStatus?.heartbeat &&
    isStale(analysisStatus.heartbeat);

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
        )}
      </section>

      {/* Scan Controls */}
      <section className="bg-zinc-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <RefreshCw className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium text-white">Library Scan</h2>
            <p className="text-sm text-zinc-500">Scan for new, changed, or missing files</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Scan buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => startScan(false)}
              disabled={scanning || analysisStatus?.status === 'running'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium"
              title={analysisStatus?.status === 'running' ? 'Wait for analysis to complete' : undefined}
            >
              {scanning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              {analysisStatus?.status === 'running' ? 'Analysis running...' : 'Quick Scan'}
            </button>
            <button
              onClick={() => startScan(true)}
              disabled={scanning || analysisStatus?.status === 'running'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium"
              title={analysisStatus?.status === 'running' ? 'Wait for analysis to complete' : undefined}
            >
              <Search className="w-5 h-5" />
              Full Scan
            </button>
          </div>

          {/* Scan Progress */}
          {scanStatus?.progress && scanStatus.status === 'running' && (
            <div className={`rounded-lg p-4 space-y-3 ${scanIsStuck ? 'bg-amber-900/30 border border-amber-700' : 'bg-zinc-800'}`}>
              {/* Stuck warning */}
              {scanIsStuck && (
                <div className="flex items-center gap-2 text-amber-400 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Scan appears to be stuck</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Phase: {scanStatus.progress.phase}</span>
                <span className="text-sm text-zinc-400">
                  {scanStatus.progress.files_processed} / {scanStatus.progress.files_total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${scanIsStuck ? 'bg-amber-500' : 'bg-purple-500'}`}
                  style={{
                    width: `${scanStatus.progress.files_total > 0
                      ? (scanStatus.progress.files_processed / scanStatus.progress.files_total) * 100
                      : 0}%`
                  }}
                />
              </div>

              {/* Current file */}
              {scanStatus.progress.current_file && (
                <div className="text-xs text-zinc-500 truncate">
                  {scanStatus.progress.current_file}
                </div>
              )}

              {/* Stats */}
              <div className="flex gap-4 text-xs text-zinc-400">
                <span className="text-green-400">+{scanStatus.progress.new_tracks} new</span>
                <span className="text-blue-400">{scanStatus.progress.updated_tracks} updated</span>
                <span className="text-yellow-400">{scanStatus.progress.recovered} recovered</span>
                {scanStatus.progress.marked_missing > 0 && (
                  <span className="text-red-400">{scanStatus.progress.marked_missing} missing</span>
                )}
              </div>

              {/* Cancel button - always show during scan, emphasized when stuck */}
              <button
                onClick={cancelScan}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  scanIsStuck
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                }`}
              >
                <XCircle className="w-4 h-4" />
                {scanIsStuck ? 'Cancel Stuck Scan' : 'Cancel Scan'}
              </button>
            </div>
          )}

          {/* Last scan result */}
          {scanStatus?.status === 'completed' && scanStatus?.progress && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Scan Complete</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1">{scanStatus.message}</p>
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

      {/* Analysis Status */}
      <section className="bg-zinc-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-cyan-500/20">
            <Music className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium text-white">Audio Analysis</h2>
            <p className="text-sm text-zinc-500">BPM, key, and audio features extraction</p>
          </div>
          {analysisStatus && (
            <span className={`flex items-center gap-1 text-sm ${
              analysisStatus.pending === 0 ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {analysisStatus.pending === 0 ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Complete
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  {analysisStatus.pending.toLocaleString()} pending
                </>
              )}
            </span>
          )}
        </div>

        {analysisStatus && (
          <div className="space-y-3">
            {/* Stuck warning */}
            {analysisIsStuck && (
              <div className="flex items-center gap-2 text-amber-400 p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">Analysis appears to be stuck</span>
              </div>
            )}

            {/* Progress bar */}
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${analysisIsStuck ? 'bg-amber-500' : 'bg-cyan-500'}`}
                style={{ width: `${analysisStatus.percent}%` }}
              />
            </div>

            <div className="flex justify-between text-sm text-zinc-400">
              <span>{analysisStatus.analyzed.toLocaleString()} analyzed</span>
              <span>{analysisStatus.percent.toFixed(1)}%</span>
            </div>

            {/* Current file being analyzed */}
            {analysisStatus.status === 'running' && analysisStatus.current_file && (
              <div className="text-xs text-zinc-500 truncate">
                {analysisStatus.current_file}
              </div>
            )}

            {analysisStatus.failed > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4" />
                {analysisStatus.failed} failed
              </div>
            )}

            {/* Running state - show cancel button */}
            {analysisStatus.status === 'running' && (
              <button
                onClick={cancelAnalysis}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  analysisIsStuck
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                }`}
              >
                <XCircle className="w-4 h-4" />
                {analysisIsStuck ? 'Cancel Stuck Analysis' : 'Cancel Analysis'}
              </button>
            )}

            {/* Start Analysis Button - only show when not running */}
            {analysisStatus.pending > 0 && analysisStatus.status !== 'running' && (
              <button
                onClick={startAnalysis}
                disabled={scanning || startingAnalysis}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium"
              >
                {startingAnalysis ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Music className="w-5 h-5" />
                )}
                {scanning ? 'Wait for scan to complete' : 'Start Analysis'}
              </button>
            )}
          </div>
        )}
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
        Library scans run automatically every 6 hours.
        Audio analysis queues new batches every 5 minutes.
      </p>
    </div>
  );
}
