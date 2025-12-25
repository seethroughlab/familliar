import { SpotifySettings } from './SpotifySettings';
import { LastfmSettings } from './LastfmSettings';

export function SettingsPanel() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Settings</h2>
        <p className="text-sm text-zinc-400">Manage your integrations and preferences</p>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Integrations
          </h3>
          <div className="space-y-4">
            <SpotifySettings />
            <LastfmSettings />
          </div>
        </section>
      </div>
    </div>
  );
}

export { SpotifySettings } from './SpotifySettings';
export { LastfmSettings } from './LastfmSettings';
