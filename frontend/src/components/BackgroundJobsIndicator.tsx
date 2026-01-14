import { useEffect, useState, useRef } from 'react';
import { Loader2, X, Music, Radio, Disc, Image } from 'lucide-react';
import { useBackgroundJobsStore } from '../stores/backgroundJobsStore';
import type { BackgroundJob } from '../api/client';

// Icons for each job type
const jobIcons: Record<BackgroundJob['type'], typeof Music> = {
  library_sync: Music,
  spotify_sync: Radio,
  new_releases: Disc,
  artwork_fetch: Image,
};

// Friendly names for job types
const jobNames: Record<BackgroundJob['type'], string> = {
  library_sync: 'Library Sync',
  spotify_sync: 'Spotify Sync',
  new_releases: 'New Releases',
  artwork_fetch: 'Artwork',
};

function JobProgressBar({ job }: { job: BackgroundJob }) {
  const Icon = jobIcons[job.type];
  const progress = job.progress;
  const percent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null;

  return (
    <div className="p-3 bg-zinc-700/50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-white">
          {jobNames[job.type]}
        </span>
        {percent !== null && (
          <span className="text-xs text-zinc-400 ml-auto">
            {percent}%
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 mb-2 truncate">
        {job.current_item || job.message}
      </p>

      {progress && progress.total > 0 && (
        <div className="h-1.5 bg-zinc-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {!progress && (
        <div className="h-1.5 bg-zinc-600 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 w-full animate-pulse" />
        </div>
      )}
    </div>
  );
}

export function BackgroundJobsIndicator() {
  const { jobs, activeCount, startPolling, stopPolling } = useBackgroundJobsStore();
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Start polling on mount
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowPopover(false);
      }
    }

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopover]);

  // Don't render if no active jobs
  if (activeCount === 0) {
    return null;
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setShowPopover(!showPopover)}
        className="p-2 rounded-lg transition-colors text-blue-400 hover:text-blue-300 hover:bg-blue-900/30"
        title={`${activeCount} background job${activeCount !== 1 ? 's' : ''} running`}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        {activeCount > 1 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {showPopover && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-[60]">
          <div className="p-3 border-b border-zinc-700 flex items-center justify-between">
            <h3 className="font-medium text-white flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              Background Jobs
            </h3>
            <button
              onClick={() => setShowPopover(false)}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {jobs.map((job) => (
              <JobProgressBar key={job.type} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
