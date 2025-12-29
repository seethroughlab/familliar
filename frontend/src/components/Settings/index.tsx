import { SpotifySettings } from './SpotifySettings';
import { LastfmSettings } from './LastfmSettings';
import { OfflineSettings } from './OfflineSettings';
import { LibraryOrganizer } from './LibraryOrganizer';
import { LibraryScan } from './LibraryScan';
import { ThemeSettings } from './ThemeSettings';
import { PlaybackSettings } from './PlaybackSettings';
import { LLMSettings } from './LLMSettings';
import { ProfileSettings } from './ProfileSettings';
import { SystemStatus } from './SystemStatus';
import { MusicImport } from './MusicImport';
import { InstallStatus } from '../PWA/InstallPrompt';

export function SettingsPanel() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white dark:text-white light:text-zinc-900 mb-2">Settings</h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-400 light:text-zinc-600">Manage your integrations and preferences</p>
      </div>

      <div className="space-y-6">
        {/* System Status at the top for visibility */}
        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            System
          </h3>
          <div className="space-y-4">
            <SystemStatus />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            Profile
          </h3>
          <div className="space-y-4">
            <ProfileSettings />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            App
          </h3>
          <div className="space-y-4">
            <InstallStatus />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            Appearance
          </h3>
          <div className="space-y-4">
            <ThemeSettings />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            Playback
          </h3>
          <div className="space-y-4">
            <PlaybackSettings />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            AI Assistant
          </h3>
          <div className="space-y-4">
            <LLMSettings />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            Integrations
          </h3>
          <div className="space-y-4">
            <SpotifySettings />
            <LastfmSettings />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            Offline & Storage
          </h3>
          <div className="space-y-4">
            <OfflineSettings />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-400 light:text-zinc-500 uppercase tracking-wider mb-3">
            Library Management
          </h3>
          <div className="space-y-4">
            <MusicImport />
            <LibraryScan />
            <LibraryOrganizer />
          </div>
        </section>
      </div>
    </div>
  );
}

export { SpotifySettings } from './SpotifySettings';
export { LastfmSettings } from './LastfmSettings';
export { OfflineSettings } from './OfflineSettings';
