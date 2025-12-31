import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

interface PathInfo {
  path: string;
  valid: boolean;
  audioCount?: number;
  error?: string;
}

interface ValidationResult {
  path: string;
  exists: boolean;
  is_directory: boolean;
  audio_file_count: number | null;
  error: string | null;
}

export function LibraryPathsSettings() {
  const [paths, setPaths] = useState<PathInfo[]>([]);
  const [newPath, setNewPath] = useState('');
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load current settings
  useEffect(() => {
    fetch('/api/v1/settings')
      .then((r) => r.json())
      .then((data) => {
        const libraryPaths = data.music_library_paths || [];
        const pathsValid = data.music_library_paths_valid || [];
        setPaths(
          libraryPaths.map((path: string, i: number) => ({
            path,
            valid: pathsValid[i] ?? false,
          }))
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const validatePath = async (pathToValidate: string): Promise<ValidationResult | null> => {
    try {
      const response = await fetch('/api/v1/settings/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToValidate }),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      console.error('Failed to validate path');
    }
    return null;
  };

  const handleValidateNewPath = async () => {
    if (!newPath.trim()) return;

    setValidating(true);
    const result = await validatePath(newPath.trim());
    setValidating(false);

    if (result) {
      if (result.exists && result.is_directory) {
        setStatus(`Found ${result.audio_file_count?.toLocaleString() ?? 0} audio files`);
      } else {
        setStatus(result.error || 'Invalid path');
      }
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const handleAddPath = async () => {
    const trimmedPath = newPath.trim();
    if (!trimmedPath) return;

    // Check for duplicates
    if (paths.some((p) => p.path === trimmedPath)) {
      setStatus('Path already added');
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    setValidating(true);
    const result = await validatePath(trimmedPath);
    setValidating(false);

    const newPathInfo: PathInfo = {
      path: trimmedPath,
      valid: result?.exists && result?.is_directory ? true : false,
      audioCount: result?.audio_file_count ?? undefined,
      error: result?.error ?? undefined,
    };

    const updatedPaths = [...paths, newPathInfo];
    setPaths(updatedPaths);
    setNewPath('');

    // Auto-save
    await savePaths(updatedPaths);
  };

  const handleRemovePath = async (index: number) => {
    const updatedPaths = paths.filter((_, i) => i !== index);
    setPaths(updatedPaths);
    await savePaths(updatedPaths);
  };

  const savePaths = async (pathsToSave: PathInfo[]) => {
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          music_library_paths: pathsToSave.map((p) => p.path),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update validation status from server
        const pathsValid = data.music_library_paths_valid || [];
        setPaths(
          pathsToSave.map((p, i) => ({
            ...p,
            valid: pathsValid[i] ?? false,
          }))
        );
        setStatus('Library paths saved');
      } else {
        setStatus('Failed to save');
      }
    } catch {
      setStatus('Error saving');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-zinc-100 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-zinc-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-5 h-5 text-blue-400" />
        <h4 className="font-medium text-white dark:text-white light:text-zinc-900">Music Library Paths</h4>
      </div>

      <div className="space-y-3">
        {/* Current paths */}
        {paths.length === 0 ? (
          <div className="flex items-start gap-2 p-3 bg-amber-900/20 dark:bg-amber-900/20 light:bg-amber-50 border border-amber-800 dark:border-amber-800 light:border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400 dark:text-amber-400 light:text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-amber-400 dark:text-amber-400 light:text-amber-700">No library paths configured</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 light:text-zinc-600 mt-1">
                Add a path to your music library below to start scanning.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {paths.map((pathInfo, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-zinc-900/50 dark:bg-zinc-900/50 light:bg-white rounded-lg border border-zinc-700 dark:border-zinc-700 light:border-zinc-200"
              >
                {pathInfo.valid ? (
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white dark:text-white light:text-zinc-900 truncate font-mono">
                    {pathInfo.path}
                  </p>
                  {pathInfo.valid && pathInfo.audioCount !== undefined && (
                    <p className="text-xs text-zinc-500">{pathInfo.audioCount.toLocaleString()} audio files</p>
                  )}
                  {pathInfo.error && <p className="text-xs text-red-400">{pathInfo.error}</p>}
                </div>
                <button
                  onClick={() => handleRemovePath(index)}
                  className="p-1 text-zinc-400 hover:text-red-400 transition-colors"
                  title="Remove path"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new path */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
            placeholder="/path/to/music"
            className="flex-1 px-3 py-2 bg-zinc-900 dark:bg-zinc-900 light:bg-white border border-zinc-700 dark:border-zinc-700 light:border-zinc-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleValidateNewPath}
            disabled={validating || !newPath.trim()}
            className="px-3 py-2 bg-zinc-700 dark:bg-zinc-700 light:bg-zinc-200 hover:bg-zinc-600 dark:hover:bg-zinc-600 light:hover:bg-zinc-300 disabled:opacity-50 rounded-lg transition-colors text-sm"
            title="Validate path"
          >
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check'}
          </button>
          <button
            onClick={handleAddPath}
            disabled={validating || !newPath.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            title="Add path"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-500 light:text-zinc-600">
          Paths must be accessible from the server. In Docker, use container paths (e.g., /data/music).
        </p>

        {/* Status message */}
        {(status || saving) && (
          <p
            className={`text-sm ${
              status?.includes('Error') || status?.includes('Failed') || status?.includes('Invalid')
                ? 'text-red-400'
                : status?.includes('Found')
                  ? 'text-blue-400'
                  : 'text-green-400'
            }`}
          >
            {saving ? 'Saving...' : status}
          </p>
        )}
      </div>
    </div>
  );
}
