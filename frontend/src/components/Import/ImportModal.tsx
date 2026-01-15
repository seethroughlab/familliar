import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Upload,
  Loader2,
  Music,
  FileArchive,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Types matching backend
interface TrackPreview {
  filename: string;
  relative_path: string;
  detected_artist: string | null;
  detected_album: string | null;
  detected_title: string | null;
  detected_track_num: number | null;
  detected_year: number | null;
  format: string;
  duration_seconds: number | null;
  file_size_bytes: number;
  // Duplicate detection
  duplicate_of: string | null;
  duplicate_info: string | null;
}

interface PreviewResponse {
  session_id: string;
  tracks: TrackPreview[];
  total_size_bytes: number;
  estimated_sizes: {
    original: number;
    flac: number;
    mp3_320: number;
  };
  has_convertible_formats: boolean;
}

interface EditableTrack extends TrackPreview {
  artist: string;
  album: string;
  title: string;
  track_num: number | null;
  year: number | null;
  // Duplicate detection (inherited but making explicit)
  duplicate_of: string | null;
  duplicate_info: string | null;
}

interface ImportModalProps {
  files: File[];
  onClose: () => void;
  onImportComplete?: () => void;
}

type UploadState = 'uploading' | 'preview' | 'importing' | 'complete' | 'error';
type FormatOption = 'original' | 'flac' | 'mp3';
type OrganizationOption = 'organized' | 'imports';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ImportModal({ files, onClose, onImportComplete }: ImportModalProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>('uploading');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<EditableTrack[]>([]);
  const [estimatedSizes, setEstimatedSizes] = useState<PreviewResponse['estimated_sizes'] | null>(null);
  const [hasConvertible, setHasConvertible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import options
  const [format, setFormat] = useState<FormatOption>('original');
  const [mp3Quality, setMp3Quality] = useState(320);
  const [organization, setOrganization] = useState<OrganizationOption>('organized');
  const [queueAnalysis, setQueueAnalysis] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // UI state
  const [expandedTracks, setExpandedTracks] = useState(false);
  // Progress tracking - value is set but not displayed in UI yet
  const [, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Upload files and get preview
  const uploadForPreview = useCallback(async () => {
    if (files.length === 0) return;

    setState('uploading');
    setUploadProgress(0);
    setError(null);

    try {
      // Use first file (could be zip or single audio)
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);

      // Upload with progress
      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<PreviewResponse>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.detail || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
      });

      xhr.open('POST', '/api/v1/library/import/preview');
      xhr.send(formData);

      const response = await uploadPromise;

      // Convert to editable tracks
      const editableTracks: EditableTrack[] = response.tracks.map(t => ({
        ...t,
        artist: t.detected_artist || '',
        album: t.detected_album || '',
        title: t.detected_title || t.filename,
        track_num: t.detected_track_num,
        year: t.detected_year,
      }));

      setSessionId(response.session_id);
      setTracks(editableTracks);
      setEstimatedSizes(response.estimated_sizes);
      setHasConvertible(response.has_convertible_formats);
      setState('preview');

      // Auto-select FLAC if convertible formats present
      if (response.has_convertible_formats) {
        setFormat('flac');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setState('error');
    }
  }, [files]);

  // Start upload on mount
  useEffect(() => {
    uploadForPreview();
  }, [uploadForPreview]);

  // Update track field
  const updateTrack = (index: number, field: keyof EditableTrack, value: string | number | null) => {
    setTracks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Apply value to all tracks (bulk edit)
  const applyToAll = (field: 'artist' | 'album' | 'year', value: string | number | null) => {
    setTracks(prev => prev.map(t => ({ ...t, [field]: value })));
  };

  // Execute import
  const executeImport = async () => {
    if (!sessionId) return;

    // Filter out duplicates if skipDuplicates is enabled
    const tracksToImport = skipDuplicates
      ? tracks.filter((t) => !t.duplicate_of)
      : tracks;

    if (tracksToImport.length === 0) {
      setError('All tracks are duplicates and were skipped');
      setState('error');
      return;
    }

    setState('importing');
    setImportProgress(0);
    setImportErrors([]);

    try {
      const response = await fetch('/api/v1/library/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          tracks: tracksToImport.map(t => ({
            filename: t.filename,
            relative_path: t.relative_path,
            artist: t.artist || t.detected_artist,
            album: t.album || t.detected_album,
            title: t.title || t.detected_title,
            track_num: t.track_num ?? t.detected_track_num,
            year: t.year ?? t.detected_year,
            detected_artist: t.detected_artist,
            detected_album: t.detected_album,
            detected_title: t.detected_title,
            detected_track_num: t.detected_track_num,
            detected_year: t.detected_year,
          })),
          options: {
            format,
            mp3_quality: mp3Quality,
            organization,
            queue_analysis: queueAnalysis,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Import failed');
      }

      const result = await response.json();

      setImportedCount(result.imported_count);
      setImportErrors(result.errors || []);
      setImportProgress(100);
      setState('complete');

      // Invalidate and refetch all library-related queries to refresh browsers
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && (
            key === 'tracks' ||
            key.startsWith('library')
          );
        },
      });

      onImportComplete?.();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setState('error');
    }
  };

  // Get estimated size for current format
  const getEstimatedSize = (): number => {
    if (!estimatedSizes) return 0;
    if (format === 'flac') return estimatedSizes.flac;
    if (format === 'mp3') return estimatedSizes.mp3_320;
    return estimatedSizes.original;
  };

  // Get count of tracks that will actually be imported
  const getImportCount = (): number => {
    if (skipDuplicates) {
      return tracks.filter((t) => !t.duplicate_of).length;
    }
    return tracks.length;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Music
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Uploading state */}
          {state === 'uploading' && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-green-400 animate-spin" />
              <p className="text-white mb-2">Scanning files...</p>
              <div className="w-full max-w-xs mx-auto bg-zinc-800 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-zinc-500 mt-2">{uploadProgress}%</p>
            </div>
          )}

          {/* Preview state */}
          {state === 'preview' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  {tracks.length} track{tracks.length !== 1 ? 's' : ''} found
                </span>
                <span className="text-zinc-400">
                  {formatBytes(getEstimatedSize())}
                </span>
              </div>

              {/* Duplicate warning */}
              {tracks.some((t) => t.duplicate_of) && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-200 font-medium">
                      {tracks.filter((t) => t.duplicate_of).length} track
                      {tracks.filter((t) => t.duplicate_of).length !== 1 ? 's' : ''} may
                      already exist in your library
                    </p>
                    <p className="text-amber-200/70 text-xs mt-1">
                      Matching by artist, album, and title
                    </p>
                  </div>
                </div>
              )}

              {/* Track list */}
              <div>
                <button
                  onClick={() => setExpandedTracks(!expandedTracks)}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-2"
                >
                  {expandedTracks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expandedTracks ? 'Collapse tracks' : 'Edit track details'}
                </button>

                {expandedTracks ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tracks.map((track, index) => (
                      <div
                        key={track.relative_path}
                        className={`bg-zinc-800/50 rounded-lg p-3 space-y-2 ${
                          track.duplicate_of ? 'border border-amber-500/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                          {track.duplicate_of ? (
                            <AlertCircle className="w-4 h-4 text-amber-400" title="May already exist in library" />
                          ) : track.format === 'zip' ? (
                            <FileArchive className="w-4 h-4" />
                          ) : (
                            <Music className="w-4 h-4" />
                          )}
                          <span className="truncate">{track.filename}</span>
                          {track.duplicate_of && (
                            <span className="text-xs text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                              duplicate
                            </span>
                          )}
                          <span className="ml-auto">{formatDuration(track.duration_seconds)}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <input
                            type="number"
                            value={track.track_num || ''}
                            onChange={(e) => updateTrack(index, 'track_num', e.target.value ? parseInt(e.target.value) : null)}
                            placeholder="#"
                            className="col-span-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          />
                          <input
                            type="text"
                            value={track.title}
                            onChange={(e) => updateTrack(index, 'title', e.target.value)}
                            placeholder="Title"
                            className="col-span-3 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          />
                          <input
                            type="text"
                            value={track.artist}
                            onChange={(e) => updateTrack(index, 'artist', e.target.value)}
                            placeholder="Artist"
                            className="col-span-2 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          />
                          <input
                            type="text"
                            value={track.album}
                            onChange={(e) => updateTrack(index, 'album', e.target.value)}
                            placeholder="Album"
                            className="col-span-2 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-800/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {tracks.slice(0, 5).map((track) => (
                      <div key={track.relative_path} className="flex items-center gap-2 text-sm text-zinc-300 py-1">
                        {track.duplicate_of ? (
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                        ) : (
                          <Music className="w-3 h-3 text-zinc-500" />
                        )}
                        <span className={`truncate ${track.duplicate_of ? 'text-amber-200' : ''}`}>
                          {track.title || track.filename}
                        </span>
                        <span className="ml-auto text-zinc-500">{formatDuration(track.duration_seconds)}</span>
                      </div>
                    ))}
                    {tracks.length > 5 && (
                      <p className="text-xs text-zinc-500 mt-1">+{tracks.length - 5} more tracks</p>
                    )}
                  </div>
                )}

                {/* Bulk edit */}
                {expandedTracks && tracks.length > 1 && (
                  <div className="mt-3 p-3 bg-zinc-800/30 rounded-lg">
                    <p className="text-xs text-zinc-500 mb-2">Apply to all tracks:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <input
                          type="text"
                          placeholder="Artist"
                          className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          onBlur={(e) => e.target.value && applyToAll('artist', e.target.value)}
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Album"
                          className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          onBlur={(e) => e.target.value && applyToAll('album', e.target.value)}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder="Year"
                          className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500"
                          onBlur={(e) => e.target.value && applyToAll('year', parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Format options */}
              {hasConvertible && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Format</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                      <input
                        type="radio"
                        name="format"
                        checked={format === 'original'}
                        onChange={() => setFormat('original')}
                        className="text-green-500"
                      />
                      <div className="flex-1">
                        <span className="text-white">Keep Original</span>
                        <span className="text-zinc-500 text-sm ml-2">
                          {formatBytes(estimatedSizes?.original || 0)}
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                      <input
                        type="radio"
                        name="format"
                        checked={format === 'flac'}
                        onChange={() => setFormat('flac')}
                        className="text-green-500"
                      />
                      <div className="flex-1">
                        <span className="text-white">Convert to FLAC</span>
                        <span className="text-zinc-500 text-sm ml-2">
                          {formatBytes(estimatedSizes?.flac || 0)}
                        </span>
                        <span className="text-xs text-green-400 ml-2">Lossless</span>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                      <input
                        type="radio"
                        name="format"
                        checked={format === 'mp3'}
                        onChange={() => setFormat('mp3')}
                        className="text-green-500"
                      />
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-white">Convert to MP3</span>
                        <select
                          value={mp3Quality}
                          onChange={(e) => setMp3Quality(parseInt(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white"
                        >
                          <option value={320}>320 kbps</option>
                          <option value={192}>192 kbps</option>
                          <option value={128}>128 kbps</option>
                        </select>
                        <span className="text-zinc-500 text-sm">
                          {formatBytes(estimatedSizes?.mp3_320 || 0)}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Organization options */}
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Organization</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                    <input
                      type="radio"
                      name="organization"
                      checked={organization === 'organized'}
                      onChange={() => setOrganization('organized')}
                      className="text-green-500"
                    />
                    <div>
                      <span className="text-white">Organize into folders</span>
                      <p className="text-xs text-zinc-500">Artist / Album / ## - Title.ext</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                    <input
                      type="radio"
                      name="organization"
                      checked={organization === 'imports'}
                      onChange={() => setOrganization('imports')}
                      className="text-green-500"
                    />
                    <div>
                      <span className="text-white">Import to _imports folder</span>
                      <p className="text-xs text-zinc-500">Flat structure, timestamped folder</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Additional options */}
              <div className="space-y-3">
                {tracks.some((t) => t.duplicate_of) && (
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded text-amber-500"
                    />
                    <span className="text-sm text-zinc-300">
                      Skip tracks that already exist in library
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={queueAnalysis}
                    onChange={(e) => setQueueAnalysis(e.target.checked)}
                    className="rounded text-green-500"
                  />
                  <span className="text-sm text-zinc-300">
                    Queue for audio analysis after import
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Importing state */}
          {state === 'importing' && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-green-400 animate-spin" />
              <p className="text-white mb-2">
                Importing {tracks.length} track{tracks.length !== 1 ? 's' : ''}...
              </p>
              <p className="text-sm text-zinc-500 mb-4">
                {format !== 'original' ? 'Converting and copying files' : 'Copying files'}
              </p>
              {/* Animated progress bar */}
              <div className="w-full max-w-xs mx-auto bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-green-500 h-2 rounded-full animate-pulse"
                  style={{
                    width: '100%',
                    animation: 'indeterminate 1.5s ease-in-out infinite',
                  }}
                />
              </div>
              <style>{`
                @keyframes indeterminate {
                  0% { transform: translateX(-100%); width: 50%; }
                  50% { transform: translateX(50%); width: 50%; }
                  100% { transform: translateX(200%); width: 50%; }
                }
              `}</style>
            </div>
          )}

          {/* Complete state */}
          {state === 'complete' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Import Complete!
              </h3>
              <p className="text-zinc-400">
                {importedCount} track{importedCount !== 1 ? 's' : ''} imported successfully
              </p>
              {importErrors.length > 0 && (
                <div className="mt-4 text-left max-w-md mx-auto">
                  <p className="text-sm text-amber-400 mb-2">
                    {importErrors.length} error{importErrors.length !== 1 ? 's' : ''}:
                  </p>
                  <div className="bg-zinc-800/50 rounded-lg p-2 max-h-32 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <p key={i} className="text-xs text-zinc-400">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Import Failed
              </h3>
              <p className="text-zinc-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          {state === 'preview' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeImport}
                disabled={getImportCount() === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                Import {getImportCount()} track{getImportCount() !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {(state === 'complete' || state === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
