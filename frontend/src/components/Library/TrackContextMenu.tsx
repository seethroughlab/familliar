/**
 * Context menu for track actions.
 *
 * Shows on right-click with options like Play, Queue, Go to Artist, etc.
 */
import { useEffect, useRef } from 'react';
import {
  Play,
  ListPlus,
  User,
  Disc,
  CheckSquare,
  Square,
  Sparkles,
  Edit3,
} from 'lucide-react';
import type { Track } from '../../types';

interface TrackContextMenuProps {
  track: Track;
  position: { x: number; y: number };
  isSelected: boolean;
  onClose: () => void;
  onPlay: () => void;
  onQueue: () => void;
  onGoToArtist: () => void;
  onGoToAlbum: () => void;
  onToggleSelect: () => void;
  onAddToPlaylist: () => void;
  onMakePlaylist: () => void;
  onEditMetadata?: () => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ icon, label, onClick, disabled }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <span className="text-zinc-400">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-zinc-700" />;
}

export function TrackContextMenu({
  track,
  position,
  isSelected,
  onClose,
  onPlay,
  onQueue,
  onGoToArtist,
  onGoToAlbum,
  onToggleSelect,
  onAddToPlaylist,
  onMakePlaylist,
  onEditMetadata,
}: TrackContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if menu would go off-screen
      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${position.x - rect.width}px`;
      }

      // Adjust vertical position if menu would go off-screen
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${position.y - rect.height}px`;
      }
    }
  }, [position]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Track info header */}
      <div className="px-3 py-2 border-b border-zinc-700">
        <div className="text-sm font-medium text-white truncate">
          {track.title || 'Unknown'}
        </div>
        <div className="text-xs text-zinc-400 truncate">
          {track.artist || 'Unknown Artist'}
        </div>
      </div>

      {/* Playback actions */}
      <MenuItem
        icon={<Play className="w-4 h-4" />}
        label="Play"
        onClick={() => handleAction(onPlay)}
      />
      <MenuItem
        icon={<ListPlus className="w-4 h-4" />}
        label="Add to Queue"
        onClick={() => handleAction(onQueue)}
      />

      <MenuDivider />

      {/* Navigation actions */}
      <MenuItem
        icon={<User className="w-4 h-4" />}
        label="Go to Artist"
        onClick={() => handleAction(onGoToArtist)}
        disabled={!track.artist}
      />
      <MenuItem
        icon={<Disc className="w-4 h-4" />}
        label="Go to Album"
        onClick={() => handleAction(onGoToAlbum)}
        disabled={!track.album}
      />

      <MenuDivider />

      {/* Selection */}
      <MenuItem
        icon={isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        label={isSelected ? 'Deselect' : 'Select'}
        onClick={() => handleAction(onToggleSelect)}
      />

      {/* Edit Metadata */}
      {onEditMetadata && (
        <MenuItem
          icon={<Edit3 className="w-4 h-4" />}
          label="Edit Metadata..."
          onClick={() => handleAction(onEditMetadata)}
        />
      )}

      {/* Playlist */}
      <MenuItem
        icon={<ListPlus className="w-4 h-4" />}
        label="Add to Playlist..."
        onClick={() => handleAction(onAddToPlaylist)}
      />

      <MenuDivider />

      {/* AI Actions */}
      <MenuItem
        icon={<Sparkles className="w-4 h-4" />}
        label="Make Playlist From This..."
        onClick={() => handleAction(onMakePlaylist)}
      />
    </div>
  );
}

