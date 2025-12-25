"""Library scanner service for discovering and tracking audio files."""

import hashlib
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AUDIO_EXTENSIONS, settings
from app.db.models import Track


def compute_file_hash(path: Path, chunk_size: int = 8192) -> str:
    """Compute SHA-256 hash of file for change detection.

    Uses first and last chunks plus file size for speed on large files.
    """
    file_size = path.stat().st_size
    hasher = hashlib.sha256()

    with open(path, "rb") as f:
        # Hash first chunk
        hasher.update(f.read(chunk_size))

        # Hash last chunk if file is large enough
        if file_size > chunk_size * 2:
            f.seek(-chunk_size, 2)  # Seek to last chunk
            hasher.update(f.read(chunk_size))

        # Include file size in hash
        hasher.update(str(file_size).encode())

    return hasher.hexdigest()


class LibraryScanner:
    """Scans music library directories for audio files."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def scan(self, library_path: Path, full_scan: bool = False) -> dict:
        """Scan library for new, changed, or deleted files.

        Args:
            library_path: Root directory to scan
            full_scan: If True, reprocess all files even if unchanged

        Returns:
            Dict with scan results: total, new, updated, deleted, queued
        """
        if not library_path.exists():
            raise ValueError(f"Library path does not exist: {library_path}")

        # Get all existing tracks from database
        existing_tracks = await self._get_existing_tracks()
        existing_paths = {t.file_path: t for t in existing_tracks}

        # Find all audio files
        found_files = self._discover_files(library_path)
        found_paths = {str(p) for p in found_files}

        results = {
            "total": len(found_files),
            "new": 0,
            "updated": 0,
            "deleted": 0,
            "unchanged": 0,
            "queued": 0,
        }

        # Process found files
        for file_path in found_files:
            path_str = str(file_path)
            file_hash = compute_file_hash(file_path)
            file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)

            if path_str not in existing_paths:
                # New file
                await self._create_track(file_path, file_hash, file_mtime)
                results["new"] += 1
                results["queued"] += 1
            else:
                existing = existing_paths[path_str]
                if full_scan or existing.file_hash != file_hash:
                    # Changed file (or full scan requested)
                    await self._update_track(existing, file_hash, file_mtime)
                    results["updated"] += 1
                    results["queued"] += 1
                else:
                    results["unchanged"] += 1

        # Handle deleted files - only delete files that were under this library_path
        library_prefix = str(library_path)
        deleted_paths = set(
            p for p in existing_paths.keys()
            if p.startswith(library_prefix)
        ) - found_paths
        for path_str in deleted_paths:
            track = existing_paths[path_str]
            await self.db.delete(track)
            results["deleted"] += 1

        await self.db.commit()

        return results

    def _discover_files(self, library_path: Path) -> list[Path]:
        """Recursively find all audio files in library."""
        files = []
        for ext in AUDIO_EXTENSIONS:
            files.extend(library_path.rglob(f"*{ext}"))
            files.extend(library_path.rglob(f"*{ext.upper()}"))
        return sorted(files)

    async def _get_existing_tracks(self) -> list[Track]:
        """Get all tracks currently in database."""
        result = await self.db.execute(select(Track))
        return list(result.scalars().all())

    async def _create_track(
        self, file_path: Path, file_hash: str, file_mtime: datetime
    ) -> Track:
        """Create a new track record."""
        # Import here to avoid circular imports
        from app.services.metadata import extract_metadata

        # Extract metadata from file
        metadata = extract_metadata(file_path)

        track = Track(
            file_path=str(file_path),
            file_hash=file_hash,
            file_modified_at=file_mtime,
            title=metadata.get("title"),
            artist=metadata.get("artist"),
            album=metadata.get("album"),
            album_artist=metadata.get("album_artist"),
            track_number=metadata.get("track_number"),
            disc_number=metadata.get("disc_number"),
            year=metadata.get("year"),
            genre=metadata.get("genre"),
            duration_seconds=metadata.get("duration_seconds"),
            sample_rate=metadata.get("sample_rate"),
            bit_depth=metadata.get("bit_depth"),
            bitrate=metadata.get("bitrate"),
            format=metadata.get("format"),
        )

        self.db.add(track)
        await self.db.flush()  # Get the track ID

        # Queue analysis task
        from app.workers.tasks import analyze_track
        analyze_track.delay(str(track.id))

        return track

    async def _update_track(
        self, track: Track, file_hash: str, file_mtime: datetime
    ) -> Track:
        """Update an existing track record."""
        from app.services.metadata import extract_metadata

        # Re-extract metadata
        metadata = extract_metadata(Path(track.file_path))

        track.file_hash = file_hash
        track.file_modified_at = file_mtime
        track.title = metadata.get("title")
        track.artist = metadata.get("artist")
        track.album = metadata.get("album")
        track.album_artist = metadata.get("album_artist")
        track.track_number = metadata.get("track_number")
        track.disc_number = metadata.get("disc_number")
        track.year = metadata.get("year")
        track.genre = metadata.get("genre")
        track.duration_seconds = metadata.get("duration_seconds")
        track.sample_rate = metadata.get("sample_rate")
        track.bit_depth = metadata.get("bit_depth")
        track.bitrate = metadata.get("bitrate")
        track.format = metadata.get("format")

        # Reset analysis status to trigger re-analysis
        track.analysis_version = 0
        track.analyzed_at = None

        # Queue analysis task
        from app.workers.tasks import analyze_track
        analyze_track.delay(str(track.id))

        return track
