/**
 * Folder browser modal for selecting music library paths.
 *
 * Provides Plex-style folder navigation within the Docker container,
 * showing available directories and audio file hints.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowUp,
  Music,
  Loader2,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';

export interface DirectoryEntry {
  name: string;
  path: string;
  is_readable: boolean;
  has_audio_hint: boolean;
}

export interface BrowseResponse {
  current_path: string;
  parent_path: string | null;
  directories: DirectoryEntry[];
  error: string | null;
}

export interface FolderBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  existingPaths?: string[];
}

export function FolderBrowser({ isOpen, onClose, onSelect, existingPaths = [] }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/settings/browse-directories?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const data: BrowseResponse = await response.json();
        setCurrentPath(data.current_path);
        setParentPath(data.parent_path);
        setDirectories(data.directories);
        if (data.error) {
          setError(data.error);
        }
      } else {
        setError('Failed to load directory');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDirectory('/');
    }
  }, [isOpen, loadDirectory]);

  function handleNavigate(path: string) {
    loadDirectory(path);
  }

  function handleSelect() {
    if (existingPaths.includes(currentPath)) {
      setError('This path is already added');
      return;
    }
    onSelect(currentPath);
    onClose();
  }

  // Parse breadcrumb parts from current path
  const pathParts = currentPath === '/'
    ? ['/']
    : ['/', ...currentPath.split('/').filter(Boolean)];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Browse Folders</h2>
            <p className="text-sm text-zinc-400">Select your music library folder</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb navigation */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-1 text-sm overflow-x-auto">
            {pathParts.map((part, index) => {
              // Build the path up to this point
              const pathUpToHere = index === 0
                ? '/'
                : '/' + pathParts.slice(1, index + 1).join('/');
              const isLast = index === pathParts.length - 1;

              return (
                <div key={index} className="flex items-center">
                  {index > 0 && <ChevronRight className="w-4 h-4 text-zinc-600 mx-1" />}
                  <button
                    onClick={() => !isLast && handleNavigate(pathUpToHere)}
                    className={`px-2 py-1 rounded ${
                      isLast
                        ? 'text-white bg-zinc-800'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    } transition-colors whitespace-nowrap`}
                    disabled={isLast}
                  >
                    {part === '/' ? 'Root' : part}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : error && directories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
              <p className="text-amber-400 font-medium">{error}</p>
              {parentPath && (
                <button
                  onClick={() => handleNavigate(parentPath)}
                  className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                >
                  Go Back
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {/* Parent directory */}
              {parentPath && (
                <button
                  onClick={() => handleNavigate(parentPath)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left"
                >
                  <div className="p-2 bg-zinc-800 rounded-lg">
                    <ArrowUp className="w-4 h-4 text-zinc-400" />
                  </div>
                  <span className="text-zinc-400">..</span>
                </button>
              )}

              {/* Directories */}
              {directories.length === 0 && !error ? (
                <div className="px-4 py-8 text-center text-zinc-500">
                  <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No subdirectories</p>
                </div>
              ) : (
                directories.map((dir) => (
                  <button
                    key={dir.path}
                    onClick={() => dir.is_readable && handleNavigate(dir.path)}
                    disabled={!dir.is_readable}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      dir.is_readable
                        ? 'hover:bg-zinc-800 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${dir.has_audio_hint ? 'bg-blue-500/20' : 'bg-zinc-800'}`}>
                      <Folder className={`w-4 h-4 ${dir.has_audio_hint ? 'text-blue-400' : 'text-zinc-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{dir.name}</p>
                      {!dir.is_readable && (
                        <p className="text-xs text-red-400">Permission denied</p>
                      )}
                    </div>
                    {dir.has_audio_hint && (
                      <div className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">
                        <Music className="w-3 h-3" />
                        <span>Contains audio</span>
                      </div>
                    )}
                    {dir.is_readable && (
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer with current selection and actions */}
        <div className="border-t border-zinc-700 px-4 py-3 bg-zinc-950/50">
          {error && directories.length > 0 && (
            <div className="flex items-center gap-2 text-amber-400 text-sm mb-3">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 mb-1">Selected path:</p>
              <p className="text-sm text-white font-mono truncate">{currentPath}</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={existingPaths.includes(currentPath)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              <Check className="w-4 h-4" />
              Select Folder
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Don't see your music folder? Make sure it's mounted as a volume in docker-compose.yml
          </p>
        </div>
      </div>
    </div>
  );
}
