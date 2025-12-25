import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Loader2, ExternalLink, User, CheckCircle, XCircle } from 'lucide-react';
import { lastfmApi } from '../../api/client';
import { useSearchParams } from 'react-router-dom';

export function LastfmSettings() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: status, isLoading } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: lastfmApi.getStatus,
  });

  const connectMutation = useMutation({
    mutationFn: lastfmApi.getAuthUrl,
    onSuccess: (data) => {
      window.location.href = data.auth_url;
    },
  });

  const callbackMutation = useMutation({
    mutationFn: (token: string) => lastfmApi.callback(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lastfm-status'] });
      // Clean up URL params
      searchParams.delete('lastfm_callback');
      searchParams.delete('token');
      setSearchParams(searchParams);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: lastfmApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lastfm-status'] });
    },
  });

  // Handle callback from Last.fm auth
  useEffect(() => {
    const isCallback = searchParams.get('lastfm_callback');
    const token = searchParams.get('token');

    if (isCallback && token && !callbackMutation.isPending) {
      callbackMutation.mutate(token);
    }
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="p-4">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Radio className="w-6 h-6 text-red-500" />
          <h3 className="font-medium">Last.fm Scrobbling</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          Last.fm is not configured. Add your API key and secret to the .env file:
        </p>
        <code className="block text-xs bg-zinc-900 p-2 rounded text-zinc-300">
          LASTFM_API_KEY=your_api_key<br />
          LASTFM_API_SECRET=your_api_secret
        </code>
        <a
          href="https://www.last.fm/api/account/create"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300 mt-3"
        >
          Get API credentials <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <Radio className="w-6 h-6 text-red-500" />
        <h3 className="font-medium">Last.fm Scrobbling</h3>
      </div>

      {status.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span>Connected as {status.username}</span>
          </div>

          <p className="text-sm text-zinc-400">
            Your listening activity is being scrobbled to Last.fm automatically.
          </p>

          <div className="flex gap-3">
            <a
              href={`https://www.last.fm/user/${status.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
            >
              <User className="w-4 h-4" />
              View Profile
            </a>
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <XCircle className="w-5 h-5" />
            <span>Not connected</span>
          </div>

          <p className="text-sm text-zinc-400">
            Connect your Last.fm account to scrobble your listening history.
          </p>

          <button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending || callbackMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
          >
            {connectMutation.isPending || callbackMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                Connect Last.fm
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
