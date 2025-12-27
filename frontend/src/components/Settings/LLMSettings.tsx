import { useState, useEffect } from 'react';
import { Bot, Cloud, Server, RefreshCw } from 'lucide-react';

interface LLMSettingsData {
  llm_provider: string;
  ollama_url: string;
  ollama_model: string;
  anthropic_api_key: string | null;
}

export function LLMSettings() {
  const [settings, setSettings] = useState<LLMSettingsData>({
    llm_provider: 'claude',
    ollama_url: 'http://localhost:11434',
    ollama_model: 'llama3.2',
    anthropic_api_key: null,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  useEffect(() => {
    // Load current settings
    fetch('/api/v1/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings({
          llm_provider: data.llm_provider || 'claude',
          ollama_url: data.ollama_url || 'http://localhost:11434',
          ollama_model: data.ollama_model || 'llama3.2',
          anthropic_api_key: data.anthropic_api_key || null,
        });
      })
      .catch(console.error);
  }, []);

  const checkOllamaConnection = async () => {
    try {
      const response = await fetch(`${settings.ollama_url}/api/tags`);
      if (response.ok) {
        setOllamaStatus('connected');
      } else {
        setOllamaStatus('error');
      }
    } catch {
      setOllamaStatus('error');
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_provider: settings.llm_provider,
          ollama_url: settings.ollama_url,
          ollama_model: settings.ollama_model,
          anthropic_api_key: settings.anthropic_api_key,
        }),
      });

      if (response.ok) {
        setStatus('Settings saved');
        setTimeout(() => setStatus(null), 3000);
      } else {
        setStatus('Failed to save settings');
      }
    } catch {
      setStatus('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-800/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="w-5 h-5 text-purple-400" />
        <h4 className="font-medium text-white">AI Assistant</h4>
      </div>

      <div className="space-y-4">
        {/* Provider Selection */}
        <div>
          <label className="block text-sm text-zinc-400 mb-2">LLM Provider</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSettings((s) => ({ ...s, llm_provider: 'claude' }))}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                settings.llm_provider === 'claude'
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-zinc-700 hover:border-zinc-500 text-zinc-400'
              }`}
            >
              <Cloud className="w-4 h-4" />
              <span>Claude</span>
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, llm_provider: 'ollama' }))}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                settings.llm_provider === 'ollama'
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-zinc-700 hover:border-zinc-500 text-zinc-400'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Ollama</span>
            </button>
          </div>
        </div>

        {/* Claude Settings */}
        {settings.llm_provider === 'claude' && (
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Anthropic API Key</label>
            <input
              type="password"
              value={settings.anthropic_api_key || ''}
              onChange={(e) => setSettings((s) => ({ ...s, anthropic_api_key: e.target.value || null }))}
              placeholder={settings.anthropic_api_key ? '••••••••••••••••' : 'sk-ant-...'}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Get your API key from{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                console.anthropic.com
              </a>
            </p>
          </div>
        )}

        {/* Ollama Settings */}
        {settings.llm_provider === 'ollama' && (
          <>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Ollama URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.ollama_url}
                  onChange={(e) => setSettings((s) => ({ ...s, ollama_url: e.target.value }))}
                  placeholder="http://localhost:11434"
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                value={settings.ollama_model}
                onChange={(e) => setSettings((s) => ({ ...s, ollama_model: e.target.value }))}
                placeholder="llama3.2"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Use a model with tool/function calling support (e.g., llama3.2, mistral)
              </p>
            </div>
          </>
        )}

        {/* Save Button */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Saving...' : 'Save LLM Settings'}
        </button>

        {status && (
          <p className={`text-sm ${status.includes('Error') || status.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
