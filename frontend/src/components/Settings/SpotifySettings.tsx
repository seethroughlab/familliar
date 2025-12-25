import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spotifyApi, SpotifyStatus } from '../../api/client';
import { Music2, RefreshCw, LogOut, ExternalLink, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export function SpotifySettings() {
  const queryClient = useQueryClient();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Check URL params for OAuth callback status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyConnected = params.get('spotify_connected');
    const spotifyError = params.get('spotify_error');
    const spotifyUser = params.get('spotify_user');

    if (spotifyConnected === 'true') {
      setSyncMessage(`Connected as ${spotifyUser || 'user'}!`);
      queryClient.invalidateQueries({ queryKey: ['spotify-status'] });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (spotifyError) {
      setSyncMessage(`Error: ${spotifyError}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [queryClient]);

  const { data: status, isLoading } = useQuery<SpotifyStatus>({
    queryKey: ['spotify-status'],
    queryFn: spotifyApi.getStatus,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const connectMutation = useMutation({
    mutationFn: spotifyApi.getAuthUrl,
    onSuccess: (data) => {
      // Redirect to Spotify OAuth
      window.location.href = data.auth_url;
    },
    onError: (error: Error) => {
      setSyncMessage(`Failed to get auth URL: ${error.message}`);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => spotifyApi.sync(true),
    onSuccess: (data) => {
      setSyncMessage(data.message);
      queryClient.invalidateQueries({ queryKey: ['spotify-status'] });
    },
    onError: (error: Error) => {
      setSyncMessage(`Sync failed: ${error.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: spotifyApi.disconnect,
    onSuccess: () => {
      setSyncMessage('Disconnected from Spotify');
      queryClient.invalidateQueries({ queryKey: ['spotify-status'] });
    },
    onError: (error: Error) => {
      setSyncMessage(`Failed to disconnect: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="bg-zinc-800/50 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-zinc-700 rounded-lg">
            <Music2 className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Spotify Not Configured</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to your backend .env file to enable Spotify integration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection status card */}
      <div className="bg-zinc-800/50 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg ${status.connected ? 'bg-green-500/20' : 'bg-zinc-700'}`}>
              <Music2 className={`w-6 h-6 ${status.connected ? 'text-green-500' : 'text-zinc-400'}`} />
            </div>
            <div>
              <h3 className="font-medium text-white flex items-center gap-2">
                Spotify
                {status.connected ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-zinc-500" />
                )}
              </h3>
              {status.connected ? (
                <p className="text-sm text-zinc-400 mt-1">
                  Connected as <span className="text-white">{status.spotify_user_id}</span>
                </p>
              ) : (
                <p className="text-sm text-zinc-400 mt-1">
                  Connect your Spotify account to sync your favorites
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {status.connected ? (
              <>
                <button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Sync
                </button>
                <button
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1DB954] hover:bg-[#1ed760] text-black font-medium rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Connect Spotify
              </button>
            )}
          </div>
        </div>

        {/* Status message */}
        {syncMessage && (
          <div className="mt-4 p-3 bg-zinc-700/50 rounded-md text-sm text-zinc-300">
            {syncMessage}
          </div>
        )}
      </div>

      {/* Stats card (when connected) */}
      {status.connected && status.stats && (
        <div className="bg-zinc-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-zinc-400 mb-4">Sync Statistics</h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{status.stats.total_favorites}</div>
              <div className="text-xs text-zinc-500 mt-1">Total Favorites</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{status.stats.matched}</div>
              <div className="text-xs text-zinc-500 mt-1">Matched</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-500">{status.stats.unmatched}</div>
              <div className="text-xs text-zinc-500 mt-1">Unmatched</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{status.stats.match_rate}%</div>
              <div className="text-xs text-zinc-500 mt-1">Match Rate</div>
            </div>
          </div>
          {status.last_sync && (
            <div className="mt-4 text-xs text-zinc-500 text-center">
              Last synced: {new Date(status.last_sync).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
