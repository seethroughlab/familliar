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
  Server,
  Bot,
  RefreshCw,
  Copy,
  FolderOpen,
  Plus,
  Trash2,
  AlertTriangle,
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
  music_library_paths: string[];
  music_library_paths_valid: boolean[];
}

interface PathInfo {
  path: string;
  valid: boolean;
  audioCount?: number;
  error?: string;
}

interface ValidationResult {
  path: string;
  exists: boolean;
  is_directory: boolean;
  audio_file_count: number | null;
  error: string | null;
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

  // LLM provider settings
  const [llmProvider, setLlmProvider] = useState('claude');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  // Library paths
  const [libraryPaths, setLibraryPaths] = useState<PathInfo[]>([]);
  const [newLibraryPath, setNewLibraryPath] = useState('');
  const [validatingPath, setValidatingPath] = useState(false);
  const [pathStatus, setPathStatus] = useState<string | null>(null);

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
        // Load LLM provider settings
        setLlmProvider(data.llm_provider || 'claude');
        setOllamaUrl(data.ollama_url || 'http://localhost:11434');
        setOllamaModel(data.ollama_model || 'llama3.2');
        // Load library paths
        const paths = data.music_library_paths || [];
        const pathsValid = data.music_library_paths_valid || [];
        setLibraryPaths(
          paths.map((path: string, i: number) => ({
            path,
            valid: pathsValid[i] ?? false,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkOllamaConnection() {
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (response.ok) {
        setOllamaStatus('connected');
      } else {
        setOllamaStatus('error');
      }
    } catch {
      setOllamaStatus('error');
    }
  }

  // Library path management
  async function validatePath(pathToValidate: string): Promise<ValidationResult | null> {
    try {
      const response = await fetch('/api/v1/settings/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToValidate }),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      console.error('Failed to validate path');
    }
    return null;
  }

  async function handleAddLibraryPath() {
    const trimmedPath = newLibraryPath.trim();
    if (!trimmedPath) return;

    // Check for duplicates
    if (libraryPaths.some((p) => p.path === trimmedPath)) {
      setPathStatus('Path already added');
      setTimeout(() => setPathStatus(null), 3000);
      return;
    }

    setValidatingPath(true);
    const result = await validatePath(trimmedPath);
    setValidatingPath(false);

    const newPathInfo: PathInfo = {
      path: trimmedPath,
      valid: result?.exists && result?.is_directory ? true : false,
      audioCount: result?.audio_file_count ?? undefined,
      error: result?.error ?? undefined,
    };

    const updatedPaths = [...libraryPaths, newPathInfo];
    setLibraryPaths(updatedPaths);
    setNewLibraryPath('');

    // Auto-save
    await saveLibraryPaths(updatedPaths);
  }

  async function handleRemoveLibraryPath(index: number) {
    const updatedPaths = libraryPaths.filter((_, i) => i !== index);
    setLibraryPaths(updatedPaths);
    await saveLibraryPaths(updatedPaths);
  }

  async function clearApiKey(keyName: string) {
    const confirmed = window.confirm(`Are you sure you want to remove this API key?`);
    if (!confirmed) return;

    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [keyName]: null }),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setStatus({ type: 'success', message: 'API key removed' });
      } else {
        setStatus({ type: 'error', message: 'Failed to remove API key' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Error removing API key' });
    }
  }

  async function saveLibraryPaths(pathsToSave: PathInfo[]) {
    setPathStatus('Saving...');
    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          music_library_paths: pathsToSave.map((p) => p.path),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const pathsValid = data.music_library_paths_valid || [];
        setLibraryPaths(
          pathsToSave.map((p, i) => ({
            ...p,
            valid: pathsValid[i] ?? false,
          }))
        );
        setPathStatus('Saved');
      } else {
        setPathStatus('Failed to save');
      }
    } catch {
      setPathStatus('Error saving');
    }
    setTimeout(() => setPathStatus(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    try {
      // Only include non-empty values in the update for API keys
      const updates: Record<string, string> = {};
      if (anthropicKey) updates.anthropic_api_key = anthropicKey;
      if (spotifyClientId) updates.spotify_client_id = spotifyClientId;
      if (spotifyClientSecret) updates.spotify_client_secret = spotifyClientSecret;
      if (lastfmApiKey) updates.lastfm_api_key = lastfmApiKey;
      if (lastfmApiSecret) updates.lastfm_api_secret = lastfmApiSecret;
      if (acoustidApiKey) updates.acoustid_api_key = acoustidApiKey;

      // Always include LLM provider settings
      updates.llm_provider = llmProvider;
      updates.ollama_url = ollamaUrl;
      updates.ollama_model = ollamaModel;

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
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle className="w-4 h-4" /> Configured
                  </span>
                  <button
                    onClick={() => clearApiKey('anthropic_api_key')}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove API key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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

          {/* AI Provider Settings */}
          <section className="bg-zinc-900 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-white">AI Provider</h2>
                <p className="text-sm text-zinc-500">Choose which AI model powers the assistant</p>
              </div>
            </div>

            {/* Provider Selection */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setLlmProvider('claude')}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                  llmProvider === 'claude'
                    ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                    : 'border-zinc-700 hover:border-zinc-500 text-zinc-400'
                }`}
              >
                <Cloud className="w-4 h-4" />
                <span>Claude</span>
              </button>
              <button
                onClick={() => setLlmProvider('ollama')}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                  llmProvider === 'ollama'
                    ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                    : 'border-zinc-700 hover:border-zinc-500 text-zinc-400'
                }`}
              >
                <Server className="w-4 h-4" />
                <span>Ollama</span>
              </button>
            </div>

            {/* Claude info */}
            {llmProvider === 'claude' && (
              <div>
                {anthropicConfigured ? (
                  <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-sm text-green-400">Claude API configured and ready</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-800 rounded-lg">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    <span className="text-sm text-amber-400">Add your Anthropic API key above to use Claude</span>
                  </div>
                )}
              </div>
            )}

            {/* Ollama Settings */}
            {llmProvider === 'ollama' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Ollama URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={checkOllamaConnection}
                      className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                      title="Test connection"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  {ollamaStatus === 'connected' && (
                    <p className="text-xs text-green-400 mt-1">Connected to Ollama</p>
                  )}
                  {ollamaStatus === 'error' && (
                    <p className="text-xs text-red-400 mt-1">Cannot connect to Ollama</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Model</label>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="llama3.2"
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Use a model with tool/function calling support (e.g., llama3.2, mistral)
                  </p>
                </div>
              </div>
            )}
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
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle className="w-4 h-4" /> Configured
                  </span>
                  <button
                    onClick={() => clearApiKey('spotify_client_id')}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove Spotify credentials"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
            </p>
            <div className="mt-3 p-3 bg-zinc-800 rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Redirect URI (copy this to Spotify Dashboard):</p>
                  <code className="text-sm text-green-400 break-all">{window.location.origin}/api/v1/spotify/callback</code>
                </div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/v1/spotify/callback`)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors flex-shrink-0"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
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
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle className="w-4 h-4" /> Configured
                  </span>
                  <button
                    onClick={() => clearApiKey('lastfm_api_key')}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove Last.fm credentials"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle className="w-4 h-4" /> Configured
                  </span>
                  <button
                    onClick={() => clearApiKey('acoustid_api_key')}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove AcoustID key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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

          {/* Music Library Paths */}
          <section className="bg-zinc-900 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${libraryPaths.length > 0 ? 'bg-blue-500/20' : 'bg-zinc-800'}`}>
                <FolderOpen className={`w-5 h-5 ${libraryPaths.length > 0 ? 'text-blue-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-white">Music Library Paths</h2>
                <p className="text-sm text-zinc-500">Directories containing your music files</p>
              </div>
              {libraryPaths.length > 0 ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> {libraryPaths.length} path{libraryPaths.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-amber-400">
                  <AlertTriangle className="w-4 h-4" /> Not configured
                </span>
              )}
            </div>

            <div className="space-y-3">
              {/* Current paths */}
              {libraryPaths.length === 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-900/20 border border-amber-800 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-amber-400">No library paths configured</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Add a path to your music library to enable scanning.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {libraryPaths.map((pathInfo, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 bg-zinc-800 rounded-lg border border-zinc-700"
                    >
                      {pathInfo.valid ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-mono">{pathInfo.path}</p>
                        {pathInfo.valid && pathInfo.audioCount !== undefined && (
                          <p className="text-xs text-zinc-500">{pathInfo.audioCount.toLocaleString()} audio files</p>
                        )}
                        {pathInfo.error && <p className="text-xs text-red-400">{pathInfo.error}</p>}
                      </div>
                      <button
                        onClick={() => handleRemoveLibraryPath(index)}
                        className="p-1 text-zinc-400 hover:text-red-400 transition-colors"
                        title="Remove path"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new path */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLibraryPath}
                  onChange={(e) => setNewLibraryPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLibraryPath()}
                  placeholder="/path/to/music"
                  className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <button
                  onClick={handleAddLibraryPath}
                  disabled={validatingPath || !newLibraryPath.trim()}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
                  title="Add path"
                >
                  {validatingPath ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              <p className="text-xs text-zinc-500">
                Paths must be accessible from the server. In Docker, use container paths (e.g., /data/music).
              </p>

              {pathStatus && (
                <p className={`text-sm ${pathStatus.includes('Error') || pathStatus.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {pathStatus}
                </p>
              )}
            </div>
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
