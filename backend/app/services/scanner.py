"""Library scanner service for discovering and tracking audio files."""

import asyncio
import hashlib
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AUDIO_EXTENSIONS, settings
from app.db.models import Track

logger = logging.getLogger(__name__)

# Thread pool for blocking file I/O operations
_file_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="scanner-io")

# Lowercase extensions for fast lookup
_AUDIO_EXT_LOWER = {ext.lower() for ext in AUDIO_EXTENSIONS}


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


def _discover_files_sync(library_path: Path) -> list[Path]:
    """Synchronous file discovery using single-pass os.walk (runs in thread pool).

    Much faster than multiple rglob calls, especially on network volumes.
    Logs progress every 500 directories scanned.
    """
    files = []
    dirs_scanned = 0

    logger.info(f"Starting single-pass directory walk of {library_path}")

    for root, dirs, filenames in os.walk(library_path):
        dirs_scanned += 1

        # Log progress every 500 directories
        if dirs_scanned % 500 == 0:
            logger.info(f"Discovery progress: scanned {dirs_scanned} directories, found {len(files)} audio files so far...")

        # Check each file in this directory
        for filename in filenames:
            # Fast extension check (case-insensitive)
            ext = os.path.splitext(filename)[1].lower()
            if ext in _AUDIO_EXT_LOWER:
                files.append(Path(root) / filename)

    logger.info(f"Discovery complete: scanned {dirs_scanned} directories, found {len(files)} audio files")
    return sorted(files)


def _get_file_info_sync(file_path: Path) -> tuple[str, datetime]:
    """Get file hash and mtime (runs in thread pool)."""
    file_hash = compute_file_hash(file_path)
    file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
    return file_hash, file_mtime


def _extract_metadata_sync(file_path: Path) -> dict:
    """Extract metadata from file (runs in thread pool)."""
    from app.services.metadata import extract_metadata
    return extract_metadata(file_path)


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

        loop = asyncio.get_event_loop()

        # Get all existing tracks from database
        logger.info(f"Loading existing tracks from database...")
        existing_tracks = await self._get_existing_tracks()
        existing_paths = {t.file_path: t for t in existing_tracks}
        logger.info(f"Found {len(existing_tracks)} existing tracks in database")

        # Find all audio files (in thread pool to not block)
        logger.info(f"Discovering audio files in {library_path}...")
        found_files = await loop.run_in_executor(
            _file_executor, _discover_files_sync, library_path
        )
        found_paths = {str(p) for p in found_files}
        logger.info(f"Discovered {len(found_files)} audio files")

        results = {
            "total": len(found_files),
            "new": 0,
            "updated": 0,
            "deleted": 0,
            "unchanged": 0,
            "queued": 0,
        }

        # Process found files
        processed = 0
        for file_path in found_files:
            path_str = str(file_path)
            processed += 1

            # Log progress every 100 files
            if processed % 100 == 0:
                logger.info(f"Progress: {processed}/{len(found_files)} files ({results['new']} new, {results['updated']} updated, {results['unchanged']} unchanged)")

            # Get file info in thread pool
            file_hash, file_mtime = await loop.run_in_executor(
                _file_executor, _get_file_info_sync, file_path
            )

            if path_str not in existing_paths:
                # New file
                logger.info(f"NEW: {file_path.name}")
                await self._create_track(file_path, file_hash, file_mtime)
                results["new"] += 1
                results["queued"] += 1
            else:
                existing = existing_paths[path_str]
                if full_scan or existing.file_hash != file_hash:
                    # Changed file (or full scan requested)
                    logger.info(f"UPDATED: {file_path.name}")
                    await self._update_track(existing, file_hash, file_mtime)
                    results["updated"] += 1
                    results["queued"] += 1
                else:
                    results["unchanged"] += 1

            # Yield control periodically to keep server responsive
            if processed % 50 == 0:
                await asyncio.sleep(0)

        # Handle deleted files - only delete files that were under this library_path
        library_prefix = str(library_path)
        deleted_paths = set(
            p for p in existing_paths.keys()
            if p.startswith(library_prefix)
        ) - found_paths

        if deleted_paths:
            logger.info(f"Removing {len(deleted_paths)} deleted files from database...")
        for path_str in deleted_paths:
            track = existing_paths[path_str]
            logger.info(f"DELETED: {Path(path_str).name}")
            await self.db.delete(track)
            results["deleted"] += 1

        await self.db.commit()

        logger.info(f"Scan complete: {results['new']} new, {results['updated']} updated, {results['deleted']} deleted, {results['unchanged']} unchanged")

        return results


    async def _get_existing_tracks(self) -> list[Track]:
        """Get all tracks currently in database."""
        result = await self.db.execute(select(Track))
        return list(result.scalars().all())

    async def _create_track(
        self, file_path: Path, file_hash: str, file_mtime: datetime
    ) -> Track:
        """Create a new track record."""
        loop = asyncio.get_event_loop()

        # Extract metadata from file (in thread pool)
        metadata = await loop.run_in_executor(
            _file_executor, _extract_metadata_sync, file_path
        )

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
        loop = asyncio.get_event_loop()

        # Re-extract metadata (in thread pool)
        metadata = await loop.run_in_executor(
            _file_executor, _extract_metadata_sync, Path(track.file_path)
        )

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
