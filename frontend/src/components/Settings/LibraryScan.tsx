import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, FolderSearch } from 'lucide-react';
import { libraryApi, type ScanStatus } from '../../api/client';

export function LibraryScan() {
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPending, setIsPending] = useState(false); // Waiting for worker to pick up task
  const [, setPendingRetries] = useState(0); // Counter for polling timeout

  const fetchStatus = useCallback(async () => {
    try {
      const data = await libraryApi.getScanStatus();
      setScanStatus(data);
      return data.status === 'running';
    } catch (error) {
      console.error('Failed to fetch scan status:', error);
    }
    return false;
  }, []);

  // Initial fetch - start polling if scan is already running
  useEffect(() => {
    const checkInitialStatus = async () => {
      const isRunning = await fetchStatus();
      if (isRunning) {
        setIsPolling(true);
      }
    };
    checkInitialStatus();
  }, [fetchStatus]);

  // Poll while scan is running or pending
  useEffect(() => {
    if (!isPolling && !isPending) return;

    const interval = setInterval(async () => {
      const stillRunning = await fetchStatus();
      if (stillRunning) {
        // Worker started, switch from pending to running
        setIsPending(false);
        setPendingRetries(0);
      } else if (isPending) {
        // Still waiting for worker to start
        setPendingRetries(prev => {
          if (prev >= 10) {
            // Give up after 10 seconds
            setIsPending(false);
            setIsPolling(false);
            return 0;
          }
          return prev + 1;
        });
      } else {
        // Scan completed
        setIsPolling(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPolling, isPending, fetchStatus]);

  const startScan = async (full: boolean = false) => {
    setIsStarting(true);
    setIsPending(true);
    setPendingRetries(0);
    try {
      const result = await libraryApi.scan(full);
      if (result.status === 'already_running') {
        setIsPending(false);
        setIsPolling(true);
      } else if (result.status === 'queued') {
        // Task is queued but won't start soon - show queued state
        setIsPending(false);
        setScanStatus(result);
      }
      await fetchStatus();
    } catch (error) {
      console.error('Failed to start scan:', error);
      setIsPending(false);
    } finally {
      setIsStarting(false);
    }
  };

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case 'discovery': return 'Discovering files...';
      case 'processing': return 'Processing files...';
      case 'cleanup': return 'Cleaning up...';
      case 'complete': return 'Complete';
      default: return phase;
    }
  };

  const getStatusIcon = () => {
    if (isPending) {
      return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    }
    if (!scanStatus) return null;

    switch (scanStatus.status) {
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'queued':
        return <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <FolderSearch className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getStatusMessage = () => {
    if (isPending) {
      return 'Starting scan...';
    }
    return scanStatus?.message || 'Check for new or changed files';
  };

  const isQueued = scanStatus?.status === 'queued';

  const progress = scanStatus?.progress;
  const isRunning = scanStatus?.status === 'running' || isPending;
  const isDiscovering = progress?.phase === 'discovery';
  const progressPercent = progress && progress.files_total > 0
    ? Math.round((progress.files_processed / progress.files_total) * 100)
    : 0;

  return (
    <div className="bg-zinc-800/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h4 className="font-medium text-white">Library Scanner</h4>
            <p className="text-sm text-zinc-400">
              {getStatusMessage()}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => startScan(false)}
            disabled={isRunning || isStarting}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-md flex items-center gap-2"
          >
            {isStarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Quick Scan
          </button>
          <button
            onClick={() => startScan(true)}
            disabled={isRunning || isStarting}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-md flex items-center gap-2"
          >
            {isStarting && <Loader2 className="w-4 h-4 animate-spin" />}
            Full Scan
          </button>
        </div>
      </div>

      {/* Queued state - waiting behind other tasks */}
      {isQueued && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-yellow-400">Scan queued</span>
            {scanStatus.queue_position && (
              <span className="text-zinc-400">
                {scanStatus.queue_position.toLocaleString()} tasks ahead
              </span>
            )}
          </div>
          <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
            <div className="bg-yellow-500 h-2 rounded-full w-1/4 animate-[pulse_1s_ease-in-out_infinite]" />
          </div>
          {scanStatus.warnings && scanStatus.warnings.length > 0 && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
              <p className="text-sm text-yellow-200">{scanStatus.warnings[0]}</p>
            </div>
          )}
        </div>
      )}

      {/* Pending state - waiting for worker */}
      {isPending && !progress && !isQueued && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Waiting for background worker...</span>
          </div>
          <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-500 h-2 rounded-full w-1/4 animate-[pulse_1s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {/* Progress bar when running */}
      {scanStatus?.status === 'running' && progress && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{getPhaseLabel(progress.phase)}</span>
            {isDiscovering ? (
              <span className="text-zinc-300">
                {progress.files_discovered.toLocaleString()} files found
              </span>
            ) : (
              <span className="text-zinc-300">{progressPercent}%</span>
            )}
          </div>

          <div className="w-full bg-zinc-700 rounded-full h-2">
            {isDiscovering ? (
              /* Animated indeterminate progress bar during discovery */
              <div className="bg-blue-500 h-2 rounded-full w-1/3 animate-pulse" />
            ) : (
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            )}
          </div>

          {progress.current_file && (
            <p className="text-xs text-zinc-500 truncate">
              {progress.current_file}
            </p>
          )}

          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="bg-zinc-700/50 rounded p-2">
              <div className="text-green-400 font-medium">{progress.new_tracks}</div>
              <div className="text-zinc-500">New</div>
            </div>
            <div className="bg-zinc-700/50 rounded p-2">
              <div className="text-blue-400 font-medium">{progress.updated_tracks}</div>
              <div className="text-zinc-500">Updated</div>
            </div>
            <div className="bg-zinc-700/50 rounded p-2">
              <div className="text-purple-400 font-medium">{progress.relocated_tracks}</div>
              <div className="text-zinc-500">Relocated</div>
            </div>
            <div className="bg-zinc-700/50 rounded p-2">
              <div className="text-zinc-400 font-medium">{progress.unchanged_tracks}</div>
              <div className="text-zinc-500">Unchanged</div>
            </div>
            <div className="bg-zinc-700/50 rounded p-2">
              <div className="text-red-400 font-medium">{progress.deleted_tracks}</div>
              <div className="text-zinc-500">Deleted</div>
            </div>
          </div>

          {progress.errors.length > 0 && (
            <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">
              <p className="font-medium mb-1">Errors ({progress.errors.length}):</p>
              <ul className="list-disc list-inside">
                {progress.errors.slice(0, 3).map((err, i) => (
                  <li key={i} className="truncate">{err}</li>
                ))}
                {progress.errors.length > 3 && (
                  <li>...and {progress.errors.length - 3} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Summary when completed */}
      {scanStatus?.status === 'completed' && progress && (
        <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-zinc-700/50 rounded p-2">
            <div className="text-green-400 font-medium">{progress.new_tracks}</div>
            <div className="text-zinc-500">New</div>
          </div>
          <div className="bg-zinc-700/50 rounded p-2">
            <div className="text-blue-400 font-medium">{progress.updated_tracks}</div>
            <div className="text-zinc-500">Updated</div>
          </div>
          <div className="bg-zinc-700/50 rounded p-2">
            <div className="text-purple-400 font-medium">{progress.relocated_tracks}</div>
            <div className="text-zinc-500">Relocated</div>
          </div>
          <div className="bg-zinc-700/50 rounded p-2">
            <div className="text-zinc-400 font-medium">{progress.unchanged_tracks}</div>
            <div className="text-zinc-500">Unchanged</div>
          </div>
          <div className="bg-zinc-700/50 rounded p-2">
            <div className="text-red-400 font-medium">{progress.deleted_tracks}</div>
            <div className="text-zinc-500">Deleted</div>
          </div>
        </div>
      )}
    </div>
  );
}
