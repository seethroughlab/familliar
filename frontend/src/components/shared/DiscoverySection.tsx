import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Play, Pause, Disc, User } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';

export interface DiscoveryItem {
  id?: string;
  name: string;
  subtitle?: string;
  imageUrl?: string;
  matchScore?: number;
  inLibrary: boolean;
  externalLinks?: {
    bandcamp?: string;
    lastfm?: string;
  };
  // For playback
  artist?: string;
  album?: string;
}

interface DiscoverySectionProps {
  title: string;
  items: DiscoveryItem[];
  type: 'album' | 'artist' | 'track';
  onItemClick?: (item: DiscoveryItem) => void;
  onPlay?: (item: DiscoveryItem) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  emptyMessage?: string;
}

export function DiscoverySection({
  title,
  items,
  type,
  onItemClick,
  onPlay,
  collapsible = false,
  defaultExpanded = true,
  emptyMessage,
}: DiscoverySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { currentTrack, isPlaying, setIsPlaying } = usePlayerStore();

  if (items.length === 0) {
    if (emptyMessage) {
      return (
        <div className="text-sm text-zinc-500 py-2">{emptyMessage}</div>
      );
    }
    return null;
  }

  const handlePlay = (item: DiscoveryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.id && currentTrack?.id === item.id) {
      setIsPlaying(!isPlaying);
    } else if (onPlay) {
      onPlay(item);
    }
  };

  const isItemPlaying = (item: DiscoveryItem) => {
    return item.id && currentTrack?.id === item.id && isPlaying;
  };

  const content = (
    <div className="space-y-1">
      {items.map((item, idx) => {
        const isCurrentlyPlaying = isItemPlaying(item);
        const isClickable = item.inLibrary && onItemClick;

        return (
          <div
            key={`${item.name}-${item.subtitle || ''}-${idx}`}
            onClick={() => isClickable && onItemClick(item)}
            className={`group flex items-center gap-3 p-2 rounded-lg transition-colors ${
              isClickable ? 'cursor-pointer hover:bg-zinc-800/50' : ''
            } ${isCurrentlyPlaying ? 'bg-zinc-800/30' : ''} ${
              !item.inLibrary ? 'opacity-75' : ''
            }`}
          >
            {/* Image/Icon */}
            <div className="relative flex-shrink-0">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className={`w-10 h-10 object-cover ${
                    type === 'artist' ? 'rounded-full' : 'rounded'
                  }`}
                />
              ) : (
                <div className={`w-10 h-10 bg-zinc-700 flex items-center justify-center ${
                  type === 'artist' ? 'rounded-full' : 'rounded'
                }`}>
                  {type === 'artist' ? (
                    <User className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <Disc className="w-5 h-5 text-zinc-400" />
                  )}
                </div>
              )}

              {/* Play button overlay for in-library items */}
              {item.inLibrary && onPlay && (
                <button
                  onClick={(e) => handlePlay(item, e)}
                  className={`absolute inset-0 flex items-center justify-center rounded ${
                    type === 'artist' ? 'rounded-full' : ''
                  } bg-black/60 transition-opacity ${
                    isCurrentlyPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {isCurrentlyPlaying ? (
                    <Pause className="w-4 h-4" fill="currentColor" />
                  ) : (
                    <Play className="w-4 h-4" fill="currentColor" />
                  )}
                </button>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-sm truncate ${
                isCurrentlyPlaying ? 'text-green-500' : ''
              }`}>
                {item.name}
              </div>
              {item.subtitle && (
                <div className="text-xs text-zinc-400 truncate">
                  {item.subtitle}
                </div>
              )}
            </div>

            {/* Right side: match score, badges, links */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.inLibrary ? (
                item.matchScore !== undefined && (
                  <span className="text-xs text-emerald-500">
                    {Math.round(item.matchScore * 100)}% match
                  </span>
                )
              ) : (
                <>
                  {item.matchScore !== undefined && (
                    <span className="text-xs text-zinc-500">
                      {Math.round(item.matchScore * 100)}%
                    </span>
                  )}
                  {item.externalLinks?.bandcamp && (
                    <a
                      href={item.externalLinks.bandcamp}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 text-xs bg-teal-600/20 text-teal-400 hover:bg-teal-600/40 rounded transition-colors"
                    >
                      Bandcamp
                    </a>
                  )}
                  {item.externalLinks?.lastfm && (
                    <a
                      href={item.externalLinks.lastfm}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                      title="View on Last.fm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (collapsible) {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between py-2 text-left hover:text-white transition-colors"
        >
          <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{items.length}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </div>
        </button>
        {isExpanded && content}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-300 mb-2">{title}</h3>
      {content}
    </div>
  );
}
