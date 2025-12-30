"""Library scanner service for discovering and tracking audio files."""

import asyncio
import hashlib
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AUDIO_EXTENSIONS
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


def _discover_files_sync(library_path: Path, progress_callback=None) -> list[Path]:
    """Synchronous file discovery using single-pass os.walk (runs in thread pool).

    Much faster than multiple rglob calls, especially on network volumes.
    Logs progress every 500 directories scanned.

    Args:
        library_path: Root directory to scan
        progress_callback: Optional callable(dirs_scanned, files_found) for progress updates
    """
    files: list[Path] = []
    dirs_scanned = 0

    logger.info(f"Starting single-pass directory walk of {library_path}")

    for root, dirs, filenames in os.walk(library_path):
        dirs_scanned += 1

        # Log and report progress every 25 directories (more frequent for slow network mounts)
        if dirs_scanned % 25 == 0:
            logger.info(f"Discovery progress: scanned {dirs_scanned} directories, found {len(files)} audio files so far...")
            if progress_callback:
                progress_callback(dirs_scanned, len(files))

        # Check each file in this directory
        for filename in filenames:
            # Fast extension check (case-insensitive)
            ext = os.path.splitext(filename)[1].lower()
            if ext in _AUDIO_EXT_LOWER:
                files.append(Path(root) / filename)

    logger.info(f"Discovery complete: scanned {dirs_scanned} directories, found {len(files)} audio files")
    # Final progress update
    if progress_callback:
        progress_callback(dirs_scanned, len(files))
    return sorted(files)


def _get_file_info_sync(file_path: Path) -> tuple[str, datetime]:
    """Get file hash and mtime (runs in thread pool)."""
    file_hash = compute_file_hash(file_path)
    file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
    return file_hash, file_mtime


def _extract_metadata_sync(file_path: Path) -> dict[str, Any]:
    """Extract metadata from file (runs in thread pool)."""
    from app.services.metadata import extract_metadata
    return extract_metadata(file_path)


class LibraryScanner:
    """Scans music library directories for audio files."""

    def __init__(self, db: AsyncSession, scan_state=None):
        self.db = db
        self.scan_state = scan_state  # Optional ScanState for progress updates

    async def scan(self, library_path: Path, full_scan: bool = False) -> dict[str, Any]:
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
        logger.info("Loading existing tracks from database...")
        existing_tracks = await self._get_existing_tracks()
        existing_paths = {t.file_path: t for t in existing_tracks}
        logger.info(f"Found {len(existing_tracks)} existing tracks in database")

        # Find all audio files (in thread pool to not block)
        logger.info(f"Discovering audio files in {library_path}...")

        # Create progress callback that updates scan_state
        def discovery_progress(dirs_scanned: int, files_found: int):
            if self.scan_state:
                self.scan_state.set_discovery(dirs_scanned, files_found)

        found_files = await loop.run_in_executor(
            _file_executor, _discover_files_sync, library_path, discovery_progress
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

        # Track IDs to queue for analysis after commit
        pending_analysis_ids: list[str] = []

        # Process found files
        processed = 0
        for file_path in found_files:
            path_str = str(file_path)
            processed += 1

            # Update progress state
            if self.scan_state and processed % 10 == 0:
                self.scan_state.set_processing(
                    processed=processed,
                    total=len(found_files),
                    new=results["new"],
                    updated=results["updated"],
                    unchanged=results["unchanged"],
                    current=file_path.name,
                )

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
                track = await self._create_track(file_path, file_hash, file_mtime)
                pending_analysis_ids.append(str(track.id))
                results["new"] += 1
                results["queued"] += 1
            else:
                existing = existing_paths[path_str]
                if full_scan or existing.file_hash != file_hash:
                    # Changed file (or full scan requested)
                    logger.info(f"UPDATED: {file_path.name}")
                    track = await self._update_track(existing, file_hash, file_mtime)
                    pending_analysis_ids.append(str(track.id))
                    results["updated"] += 1
                    results["queued"] += 1
                else:
                    results["unchanged"] += 1

            # Commit and queue analysis tasks periodically
            # This ensures tracks are visible to analyze_track workers BEFORE they're queued
            if processed % 50 == 0:
                await self.db.commit()
                # Queue analysis tasks for committed tracks
                if pending_analysis_ids:
                    from app.workers.tasks import queue_track_analysis
                    for track_id in pending_analysis_ids:
                        queue_track_analysis(track_id)
                    pending_analysis_ids = []
                await asyncio.sleep(0)

        # Commit and queue any remaining tracks from the last batch
        if pending_analysis_ids:
            await self.db.commit()
            from app.workers.tasks import queue_track_analysis
            for track_id in pending_analysis_ids:
                queue_track_analysis(track_id)
            pending_analysis_ids = []

        # Handle missing files - only check files that were under this library_path
        library_prefix = str(library_path)
        missing_paths = set(
            p for p in existing_paths.keys()
            if p.startswith(library_prefix)
        ) - found_paths

        if missing_paths:
            logger.info(f"Found {len(missing_paths)} missing files, searching for relocated files...")
            if self.scan_state:
                self.scan_state.set_cleanup(len(missing_paths))

        # Build filename -> path map for relocated file search
        filename_to_path: dict[str, str] = {}
        for path_str in found_paths:
            filename = Path(path_str).name.lower()
            # Only use first occurrence to avoid ambiguity
            if filename not in filename_to_path:
                filename_to_path[filename] = path_str

        results["relocated"] = 0
        for path_str in missing_paths:
            track = existing_paths[path_str]
            filename = Path(path_str).name.lower()

            # Check if file exists at a new location
            if filename in filename_to_path:
                new_path = filename_to_path[filename]
                # Verify it's not already tracked by another record
                if new_path not in existing_paths:
                    logger.info(f"RELOCATED: {Path(path_str).name} -> {new_path}")
                    track.file_path = new_path
                    results["relocated"] += 1
                    continue

            # File truly deleted
            logger.info(f"DELETED: {Path(path_str).name}")
            await self.db.delete(track)
            results["deleted"] += 1

        await self.db.commit()

        logger.info(f"Scan complete: {results['new']} new, {results['updated']} updated, {results['relocated']} relocated, {results['deleted']} deleted, {results['unchanged']} unchanged")

        return results


    async def _get_existing_tracks(self) -> list[Track]:
        """Get all tracks currently in database."""
        result = await self.db.execute(select(Track))
        return list(result.scalars().all())

    async def _create_track(
        self, file_path: Path, file_hash: str, file_mtime: datetime
    ) -> Track:
        """Create a new track record, or update if it already exists (upsert)."""
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        loop = asyncio.get_event_loop()

        # Extract metadata from file (in thread pool)
        metadata = await loop.run_in_executor(
            _file_executor, _extract_metadata_sync, file_path
        )

        values = {
            "file_path": str(file_path),
            "file_hash": file_hash,
            "file_modified_at": file_mtime,
            "title": metadata.get("title"),
            "artist": metadata.get("artist"),
            "album": metadata.get("album"),
            "album_artist": metadata.get("album_artist"),
            "track_number": metadata.get("track_number"),
            "disc_number": metadata.get("disc_number"),
            "year": metadata.get("year"),
            "genre": metadata.get("genre"),
            "duration_seconds": metadata.get("duration_seconds"),
            "sample_rate": metadata.get("sample_rate"),
            "bit_depth": metadata.get("bit_depth"),
            "bitrate": metadata.get("bitrate"),
            "format": metadata.get("format"),
        }

        # Use upsert to handle race conditions (another process may have inserted this track)
        insert_stmt = pg_insert(Track).values(**values)
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["file_path"],
            set_={
                "file_hash": insert_stmt.excluded.file_hash,
                "file_modified_at": insert_stmt.excluded.file_modified_at,
                "title": insert_stmt.excluded.title,
                "artist": insert_stmt.excluded.artist,
                "album": insert_stmt.excluded.album,
                "album_artist": insert_stmt.excluded.album_artist,
                "track_number": insert_stmt.excluded.track_number,
                "disc_number": insert_stmt.excluded.disc_number,
                "year": insert_stmt.excluded.year,
                "genre": insert_stmt.excluded.genre,
                "duration_seconds": insert_stmt.excluded.duration_seconds,
                "sample_rate": insert_stmt.excluded.sample_rate,
                "bit_depth": insert_stmt.excluded.bit_depth,
                "bitrate": insert_stmt.excluded.bitrate,
                "format": insert_stmt.excluded.format,
            },
        ).returning(Track)

        result = await self.db.execute(upsert_stmt)
        track = result.scalar_one()

        # Note: Analysis is queued by the caller after commit
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

        # Note: Analysis is queued by the caller after commit
        return track
