/**
 * Offline storage settings component.
 */
import { useState, useEffect } from 'react';
import {
  HardDrive,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  WifiOff,
  Cloud,
  CheckCircle,
} from 'lucide-react';
import * as offlineService from '../../services/offlineService';
import * as libraryCache from '../../services/libraryCache';
import * as syncService from '../../services/syncService';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';

export function OfflineSettings() {
  const { isOnline, isOffline } = useOfflineStatus();

  const [offlineStats, setOfflineStats] = useState<{
    count: number;
    sizeFormatted: string;
  } | null>(null);

  const [cacheInfo, setCacheInfo] = useState<{
    count: number;
    lastCached: Date | null;
  } | null>(null);

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<{
    offlineStats?: boolean;
    cacheLibrary?: boolean;
    clearOffline?: boolean;
    clearCache?: boolean;
    syncPending?: boolean;
  }>({});

  const loadStats = async () => {
    setIsLoading((prev) => ({ ...prev, offlineStats: true }));
    try {
      const [offline, cache, pending] = await Promise.all([
        offlineService.getOfflineStorageUsage(),
        libraryCache.getCacheInfo(),
        syncService.getPendingCount(),
      ]);
      setOfflineStats(offline);
      setCacheInfo(cache);
      setPendingCount(pending);
    } catch (error) {
      console.error('Failed to load offline stats:', error);
    } finally {
      setIsLoading((prev) => ({ ...prev, offlineStats: false }));
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleCacheLibrary = async () => {
    setIsLoading((prev) => ({ ...prev, cacheLibrary: true }));
    try {
      await libraryCache.cacheLibrary();
      await loadStats();
    } catch (error) {
      console.error('Failed to cache library:', error);
    } finally {
      setIsLoading((prev) => ({ ...prev, cacheLibrary: false }));
    }
  };

  const handleClearOfflineTracks = async () => {
    if (!confirm('Remove all downloaded tracks for offline playback?')) {
      return;
    }
    setIsLoading((prev) => ({ ...prev, clearOffline: true }));
    try {
      await offlineService.clearAllOfflineTracks();
      await loadStats();
    } catch (error) {
      console.error('Failed to clear offline tracks:', error);
    } finally {
      setIsLoading((prev) => ({ ...prev, clearOffline: false }));
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear the library cache? You can re-cache anytime.')) {
      return;
    }
    setIsLoading((prev) => ({ ...prev, clearCache: true }));
    try {
      await libraryCache.clearLibraryCache();
      await loadStats();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setIsLoading((prev) => ({ ...prev, clearCache: false }));
    }
  };

  const handleSyncPending = async () => {
    if (!isOnline) {
      alert('Cannot sync while offline');
      return;
    }
    setIsLoading((prev) => ({ ...prev, syncPending: true }));
    try {
      const result = await syncService.processPendingActions();
      await loadStats();
      if (result.processed > 0 || result.failed > 0) {
        alert(
          `Synced ${result.processed} actions${result.failed > 0 ? `, ${result.failed} failed` : ''}`
        );
      }
    } catch (error) {
      console.error('Failed to sync pending actions:', error);
    } finally {
      setIsLoading((prev) => ({ ...prev, syncPending: false }));
    }
  };

  return (
    <div className="bg-zinc-800/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <HardDrive className="w-5 h-5 text-purple-400" />
          <div>
            <h4 className="font-medium text-white">Offline Storage</h4>
            <p className="text-xs text-zinc-400">
              Download tracks for offline playback
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <div className="flex items-center gap-1.5 text-green-400 text-xs">
              <Cloud className="w-4 h-4" />
              <span>Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <WifiOff className="w-4 h-4" />
              <span>Offline</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Downloaded tracks */}
        <div className="flex items-center justify-between py-2 border-t border-zinc-700">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">Downloaded tracks</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              {offlineStats
                ? `${offlineStats.count} tracks (${offlineStats.sizeFormatted})`
                : '...'}
            </span>
            {offlineStats && offlineStats.count > 0 && (
              <button
                onClick={handleClearOfflineTracks}
                disabled={isLoading.clearOffline}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors disabled:opacity-50"
                title="Clear offline tracks"
              >
                {isLoading.clearOffline ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Library cache */}
        <div className="flex items-center justify-between py-2 border-t border-zinc-700">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">Library cache</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              {cacheInfo ? (
                cacheInfo.count > 0 ? (
                  <>
                    {cacheInfo.count} tracks
                    {cacheInfo.lastCached && (
                      <span className="text-xs ml-1">
                        (cached {formatRelativeTime(cacheInfo.lastCached)})
                      </span>
                    )}
                  </>
                ) : (
                  'Not cached'
                )
              ) : (
                '...'
              )}
            </span>
            <button
              onClick={handleCacheLibrary}
              disabled={isLoading.cacheLibrary || isOffline}
              className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded transition-colors disabled:opacity-50"
              title="Refresh library cache"
            >
              {isLoading.cacheLibrary ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
            {cacheInfo && cacheInfo.count > 0 && (
              <button
                onClick={handleClearCache}
                disabled={isLoading.clearCache}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors disabled:opacity-50"
                title="Clear library cache"
              >
                {isLoading.clearCache ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Pending sync actions */}
        <div className="flex items-center justify-between py-2 border-t border-zinc-700">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">Pending sync</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              {pendingCount > 0 ? `${pendingCount} actions` : 'All synced'}
            </span>
            {pendingCount > 0 ? (
              <button
                onClick={handleSyncPending}
                disabled={isLoading.syncPending || isOffline}
                className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded transition-colors disabled:opacity-50"
                title="Sync now"
              >
                {isLoading.syncPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
            ) : (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
