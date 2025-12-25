import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Music, Wrench } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'running' | 'complete';
}

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { setQueue } = usePlayerStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Build history for API (exclude the new messages we just added)
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
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
              handleStreamEvent(event, assistantId);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, something went wrong. Please try again.', isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
    }
  };

  const handleStreamEvent = (event: Record<string, unknown>, messageId: string) => {
    switch (event.type) {
      case 'text':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: m.content + (event.content as string) } : m
          )
        );
        break;

      case 'tool_call':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls || []),
                    {
                      name: event.name as string,
                      input: event.input as Record<string, unknown>,
                      status: 'running' as const,
                    },
                  ],
                }
              : m
          )
        );
        break;

      case 'tool_result':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  toolCalls: m.toolCalls?.map((tc) =>
                    tc.name === event.name
                      ? { ...tc, result: event.result as Record<string, unknown>, status: 'complete' as const }
                      : tc
                  ),
                }
              : m
          )
        );
        break;

      case 'queue':
        // Queue tracks in the player
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

      case 'playback':
        // Handle playback control
        const action = event.action as string;
        const store = usePlayerStore.getState();
        if (action === 'play') store.setIsPlaying(true);
        else if (action === 'pause') store.setIsPlaying(false);
        else if (action === 'next') store.playNext();
        else if (action === 'previous') store.playPrevious();
        break;
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-lg font-semibold">Familiar</h2>
        <p className="text-xs text-zinc-500">Ask me to play something</p>
      </div>

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
              {message.isStreaming && !message.content && (
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

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const toolNames: Record<string, string> = {
    search_library: 'Searching',
    find_similar_tracks: 'Finding similar',
    filter_tracks_by_features: 'Filtering',
    get_library_stats: 'Getting stats',
    queue_tracks: 'Queueing',
    control_playback: 'Controlling',
    get_track_details: 'Getting details',
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
