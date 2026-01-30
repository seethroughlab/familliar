/**
 * Context menu for album actions.
 *
 * Shows on right-click with options like Play, Shuffle, Queue, Go to Artist, etc.
 */
import { useEffect, useRef } from 'react';
import {
  Play,
  Shuffle,
  ListPlus,
  User,
  Disc,
  Download,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface AlbumContextMenuProps {
  album: { name: string; artist: string; year: number | null; first_track_id: string };
  position: { x: number; y: number };
  onClose: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onQueue: () => void;
  onGoToArtist: () => void;
  onGoToAlbum: () => void;
  onDownload: () => void;
  onRemoveDownload: () => void;
  hasDownloadedTracks: boolean;
  onAddToPlaylist: () => void;
  onMakePlaylist: () => void;
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

export function AlbumContextMenu({
  album,
  position,
  onClose,
  onPlay,
  onShuffle,
  onQueue,
  onGoToArtist,
  onGoToAlbum,
  onDownload,
  onRemoveDownload,
  hasDownloadedTracks,
  onAddToPlaylist,
  onMakePlaylist,
}: AlbumContextMenuProps) {
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
      {/* Album info header */}
      <div className="px-3 py-2 border-b border-zinc-700">
        <div className="text-sm font-medium text-white truncate">
          {album.name}
        </div>
        <div className="text-xs text-zinc-400 truncate">
          {album.artist}
          {album.year && ` · ${album.year}`}
        </div>
      </div>

      {/* Playback actions */}
      <MenuItem
        icon={<Play className="w-4 h-4" />}
        label="Play Album"
        onClick={() => handleAction(onPlay)}
      />
      <MenuItem
        icon={<Shuffle className="w-4 h-4" />}
        label="Shuffle Album"
        onClick={() => handleAction(onShuffle)}
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
      />
      <MenuItem
        icon={<Disc className="w-4 h-4" />}
        label="Go to Album"
        onClick={() => handleAction(onGoToAlbum)}
      />

      <MenuDivider />

      {/* Downloads */}
      <MenuItem
        icon={<Download className="w-4 h-4" />}
        label="Download Album"
        onClick={() => handleAction(onDownload)}
      />
      {hasDownloadedTracks && (
        <MenuItem
          icon={<Trash2 className="w-4 h-4" />}
          label="Remove Downloaded"
          onClick={() => handleAction(onRemoveDownload)}
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
