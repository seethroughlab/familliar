import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Music, Wrench, Plus, Trash2, MessageSquare } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { getOrCreateDeviceProfile } from '../../services/profileService';
import * as chatService from '../../services/chatService';
import type { ChatSession, ChatToolCall } from '../../db';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
}

export function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setQueue } = usePlayerStore();

  // Load profile and sessions on mount
  useEffect(() => {
    const init = async () => {
      const profile = await getOrCreateDeviceProfile();
      setProfileId(profile);

      const allSessions = await chatService.listSessions(profile);
      setSessions(allSessions);

      // Load most recent session or create new one
      if (allSessions.length > 0) {
        setCurrentSession(allSessions[0]);
      }
    };
    init();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages]);

  const refreshSessions = useCallback(async () => {
    if (!profileId) return;
    const allSessions = await chatService.listSessions(profileId);
    setSessions(allSessions);
  }, [profileId]);

  const createNewSession = async () => {
    if (!profileId) return;

    const session = await chatService.createSession(profileId);
    setSessions((prev) => [session, ...prev]);
    setCurrentSession(session);
    setShowSessions(false);
    inputRef.current?.focus();
  };

  const selectSession = async (session: ChatSession) => {
    setCurrentSession(session);
    setShowSessions(false);
    inputRef.current?.focus();
  };

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await chatService.deleteSession(sessionId);
    await refreshSessions();

    if (currentSession?.id === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setCurrentSession(remaining[0] || null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !profileId) return;

    // Create session if needed
    let session = currentSession;
    if (!session) {
      session = await chatService.createSession(profileId);
      setSessions((prev) => [session!, ...prev]);
      setCurrentSession(session);
    }

    const userMessageContent = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    const userMessage = await chatService.addMessage(session.id, {
      role: 'user',
      content: userMessageContent,
    });

    // Update local state
    setCurrentSession((prev) =>
      prev ? { ...prev, messages: [...prev.messages, userMessage] } : null
    );

    // Add assistant placeholder
    const assistantMessage = await chatService.addMessage(session.id, {
      role: 'assistant',
      content: '',
      toolCalls: [],
    });

    setCurrentSession((prev) =>
      prev ? { ...prev, messages: [...prev.messages, assistantMessage] } : null
    );

    try {
      // Build history for API (exclude new messages)
      const history = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessageContent,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              await handleStreamEvent(event, session!.id);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      await chatService.updateLastMessage(session.id, {
        content: 'Sorry, something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
      // Refresh session from DB to get final state
      const updatedSession = await chatService.getSession(session.id);
      if (updatedSession) {
        setCurrentSession(updatedSession);
      }
      await refreshSessions();
    }
  };

  const handleStreamEvent = async (
    event: Record<string, unknown>,
    sessionId: string
  ) => {
    switch (event.type) {
      case 'text':
        await chatService.appendToLastMessage(sessionId, event.content as string);
        // Update local state for immediate feedback
        setCurrentSession((prev) => {
          if (!prev) return null;
          const messages = [...prev.messages];
          const lastIdx = messages.length - 1;
          messages[lastIdx] = {
            ...messages[lastIdx],
            content: messages[lastIdx].content + (event.content as string),
          };
          return { ...prev, messages };
        });
        break;

      case 'tool_call': {
        const toolCall: ChatToolCall = {
          name: event.name as string,
          input: event.input as Record<string, unknown>,
          status: 'running',
        };
        await chatService.addToolCallToLastMessage(sessionId, toolCall);
        setCurrentSession((prev) => {
          if (!prev) return null;
          const messages = [...prev.messages];
          const lastIdx = messages.length - 1;
          messages[lastIdx] = {
            ...messages[lastIdx],
            toolCalls: [...(messages[lastIdx].toolCalls || []), toolCall],
          };
          return { ...prev, messages };
        });
        break;
      }

      case 'tool_result':
        await chatService.updateToolCallInLastMessage(sessionId, event.name as string, {
          result: event.result as Record<string, unknown>,
          status: 'complete',
        });
        setCurrentSession((prev) => {
          if (!prev) return null;
          const messages = [...prev.messages];
          const lastIdx = messages.length - 1;
          messages[lastIdx] = {
            ...messages[lastIdx],
            toolCalls: messages[lastIdx].toolCalls?.map((tc) =>
              tc.name === event.name
                ? { ...tc, result: event.result as Record<string, unknown>, status: 'complete' as const }
                : tc
            ),
          };
          return { ...prev, messages };
        });
        break;

      case 'queue': {
        const tracks = (event.tracks as Track[]).map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          file_path: '',
          album_artist: null,
          album_type: 'album' as const,
          track_number: null,
          disc_number: null,
          year: null,
          genre: null,
          duration_seconds: null,
          format: null,
          analysis_version: 0,
        }));
        if (tracks.length > 0) {
          setQueue(tracks, 0);
        }
        break;
      }

      case 'playback': {
        const action = event.action as string;
        const store = usePlayerStore.getState();
        if (action === 'play') store.setIsPlaying(true);
        else if (action === 'pause') store.setIsPlaying(false);
        else if (action === 'next') store.playNext();
        else if (action === 'previous') store.playPrevious();
        break;
      }
    }
  };

  const messages = currentSession?.messages || [];

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Familiar</h2>
          <p className="text-xs text-zinc-500">
            {currentSession ? currentSession.title : 'Ask me to play something'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Chat history"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button
            onClick={createNewSession}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="New chat"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Session list dropdown */}
      {showSessions && (
        <div className="border-b border-zinc-800 bg-zinc-950 max-h-64 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 text-center">No conversations yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => selectSession(session)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800 transition-colors ${
                  currentSession?.id === session.id ? 'bg-zinc-800' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.title}</p>
                  <p className="text-xs text-zinc-500">
                    {session.messages.length} messages
                  </p>
                </div>
                <button
                  onClick={(e) => deleteSession(session.id, e)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 rounded transition-colors"
                  title="Delete conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">Try asking:</p>
            <p className="text-sm italic mt-2">"Play something chill for coding"</p>
            <p className="text-sm italic">"Find me upbeat electronic music"</p>
            <p className="text-sm italic">"What's similar to the current track?"</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-800 text-zinc-100'
              }`}
            >
              {/* Tool calls */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mb-2 space-y-1">
                  {message.toolCalls.map((tc, i) => (
                    <ToolCallBadge key={i} toolCall={tc} />
                  ))}
                </div>
              )}

              {/* Message content */}
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>

              {/* Streaming indicator */}
              {message.role === 'assistant' && !message.content && isLoading && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Familiar..."
            disabled={isLoading}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-green-600 text-white rounded-full hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function ToolCallBadge({ toolCall }: { toolCall: ChatToolCall }) {
  const toolNames: Record<string, string> = {
    search_library: 'Searching',
    find_similar_tracks: 'Finding similar',
    filter_tracks_by_features: 'Filtering',
    get_library_stats: 'Getting stats',
    queue_tracks: 'Queueing',
    control_playback: 'Controlling',
    get_track_details: 'Getting details',
    get_spotify_status: 'Checking Spotify',
    get_spotify_favorites: 'Getting favorites',
    get_unmatched_spotify_favorites: 'Finding unmatched',
    get_spotify_sync_stats: 'Sync stats',
    search_bandcamp: 'Searching Bandcamp',
    recommend_bandcamp_purchases: 'Recommending',
  };

  const displayName = toolNames[toolCall.name] || toolCall.name;
  const trackCount = (toolCall.result as { count?: number })?.count;

  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
      {toolCall.status === 'running' ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Wrench className="w-3 h-3" />
      )}
      <span>{displayName}</span>
      {trackCount !== undefined && (
        <span className="text-zinc-500">({trackCount} tracks)</span>
      )}
    </div>
  );
}
