import { useState, useCallback, useRef } from 'react';
import {
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileJson,
  X,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  exportImportApi,
  type ImportPreviewResponse,
  type ImportExecuteResponse,
} from '../../api/client';

type ExportState = 'idle' | 'exporting' | 'success' | 'error';
type ImportState = 'idle' | 'preview' | 'previewing' | 'ready' | 'importing' | 'success' | 'error';

interface ExportOptions {
  include_play_history: boolean;
  include_favorites: boolean;
  include_playlists: boolean;
  include_smart_playlists: boolean;
  include_proposed_changes: boolean;
  include_external_tracks: boolean;
}

interface ImportOptions {
  import_play_history: boolean;
  import_favorites: boolean;
  import_playlists: boolean;
  import_smart_playlists: boolean;
  import_proposed_changes: boolean;
  import_user_overrides: boolean;
  import_external_tracks: boolean;
}

export function DataManagement() {
  // Export state
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    include_play_history: true,
    include_favorites: true,
    include_playlists: true,
    include_smart_playlists: true,
    include_proposed_changes: true,
    include_external_tracks: true,
  });

  // Import state
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportExecuteResponse | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    import_play_history: true,
    import_favorites: true,
    import_playlists: true,
    import_smart_playlists: true,
    import_proposed_changes: true,
    import_user_overrides: true,
    import_external_tracks: true,
  });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export handler
  const handleExport = async () => {
    setExportState('exporting');
    setExportError(null);

    try {
      // TODO: Get chat history from IndexedDB if needed
      await exportImportApi.downloadExport(exportOptions);
      setExportState('success');
      setTimeout(() => setExportState('idle'), 3000);
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
      setExportState('error');
    }
  };

  // Import file handler
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setImportError('Please select a JSON file');
      setImportState('error');
      return;
    }

    setImportState('previewing');
    setImportError(null);
    setImportPreview(null);

    try {
      const preview = await exportImportApi.previewImport(file);
      setImportPreview(preview);
      setImportState('ready');
    } catch (error) {
      console.error('Import preview failed:', error);
      setImportError(error instanceof Error ? error.message : 'Failed to read file');
      setImportState('error');
    }
  }, []);

  // Drag handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Execute import
  const executeImport = async () => {
    if (!importPreview) return;

    setImportState('importing');
    setImportError(null);

    try {
      const result = await exportImportApi.executeImport({
        session_id: importPreview.session_id,
        mode: importMode,
        ...importOptions,
      });
      setImportResult(result);
      setImportState('success');
    } catch (error) {
      console.error('Import failed:', error);
      setImportError(error instanceof Error ? error.message : 'Import failed');
      setImportState('error');
    }
  };

  // Reset import state
  const resetImport = () => {
    setImportState('idle');
    setImportError(null);
    setImportPreview(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleExportOption = (key: keyof ExportOptions) => {
    setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleImportOption = (key: keyof ImportOptions) => {
    setImportOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <div className="bg-zinc-800/50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <Download className="w-5 h-5 text-zinc-400" />
          <div>
            <h4 className="font-medium text-white">Export Data</h4>
            <p className="text-sm text-zinc-400">
              Download your playlists, favorites, and play history
            </p>
          </div>
        </div>

        {/* Export options */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {Object.entries({
            include_play_history: 'Play History',
            include_favorites: 'Favorites',
            include_playlists: 'Playlists',
            include_smart_playlists: 'Smart Playlists',
            include_proposed_changes: 'Pending Changes',
            include_external_tracks: 'Wishlist Items',
          }).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={exportOptions[key as keyof ExportOptions]}
                onChange={() => toggleExportOption(key as keyof ExportOptions)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
              />
              {label}
            </label>
          ))}
        </div>

        {/* Export button and status */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={exportState === 'exporting'}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md flex items-center gap-2 text-sm font-medium"
          >
            {exportState === 'exporting' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exportState === 'exporting' ? 'Exporting...' : 'Export'}
          </button>

          {exportState === 'success' && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              Download started
            </span>
          )}

          {exportState === 'error' && (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {exportError}
            </span>
          )}
        </div>
      </div>

      {/* Import Section */}
      <div className="bg-zinc-800/50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <Upload className="w-5 h-5 text-zinc-400" />
          <div>
            <h4 className="font-medium text-white">Import Data</h4>
            <p className="text-sm text-zinc-400">
              Restore data from a Familiar export file
            </p>
          </div>
        </div>

        {/* File drop zone - shown when idle or error */}
        {(importState === 'idle' || importState === 'error') && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
              ${dragActive
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-zinc-600 hover:border-zinc-500'
              }
            `}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileJson className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-400 mb-1">
              Drop a Familiar export file here, or click to browse
            </p>
            <p className="text-xs text-zinc-500">
              JSON files only
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        )}

        {/* Error message */}
        {importState === 'error' && importError && (
          <div className="mt-3 p-3 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-300">{importError}</p>
              <button
                onClick={resetImport}
                className="mt-2 text-xs text-red-400 hover:text-red-300"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Previewing state */}
        {importState === 'previewing' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <span className="ml-2 text-zinc-400">Analyzing file...</span>
          </div>
        )}

        {/* Preview ready */}
        {importState === 'ready' && importPreview && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center justify-between p-3 bg-zinc-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileJson className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-white">
                    {importPreview.profile_name || 'Unknown Profile'}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Exported {importPreview.exported_at
                      ? new Date(importPreview.exported_at).toLocaleDateString()
                      : 'date unknown'}
                    {importPreview.familiar_version && ` (v${importPreview.familiar_version})`}
                  </p>
                </div>
              </div>
              <button
                onClick={resetImport}
                className="p-1.5 text-zinc-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warnings */}
            {importPreview.warnings.length > 0 && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-300">Warnings</p>
                    <ul className="mt-1 text-xs text-yellow-200/80 space-y-1">
                      {importPreview.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Matching stats */}
            <div className="p-3 bg-zinc-700/50 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Track Matching</p>
                  <p className="text-xs text-zinc-400">
                    {importPreview.matching.matched} of {importPreview.matching.total} tracks matched to your library
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-zinc-600/50 rounded p-2">
                  <div className="text-green-400 font-medium">
                    {importPreview.matching.by_method.isrc || 0}
                  </div>
                  <div className="text-zinc-500">ISRC</div>
                </div>
                <div className="bg-zinc-600/50 rounded p-2">
                  <div className="text-blue-400 font-medium">
                    {importPreview.matching.by_method.musicbrainz || 0}
                  </div>
                  <div className="text-zinc-500">MusicBrainz</div>
                </div>
                <div className="bg-zinc-600/50 rounded p-2">
                  <div className="text-purple-400 font-medium">
                    {importPreview.matching.by_method.exact || 0}
                  </div>
                  <div className="text-zinc-500">Exact</div>
                </div>
                <div className="bg-zinc-600/50 rounded p-2">
                  <div className="text-yellow-400 font-medium">
                    {importPreview.matching.by_method.fuzzy || 0}
                  </div>
                  <div className="text-zinc-500">Fuzzy</div>
                </div>
              </div>

              {/* Unmatched samples */}
              {importPreview.matching.unmatched_samples.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-zinc-400 mb-2">
                    Unmatched tracks (sample):
                  </p>
                  <div className="space-y-1">
                    {importPreview.matching.unmatched_samples.slice(0, 5).map((track, i) => (
                      <div key={i} className="text-xs text-zinc-500 truncate">
                        {track.artist} - {track.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Data summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-zinc-700/50 rounded p-2">
                <div className="text-white font-medium">
                  {importPreview.summary.play_history_count}
                </div>
                <div className="text-zinc-500">Plays</div>
              </div>
              <div className="bg-zinc-700/50 rounded p-2">
                <div className="text-white font-medium">
                  {importPreview.summary.favorites_count}
                </div>
                <div className="text-zinc-500">Favorites</div>
              </div>
              <div className="bg-zinc-700/50 rounded p-2">
                <div className="text-white font-medium">
                  {importPreview.summary.playlists_count}
                </div>
                <div className="text-zinc-500">Playlists</div>
              </div>
              <div className="bg-zinc-700/50 rounded p-2">
                <div className="text-white font-medium">
                  {importPreview.summary.smart_playlists_count}
                </div>
                <div className="text-zinc-500">Smart Playlists</div>
              </div>
            </div>

            {/* Import options */}
            <div>
              <p className="text-sm text-zinc-400 mb-2">Import options:</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {Object.entries({
                  import_play_history: 'Play History',
                  import_favorites: 'Favorites',
                  import_playlists: 'Playlists',
                  import_smart_playlists: 'Smart Playlists',
                  import_user_overrides: 'User Overrides',
                  import_external_tracks: 'Wishlist Items',
                }).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={importOptions[key as keyof ImportOptions]}
                      onChange={() => toggleImportOption(key as keyof ImportOptions)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Import mode */}
              <div className="flex items-center gap-4 mb-4">
                <span className="text-sm text-zinc-400">Mode:</span>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="w-4 h-4 border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
                  />
                  Merge (recommended)
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'overwrite'}
                    onChange={() => setImportMode('overwrite')}
                    className="w-4 h-4 border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800"
                  />
                  Overwrite
                </label>
              </div>
            </div>

            {/* Import button */}
            <div className="flex items-center gap-3">
              <button
                onClick={executeImport}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md flex items-center gap-2 text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                Import Data
              </button>
              <button
                onClick={resetImport}
                className="px-4 py-2 text-zinc-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Importing state */}
        {importState === 'importing' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-green-400 animate-spin" />
            <span className="ml-2 text-zinc-400">Importing data...</span>
          </div>
        )}

        {/* Import success */}
        {importState === 'success' && importResult && (
          <div className="space-y-4">
            <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <p className="text-sm font-medium text-green-300">Import completed</p>
              </div>
            </div>

            {/* Results grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
              {Object.entries({
                play_history: 'Plays',
                favorites: 'Favorites',
                playlists: 'Playlists',
                smart_playlists: 'Smart Playlists',
                user_overrides: 'Overrides',
                external_tracks: 'Wishlist',
              }).map(([key, label]) => {
                const result = importResult.results[key as keyof typeof importResult.results];
                if (typeof result === 'object' && 'imported' in result) {
                  return (
                    <div key={key} className="bg-zinc-700/50 rounded p-2">
                      <div className="text-green-400 font-medium">{result.imported}</div>
                      <div className="text-zinc-500">{label}</div>
                      {result.skipped > 0 && (
                        <div className="text-xs text-zinc-600">({result.skipped} skipped)</div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {/* Show any errors */}
            {Object.entries(importResult.results).some(
              ([_, v]) => typeof v === 'object' && 'errors' in v && (v as { errors: string[] }).errors.length > 0
            ) && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                <p className="text-sm font-medium text-yellow-300 mb-2">Some items had errors:</p>
                <ul className="text-xs text-yellow-200/80 space-y-1">
                  {Object.entries(importResult.results).map(([key, v]) => {
                    if (typeof v === 'object' && 'errors' in v) {
                      const errors = (v as { errors: string[] }).errors;
                      return errors.map((err, i) => (
                        <li key={`${key}-${i}`}>{err}</li>
                      ));
                    }
                    return null;
                  })}
                </ul>
              </div>
            )}

            <button
              onClick={resetImport}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md text-sm"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
