import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileArchive,
  Music,
  Loader2,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { libraryApi } from '../../api/client';
import type { ImportResult } from '../../api/client';

interface Props {
  onImportComplete?: (result: ImportResult) => void;
  onClose?: () => void;
}

export function MusicImport({ onImportComplete, onClose }: Props) {
  const queryClient = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const importMutation = useMutation({
    mutationFn: (file: File) => libraryApi.importMusic(file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['library-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      onImportComplete?.(result);
    },
  });

  const handleFile = useCallback((file: File) => {
    const isValid =
      file.name.toLowerCase().endsWith('.zip') ||
      /\.(mp3|flac|m4a|aac|ogg|wav|wma)$/i.test(file.name);

    if (!isValid) {
      alert('Please upload a zip file or audio file (mp3, flac, m4a, etc.)');
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleImport = () => {
    if (selectedFile) {
      importMutation.mutate(selectedFile);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    importMutation.reset();
  };

  // Success view
  if (importMutation.isSuccess) {
    const result = importMutation.data;
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 rounded-xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-3 text-green-500">
            <Check className="w-8 h-8" />
            <h2 className="text-xl font-semibold">Import Started!</h2>
          </div>

          <div className="space-y-2 text-sm">
            <p>
              <span className="text-zinc-400">Files found:</span>{' '}
              {result.files_found}
            </p>
            <p className="text-zinc-400">
              Files are being scanned for metadata. They'll appear in your
              library shortly.
            </p>
            {result.files.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto bg-zinc-800/50 rounded-lg p-2">
                <p className="text-xs text-zinc-500 mb-1">Imported files:</p>
                {result.files.slice(0, 10).map((file, i) => (
                  <p key={i} className="text-xs text-zinc-300 truncate">
                    {file}
                  </p>
                ))}
                {result.files.length > 10 && (
                  <p className="text-xs text-zinc-500">
                    ...and {result.files.length - 10} more
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                reset();
                onClose?.();
              }}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
            >
              Done
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Import More
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-lg p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Music
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop zone or file preview */}
        {!selectedFile ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center transition-colors
              ${
                dragOver
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-zinc-700 hover:border-zinc-600'
              }
            `}
          >
            <FileArchive
              className={`w-12 h-12 mx-auto mb-4 ${
                dragOver ? 'text-green-500' : 'text-zinc-500'
              }`}
            />
            <p className="text-zinc-300 mb-2">
              Drop a zip file or audio files here
            </p>
            <p className="text-zinc-500 text-sm mb-4">
              Supports: zip, mp3, flac, m4a, aac, ogg, wav
            </p>
            <label className="inline-block px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg cursor-pointer transition-colors">
              Browse files
              <input
                type="file"
                accept=".zip,.mp3,.flac,.m4a,.aac,.ogg,.wav,.wma"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File preview */}
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                {selectedFile.name.toLowerCase().endsWith('.zip') ? (
                  <FileArchive className="w-8 h-8 text-yellow-500" />
                ) : (
                  <Music className="w-8 h-8 text-green-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-sm text-zinc-400">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Import error */}
            {importMutation.isError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Import failed:{' '}
                  {importMutation.error instanceof Error
                    ? importMutation.error.message
                    : 'Unknown error'}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFile(null)}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importMutation.isPending}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Import'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Help text */}
        <p className="text-xs text-zinc-500 text-center">
          Files will be imported to your library's _imports folder and
          automatically scanned.
        </p>
      </div>
    </div>
  );
}
