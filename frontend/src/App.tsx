import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Search, Library, MessageSquare, Settings } from 'lucide-react';
import { PlayerBar } from './components/Player/PlayerBar';
import { TrackList } from './components/Library/TrackList';
import { ChatPanel } from './components/Chat';
import { SettingsPanel } from './components/Settings';
import { FullPlayer } from './components/FullPlayer';
import { useScrobbling } from './hooks/useScrobbling';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

type RightPanelTab = 'context' | 'library' | 'settings';

function AppContent() {
  const [search, setSearch] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('library');
  const [showFullPlayer, setShowFullPlayer] = useState(false);

  // Initialize Last.fm scrobbling
  useScrobbling();

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* Main content area - pb-20 accounts for fixed player bar */}
      <div className="flex-1 flex overflow-hidden pb-20">
        {/* Left panel - Chat */}
        <div className="w-96 border-r border-zinc-800 flex flex-col">
          <ChatPanel />
        </div>

        {/* Right panel - Library/Context */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with tabs */}
          <header className="bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800">
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
          <main className="flex-1 overflow-y-auto bg-gradient-to-b from-zinc-900 to-black">
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
            {rightPanelTab === 'settings' && (
              <SettingsPanel />
            )}
          </main>
        </div>
      </div>

      {/* Player bar - fixed at bottom */}
      <PlayerBar onExpandClick={() => setShowFullPlayer(true)} />

      {/* Full player overlay */}
      {showFullPlayer && (
        <FullPlayer onClose={() => setShowFullPlayer(false)} />
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
