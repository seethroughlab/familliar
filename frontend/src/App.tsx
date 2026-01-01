import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Search, Library, Settings, Zap, Activity } from 'lucide-react';
import { PlayerBar } from './components/Player/PlayerBar';
import { TrackList } from './components/Library/TrackList';
import { ChatPanel } from './components/Chat';
import { SettingsPanel } from './components/Settings';
import { FullPlayer } from './components/FullPlayer';
import { InstallPrompt } from './components/PWA/InstallPrompt';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
// Listening sessions disabled for v0.1.0
// import { SessionPanel } from './components/Sessions';
import { PlaylistsView } from './components/Playlists';
import { VisualizerView } from './components/Visualizer';
// Listening sessions disabled for v0.1.0
// import { GuestListener } from './components/Guest';
import { ShortcutsHelp } from './components/KeyboardShortcuts';
import { ProfileSelector } from './components/Profiles';
import { HealthIndicator } from './components/HealthIndicator';
import { WorkerAlert } from './components/WorkerAlert';
import { AdminSetup } from './components/Admin';
import { GlobalDropZone, ImportModal } from './components/Import';
import { ColumnSelector } from './components/Library/ColumnSelector';
import { useScrobbling } from './hooks/useScrobbling';
// Listening sessions disabled for v0.1.0
// import { useListeningSession } from './hooks/useListeningSession';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { initSyncListeners } from './services/syncService';
import { usePlayerStore } from './stores/playerStore';
import { useThemeStore } from './stores/themeStore';
import { initializeProfile, type Profile } from './services/profileService';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

type RightPanelTab = 'library' | 'playlists' | 'visualizer' | 'settings';

function AppContent() {
  const [search, setSearch] = useState('');
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const queryClient = useQueryClient();

  // Determine initial tab from URL path (e.g., /settings from OAuth callback)
  const initialTab = (): RightPanelTab => {
    const path = window.location.pathname;
    const search = window.location.search;
    console.log('[AppContent] initialTab called, path:', path, 'search:', search);
    if (path === '/settings') return 'settings';
    if (path === '/playlists') return 'playlists';
    return 'library';
  };
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>(() => {
    const tab = initialTab();
    console.log('[AppContent] Initial tab set to:', tab);
    return tab;
  });
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  // Listening sessions disabled for v0.1.0
  // const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Initialize Last.fm scrobbling
  useScrobbling();

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    onToggleFullPlayer: () => setShowFullPlayer((prev) => !prev),
    onShowHelp: () => setShowShortcutsHelp(true),
    onEscape: () => {
      // Close overlays in order of priority
      if (showShortcutsHelp) {
        setShowShortcutsHelp(false);
      } else if (showFullPlayer) {
        setShowFullPlayer(false);
      }
      // Listening sessions disabled for v0.1.0
    },
  });

  // Initialize offline sync listeners
  useEffect(() => {
    const cleanup = initSyncListeners();
    return cleanup;
  }, []);

  // Listen for navigate-to-settings event from HealthIndicator
  useEffect(() => {
    const handleNavigateToSettings = () => {
      setRightPanelTab('settings');
    };
    window.addEventListener('navigate-to-settings', handleNavigateToSettings);
    return () => window.removeEventListener('navigate-to-settings', handleNavigateToSettings);
  }, []);

  // Listen for show-playlist event from ChatPanel when LLM creates a playlist
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  useEffect(() => {
    const handleShowPlaylist = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.playlistId) {
        setSelectedPlaylistId(detail.playlistId);
        setRightPanelTab('playlists');
      }
    };
    window.addEventListener('show-playlist', handleShowPlaylist);
    return () => window.removeEventListener('show-playlist', handleShowPlaylist);
  }, []);

  // Hydrate player state from IndexedDB
  const hydrate = usePlayerStore((state) => state.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Listening sessions disabled for v0.1.0 - re-enable when signaling server is ready
  // const userId = 'user-' + (localStorage.getItem('familiar-user-id') || (() => {
  //   const id = Math.random().toString(36).substring(7);
  //   localStorage.setItem('familiar-user-id', id);
  //   return id;
  // })());
  // const username = localStorage.getItem('familiar-username') || 'Anonymous';
  // const {
  //   session,
  //   isConnecting,
  //   error: sessionError,
  //   chatMessages,
  //   isHost,
  //   createSession,
  //   joinSession,
  //   leaveSession,
  //   sendChatMessage,
  // } = useListeningSession({ userId, username });

  // Get resolved theme for conditional styling
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  return (
    <GlobalDropZone onFilesDropped={setImportFiles}>
    <div className={`h-screen flex flex-col ${resolvedTheme === 'light' ? 'bg-white text-zinc-900' : 'bg-black text-white'}`}>
      {/* Main content area - pb-20 accounts for fixed player bar */}
      <div className="flex-1 flex overflow-hidden pb-20">
        {/* Left panel - Chat */}
        <div className={`w-96 border-r ${resolvedTheme === 'light' ? 'border-zinc-200' : 'border-zinc-800'} flex flex-col`}>
          <ChatPanel />
        </div>

        {/* Right panel - Library/Context */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with tabs */}
          <header className={`backdrop-blur-md border-b ${resolvedTheme === 'light' ? 'bg-white/80 border-zinc-200' : 'bg-zinc-900/80 border-zinc-800'}`}>
            <div className="px-4 py-3 flex items-center gap-4">
              {/* Tabs */}
              <div className="flex gap-1">
                <button
                  onClick={() => setRightPanelTab('library')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    rightPanelTab === 'library'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Library className="w-4 h-4 inline-block mr-1.5" />
                  Library
                </button>
                <button
                  onClick={() => setRightPanelTab('playlists')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    rightPanelTab === 'playlists'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Zap className="w-4 h-4 inline-block mr-1.5" />
                  Playlists
                </button>
                <button
                  onClick={() => setRightPanelTab('visualizer')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    rightPanelTab === 'visualizer'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Activity className="w-4 h-4 inline-block mr-1.5" />
                  Visualizer
                </button>
                <button
                  onClick={() => setRightPanelTab('settings')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    rightPanelTab === 'settings'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Settings className="w-4 h-4 inline-block mr-1.5" />
                  Settings
                </button>
              </div>

              {/* Search and column selector (only in library view) */}
              {rightPanelTab === 'library' && (
                <>
                  <div className="flex-1 max-w-md">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search tracks..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-full text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <ColumnSelector />
                </>
              )}

              {/* Spacer to push health indicator right */}
              <div className="flex-1" />

              {/* Health indicator - only shows when issues detected */}
              <HealthIndicator />
            </div>
          </header>

          {/* Content */}
          <main className={`flex-1 overflow-y-auto ${resolvedTheme === 'light' ? 'bg-gradient-to-b from-zinc-50 to-white' : 'bg-gradient-to-b from-zinc-900 to-black'}`}>
            {rightPanelTab === 'library' && (
              <div className="px-4 py-6">
                <TrackList search={search || undefined} />
              </div>
            )}
            {rightPanelTab === 'playlists' && (
              <div className="px-4 py-6">
                <PlaylistsView
                  selectedPlaylistId={selectedPlaylistId}
                  onPlaylistViewed={() => setSelectedPlaylistId(null)}
                />
              </div>
            )}
            {rightPanelTab === 'visualizer' && (
              <VisualizerView />
            )}
            {rightPanelTab === 'settings' && (
              <SettingsPanel />
            )}
          </main>
        </div>
      </div>

      {/* Player bar - fixed at bottom */}
      <PlayerBar
        onExpandClick={() => setShowFullPlayer(true)}
        // Listening sessions disabled for v0.1.0
      />

      {/* Full player overlay */}
      {showFullPlayer && (
        <FullPlayer onClose={() => setShowFullPlayer(false)} />
      )}

      {/* PWA install prompt */}
      <InstallPrompt />

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Listening sessions disabled for v0.1.0 - re-enable when signaling server is ready */}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}

      {/* Import modal */}
      {importFiles && (
        <ImportModal
          files={importFiles}
          onClose={() => {
            setImportFiles(null);
            // Refetch tracks after modal closes
            queryClient.refetchQueries({ queryKey: ['tracks'] });
          }}
        />
      )}
    </div>
    </GlobalDropZone>
  );
}

function App() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [checkingProfile, setCheckingProfile] = useState(true);

  const checkProfile = useCallback(async () => {
    setCheckingProfile(true);
    try {
      const p = await initializeProfile();
      setProfile(p);
    } catch (err) {
      console.error('Failed to check profile:', err);
      setProfile(null);
    } finally {
      setCheckingProfile(false);
    }
  }, []);

  useEffect(() => {
    checkProfile();

    // Listen for profile invalidation events (from API client)
    const handleInvalidated = () => {
      setProfile(null);
    };
    window.addEventListener('profile-invalidated', handleInvalidated);

    return () => {
      window.removeEventListener('profile-invalidated', handleInvalidated);
    };
  }, [checkProfile]);

  // Show loading spinner while checking profile
  if (checkingProfile) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Check if we're on /admin route - allow access without profile for initial setup
  const isAdminRoute = window.location.pathname === '/admin';

  // Show profile selector if no profile selected (unless on admin route)
  if (profile === null && !isAdminRoute) {
    return (
      <ProfileSelector
        onProfileSelected={(p) => {
          setProfile(p);
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <WorkerAlert />
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/admin" element={<AdminSetup />} />
          {/* Listening sessions disabled for v0.1.0 */}
          {/* <Route path="/guest" element={<GuestListener />} /> */}
          <Route path="*" element={<AppContent />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
