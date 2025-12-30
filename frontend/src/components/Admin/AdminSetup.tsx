/**
 * Admin setup page for configuring global API keys.
 *
 * Accessible at /admin for initial setup or reconfiguration.
 * API keys configured here are app-wide, not per-profile.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Cloud,
  Music2,
  Radio,
  Fingerprint,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

interface SettingsData {
  spotify_client_id: string | null;
  spotify_client_secret: string | null;
  lastfm_api_key: string | null;
  lastfm_api_secret: string | null;
  anthropic_api_key: string | null;
  acoustid_api_key: string | null;
  llm_provider: string;
  ollama_url: string;
  ollama_model: string;
  spotify_configured: boolean;
  lastfm_configured: boolean;
}

export function AdminSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state - empty strings for new values, undefined to keep existing
  const [anthropicKey, setAnthropicKey] = useState('');
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [lastfmApiKey, setLastfmApiKey] = useState('');
  const [lastfmApiSecret, setLastfmApiSecret] = useState('');
  const [acoustidApiKey, setAcoustidApiKey] = useState('');

  // Visibility toggles for secret fields
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showSpotifySecret, setShowSpotifySecret] = useState(false);
  const [showLastfmSecret, setShowLastfmSecret] = useState(false);
  const [showAcoustidKey, setShowAcoustidKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    try {
      // Only include non-empty values in the update
      const updates: Record<string, string> = {};
      if (anthropicKey) updates.anthropic_api_key = anthropicKey;
      if (spotifyClientId) updates.spotify_client_id = spotifyClientId;
      if (spotifyClientSecret) updates.spotify_client_secret = spotifyClientSecret;
      if (lastfmApiKey) updates.lastfm_api_key = lastfmApiKey;
      if (lastfmApiSecret) updates.lastfm_api_secret = lastfmApiSecret;
      if (acoustidApiKey) updates.acoustid_api_key = acoustidApiKey;

      if (Object.keys(updates).length === 0) {
        setStatus({ type: 'error', message: 'No changes to save' });
        setSaving(false);
        return;
      }

      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        // Clear form fields after successful save
        setAnthropicKey('');
        setSpotifyClientId('');
        setSpotifyClientSecret('');
        setLastfmApiKey('');
        setLastfmApiSecret('');
        setAcoustidApiKey('');
        setStatus({ type: 'success', message: 'Settings saved successfully' });
      } else {
        setStatus({ type: 'error', message: 'Failed to save settings' });
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      setStatus({ type: 'error', message: 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  const anthropicConfigured = !!settings?.anthropic_api_key;
  const acoustidConfigured = !!settings?.acoustid_api_key;

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Setup</h1>
              <p className="text-zinc-400 text-sm">Configure global API keys</p>
            </div>
          </div>
        </div>

        {/* Status message */}
        {status && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-2 ${
              status.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {status.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            {status.message}
          </div>
        )}

        <div className="space-y-6">
          {/* Anthropic API */}
          <section className="bg-zinc-900 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${anthropicConfigured ? 'bg-purple-500/20' : 'bg-zinc-800'}`}>
                <Cloud className={`w-5 h-5 ${anthropicConfigured ? 'text-purple-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-white">Claude API (Anthropic)</h2>
                <p className="text-sm text-zinc-500">For AI-powered playlist generation</p>
              </div>
              {anthropicConfigured ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  <XCircle className="w-4 h-4" /> Not configured
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showAnthropicKey ? 'text' : 'password'}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder={anthropicConfigured ? 'Enter new key to update' : 'sk-ant-...'}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                {showAnthropicKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </section>

          {/* Spotify API */}
          <section className="bg-zinc-900 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${settings?.spotify_configured ? 'bg-green-500/20' : 'bg-zinc-800'}`}>
                <Music2 className={`w-5 h-5 ${settings?.spotify_configured ? 'text-green-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-white">Spotify API</h2>
                <p className="text-sm text-zinc-500">For syncing Spotify favorites</p>
              </div>
              {settings?.spotify_configured ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  <XCircle className="w-4 h-4" /> Not configured
                </span>
              )}
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={spotifyClientId}
                onChange={(e) => setSpotifyClientId(e.target.value)}
                placeholder={settings?.spotify_configured ? 'Enter new Client ID to update' : 'Client ID'}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="relative">
                <input
                  type={showSpotifySecret ? 'text' : 'password'}
                  value={spotifyClientSecret}
                  onChange={(e) => setSpotifyClientSecret(e.target.value)}
                  placeholder={settings?.spotify_configured ? 'Enter new Client Secret to update' : 'Client Secret'}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowSpotifySecret(!showSpotifySecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  {showSpotifySecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Create an app at{' '}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:underline"
              >
                developer.spotify.com
              </a>
              . Set redirect URI to <code className="text-zinc-400">{window.location.origin}/settings</code>
            </p>
          </section>

          {/* Last.fm API */}
          <section className="bg-zinc-900 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${settings?.lastfm_configured ? 'bg-red-500/20' : 'bg-zinc-800'}`}>
                <Radio className={`w-5 h-5 ${settings?.lastfm_configured ? 'text-red-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-white">Last.fm API</h2>
                <p className="text-sm text-zinc-500">For scrobbling and now playing</p>
              </div>
              {settings?.lastfm_configured ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  <XCircle className="w-4 h-4" /> Not configured
                </span>
              )}
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={lastfmApiKey}
                onChange={(e) => setLastfmApiKey(e.target.value)}
                placeholder={settings?.lastfm_configured ? 'Enter new API Key to update' : 'API Key'}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="relative">
                <input
                  type={showLastfmSecret ? 'text' : 'password'}
                  value={lastfmApiSecret}
                  onChange={(e) => setLastfmApiSecret(e.target.value)}
                  placeholder={settings?.lastfm_configured ? 'Enter new Shared Secret to update' : 'Shared Secret'}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowLastfmSecret(!showLastfmSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  {showLastfmSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Get API credentials at{' '}
              <a
                href="https://www.last.fm/api/account/create"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-400 hover:underline"
              >
                last.fm/api
              </a>
            </p>
          </section>

          {/* AcoustID API */}
          <section className="bg-zinc-900 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${acoustidConfigured ? 'bg-blue-500/20' : 'bg-zinc-800'}`}>
                <Fingerprint className={`w-5 h-5 ${acoustidConfigured ? 'text-blue-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-white">AcoustID API</h2>
                <p className="text-sm text-zinc-500">For audio fingerprinting (optional)</p>
              </div>
              {acoustidConfigured ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  <XCircle className="w-4 h-4" /> Not configured
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showAcoustidKey ? 'text' : 'password'}
                value={acoustidApiKey}
                onChange={(e) => setAcoustidApiKey(e.target.value)}
                placeholder={acoustidConfigured ? 'Enter new key to update' : 'API Key'}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowAcoustidKey(!showAcoustidKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                {showAcoustidKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Register at{' '}
              <a
                href="https://acoustid.org/api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                acoustid.org
              </a>
            </p>
          </section>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>

          {/* Info */}
          <p className="text-sm text-zinc-500 text-center">
            These settings are global and apply to all profiles.
            Individual users connect their own Spotify and Last.fm accounts via Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
