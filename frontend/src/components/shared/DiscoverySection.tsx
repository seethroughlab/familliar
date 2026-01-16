import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Play, Pause, Disc, User, Disc3, Loader2 } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { AlbumArtwork } from '../AlbumArtwork';

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

export interface DiscoveryGroup {
  id: string;
  title: string;
  type: 'album' | 'artist' | 'track';
  items: DiscoveryItem[];
  icon?: React.ReactNode;
}

interface DiscoverySectionProps {
  // Single-section mode (backward compatible)
  title?: string;
  items?: DiscoveryItem[];
  type?: 'album' | 'artist' | 'track';
  // Multi-section mode (tabs)
  sections?: DiscoveryGroup[];
  // Common props
  sources?: string[];
  loading?: boolean;
  onItemClick?: (item: DiscoveryItem, type?: 'album' | 'artist' | 'track') => void;
  onPlay?: (item: DiscoveryItem, type?: 'album' | 'artist' | 'track') => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  emptyMessage?: string;
  headerIcon?: React.ReactNode;
}

export function DiscoverySection({
  title,
  items,
  type,
  sections,
  sources,
  loading,
  onItemClick,
  onPlay,
  collapsible = false,
  defaultExpanded = true,
  emptyMessage,
  headerIcon,
}: DiscoverySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const { currentTrack, isPlaying, setIsPlaying } = usePlayerStore();

  // Determine if we're in multi-section (tabs) mode
  const isMultiSection = sections && sections.length > 0;

  // Filter sections to only those with items
  const activeSections = sections?.filter(s => s.items.length > 0) || [];

  // Initialize active tab to first section with items
  const effectiveActiveTab = activeTabId || activeSections[0]?.id || null;

  // Handle loading state
  if (loading) {
    return (
      <div className="py-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          <span className="ml-2 text-sm text-zinc-400">Loading recommendations...</span>
        </div>
      </div>
    );
  }

  // Handle empty state for single-section mode
  if (!isMultiSection && (!items || items.length === 0)) {
    if (emptyMessage) {
      return (
        <div className="text-sm text-zinc-500 py-2">{emptyMessage}</div>
      );
    }
    return null;
  }

  // Handle empty state for multi-section mode
  if (isMultiSection && activeSections.length === 0) {
    if (emptyMessage) {
      return (
        <div className="text-sm text-zinc-500 py-2">{emptyMessage}</div>
      );
    }
    return null;
  }

  const handlePlay = (item: DiscoveryItem, itemType: 'album' | 'artist' | 'track', e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.id && currentTrack?.id === item.id) {
      setIsPlaying(!isPlaying);
    } else if (onPlay) {
      onPlay(item, itemType);
    }
  };

  const isItemPlaying = (item: DiscoveryItem) => {
    return item.id && currentTrack?.id === item.id && isPlaying;
  };

  // Check if URL is Last.fm's default placeholder image
  const isLastFmPlaceholder = (url: string | undefined) => {
    return url?.includes('2a96cbd8b46e442fc41c2b86b821562f');
  };

  // Render a single item
  const renderItem = (item: DiscoveryItem, idx: number, itemType: 'album' | 'artist' | 'track') => {
    const isCurrentlyPlaying = isItemPlaying(item);
    const isClickable = item.inLibrary && onItemClick;

    // Determine if we can use AlbumArtwork (for albums and tracks with artist+album info)
    const canUseAlbumArtwork = itemType !== 'artist' && item.artist && item.album;

    // Filter out Last.fm placeholder images - prefer our own icons
    const hasValidImageUrl = item.imageUrl && !isLastFmPlaceholder(item.imageUrl);

    return (
      <div
        key={`${item.name}-${item.subtitle || ''}-${idx}`}
        onClick={() => isClickable && onItemClick(item, itemType)}
        className={`group flex items-center gap-3 p-2 rounded-lg transition-colors ${
          isClickable ? 'cursor-pointer hover:bg-zinc-800/50' : ''
        } ${isCurrentlyPlaying ? 'bg-zinc-800/30' : ''} ${
          !item.inLibrary ? 'opacity-75' : ''
        }`}
      >
        {/* Image/Icon */}
        <div className="relative flex-shrink-0">
          {canUseAlbumArtwork ? (
            <AlbumArtwork
              artist={item.artist}
              album={item.album}
              trackId={item.id}
              size="thumb"
              className="w-10 h-10 rounded"
            />
          ) : hasValidImageUrl ? (
            <div className={`relative w-10 h-10 bg-zinc-700 ${
              itemType === 'artist' ? 'rounded-full' : 'rounded'
            }`}>
              <img
                src={item.imageUrl}
                alt={item.name}
                className={`w-10 h-10 object-cover ${
                  itemType === 'artist' ? 'rounded-full' : 'rounded'
                }`}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              {/* Fallback icon behind image */}
              <div className={`absolute inset-0 flex items-center justify-center -z-10 ${
                itemType === 'artist' ? 'rounded-full' : 'rounded'
              }`}>
                {itemType === 'artist' ? (
                  <User className="w-5 h-5 text-zinc-400" />
                ) : (
                  <Disc className="w-5 h-5 text-zinc-400" />
                )}
              </div>
            </div>
          ) : (
            <div className={`w-10 h-10 bg-zinc-700 flex items-center justify-center ${
              itemType === 'artist' ? 'rounded-full' : 'rounded'
            }`}>
              {itemType === 'artist' ? (
                <User className="w-5 h-5 text-zinc-400" />
              ) : itemType === 'track' ? (
                <Disc3 className="w-5 h-5 text-zinc-400" />
              ) : (
                <Disc className="w-5 h-5 text-zinc-400" />
              )}
            </div>
          )}

          {/* Play button overlay for in-library items */}
          {item.inLibrary && onPlay && (
            <button
              onClick={(e) => handlePlay(item, itemType, e)}
              className={`absolute inset-0 flex items-center justify-center rounded ${
                itemType === 'artist' ? 'rounded-full' : ''
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
  };

  // Render list of items
  const renderItemList = (itemList: DiscoveryItem[], itemType: 'album' | 'artist' | 'track') => (
    <div className="space-y-1">
      {itemList.map((item, idx) => renderItem(item, idx, itemType))}
    </div>
  );

  // Get the default icon for a type
  const getTypeIcon = (itemType: 'album' | 'artist' | 'track') => {
    switch (itemType) {
      case 'artist':
        return <User className="w-4 h-4 inline-block mr-1.5" />;
      case 'track':
        return <Disc3 className="w-4 h-4 inline-block mr-1.5" />;
      default:
        return <Disc className="w-4 h-4 inline-block mr-1.5" />;
    }
  };

  // Render tabs for multi-section mode
  const renderTabs = () => {
    if (activeSections.length <= 1) return null;

    return (
      <div className="flex gap-1 mb-4">
        {activeSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveTabId(section.id)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              effectiveActiveTab === section.id
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {section.icon || getTypeIcon(section.type)}
            {section.title} ({section.items.length})
          </button>
        ))}
      </div>
    );
  };

  // Render content based on mode
  const renderContent = () => {
    if (isMultiSection) {
      const activeSection = activeSections.find(s => s.id === effectiveActiveTab) || activeSections[0];
      if (!activeSection) return null;

      return (
        <div>
          {renderTabs()}
          {renderItemList(activeSection.items, activeSection.type)}
        </div>
      );
    }

    // Single-section mode
    return renderItemList(items || [], type || 'track');
  };

  // Unified header rendering for both modes
  const itemCount = isMultiSection
    ? activeSections.reduce((sum, s) => sum + s.items.length, 0)
    : (items?.length || 0);

  const renderHeader = (asButton: boolean) => {
    const content = (
      <>
        <div className="flex items-center gap-2">
          {headerIcon || <Disc3 className="w-5 h-5 text-purple-400" />}
          <span className="font-medium">{title || 'Discover'}</span>
          {sources && sources.length > 0 && (
            <span className="text-xs text-zinc-500">
              via {sources.join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{itemCount}</span>
          {asButton && (
            isExpanded ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )
          )}
        </div>
      </>
    );

    if (asButton) {
      return (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-2 py-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
        >
          {content}
        </button>
      );
    }

    return (
      <div className="flex items-center justify-between px-2 py-2">
        {content}
      </div>
    );
  };

  // Collapsible mode (both single and multi-section)
  if (collapsible) {
    return (
      <div>
        {renderHeader(true)}
        {isExpanded && <div className="mt-2">{renderContent()}</div>}
      </div>
    );
  }

  // Non-collapsible mode
  return (
    <div>
      {renderHeader(false)}
      <div className="mt-2">{renderContent()}</div>
    </div>
  );
}
