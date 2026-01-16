"""Library organization service for reorganizing music files."""

import logging
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import MUSIC_LIBRARY_PATH
from app.db.models import Track

logger = logging.getLogger(__name__)

# Default organization templates
TEMPLATES = {
    "artist-album": "{artist}/{album}/{track_number} - {title}",
    "artist-album-disc": "{artist}/{album}/Disc {disc_number}/{track_number} - {title}",
    "genre-artist-album": "{genre}/{artist}/{album}/{track_number} - {title}",
    "year-artist-album": "{year}/{artist}/{album}/{track_number} - {title}",
    "flat": "{artist} - {album} - {track_number} - {title}",
}

# Characters not allowed in filenames (Windows + macOS + Linux)
INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

# Characters to replace with alternatives
CHAR_REPLACEMENTS = {
    ":": " -",
    "/": "-",
    "\\": "-",
    "?": "",
    "*": "",
    "<": "",
    ">": "",
    "|": "-",
    '"': "'",
}


def sanitize_filename(name: str | None, default: str = "Unknown") -> str:
    """Sanitize a string for use as a filename component.

    - Replaces invalid characters
    - Strips leading/trailing whitespace and dots
    - Limits length to 200 characters
    - Returns default if empty
    """
    if not name:
        return default

    # Replace known problematic characters with alternatives
    result = name
    for char, replacement in CHAR_REPLACEMENTS.items():
        result = result.replace(char, replacement)

    # Remove any remaining invalid characters
    result = INVALID_CHARS.sub("", result)

    # Strip whitespace and dots (dots at start are hidden files on Unix)
    result = result.strip().strip(".")

    # Limit length
    if len(result) > 200:
        result = result[:200].strip()

    return result or default


@dataclass
class OrganizeResult:
    """Result of organizing a track."""
    track_id: UUID
    old_path: str
    new_path: str | None
    status: Literal["moved", "skipped", "error"]
    message: str


@dataclass
class OrganizeStats:
    """Statistics from an organization operation."""
    total: int
    moved: int
    skipped: int
    errors: int
    results: list[OrganizeResult]


class LibraryOrganizer:
    """Reorganizes music files according to a template.

    Only moves files with complete metadata to avoid creating
    messy folder structures from poorly-tagged files.
    """

    def __init__(self, db: AsyncSession, library_root: Path | None = None):
        self.db = db
        self.library_root = library_root or MUSIC_LIBRARY_PATH

    def _has_complete_metadata(self, track: Track) -> bool:
        """Check if track has enough metadata for organization."""
        return bool(
            track.title
            and track.artist
            and track.album
        )

    def _format_path(self, track: Track, template: str) -> Path:
        """Format a path from template and track metadata."""
        # Build substitution dict with sanitized values
        subs = {
            "artist": sanitize_filename(track.album_artist or track.artist),
            "album": sanitize_filename(track.album),
            "title": sanitize_filename(track.title),
            "genre": sanitize_filename(track.genre, "Unknown Genre"),
            "year": str(track.year) if track.year else "Unknown Year",
            "track_number": str(track.track_number or 0).zfill(2),
            "disc_number": str(track.disc_number or 1),
        }

        # Get file extension from current path
        ext = Path(track.file_path).suffix

        # Format template and add extension
        formatted = template.format(**subs)
        return self.library_root / f"{formatted}{ext}"

    async def preview_track(
        self,
        track_id: UUID,
        template: str = TEMPLATES["artist-album"],
    ) -> OrganizeResult:
        """Preview what would happen if a track was organized.

        Does not move any files.
        """
        result = await self.db.execute(
            select(Track).where(Track.id == track_id)
        )
        track = result.scalar_one_or_none()

        if not track:
            return OrganizeResult(
                track_id=track_id,
                old_path="",
                new_path=None,
                status="error",
                message="Track not found",
            )

        if not self._has_complete_metadata(track):
            return OrganizeResult(
                track_id=track_id,
                old_path=track.file_path,
                new_path=None,
                status="skipped",
                message="Incomplete metadata (needs title, artist, album)",
            )

        new_path = self._format_path(track, template)

        if Path(track.file_path) == new_path:
            return OrganizeResult(
                track_id=track_id,
                old_path=track.file_path,
                new_path=str(new_path),
                status="skipped",
                message="Already at target path",
            )

        return OrganizeResult(
            track_id=track_id,
            old_path=track.file_path,
            new_path=str(new_path),
            status="moved",  # Would be moved
            message="Ready to move",
        )

    async def organize_track(
        self,
        track_id: UUID,
        template: str = TEMPLATES["artist-album"],
        dry_run: bool = False,
    ) -> OrganizeResult:
        """Organize a single track according to template.

        Args:
            track_id: Track to organize
            template: Path template with placeholders
            dry_run: If True, don't actually move files

        Returns:
            OrganizeResult with status and paths
        """
        result = await self.db.execute(
            select(Track).where(Track.id == track_id)
        )
        track = result.scalar_one_or_none()

        if not track:
            return OrganizeResult(
                track_id=track_id,
                old_path="",
                new_path=None,
                status="error",
                message="Track not found",
            )

        old_path = Path(track.file_path)

        # Check metadata completeness
        if not self._has_complete_metadata(track):
            return OrganizeResult(
                track_id=track_id,
                old_path=str(old_path),
                new_path=None,
                status="skipped",
                message="Incomplete metadata",
            )

        # Generate new path
        new_path = self._format_path(track, template)

        # Skip if already at target
        if old_path == new_path:
            return OrganizeResult(
                track_id=track_id,
                old_path=str(old_path),
                new_path=str(new_path),
                status="skipped",
                message="Already organized",
            )

        if dry_run:
            return OrganizeResult(
                track_id=track_id,
                old_path=str(old_path),
                new_path=str(new_path),
                status="moved",
                message="Would move (dry run)",
            )

        try:
            # Check source exists
            if not old_path.exists():
                return OrganizeResult(
                    track_id=track_id,
                    old_path=str(old_path),
                    new_path=str(new_path),
                    status="error",
                    message="Source file not found",
                )

            # Check target doesn't already exist
            if new_path.exists():
                return OrganizeResult(
                    track_id=track_id,
                    old_path=str(old_path),
                    new_path=str(new_path),
                    status="error",
                    message="Target path already exists",
                )

            # Create parent directories
            new_path.parent.mkdir(parents=True, exist_ok=True)

            # Move the file
            shutil.move(str(old_path), str(new_path))

            # Update database
            await self.db.execute(
                update(Track)
                .where(Track.id == track_id)
                .values(file_path=str(new_path))
            )
            await self.db.commit()

            # Try to remove empty parent directories
            self._cleanup_empty_dirs(old_path.parent)

            logger.info(f"Organized track: {old_path} -> {new_path}")

            return OrganizeResult(
                track_id=track_id,
                old_path=str(old_path),
                new_path=str(new_path),
                status="moved",
                message="Successfully moved",
            )

        except Exception as e:
            logger.error(f"Failed to organize {track_id}: {e}")
            return OrganizeResult(
                track_id=track_id,
                old_path=str(old_path),
                new_path=str(new_path),
                status="error",
                message=str(e),
            )

    def _cleanup_empty_dirs(self, directory: Path) -> None:
        """Remove empty parent directories up to library root."""
        try:
            while directory != self.library_root and directory.exists():
                if any(directory.iterdir()):
                    break  # Directory not empty
                directory.rmdir()
                logger.debug(f"Removed empty directory: {directory}")
                directory = directory.parent
        except Exception as e:
            logger.warning(f"Failed to cleanup empty dirs: {e}")

    async def organize_all(
        self,
        template: str = TEMPLATES["artist-album"],
        dry_run: bool = False,
        limit: int | None = None,
    ) -> OrganizeStats:
        """Organize all tracks in the library.

        Args:
            template: Path template to use
            dry_run: If True, don't actually move files
            limit: Maximum number of tracks to process

        Returns:
            OrganizeStats with counts and results
        """
        query = select(Track)
        if limit:
            query = query.limit(limit)

        result = await self.db.execute(query)
        tracks = result.scalars().all()

        stats = OrganizeStats(
            total=len(tracks),
            moved=0,
            skipped=0,
            errors=0,
            results=[],
        )

        for track in tracks:
            organize_result = await self.organize_track(track.id, template, dry_run)
            stats.results.append(organize_result)

            if organize_result.status == "moved":
                stats.moved += 1
            elif organize_result.status == "skipped":
                stats.skipped += 1
            elif organize_result.status == "error":
                stats.errors += 1

        return stats

    async def preview_all(
        self,
        template: str = TEMPLATES["artist-album"],
        limit: int = 100,
    ) -> OrganizeStats:
        """Preview organization for all tracks (limited).

        Returns what would happen without moving any files.
        """
        return await self.organize_all(template, dry_run=True, limit=limit)


def get_available_templates() -> dict[str, str]:
    """Get all available organization templates."""
    return TEMPLATES.copy()
