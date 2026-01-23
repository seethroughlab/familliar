import { useState, useEffect } from 'react';
import { Bug, RefreshCw, Trash2 } from 'lucide-react';
import {
  getAudioContext,
  getAudioAnalyser,
  areAudioEffectsAvailable,
  getCurrentMode,
  isVisualizerAvailable,
} from '../../hooks/useAudioEngine';
import { usePlayerStore } from '../../stores/playerStore';

// Capture console logs
const logBuffer: { time: string; level: string; message: string }[] = [];
const MAX_LOGS = 50;

// Intercept console methods (only once)
if (typeof window !== 'undefined' && !(window as unknown as { __debugLogsSetup: boolean }).__debugLogsSetup) {
  (window as unknown as { __debugLogsSetup: boolean }).__debugLogsSetup = true;

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const captureLog = (level: string, ...args: unknown[]) => {
    const time = new Date().toLocaleTimeString();
    const message = args
      .map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(' ');

    logBuffer.unshift({ time, level, message });
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.pop();
    }
  };

  console.log = (...args) => {
    captureLog('log', ...args);
    originalConsole.log(...args);
  };
  console.warn = (...args) => {
    captureLog('warn', ...args);
    originalConsole.warn(...args);
  };
  console.error = (...args) => {
    captureLog('error', ...args);
    originalConsole.error(...args);
  };
  console.debug = (...args) => {
    captureLog('debug', ...args);
    originalConsole.debug(...args);
  };
}

export function DebugSettings() {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<typeof logBuffer>([]);
  const { isPlaying, currentTrack } = usePlayerStore();

  // Refresh logs periodically when expanded
  useEffect(() => {
    if (!expanded) return;

    const interval = setInterval(() => {
      setLogs([...logBuffer]);
    }, 1000);

    // Initial load
    setLogs([...logBuffer]);

    return () => clearInterval(interval);
  }, [expanded]);

  const audioContext = getAudioContext();
  const analyser = getAudioAnalyser();
  const effectsAvailable = areAudioEffectsAvailable();
  const visualizerAvailable = isVisualizerAvailable();
  const currentMode = getCurrentMode();

  // Platform detection
  const isMobilePlatform = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  const useHybridMode = isIOS;

  const clearLogs = () => {
    logBuffer.length = 0;
    setLogs([]);
  };

  const refreshLogs = () => {
    setLogs([...logBuffer]);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'debug':
        return 'text-zinc-500';
      default:
        return 'text-zinc-300';
    }
  };

  return (
    <div className="bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-white rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3"
      >
        <Bug className="w-5 h-5 text-orange-400" />
        <div className="flex-1 text-left">
          <h4 className="font-medium text-white dark:text-white light:text-zinc-900">
            Debug Info
          </h4>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
            Platform detection, audio state, and console logs
          </p>
        </div>
        <span className="text-zinc-400">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Platform Detection */}
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <h5 className="text-sm font-medium text-zinc-300 mb-2">Platform Detection</h5>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="text-zinc-400">User Agent:</div>
              <div className="text-zinc-200 break-all">{navigator.userAgent.slice(0, 50)}...</div>

              <div className="text-zinc-400">isMobilePlatform:</div>
              <div className={isMobilePlatform ? 'text-green-400' : 'text-red-400'}>
                {String(isMobilePlatform)}
              </div>

              <div className="text-zinc-400">isIOS:</div>
              <div className={isIOS ? 'text-green-400' : 'text-red-400'}>
                {String(isIOS)}
              </div>

              <div className="text-zinc-400">useHybridMode:</div>
              <div className={useHybridMode ? 'text-green-400' : 'text-red-400'}>
                {String(useHybridMode)}
              </div>

              <div className="text-zinc-400">currentMode:</div>
              <div className={currentMode === 'webaudio' ? 'text-purple-400' : 'text-blue-400'}>
                {currentMode}
              </div>

              <div className="text-zinc-400">effectsAvailable:</div>
              <div className={effectsAvailable ? 'text-green-400' : 'text-red-400'}>
                {String(effectsAvailable)}
              </div>

              <div className="text-zinc-400">visualizerAvailable:</div>
              <div className={visualizerAvailable ? 'text-green-400' : 'text-red-400'}>
                {String(visualizerAvailable)}
              </div>
            </div>
          </div>

          {/* Audio State */}
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <h5 className="text-sm font-medium text-zinc-300 mb-2">Audio State</h5>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="text-zinc-400">AudioContext:</div>
              <div className={audioContext ? 'text-green-400' : 'text-yellow-400'}>
                {audioContext ? `exists (${audioContext.state})` : 'null'}
              </div>

              <div className="text-zinc-400">Analyser:</div>
              <div className={analyser ? 'text-green-400' : 'text-yellow-400'}>
                {analyser ? 'exists' : 'null'}
              </div>

              <div className="text-zinc-400">isPlaying:</div>
              <div className={isPlaying ? 'text-green-400' : 'text-zinc-400'}>
                {String(isPlaying)}
              </div>

              <div className="text-zinc-400">currentTrack:</div>
              <div className="text-zinc-200 truncate">
                {currentTrack ? currentTrack.title : 'none'}
              </div>
            </div>
          </div>

          {/* Console Logs */}
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-zinc-300">Console Logs</h5>
              <div className="flex gap-2">
                <button
                  onClick={refreshLogs}
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={clearLogs}
                  className="p-1 text-zinc-400 hover:text-red-400"
                  title="Clear"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 text-xs font-mono">
              {logs.length === 0 ? (
                <div className="text-zinc-500 italic">No logs captured yet</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${getLevelColor(log.level)} break-all`}>
                    <span className="text-zinc-500">[{log.time}]</span>{' '}
                    <span className="text-zinc-400">[{log.level}]</span>{' '}
                    {log.message}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Test Actions */}
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <h5 className="text-sm font-medium text-zinc-300 mb-2">Test Actions</h5>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => console.log('[Test] Manual log test')}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs rounded"
              >
                Log Test
              </button>
              <button
                onClick={() => {
                  const ctx = getAudioContext();
                  if (ctx) {
                    console.log('[Test] AudioContext state:', ctx.state);
                    if (ctx.state === 'suspended') {
                      ctx.resume().then(() => {
                        console.log('[Test] AudioContext resumed');
                      });
                    }
                  } else {
                    console.log('[Test] No AudioContext');
                  }
                }}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs rounded"
              >
                Check/Resume Context
              </button>
              <button
                onClick={() => {
                  console.log('[Test] Visibility state:', document.visibilityState);
                  console.log('[Test] Hidden:', document.hidden);
                }}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs rounded"
              >
                Check Visibility
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
