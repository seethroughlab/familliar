import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Type, Loader2 } from 'lucide-react';
import { tracksApi } from '../../api/client';
import { usePlayerStore } from '../../stores/playerStore';

interface LyricsDisplayProps {
  trackId: string;
}

export function LyricsDisplay({ trackId }: LyricsDisplayProps) {
  const { currentTime } = usePlayerStore();
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const { data: lyrics, isLoading, error } = useQuery({
    queryKey: ['lyrics', trackId],
    queryFn: () => tracksApi.getLyrics(trackId),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    retry: false, // Don't retry failed lyrics fetches
  });

  // Update active line based on current playback time
  useEffect(() => {
    if (!lyrics?.synced || !lyrics.lines.length) return;

    // Find the current line based on playback time
    let newActiveIndex = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (currentTime >= lyrics.lines[i].time) {
        newActiveIndex = i;
      } else {
        break;
      }
    }

    if (newActiveIndex !== activeLineIndex) {
      setActiveLineIndex(newActiveIndex);
    }
  }, [currentTime, lyrics, activeLineIndex]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeLine = activeLineRef.current;

      // Scroll so active line is in the center of the container
      const containerHeight = container.clientHeight;
      const lineTop = activeLine.offsetTop;
      const lineHeight = activeLine.clientHeight;

      container.scrollTo({
        top: lineTop - containerHeight / 2 + lineHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [activeLineIndex]);

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
        <div className="text-center text-zinc-400">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <p>Loading lyrics...</p>
        </div>
      </div>
    );
  }

  if (error || !lyrics) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black overflow-auto">
        <div className="text-center text-zinc-500 p-8">
          <Type className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No lyrics available</p>
          <p className="text-sm mt-2">Lyrics will be fetched automatically when available</p>
        </div>
      </div>
    );
  }

  if (lyrics.synced) {
    // Synced lyrics with timestamps
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto bg-gradient-to-b from-zinc-900 to-black px-8 py-32"
      >
        <div className="max-w-2xl mx-auto space-y-6">
          {lyrics.lines.map((line, index) => (
            <div
              key={index}
              ref={index === activeLineIndex ? activeLineRef : null}
              className={`text-center transition-all duration-300 ${
                index === activeLineIndex
                  ? 'text-white text-3xl font-bold scale-105'
                  : index < activeLineIndex
                  ? 'text-zinc-500 text-xl'
                  : 'text-zinc-600 text-xl'
              }`}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Plain lyrics without timestamps
  return (
    <div className="absolute inset-0 overflow-auto bg-gradient-to-b from-zinc-900 to-black px-8 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="text-center space-y-4">
          {lyrics.lines.map((line, index) => (
            <p key={index} className="text-xl text-zinc-300">
              {line.text}
            </p>
          ))}
        </div>
        <p className="text-center text-sm text-zinc-600 mt-8">
          Synced lyrics not available for this track
        </p>
      </div>
    </div>
  );
}
