import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileEdit, X, Check, AlertCircle } from 'lucide-react';
import { proposedChangesApi, type ProposedChange } from '../api/client';

export function ProposedChangesIndicator() {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch pending changes count
  const { data: stats } = useQuery({
    queryKey: ['proposed-changes-stats'],
    queryFn: () => proposedChangesApi.getStats(),
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Fetch pending changes for popover
  const { data: pendingChanges } = useQuery({
    queryKey: ['proposed-changes', 'pending'],
    queryFn: () => proposedChangesApi.list({ status: 'pending', limit: 5 }),
    enabled: showPopover,
  });

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

  const pendingCount = stats?.pending ?? 0;

  // Don't render if no pending changes
  if (pendingCount === 0) {
    return null;
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setShowPopover(!showPopover)}
        className="p-2 rounded-lg transition-colors text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 relative"
        title={`${pendingCount} proposed change${pendingCount !== 1 ? 's' : ''} pending review`}
      >
        <FileEdit className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      </button>

      {/* Popover */}
      {showPopover && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-[60]">
          <div className="p-3 border-b border-zinc-700 flex items-center justify-between">
            <h3 className="font-medium text-white flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-amber-400" />
              Proposed Changes
            </h3>
            <button
              onClick={() => setShowPopover(false)}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {pendingChanges?.map((change) => (
              <ChangePreviewCard key={change.id} change={change} />
            ))}
            {(!pendingChanges || pendingChanges.length === 0) && (
              <p className="text-sm text-zinc-400 text-center py-2">Loading...</p>
            )}
          </div>

          <div className="p-3 border-t border-zinc-700">
            <p className="text-xs text-zinc-400 text-center">
              Go to <span className="text-amber-400">Settings → Library → Proposed Changes</span> to review
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePreviewCard({ change }: { change: ProposedChange }) {
  const trackCount = Array.isArray(change.target_ids) ? change.target_ids.length : 0;

  const getIcon = () => {
    if (change.change_type === 'artwork') return <AlertCircle className="w-4 h-4 text-purple-400" />;
    return <FileEdit className="w-4 h-4 text-amber-400" />;
  };

  const getDescription = () => {
    if (change.change_type === 'artwork') {
      const artworkValue = change.new_value as { album?: string } | null;
      return `Update artwork for ${artworkValue?.album || 'album'}`;
    }
    if (change.field) {
      return `Change ${change.field} to "${change.new_value}"`;
    }
    return change.reason || 'Metadata change';
  };

  return (
    <div className="p-2 bg-zinc-700/50 rounded-lg">
      <div className="flex items-start gap-2">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {getDescription()}
          </p>
          <p className="text-xs text-zinc-400">
            {trackCount} track{trackCount !== 1 ? 's' : ''} • {change.source.replace('_', ' ')}
          </p>
        </div>
        <Check className="w-4 h-4 text-zinc-500" />
      </div>
    </div>
  );
}
