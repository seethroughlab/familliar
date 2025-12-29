import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  File,
  FileArchive,
  Music,
  CheckCircle,
  AlertCircle,
  Loader2,
  FolderOpen,
  Clock,
} from 'lucide-react';
import { libraryApi, type ImportResult, type RecentImport } from '../../api/client';

const ACCEPTED_EXTENSIONS = [
  '.mp3',
  '.flac',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.wav',
  '.aiff',
  '.wma',
  '.zip',
];

type UploadState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export function MusicImport() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load recent imports on mount
  useEffect(() => {
    loadRecentImports();
  }, []);

  const loadRecentImports = async () => {
    try {
      const imports = await libraryApi.getRecentImports(5);
      setRecentImports(imports);
    } catch (err) {
      console.error('Failed to load recent imports:', err);
    }
  };

  const isValidFile = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const handleUpload = async (file: File) => {
    if (!isValidFile(file)) {
      setError(`Invalid file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      setUploadState('error');
      return;
    }

    setSelectedFile(file);
    setUploadState('uploading');
    setUploadProgress(0);
    setError(null);
    setResult(null);

    try {
      const importResult = await libraryApi.importMusic(file, (progress) => {
        setUploadProgress(progress);
        if (progress === 100) {
          setUploadState('processing');
        }
      });

      setResult(importResult);
      setUploadState('success');
      loadRecentImports();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(message);
      setUploadState('error');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const resetUpload = () => {
    setUploadState('idle');
    setUploadProgress(0);
    setResult(null);
    setError(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-white rounded-lg p-4">
      <div className="flex items-center gap-3 mb-4">
        <Upload className="w-5 h-5 text-purple-400" />
        <div>
          <h4 className="font-medium text-white dark:text-white light:text-zinc-900">
            Import Music
          </h4>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">
            Add music files or zip archives to your library
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() =>
          uploadState === 'idle' && fileInputRef.current?.click()
        }
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          isDragOver
            ? 'border-purple-500 bg-purple-500/10'
            : uploadState === 'idle'
              ? 'border-zinc-600 hover:border-zinc-500 hover:bg-zinc-700/30'
              : 'border-zinc-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploadState === 'idle' && (
          <>
            <Upload className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
            <p className="text-sm text-zinc-300 mb-1">
              Drag and drop files here
            </p>
            <p className="text-xs text-zinc-500">
              or click to browse
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              Supports: MP3, FLAC, M4A, AAC, OGG, WAV, AIFF, ZIP
            </p>
          </>
        )}

        {uploadState === 'uploading' && (
          <>
            <div className="flex items-center justify-center gap-3 mb-3">
              {selectedFile?.name.endsWith('.zip') ? (
                <FileArchive className="w-8 h-8 text-purple-400" />
              ) : (
                <Music className="w-8 h-8 text-purple-400" />
              )}
              <div className="text-left">
                <p className="text-sm text-zinc-200 truncate max-w-[200px]">
                  {selectedFile?.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {selectedFile && formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2 mb-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400">
              Uploading... {uploadProgress}%
            </p>
          </>
        )}

        {uploadState === 'processing' && (
          <>
            <Loader2 className="w-10 h-10 mx-auto mb-3 text-purple-400 animate-spin" />
            <p className="text-sm text-zinc-300">Processing...</p>
            <p className="text-xs text-zinc-500">
              Extracting files and scanning metadata
            </p>
          </>
        )}

        {uploadState === 'success' && result && (
          <>
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <p className="text-sm text-zinc-200 mb-1">
              Import successful!
            </p>
            <p className="text-xs text-zinc-400">
              {result.files_found} file{result.files_found !== 1 ? 's' : ''}{' '}
              imported
            </p>
            {result.files.length > 0 && (
              <div className="mt-3 max-h-24 overflow-y-auto text-left">
                {result.files.slice(0, 5).map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-zinc-500 py-0.5"
                  >
                    <File className="w-3 h-3" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
                {result.files.length > 5 && (
                  <p className="text-xs text-zinc-600 mt-1">
                    +{result.files.length - 5} more files
                  </p>
                )}
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetUpload();
              }}
              className="mt-3 px-4 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md transition-colors"
            >
              Import Another
            </button>
          </>
        )}

        {uploadState === 'error' && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
            <p className="text-sm text-red-400 mb-1">Import failed</p>
            <p className="text-xs text-zinc-500">{error}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetUpload();
              }}
              className="mt-3 px-4 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>

      {/* Recent imports */}
      {recentImports.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              Recent Imports
            </span>
          </div>
          <div className="space-y-1">
            {recentImports.map((imp) => (
              <div
                key={imp.name}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-zinc-700/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-400 truncate">
                    {imp.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{imp.file_count} files</span>
                  <span>{formatRelativeTime(imp.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-zinc-500 space-y-1">
        <p>
          <strong>Tip:</strong> Upload a ZIP file containing an album folder
          structure for best results.
        </p>
        <p>
          Imported files are saved to your library's{' '}
          <code className="bg-zinc-700 px-1 rounded">_imports/</code> folder
          and automatically scanned for metadata.
        </p>
      </div>
    </div>
  );
}
