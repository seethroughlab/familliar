import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Search, Library, MessageSquare, Settings, Zap } from 'lucide-react';
import { PlayerBar } from './components/Player/PlayerBar';
import { TrackList } from './components/Library/TrackList';
import { ChatPanel } from './components/Chat';
import { SettingsPanel } from './components/Settings';
import { FullPlayer } from './components/FullPlayer';
import { InstallPrompt } from './components/PWA/InstallPrompt';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import { SessionPanel } from './components/Sessions';
import { SmartPlaylistList } from './components/SmartPlaylists';
import { GuestListener } from './components/Guest';
import { ShortcutsHelp } from './components/KeyboardShortcuts';
import { useScrobbling } from './hooks/useScrobbling';
import { useListeningSession } from './hooks/useListeningSession';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { initSyncListeners } from './services/syncService';
import { usePlayerStore } from './stores/playerStore';
import { useThemeStore } from './stores/themeStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

type RightPanelTab = 'context' | 'library' | 'playlists' | 'settings';

function AppContent() {
  const [search, setSearch] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('library');
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
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
      } else if (showSessionPanel) {
        setShowSessionPanel(false);
      }
    },
  });

  // Initialize offline sync listeners
  useEffect(() => {
    const cleanup = initSyncListeners();
    return cleanup;
  }, []);

  // Hydrate player state from IndexedDB
  const hydrate = usePlayerStore((state) => state.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Listening session (using a simple user ID for now)
  const userId = 'user-' + (localStorage.getItem('familiar-user-id') || (() => {
    const id = Math.random().toString(36).substring(7);
    localStorage.setItem('familiar-user-id', id);
    return id;
  })());
  const username = localStorage.getItem('familiar-username') || 'Anonymous';

  const {
    session,
    isConnecting,
    error: sessionError,
    chatMessages,
    isHost,
    createSession,
    joinSession,
    leaveSession,
    sendChatMessage,
  } = useListeningSession({ userId, username });

  // Get resolved theme for conditional styling
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  return (
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
                  onClick={() => setRightPanelTab('context')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    rightPanelTab === 'context'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
                  Context
                </button>
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

              {/* Search (only in library view) */}
              {rightPanelTab === 'library' && (
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
              )}
            </div>
          </header>

          {/* Content */}
          <main className={`flex-1 overflow-y-auto ${resolvedTheme === 'light' ? 'bg-gradient-to-b from-zinc-50 to-white' : 'bg-gradient-to-b from-zinc-900 to-black'}`}>
            {rightPanelTab === 'library' && (
              <div className="px-4 py-6">
                <TrackList search={search || undefined} />
              </div>
            )}
            {rightPanelTab === 'context' && (
              <div className="px-4 py-6 text-zinc-500 text-center">
                <p className="mt-12">Context panel shows results from your conversation.</p>
                <p className="text-sm mt-2">Start a conversation in the chat to see results here.</p>
              </div>
            )}
            {rightPanelTab === 'playlists' && (
              <div className="px-4 py-6">
                <SmartPlaylistList />
              </div>
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
        onSessionClick={() => setShowSessionPanel(true)}
        isInSession={!!session}
        sessionParticipantCount={session?.participant_count || 0}
      />

      {/* Full player overlay */}
      {showFullPlayer && (
        <FullPlayer onClose={() => setShowFullPlayer(false)} />
      )}

      {/* PWA install prompt */}
      <InstallPrompt />

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Listening session panel */}
      {showSessionPanel && (
        <SessionPanel
          session={session}
          isHost={isHost}
          isConnecting={isConnecting}
          error={sessionError}
          chatMessages={chatMessages}
          onCreateSession={createSession}
          onJoinSession={joinSession}
          onLeaveSession={leaveSession}
          onSendMessage={sendChatMessage}
          onClose={() => setShowSessionPanel(false)}
        />
      )}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/guest" element={<GuestListener />} />
          <Route path="*" element={<AppContent />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
