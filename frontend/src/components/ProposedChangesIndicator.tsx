import { useQuery } from '@tanstack/react-query';
import { FileEdit } from 'lucide-react';
import { proposedChangesApi } from '../api/client';

export function ProposedChangesIndicator() {
  // Fetch pending changes count
  const { data: stats } = useQuery({
    queryKey: ['proposed-changes-stats'],
    queryFn: () => proposedChangesApi.getStats(),
    refetchInterval: 30000, // Check every 30 seconds
  });

  const pendingCount = stats?.pending ?? 0;

  // Don't render if no pending changes
  if (pendingCount === 0) {
    return null;
  }

  const handleClick = () => {
    // Navigate to the proposed-changes view in the library
    // Update URL to switch to proposed-changes view
    const url = new URL(window.location.href);
    url.hash = 'library';
    url.searchParams.set('view', 'proposed-changes');
    // Clear any existing filters
    url.searchParams.delete('artist');
    url.searchParams.delete('album');
    url.searchParams.delete('artistDetail');
    window.history.pushState(null, '', url.toString());
    // Trigger a navigation event so React Router picks it up
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <button
      onClick={handleClick}
      className="p-2 rounded-lg transition-colors text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 relative"
      title={`${pendingCount} proposed change${pendingCount !== 1 ? 's' : ''} pending review - click to review`}
    >
      <FileEdit className="w-5 h-5" />
      <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
        {pendingCount > 99 ? '99+' : pendingCount}
      </span>
    </button>
  );
}
