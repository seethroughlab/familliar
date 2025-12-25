import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Loader2, User, CheckCircle, XCircle, Settings, Save } from 'lucide-react';
import { lastfmApi, appSettingsApi } from '../../api/client';
import { useSearchParams } from 'react-router-dom';

export function LastfmSettings() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSetup, setShowSetup] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: lastfmApi.getStatus,
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: () => appSettingsApi.update({
      lastfm_api_key: apiKey,
      lastfm_api_secret: apiSecret,
    }),
    onSuccess: () => {
      setMessage('Last.fm credentials saved!');
      setShowSetup(false);
      setApiKey('');
      setApiSecret('');
      queryClient.invalidateQueries({ queryKey: ['lastfm-status'] });
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: (error: Error) => {
      setMessage(`Failed to save credentials: ${error.message}`);
    },
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

  if (!status?.configured || showSetup) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Radio className="w-6 h-6 text-red-500" />
          <h3 className="font-medium">Configure Last.fm</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          Enter your Last.fm API credentials to enable scrobbling.
          <a
            href="https://www.last.fm/api/account/create"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-400 hover:text-red-300 ml-1"
          >
            Get credentials
          </a>
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your Last.fm API Key"
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Shared Secret</label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Your Last.fm Shared Secret"
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => saveCredentialsMutation.mutate()}
              disabled={!apiKey || !apiSecret || saveCredentialsMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveCredentialsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
            {showSetup && (
              <button
                onClick={() => setShowSetup(false)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className="mt-4 p-3 bg-zinc-700/50 rounded-md text-sm text-zinc-300">
            {message}
          </div>
        )}
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
            <button
              onClick={() => setShowSetup(true)}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
              title="Change API credentials"
            >
              <Settings className="w-4 h-4" />
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

          <div className="flex gap-3">
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
            <button
              onClick={() => setShowSetup(true)}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
              title="Change API credentials"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
