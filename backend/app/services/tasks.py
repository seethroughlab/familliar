"""Async background tasks for audio analysis and library sync.

Tasks run in-process using asyncio and ProcessPoolExecutor.
Progress is reported via Redis for frontend consumption.
"""

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import redis

from app.config import ANALYSIS_VERSION, settings

logger = logging.getLogger(__name__)

# Redis client for progress reporting
_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Get Redis client for progress updates."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url)
    return _redis_client


# Redis keys for progress tracking
SYNC_PROGRESS_KEY = "familiar:sync:progress"
TASK_FAILURES_KEY = "familiar:task:failures"
MAX_FAILURES_STORED = 50


def _record_task_failure(task_name: str, error: str, track_info: str | None = None) -> None:
    """Record a task failure in Redis for UI visibility."""
    try:
        r = get_redis()
        failure = json.dumps({
            "task": task_name,
            "error": error,
            "track": track_info,
            "timestamp": datetime.now().isoformat(),
        })
        r.lpush(TASK_FAILURES_KEY, failure)
        r.ltrim(TASK_FAILURES_KEY, 0, MAX_FAILURES_STORED - 1)
        r.expire(TASK_FAILURES_KEY, 86400)  # 24 hour expiry
    except Exception as e:
        logger.warning(f"Could not record task failure: {e}")


def get_recent_failures(limit: int = 10) -> list[dict[str, Any]]:
    """Get recent task failures from Redis."""
    try:
        r = get_redis()
        failures: list[bytes] = r.lrange(TASK_FAILURES_KEY, 0, limit - 1)  # type: ignore[assignment]
        return [json.loads(f) for f in failures]
    except Exception:
        return []


def clear_task_failures() -> None:
    """Clear all task failures from Redis."""
    try:
        r = get_redis()
        r.delete(TASK_FAILURES_KEY)
    except Exception:
        pass


# ============================================================================
# Unified Library Sync
# ============================================================================


class SyncProgressReporter:
    """Reports unified sync progress to Redis for API consumption.

    This class provides a single progress view that encompasses:
    - File discovery (finding audio files)
    - Metadata reading (extracting tags from files)
    - Audio analysis (feature extraction, embeddings)
    """

    def __init__(self):
        self.redis = get_redis()
        self.started_at = datetime.now().isoformat()
        self.errors: list[str] = []
        self._update({
            "status": "running",
            "phase": "starting",
            "phase_message": "Starting library sync...",
            "files_discovered": 0,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": 0,
            "updated_tracks": 0,
            "unchanged_tracks": 0,
            "relocated_tracks": 0,
            "marked_missing": 0,
            "recovered": 0,
            "tracks_analyzed": 0,
            "tracks_pending_analysis": 0,
            "tracks_total": 0,
            "analysis_percent": 0,
            "current_item": None,
            "started_at": self.started_at,
            "last_heartbeat": datetime.now().isoformat(),
            "errors": [],
        })

    def _update(self, data: dict[str, Any]) -> None:
        """Update progress in Redis with heartbeat."""
        data["last_heartbeat"] = datetime.now().isoformat()
        data["errors"] = self.errors
        self.redis.set(SYNC_PROGRESS_KEY, json.dumps(data), ex=3600)

    def set_discovering(self, dirs_scanned: int, files_found: int) -> None:
        """Phase 1: File discovery."""
        self._update({
            "status": "running",
            "phase": "discovering",
            "phase_message": f"Discovering files... ({dirs_scanned} dirs, {files_found} files)",
            "files_discovered": files_found,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": 0,
            "updated_tracks": 0,
            "unchanged_tracks": 0,
            "relocated_tracks": 0,
            "marked_missing": 0,
            "recovered": 0,
            "tracks_analyzed": 0,
            "tracks_pending_analysis": 0,
            "tracks_total": 0,
            "analysis_percent": 0,
            "current_item": None,
            "started_at": self.started_at,
        })

    def set_reading(
        self,
        processed: int,
        total: int,
        new: int,
        updated: int,
        unchanged: int,
        current: str | None = None,
        recovered: int = 0,
    ) -> None:
        """Phase 2: Reading metadata from files."""
        pct = int(processed / total * 100) if total > 0 else 0
        self._update({
            "status": "running",
            "phase": "reading",
            "phase_message": f"Reading metadata... {processed}/{total} ({pct}%)",
            "files_discovered": total,
            "files_processed": processed,
            "files_total": total,
            "new_tracks": new,
            "updated_tracks": updated,
            "unchanged_tracks": unchanged,
            "relocated_tracks": 0,
            "marked_missing": 0,
            "recovered": recovered,
            "tracks_analyzed": 0,
            "tracks_pending_analysis": 0,
            "tracks_total": 0,
            "analysis_percent": 0,
            "current_item": current,
            "started_at": self.started_at,
        })

    def set_analyzing(
        self,
        analyzed: int,
        pending: int,
        total: int,
        scan_stats: dict[str, int] | None = None,
    ) -> None:
        """Phase 3: Audio analysis."""
        pct = int(analyzed / total * 100) if total > 0 else 0
        stats = scan_stats or {}
        self._update({
            "status": "running",
            "phase": "analyzing",
            "phase_message": f"Analyzing audio... {analyzed}/{total} ({pct}%)",
            "files_discovered": stats.get("files_total", 0),
            "files_processed": stats.get("files_total", 0),
            "files_total": stats.get("files_total", 0),
            "new_tracks": stats.get("new_tracks", 0),
            "updated_tracks": stats.get("updated_tracks", 0),
            "unchanged_tracks": stats.get("unchanged_tracks", 0),
            "relocated_tracks": stats.get("relocated_tracks", 0),
            "marked_missing": stats.get("marked_missing", 0),
            "recovered": stats.get("recovered", 0),
            "tracks_analyzed": analyzed,
            "tracks_pending_analysis": pending,
            "tracks_total": total,
            "analysis_percent": pct,
            "current_item": None,
            "started_at": self.started_at,
        })

    def complete(
        self,
        new: int = 0,
        updated: int = 0,
        unchanged: int = 0,
        relocated: int = 0,
        marked_missing: int = 0,
        recovered: int = 0,
        analyzed: int = 0,
        total_tracks: int = 0,
    ) -> None:
        """Mark sync as complete."""
        self._update({
            "status": "completed",
            "phase": "complete",
            "phase_message": f"Complete: {new} new, {updated} updated, {analyzed} analyzed",
            "files_discovered": 0,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": new,
            "updated_tracks": updated,
            "unchanged_tracks": unchanged,
            "relocated_tracks": relocated,
            "marked_missing": marked_missing,
            "recovered": recovered,
            "tracks_analyzed": analyzed,
            "tracks_pending_analysis": 0,
            "tracks_total": total_tracks,
            "analysis_percent": 100 if total_tracks > 0 else 0,
            "current_item": None,
            "started_at": self.started_at,
        })

    def error(self, msg: str) -> None:
        """Mark sync as failed."""
        self.errors.append(msg)
        self._update({
            "status": "error",
            "phase": "error",
            "phase_message": msg,
            "files_discovered": 0,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": 0,
            "updated_tracks": 0,
            "unchanged_tracks": 0,
            "relocated_tracks": 0,
            "marked_missing": 0,
            "recovered": 0,
            "tracks_analyzed": 0,
            "tracks_pending_analysis": 0,
            "tracks_total": 0,
            "analysis_percent": 0,
            "current_item": None,
            "started_at": self.started_at,
        })


def get_sync_progress() -> dict[str, Any] | None:
    """Get current sync progress from Redis."""
    try:
        r = get_redis()
        data: bytes | None = r.get(SYNC_PROGRESS_KEY)  # type: ignore[assignment]
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Failed to get sync progress: {e}")
    return None


def clear_sync_progress() -> None:
    """Clear sync progress from Redis."""
    try:
        r = get_redis()
        r.delete(SYNC_PROGRESS_KEY)
    except Exception as e:
        logger.error(f"Failed to clear sync progress: {e}")


async def run_library_sync(
    reread_unchanged: bool = False,
) -> dict[str, Any]:
    """Run a complete library sync: scan + analysis.

    This is the main entry point for unified sync operations.
    Orchestrates the scan and analysis phases with unified progress.

    Args:
        reread_unchanged: Re-read metadata for files even if unchanged.

    Returns:
        Dict with status and statistics.
    """
    import asyncio

    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.db.models import Track

    progress = SyncProgressReporter()

    try:
        # Phase 1 & 2: Run the scan (discovery + metadata reading)
        scan_result = await _run_scan_for_sync(
            reread_unchanged=reread_unchanged,
            sync_progress=progress,
        )

        if scan_result.get("status") == "error":
            progress.error(scan_result.get("error", "Scan failed"))
            return scan_result

        # Phase 3: Analysis - wait for all pending analysis to complete
        scan_stats = {
            "files_total": scan_result.get("new", 0) + scan_result.get("updated", 0) + scan_result.get("unchanged", 0),
            "new_tracks": scan_result.get("new", 0),
            "updated_tracks": scan_result.get("updated", 0),
            "unchanged_tracks": scan_result.get("unchanged", 0),
            "relocated_tracks": scan_result.get("relocated", 0),
            "marked_missing": scan_result.get("marked_missing", 0),
            "recovered": scan_result.get("recovered", 0),
        }

        # Create engine for analysis tracking
        local_engine = create_async_engine(
            settings.database_url,
            echo=False,
            future=True,
        )
        local_session_maker = async_sessionmaker(
            local_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        try:
            analyzed_count = 0
            last_pending = -1

            # Poll until analysis is complete
            while True:
                async with local_session_maker() as db:
                    # Get counts
                    total_result = await db.execute(select(func.count(Track.id)))
                    total_tracks = total_result.scalar() or 0

                    analyzed_result = await db.execute(
                        select(func.count(Track.id)).where(
                            Track.analysis_version >= ANALYSIS_VERSION
                        )
                    )
                    analyzed_tracks = analyzed_result.scalar() or 0
                    pending_tracks = total_tracks - analyzed_tracks

                if pending_tracks == 0:
                    analyzed_count = analyzed_tracks
                    break

                # Queue more tracks for analysis if needed
                if pending_tracks > 0 and (last_pending == -1 or pending_tracks >= last_pending):
                    await queue_unanalyzed_tracks(limit=100)

                last_pending = pending_tracks
                progress.set_analyzing(
                    analyzed=analyzed_tracks,
                    pending=pending_tracks,
                    total=total_tracks,
                    scan_stats=scan_stats,
                )

                # Wait before next poll
                await asyncio.sleep(2)

        finally:
            await local_engine.dispose()

        # Mark complete
        progress.complete(
            new=scan_result.get("new", 0),
            updated=scan_result.get("updated", 0),
            unchanged=scan_result.get("unchanged", 0),
            relocated=scan_result.get("relocated", 0),
            marked_missing=scan_result.get("marked_missing", 0),
            recovered=scan_result.get("recovered", 0),
            analyzed=analyzed_count,
            total_tracks=analyzed_count,
        )

        logger.info(f"Library sync complete: {scan_result}, analyzed={analyzed_count}")
        return {"status": "success", **scan_result, "analyzed": analyzed_count}

    except Exception as e:
        logger.error(f"Library sync failed: {e}", exc_info=True)
        progress.error(str(e))
        return {"status": "error", "error": str(e)}


async def _run_scan_for_sync(
    reread_unchanged: bool,
    sync_progress: SyncProgressReporter,
) -> dict[str, Any]:
    """Run library scan with unified sync progress reporting.

    This is a modified version of run_library_scan that reports to the sync progress.
    """
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.services.scanner import LibraryScanner

    results = {
        "new": 0,
        "updated": 0,
        "unchanged": 0,
        "deleted": 0,
        "marked_missing": 0,
        "still_missing": 0,
        "relocated": 0,
        "recovered": 0,
    }

    # Pre-scan validation
    library_paths = settings.music_library_paths
    if not library_paths:
        error_msg = "No music library paths configured."
        return {"status": "error", "error": error_msg}

    valid_paths = []
    for path in library_paths:
        if path.exists() and path.is_dir():
            try:
                if any(path.iterdir()):
                    valid_paths.append(path)
            except PermissionError:
                continue

    if not valid_paths:
        error_msg = f"No valid library paths found: {[str(p) for p in library_paths]}"
        return {"status": "error", "error": error_msg}

    # Create async engine
    local_engine = create_async_engine(
        settings.database_url,
        echo=False,
        future=True,
    )
    local_session_maker = async_sessionmaker(
        local_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    try:
        async with local_session_maker() as db:
            # Create scanner with sync progress adapter
            scanner = LibraryScanner(
                db,
                scan_state=_SyncProgressAdapter(sync_progress),
            )

            for library_path in valid_paths:
                scan_results = await scanner.scan(
                    library_path,
                    reread_unchanged=reread_unchanged,
                    reanalyze_changed=True,
                )
                results["new"] += scan_results.get("new", 0)
                results["updated"] += scan_results.get("updated", 0)
                results["unchanged"] += scan_results.get("unchanged", 0)
                results["deleted"] += scan_results.get("deleted", 0)
                results["marked_missing"] += scan_results.get("marked_missing", 0)
                results["still_missing"] += scan_results.get("still_missing", 0)
                results["relocated"] += scan_results.get("relocated", 0)
                results["recovered"] += scan_results.get("recovered", 0)

            # Cleanup orphans
            orphan_results = await scanner.cleanup_orphaned_tracks(valid_paths)
            results["marked_missing"] += orphan_results.get("orphaned", 0)

        # Queue analysis
        await queue_unanalyzed_tracks(limit=500)

        return {"status": "success", **results}

    except Exception as e:
        logger.error(f"Scan for sync failed: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}
    finally:
        await local_engine.dispose()


class _SyncProgressAdapter:
    """Adapts SyncProgressReporter to the scanner's expected progress interface.

    This allows the LibraryScanner to report progress through the unified sync progress.
    """

    def __init__(self, sync_progress: SyncProgressReporter):
        self.sync_progress = sync_progress
        self.started_at = sync_progress.started_at
        self.warnings: list[str] = []

    def set_discovery(self, dirs_scanned: int, files_found: int) -> None:
        self.sync_progress.set_discovering(dirs_scanned, files_found)

    def set_processing(
        self,
        processed: int,
        total: int,
        new: int,
        updated: int,
        unchanged: int,
        current: str | None = None,
        recovered: int = 0,
    ) -> None:
        self.sync_progress.set_reading(
            processed=processed,
            total=total,
            new=new,
            updated=updated,
            unchanged=unchanged,
            current=current,
            recovered=recovered,
        )

    def set_cleanup(self, marked_missing: int, still_missing: int = 0) -> None:
        # Just update phase message, keep in reading phase
        pass

    def complete(self, *args, **kwargs) -> None:
        # Don't mark complete - sync orchestrator handles this
        pass

    def error(self, msg: str) -> None:
        self.sync_progress.error(msg)


def run_track_analysis(track_id: str) -> dict[str, Any]:
    """Analyze a single track - runs in subprocess via ProcessPoolExecutor.

    This function is designed to run in a spawned process to isolate
    librosa/numpy crashes from the main API process.
    """
    from sqlalchemy import select

    from app.db.models import Track, TrackAnalysis
    from app.db.session import sync_session_maker
    from app.services.analysis import (
        AnalysisError,
        extract_embedding,
        extract_features,
        generate_fingerprint,
        identify_track,
    )
    from app.services.artwork import extract_and_save_artwork

    track_info = None
    try:
        with sync_session_maker() as db:
            result = db.execute(
                select(Track).where(Track.id == UUID(track_id))
            )
            track = result.scalar_one_or_none()

            if not track:
                return {"error": f"Track not found: {track_id}", "permanent": True}

            track_info = f"{track.artist} - {track.title}"
            file_path = Path(track.file_path)

            if not file_path.exists():
                return {"error": f"File not found: {track.file_path}", "permanent": True}

            logger.info(f"Analyzing track: {track.title} by {track.artist}")

            # Extract and save artwork
            artwork_hash = extract_and_save_artwork(
                file_path,
                artist=track.artist,
                album=track.album,
            )

            # Extract audio features with librosa
            features: dict[str, Any] = extract_features(file_path)

            # Generate CLAP embedding for similarity search
            embedding = extract_embedding(file_path)

            # Generate AcoustID fingerprint
            acoustid_fingerprint = None
            fp_result = generate_fingerprint(file_path)
            if fp_result:
                _, acoustid_fingerprint = fp_result

            # Try to identify track via AcoustID
            acoustid_metadata = None
            musicbrainz_recording_id = None
            if acoustid_fingerprint:
                id_result = identify_track(file_path)
                if id_result.get("metadata"):
                    acoustid_metadata = id_result["metadata"]
                    musicbrainz_recording_id = acoustid_metadata.get("musicbrainz_recording_id")

            # Enrich with MusicBrainz metadata
            from app.services.musicbrainz import enrich_track
            musicbrainz_metadata = enrich_track(
                title=track.title,
                artist=track.artist,
                musicbrainz_recording_id=musicbrainz_recording_id,
            )

            if musicbrainz_metadata:
                features["musicbrainz"] = musicbrainz_metadata

            # Create or update analysis record
            analysis = TrackAnalysis(
                track_id=track.id,
                version=ANALYSIS_VERSION,
                features=features,
                embedding=embedding,
                acoustid=acoustid_fingerprint,
            )

            existing = db.execute(
                select(TrackAnalysis)
                .where(TrackAnalysis.track_id == track.id)
                .where(TrackAnalysis.version == ANALYSIS_VERSION)
            )
            existing_analysis = existing.scalar_one_or_none()

            if existing_analysis:
                existing_analysis.features = features
                existing_analysis.embedding = embedding
                existing_analysis.acoustid = acoustid_fingerprint
            else:
                db.add(analysis)

            # Update track analysis status
            track.analysis_version = ANALYSIS_VERSION
            track.analyzed_at = datetime.utcnow()
            track.analysis_error = None
            track.analysis_failed_at = None

            db.commit()

            logger.info(
                f"Analysis complete for {track.title}: "
                f"BPM={features.get('bpm')}, Key={features.get('key')}, "
                f"Embedding={'Yes' if embedding else 'No'}"
            )

            return {
                "track_id": track_id,
                "status": "success",
                "artwork_extracted": artwork_hash is not None,
                "features_extracted": bool(features.get("bpm")),
                "embedding_generated": embedding is not None,
                "bpm": features.get("bpm"),
                "key": features.get("key"),
            }

    except AnalysisError as e:
        error_msg = str(e)[:500]
        logger.error(f"Analysis error for {track_id}: {error_msg}")
        _record_task_failure("analyze_track", error_msg, track_info)
        return {"error": error_msg, "status": "failed", "permanent": True}
    except Exception as e:
        error_msg = str(e)[:500]
        logger.error(f"Error analyzing track {track_id}: {error_msg}")
        _record_task_failure("analyze_track", error_msg, track_info)

        # Record failure in database
        try:
            with sync_session_maker() as db:
                result = db.execute(
                    select(Track).where(Track.id == UUID(track_id))
                )
                track = result.scalar_one_or_none()
                if track:
                    track.analysis_error = error_msg
                    track.analysis_failed_at = datetime.utcnow()
                    db.commit()
        except Exception as db_error:
            logger.warning(f"Could not record analysis failure to DB: {db_error}")

        return {"error": error_msg, "status": "failed", "permanent": True}


async def queue_unanalyzed_tracks(limit: int = 500) -> int:
    """Queue analysis for tracks that haven't been analyzed yet.

    Returns the number of tracks queued.
    """
    from sqlalchemy import and_, or_, select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.db.models import Track
    from app.services.background import get_background_manager

    local_engine = create_async_engine(
        settings.database_url,
        echo=False,
        future=True,
    )
    local_session_maker = async_sessionmaker(
        local_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    queued = 0
    try:
        async with local_session_maker() as db:
            # Skip tracks that failed recently (within 24 hours)
            failure_cutoff = datetime.utcnow() - timedelta(hours=24)

            result = await db.execute(
                select(Track.id)
                .where(
                    and_(
                        or_(
                            Track.analysis_version == 0,
                            Track.analysis_version < ANALYSIS_VERSION,
                            Track.analyzed_at.is_(None),
                        ),
                        or_(
                            Track.analysis_failed_at.is_(None),
                            Track.analysis_failed_at < failure_cutoff,
                        ),
                    )
                )
                .limit(limit)
            )
            track_ids = [str(row[0]) for row in result.fetchall()]

            if not track_ids:
                logger.info("No unanalyzed tracks found")
                return 0

            # Queue each track for analysis
            bg = get_background_manager()
            for track_id in track_ids:
                await bg.run_analysis(track_id)
                queued += 1

            logger.info(f"Queued {queued} tracks for analysis")

    finally:
        await local_engine.dispose()

    return queued


# ============================================================================
# Spotify Sync
# ============================================================================

SPOTIFY_SYNC_PROGRESS_KEY = "familiar:spotify:sync:progress"


class SpotifySyncProgressReporter:
    """Reports Spotify sync progress to Redis for API consumption."""

    def __init__(self, profile_id: str):
        self.redis = get_redis()
        self.profile_id = profile_id
        self.started_at = datetime.now().isoformat()
        self._update_progress({
            "status": "running",
            "phase": "connecting",
            "message": "Connecting to Spotify...",
            "profile_id": profile_id,
            "tracks_fetched": 0,
            "tracks_processed": 0,
            "tracks_total": 0,
            "new_favorites": 0,
            "matched": 0,
            "unmatched": 0,
            "current_track": None,
            "started_at": self.started_at,
            "last_heartbeat": datetime.now().isoformat(),
            "errors": [],
        })

    def _update_progress(self, data: dict[str, Any]) -> None:
        """Update progress in Redis with heartbeat."""
        data["last_heartbeat"] = datetime.now().isoformat()
        self.redis.set(SPOTIFY_SYNC_PROGRESS_KEY, json.dumps(data), ex=3600)

    def _get_current(self) -> dict[str, Any]:
        """Get current progress from Redis."""
        data: bytes | None = self.redis.get(SPOTIFY_SYNC_PROGRESS_KEY)  # type: ignore[assignment]
        if data:
            return json.loads(data)
        return {}

    def set_fetching(self, fetched: int, message: str | None = None) -> None:
        """Update fetching progress."""
        self._update_progress({
            "status": "running",
            "phase": "fetching",
            "message": message or f"Fetching saved tracks from Spotify... ({fetched} tracks)",
            "profile_id": self.profile_id,
            "tracks_fetched": fetched,
            "tracks_processed": 0,
            "tracks_total": 0,
            "new_favorites": 0,
            "matched": 0,
            "unmatched": 0,
            "current_track": None,
            "started_at": self.started_at,
            "errors": [],
        })

    def set_matching(
        self,
        processed: int,
        total: int,
        new: int,
        matched: int,
        unmatched: int,
        current: str | None = None,
    ) -> None:
        """Update matching progress."""
        pct = int(processed / total * 100) if total > 0 else 0
        self._update_progress({
            "status": "running",
            "phase": "matching",
            "message": f"Matching to local library... {processed}/{total} ({pct}%)",
            "profile_id": self.profile_id,
            "tracks_fetched": total,
            "tracks_processed": processed,
            "tracks_total": total,
            "new_favorites": new,
            "matched": matched,
            "unmatched": unmatched,
            "current_track": current,
            "started_at": self.started_at,
            "errors": [],
        })

    def complete(self, fetched: int, new: int, matched: int, unmatched: int) -> None:
        """Mark sync as complete."""
        self._update_progress({
            "status": "completed",
            "phase": "complete",
            "message": f"Complete: {fetched} tracks synced, {matched} matched to local library",
            "profile_id": self.profile_id,
            "tracks_fetched": fetched,
            "tracks_processed": fetched,
            "tracks_total": fetched,
            "new_favorites": new,
            "matched": matched,
            "unmatched": unmatched,
            "current_track": None,
            "started_at": self.started_at,
            "errors": [],
        })

    def error(self, msg: str) -> None:
        """Mark sync as failed."""
        current = self._get_current()
        current["status"] = "error"
        current["message"] = msg
        if "errors" not in current:
            current["errors"] = []
        current["errors"].append(msg)
        self._update_progress(current)


def get_spotify_sync_progress() -> dict[str, Any] | None:
    """Get current Spotify sync progress from Redis."""
    try:
        r = get_redis()
        data: bytes | None = r.get(SPOTIFY_SYNC_PROGRESS_KEY)  # type: ignore[assignment]
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Failed to get Spotify sync progress: {e}")
    return None


def clear_spotify_sync_progress() -> None:
    """Clear Spotify sync progress from Redis."""
    try:
        r = get_redis()
        r.delete(SPOTIFY_SYNC_PROGRESS_KEY)
    except Exception as e:
        logger.error(f"Failed to clear Spotify sync progress: {e}")


async def run_spotify_sync(
    profile_id: str,
    include_top_tracks: bool = True,
    favorite_matched: bool = False,
) -> dict[str, Any]:
    """Sync Spotify favorites for a profile."""
    from datetime import datetime as dt

    from spotipy.exceptions import SpotifyException
    from sqlalchemy import delete, select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.db.models import ProfileFavorite, SpotifyFavorite, SpotifyProfile
    from app.services.spotify import SpotifyService

    progress = SpotifySyncProgressReporter(profile_id)
    profile_uuid = UUID(profile_id)

    stats = {
        "fetched": 0,
        "new": 0,
        "matched": 0,
        "unmatched": 0,
        "top_tracks_fetched": 0,
        "top_tracks_new": 0,
        "favorited": 0,
    }

    local_engine = create_async_engine(
        settings.database_url,
        echo=False,
        future=True,
    )
    local_session_maker = async_sessionmaker(
        local_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    try:
        async with local_session_maker() as db:
            spotify_service = SpotifyService()
            client = await spotify_service.get_client(db, profile_uuid)

            if not client:
                raise ValueError("Spotify not connected - please reconnect your account")

            # Clear existing favorites for full sync
            await db.execute(
                delete(SpotifyFavorite).where(SpotifyFavorite.profile_id == profile_uuid)
            )
            await db.commit()

            # Fetch saved tracks
            all_tracks: list[dict[str, Any]] = []
            offset = 0
            limit = 50

            progress.set_fetching(0, "Fetching saved tracks from Spotify...")

            while True:
                try:
                    results = client.current_user_saved_tracks(limit=limit, offset=offset)
                except SpotifyException as e:
                    raise ValueError(f"Spotify API error: {e.msg if hasattr(e, 'msg') else str(e)}")

                tracks = results.get("items", [])
                if not tracks:
                    break

                all_tracks.extend(tracks)
                stats["fetched"] = len(all_tracks)
                progress.set_fetching(len(all_tracks))

                offset += limit
                if offset > 2000:
                    break

            added_track_ids: set[str] = set()
            matched_local_track_ids: list[UUID] = []

            # Process tracks
            for i, item in enumerate(all_tracks):
                spotify_track = item.get("track")
                if not spotify_track:
                    continue

                track_id = spotify_track["id"]
                if track_id in added_track_ids:
                    continue

                added_at = item.get("added_at")
                track_name = spotify_track.get("name", "Unknown")
                artists = spotify_track.get("artists", [])
                artist_name = artists[0]["name"] if artists else "Unknown"

                if i % 10 == 0:
                    progress.set_matching(
                        processed=i,
                        total=len(all_tracks),
                        new=stats["new"],
                        matched=stats["matched"],
                        unmatched=stats["unmatched"],
                        current=f"{artist_name} - {track_name}",
                    )

                # Try to match to local library
                local_match = await _match_to_local(db, spotify_track)

                parsed_added_at = None
                if added_at:
                    parsed_dt = dt.fromisoformat(added_at.replace("Z", "+00:00"))
                    parsed_added_at = parsed_dt.replace(tzinfo=None)

                favorite = SpotifyFavorite(
                    profile_id=profile_uuid,
                    spotify_track_id=track_id,
                    matched_track_id=local_match.id if local_match else None,
                    track_data=_extract_track_data(spotify_track),
                    added_at=parsed_added_at,
                )
                db.add(favorite)
                added_track_ids.add(track_id)
                stats["new"] += 1

                if local_match:
                    stats["matched"] += 1
                    if favorite_matched:
                        matched_local_track_ids.append(local_match.id)
                else:
                    stats["unmatched"] += 1

            # Batch process ProfileFavorites
            if favorite_matched and matched_local_track_ids:
                existing_result = await db.execute(
                    select(ProfileFavorite.track_id).where(
                        ProfileFavorite.profile_id == profile_uuid,
                        ProfileFavorite.track_id.in_(matched_local_track_ids),
                    )
                )
                existing_favs = {row[0] for row in existing_result.fetchall()}

                new_favs = [
                    ProfileFavorite(profile_id=profile_uuid, track_id=tid)
                    for tid in matched_local_track_ids
                    if tid not in existing_favs
                ]
                if new_favs:
                    db.add_all(new_favs)
                    stats["favorited"] = len(new_favs)

            # Update last sync time
            profile_result = await db.execute(
                select(SpotifyProfile).where(SpotifyProfile.profile_id == profile_uuid)
            )
            spotify_profile = profile_result.scalar_one_or_none()
            if spotify_profile:
                spotify_profile.last_sync_at = dt.utcnow()

            await db.commit()

        progress.complete(
            fetched=stats["fetched"],
            new=stats["new"],
            matched=stats["matched"],
            unmatched=stats["unmatched"],
        )

        return {"status": "success", **stats}

    except ValueError as e:
        logger.error(f"Spotify sync failed: {e}")
        progress.error(str(e))
        return {"status": "error", "error": str(e)}
    except Exception as e:
        logger.error(f"Spotify sync failed unexpectedly: {e}", exc_info=True)
        progress.error(f"Unexpected error: {str(e)}")
        return {"status": "error", "error": str(e)}
    finally:
        await local_engine.dispose()


async def _match_to_local(db, spotify_track: dict[str, Any]):
    """Try to match a Spotify track to local library."""
    from sqlalchemy import func, select

    from app.db.models import Track

    isrc = spotify_track.get("external_ids", {}).get("isrc")
    track_name = spotify_track.get("name", "").lower().strip()
    artists = spotify_track.get("artists", [])
    artist_name = artists[0]["name"].lower().strip() if artists else ""

    if isrc:
        result = await db.execute(select(Track).where(Track.isrc == isrc))
        match = result.scalar_one_or_none()
        if match:
            return match

    if track_name and artist_name:
        result = await db.execute(
            select(Track).where(
                func.lower(Track.title) == track_name,
                func.lower(Track.artist) == artist_name,
            ).limit(1)
        )
        match = result.scalars().first()
        if match:
            return match

    return None


def _extract_track_data(spotify_track: dict[str, Any]) -> dict[str, Any]:
    """Extract relevant data from Spotify track object."""
    artists = spotify_track.get("artists", [])
    album = spotify_track.get("album", {})

    return {
        "name": spotify_track.get("name"),
        "artist": artists[0]["name"] if artists else None,
        "artist_id": artists[0]["id"] if artists else None,
        "album": album.get("name"),
        "album_id": album.get("id"),
        "isrc": spotify_track.get("external_ids", {}).get("isrc"),
        "duration_ms": spotify_track.get("duration_ms"),
        "popularity": spotify_track.get("popularity"),
        "preview_url": spotify_track.get("preview_url"),
        "external_url": spotify_track.get("external_urls", {}).get("spotify"),
    }


# ============================================================================
# New Releases Check
# ============================================================================

NEW_RELEASES_PROGRESS_KEY = "familiar:new_releases:progress"


class NewReleasesProgressReporter:
    """Reports new releases check progress to Redis for API consumption."""

    def __init__(self, profile_id: str | None = None):
        self.redis = get_redis()
        self.profile_id = profile_id
        self.started_at = datetime.now().isoformat()
        self._update_progress({
            "status": "running",
            "phase": "starting",
            "message": "Starting new releases check...",
            "profile_id": profile_id,
            "artists_total": 0,
            "artists_checked": 0,
            "releases_found": 0,
            "releases_new": 0,
            "current_artist": None,
            "started_at": self.started_at,
            "last_heartbeat": datetime.now().isoformat(),
            "errors": [],
        })

    def _update_progress(self, data: dict[str, Any]) -> None:
        data["last_heartbeat"] = datetime.now().isoformat()
        self.redis.set(NEW_RELEASES_PROGRESS_KEY, json.dumps(data), ex=3600)

    def _get_current(self) -> dict[str, Any]:
        data: bytes | None = self.redis.get(NEW_RELEASES_PROGRESS_KEY)  # type: ignore[assignment]
        if data:
            return json.loads(data)
        return {}

    def set_checking(
        self,
        checked: int,
        total: int,
        found: int,
        new: int,
        current_artist: str | None = None,
    ) -> None:
        pct = int(checked / total * 100) if total > 0 else 0
        self._update_progress({
            "status": "running",
            "phase": "checking",
            "message": f"Checking artists... {checked}/{total} ({pct}%)",
            "profile_id": self.profile_id,
            "artists_total": total,
            "artists_checked": checked,
            "releases_found": found,
            "releases_new": new,
            "current_artist": current_artist,
            "started_at": self.started_at,
            "errors": [],
        })

    def complete(self, checked: int, found: int, new: int) -> None:
        self._update_progress({
            "status": "completed",
            "phase": "complete",
            "message": f"Complete: {checked} artists checked, {new} new releases found",
            "profile_id": self.profile_id,
            "artists_total": checked,
            "artists_checked": checked,
            "releases_found": found,
            "releases_new": new,
            "current_artist": None,
            "started_at": self.started_at,
            "errors": [],
        })

    def error(self, msg: str) -> None:
        current = self._get_current()
        current["status"] = "error"
        current["message"] = msg
        if "errors" not in current:
            current["errors"] = []
        current["errors"].append(msg)
        self._update_progress(current)


def get_new_releases_progress() -> dict[str, Any] | None:
    """Get current new releases check progress from Redis."""
    try:
        r = get_redis()
        data: bytes | None = r.get(NEW_RELEASES_PROGRESS_KEY)  # type: ignore[assignment]
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Failed to get new releases progress: {e}")
    return None


def clear_new_releases_progress() -> None:
    """Clear new releases check progress from Redis."""
    try:
        r = get_redis()
        r.delete(NEW_RELEASES_PROGRESS_KEY)
    except Exception as e:
        logger.error(f"Failed to clear new releases progress: {e}")


async def run_new_releases_check(
    profile_id: str | None = None,
    days_back: int = 90,
    force: bool = False,
) -> dict[str, Any]:
    """Check for new releases from artists in the library."""

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.services.musicbrainz import get_artist_releases_recent, search_artist
    from app.services.new_releases import NewReleasesService
    from app.services.spotify import SpotifyArtistService

    progress = NewReleasesProgressReporter(profile_id)

    stats = {
        "artists_total": 0,
        "artists_checked": 0,
        "artists_skipped_cache": 0,
        "releases_found": 0,
        "releases_new": 0,
        "spotify_queries": 0,
        "musicbrainz_queries": 0,
    }

    local_engine = create_async_engine(
        settings.database_url,
        echo=False,
        future=True,
    )
    local_session_maker = async_sessionmaker(
        local_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    try:
        async with local_session_maker() as db:
            service = NewReleasesService(db)
            spotify_service = None

            if profile_id:
                spotify_service = SpotifyArtistService(db)

            artists = await service.get_library_artists()
            stats["artists_total"] = len(artists)

            if not artists:
                progress.complete(0, 0, 0)
                return {"status": "success", **stats}

            for i, artist_info in enumerate(artists):
                artist_name = artist_info["name"]
                normalized = artist_info["normalized_name"]
                mb_artist_id = artist_info.get("musicbrainz_artist_id")

                if i % 5 == 0:
                    progress.set_checking(
                        checked=i,
                        total=len(artists),
                        found=stats["releases_found"],
                        new=stats["releases_new"],
                        current_artist=artist_name,
                    )

                if not force:
                    should_check = await service.should_check_artist(normalized)
                    if not should_check:
                        stats["artists_skipped_cache"] += 1
                        continue

                stats["artists_checked"] += 1
                spotify_artist_id = None
                releases_for_artist: list[dict[str, Any]] = []

                # Try Spotify first
                if spotify_service and profile_id:
                    try:
                        spotify_artist = await spotify_service.search_artist(
                            UUID(profile_id), artist_name
                        )
                        if spotify_artist:
                            spotify_artist_id = spotify_artist["id"]
                            recent = await spotify_service.get_artist_albums_recent(
                                UUID(profile_id),
                                spotify_artist_id,
                                days_back=days_back,
                            )
                            stats["spotify_queries"] += 1

                            for album in recent:
                                releases_for_artist.append({
                                    "release_id": album["id"],
                                    "source": "spotify",
                                    "release_name": album["name"],
                                    "release_type": album.get("album_type"),
                                    "release_date_str": album.get("release_date"),
                                    "release_date": album.get("release_date_parsed"),
                                    "artwork_url": album["images"][0]["url"] if album.get("images") else None,
                                    "external_url": album.get("external_url"),
                                    "track_count": album.get("total_tracks"),
                                    "spotify_artist_id": spotify_artist_id,
                                })

                        time.sleep(0.1)  # Rate limiting

                    except Exception as e:
                        logger.warning(f"Spotify lookup failed for {artist_name}: {e}")

                # Fall back to MusicBrainz
                if not releases_for_artist:
                    try:
                        mb_id_to_use = mb_artist_id
                        if not mb_id_to_use:
                            mb_result = search_artist(artist_name)
                            if mb_result and mb_result.get("score", 0) >= 80:
                                mb_id_to_use = mb_result["musicbrainz_artist_id"]

                        if mb_id_to_use:
                            recent = get_artist_releases_recent(mb_id_to_use, days_back=days_back)
                            stats["musicbrainz_queries"] += 1

                            for release in recent:
                                releases_for_artist.append({
                                    "release_id": release["musicbrainz_release_group_id"],
                                    "source": "musicbrainz",
                                    "release_name": release["title"],
                                    "release_type": release.get("release_type"),
                                    "release_date_str": release.get("release_date"),
                                    "release_date": release.get("release_date_parsed"),
                                    "musicbrainz_artist_id": mb_id_to_use,
                                })

                    except Exception as e:
                        logger.warning(f"MusicBrainz lookup failed for {artist_name}: {e}")

                # Save discovered releases
                for release in releases_for_artist:
                    stats["releases_found"] += 1

                    release_date = None
                    if release.get("release_date"):
                        try:
                            from datetime import datetime as dt
                            release_date = dt.fromisoformat(release["release_date"])
                        except Exception:
                            pass

                    saved = await service.save_discovered_release(
                        artist_name=artist_name,
                        release_id=release["release_id"],
                        source=release["source"],
                        release_name=release["release_name"],
                        release_type=release.get("release_type"),
                        release_date=release_date,
                        artwork_url=release.get("artwork_url"),
                        external_url=release.get("external_url"),
                        track_count=release.get("track_count"),
                        musicbrainz_artist_id=release.get("musicbrainz_artist_id"),
                        spotify_artist_id=release.get("spotify_artist_id"),
                    )
                    if saved:
                        stats["releases_new"] += 1

                await service.update_artist_cache(
                    artist_normalized=normalized,
                    musicbrainz_id=mb_artist_id,
                    spotify_id=spotify_artist_id,
                )

            await db.commit()

        progress.complete(
            checked=stats["artists_checked"],
            found=stats["releases_found"],
            new=stats["releases_new"],
        )

        return {"status": "success", **stats}

    except Exception as e:
        logger.error(f"New releases check failed: {e}", exc_info=True)
        progress.error(str(e))
        return {"status": "error", "error": str(e)}
    finally:
        await local_engine.dispose()
