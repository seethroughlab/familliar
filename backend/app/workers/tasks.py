"""Celery tasks for audio analysis and library scanning."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import redis
from sqlalchemy import select

from app.config import ANALYSIS_VERSION, settings
from app.db.models import Track, TrackAnalysis
from app.db.session import sync_session_maker
from app.services.artwork import extract_and_save_artwork
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Redis client for progress reporting
_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Get Redis client for progress updates."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url)
    return _redis_client


# Redis key for scan progress
SCAN_PROGRESS_KEY = "familiar:scan:progress"


@celery_app.task(bind=True, max_retries=3)  # type: ignore[misc]
def analyze_track(self, track_id: str) -> dict[str, Any]:
    """Analyze a track and save results.

    This is the main analysis task that orchestrates:
    1. Metadata extraction (already done during scan)
    2. Artwork extraction
    3. Audio feature extraction with librosa
    4. CLAP embedding generation for similarity search

    Args:
        track_id: UUID of the track to analyze

    Returns:
        Dict with analysis results
    """
    try:
        with sync_session_maker() as db:
            # Get track from database
            result = db.execute(
                select(Track).where(Track.id == UUID(track_id))
            )
            track = result.scalar_one_or_none()

            if not track:
                return {"error": f"Track not found: {track_id}"}

            file_path = Path(track.file_path)
            if not file_path.exists():
                return {"error": f"File not found: {track.file_path}"}

            logger.info(f"Analyzing track: {track.title} by {track.artist}")

            # Extract and save artwork
            artwork_hash = extract_and_save_artwork(
                file_path,
                artist=track.artist,
                album=track.album,
            )

            # Import analysis functions (lazy import to avoid loading models on worker start)
            from app.services.analysis import (
                extract_embedding,
                extract_features,
                generate_fingerprint,
                identify_track,
            )

            # Extract audio features with librosa
            features = extract_features(file_path)

            # Generate CLAP embedding for similarity search
            embedding = extract_embedding(file_path)

            # Generate AcoustID fingerprint
            acoustid_fingerprint = None
            fp_result = generate_fingerprint(file_path)
            if fp_result:
                _, acoustid_fingerprint = fp_result

            # Try to identify track via AcoustID (if API key is set)
            acoustid_metadata = None
            musicbrainz_recording_id = None
            if acoustid_fingerprint:
                id_result = identify_track(file_path)
                if id_result.get("metadata"):
                    acoustid_metadata = id_result["metadata"]
                    musicbrainz_recording_id = acoustid_metadata.get("musicbrainz_recording_id")
                    logger.info(
                        f"AcoustID match: {acoustid_metadata.get('title')} by {acoustid_metadata.get('artist')} "
                        f"(score: {acoustid_metadata.get('acoustid_score', 0):.2f})"
                    )

            # Enrich with MusicBrainz metadata
            from app.services.musicbrainz import enrich_track
            musicbrainz_metadata = enrich_track(
                title=track.title,
                artist=track.artist,
                musicbrainz_recording_id=musicbrainz_recording_id,
            )

            # Store MusicBrainz enrichment in features if available
            if musicbrainz_metadata:
                features["musicbrainz"] = musicbrainz_metadata
                logger.info(
                    f"MusicBrainz enrichment: tags={musicbrainz_metadata.get('tags', [])}"
                )

            # Create or update analysis record
            analysis = TrackAnalysis(
                track_id=track.id,
                version=ANALYSIS_VERSION,
                features=features,
                embedding=embedding,
                acoustid=acoustid_fingerprint,
            )

            # Check if analysis for this version exists
            existing = db.execute(
                select(TrackAnalysis)
                .where(TrackAnalysis.track_id == track.id)
                .where(TrackAnalysis.version == ANALYSIS_VERSION)
            )
            existing_analysis = existing.scalar_one_or_none()

            if existing_analysis:
                # Update existing
                existing_analysis.features = features
                existing_analysis.embedding = embedding
                existing_analysis.acoustid = acoustid_fingerprint
            else:
                # Create new
                db.add(analysis)

            # Update track analysis status
            track.analysis_version = ANALYSIS_VERSION
            track.analyzed_at = datetime.utcnow()

            db.commit()

            logger.info(
                f"Analysis complete for {track.title}: "
                f"BPM={features.get('bpm')}, Key={features.get('key')}, "
                f"Embedding={'Yes' if embedding else 'No'}, "
                f"AcoustID={'Yes' if acoustid_fingerprint else 'No'}, "
                f"MusicBrainz={'Yes' if musicbrainz_metadata else 'No'}"
            )

            return {
                "track_id": track_id,
                "status": "success",
                "artwork_extracted": artwork_hash is not None,
                "features_extracted": bool(features.get("bpm")),
                "embedding_generated": embedding is not None,
                "acoustid_generated": acoustid_fingerprint is not None,
                "acoustid_matched": acoustid_metadata is not None,
                "musicbrainz_enriched": musicbrainz_metadata is not None,
                "bpm": features.get("bpm"),
                "key": features.get("key"),
            }
    except Exception as e:
        logger.error(f"Error analyzing track {track_id}: {e}")
        self.retry(exc=e, countdown=60)
        return {"error": str(e), "status": "retry"}


@celery_app.task  # type: ignore[misc]
def batch_analyze(track_ids: list[str]) -> dict[str, Any]:
    """Analyze multiple tracks.

    Args:
        track_ids: List of track UUIDs to analyze

    Returns:
        Dict with batch results
    """
    results = {
        "total": len(track_ids),
        "success": 0,
        "failed": 0,
        "errors": [],
    }

    for track_id in track_ids:
        try:
            analyze_track.delay(track_id)
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"track_id": track_id, "error": str(e)})

    return results


class ScanProgressReporter:
    """Reports scan progress to Redis for API consumption."""

    def __init__(self):
        self.redis = get_redis()
        self.started_at = datetime.now().isoformat()
        self._update_progress({
            "status": "running",
            "phase": "discovery",
            "message": "Starting scan...",
            "files_discovered": 0,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": 0,
            "updated_tracks": 0,
            "unchanged_tracks": 0,
            "deleted_tracks": 0,
            "current_file": None,
            "started_at": self.started_at,
            "last_heartbeat": datetime.now().isoformat(),
            "errors": [],
        })

    def _update_progress(self, data: dict[str, Any]) -> None:
        """Update progress in Redis with heartbeat."""
        data["last_heartbeat"] = datetime.now().isoformat()
        self.redis.set(SCAN_PROGRESS_KEY, json.dumps(data), ex=3600)  # 1 hour expiry

    def set_discovery(self, dirs_scanned: int, files_found: int) -> None:
        """Update discovery progress."""
        self._update_progress({
            "status": "running",
            "phase": "discovery",
            "message": f"Discovering files... ({dirs_scanned} directories, {files_found} files found)",
            "files_discovered": files_found,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": 0,
            "updated_tracks": 0,
            "unchanged_tracks": 0,
            "deleted_tracks": 0,
            "current_file": None,
            "started_at": self.started_at,
            "errors": [],
        })

    def set_processing(
        self,
        processed: int,
        total: int,
        new: int,
        updated: int,
        unchanged: int,
        current: str | None = None,
    ) -> None:
        """Update processing progress."""
        pct = int(processed / total * 100) if total > 0 else 0
        self._update_progress({
            "status": "running",
            "phase": "processing",
            "message": f"Processing files... {processed}/{total} ({pct}%)",
            "files_discovered": total,
            "files_processed": processed,
            "files_total": total,
            "new_tracks": new,
            "updated_tracks": updated,
            "unchanged_tracks": unchanged,
            "deleted_tracks": 0,
            "current_file": current,
            "started_at": self.started_at,
            "errors": [],
        })

    def set_cleanup(self, deleted: int) -> None:
        """Update cleanup progress."""
        # Get current state to preserve counts
        current = self._get_current()
        current["phase"] = "cleanup"
        current["message"] = f"Cleanup: removed {deleted} deleted files"
        current["deleted_tracks"] = deleted
        self._update_progress(current)

    def _get_current(self) -> dict[str, Any]:
        """Get current progress from Redis."""
        data = self.redis.get(SCAN_PROGRESS_KEY)
        if data:
            return json.loads(data)
        return {}

    def complete(self, new: int, updated: int, unchanged: int, deleted: int) -> None:
        """Mark scan as complete."""
        self._update_progress({
            "status": "completed",
            "phase": "complete",
            "message": f"Complete: {new} new, {updated} updated, {deleted} deleted, {unchanged} unchanged",
            "files_discovered": 0,
            "files_processed": 0,
            "files_total": 0,
            "new_tracks": new,
            "updated_tracks": updated,
            "unchanged_tracks": unchanged,
            "deleted_tracks": deleted,
            "current_file": None,
            "started_at": self.started_at,
            "errors": [],
        })

    def error(self, msg: str) -> None:
        """Mark scan as failed."""
        current = self._get_current()
        current["status"] = "error"
        current["message"] = msg
        if "errors" not in current:
            current["errors"] = []
        current["errors"].append(msg)
        self._update_progress(current)


@celery_app.task(bind=True)  # type: ignore[misc]
def scan_library(self, full_scan: bool = False) -> dict[str, Any]:
    """Scan the music library for new/changed/deleted files.

    This task runs in a Celery worker process, so it won't block the API.
    Progress is reported via Redis for the API to read.

    Args:
        full_scan: If True, rescan all files even if unchanged

    Returns:
        Dict with scan results
    """
    import asyncio

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.services.scanner import LibraryScanner

    progress = ScanProgressReporter()

    async def run_scan() -> dict[str, Any]:
        """Run the async scanner."""
        results = {
            "new": 0,
            "updated": 0,
            "unchanged": 0,
            "deleted": 0,
        }

        # Create a fresh async engine for this event loop
        # This avoids "Future attached to a different loop" errors
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
                scanner = LibraryScanner(db, scan_state=progress)

                for library_path in settings.music_library_paths:
                    if library_path.exists():
                        logger.info(f"Scanning library path: {library_path}")
                        scan_results = await scanner.scan(library_path, full_scan=full_scan)
                        results["new"] += scan_results.get("new", 0)
                        results["updated"] += scan_results.get("updated", 0)
                        results["unchanged"] += scan_results.get("unchanged", 0)
                        results["deleted"] += scan_results.get("deleted", 0)
                    else:
                        logger.warning(f"Library path does not exist: {library_path}")
        finally:
            await local_engine.dispose()

        return results

    try:
        # Run the async scanner in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            results = loop.run_until_complete(run_scan())
        finally:
            loop.close()

        progress.complete(
            new=results["new"],
            updated=results["updated"],
            unchanged=results["unchanged"],
            deleted=results["deleted"],
        )

        logger.info(f"Scan complete: {results}")
        return {"status": "success", **results}

    except Exception as e:
        logger.error(f"Scan failed: {e}")
        progress.error(str(e))
        return {"status": "error", "error": str(e)}


def get_scan_progress() -> dict[str, Any] | None:
    """Get current scan progress from Redis.

    This is called by the API to check scan status.
    """
    try:
        r = get_redis()
        data = r.get(SCAN_PROGRESS_KEY)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Failed to get scan progress: {e}")
    return None


def clear_scan_progress() -> None:
    """Clear scan progress from Redis."""
    try:
        r = get_redis()
        r.delete(SCAN_PROGRESS_KEY)
    except Exception as e:
        logger.error(f"Failed to clear scan progress: {e}")


# Redis key for Spotify sync progress
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
        self.redis.set(SPOTIFY_SYNC_PROGRESS_KEY, json.dumps(data), ex=3600)  # 1 hour expiry

    def _get_current(self) -> dict[str, Any]:
        """Get current progress from Redis."""
        data = self.redis.get(SPOTIFY_SYNC_PROGRESS_KEY)
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


@celery_app.task(bind=True, max_retries=3)  # type: ignore[misc]
def sync_spotify(self, profile_id: str, include_top_tracks: bool = True) -> dict[str, Any]:
    """Sync Spotify favorites for a profile.

    This task runs in a Celery worker process, so it won't block the API.
    Progress is reported via Redis for the API to read.

    Args:
        profile_id: UUID of the device profile
        include_top_tracks: If True, also sync top tracks

    Returns:
        Dict with sync results
    """
    import asyncio
    from datetime import datetime as dt

    from spotipy.exceptions import SpotifyException
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.config import settings
    from app.db.models import SpotifyFavorite, SpotifyProfile
    from app.services.spotify import SpotifyService

    progress = SpotifySyncProgressReporter(profile_id)
    profile_uuid = UUID(profile_id)

    async def run_sync() -> dict[str, Any]:
        """Run the async sync."""
        stats = {
            "fetched": 0,
            "new": 0,
            "matched": 0,
            "unmatched": 0,
            "top_tracks_fetched": 0,
            "top_tracks_new": 0,
        }

        # Create a fresh async engine for this event loop
        # This avoids "Future attached to a different loop" errors
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
                # Get Spotify client
                spotify_service = SpotifyService()
                client = await spotify_service.get_client(db, profile_uuid)

                # Clear existing favorites for this profile (full sync)
                from sqlalchemy import delete
                await db.execute(
                    delete(SpotifyFavorite).where(SpotifyFavorite.profile_id == profile_uuid)
                )
                await db.commit()
                logger.info(f"Cleared existing favorites for profile {profile_id}")

                if not client:
                    raise ValueError("Spotify not connected - please reconnect your account")

                # Fetch saved tracks (paginated)
                all_tracks: list[dict[str, Any]] = []
                offset = 0
                limit = 50

                progress.set_fetching(0, "Fetching saved tracks from Spotify...")

                while True:
                    try:
                        results = client.current_user_saved_tracks(limit=limit, offset=offset)
                        logger.info(f"Spotify API returned {len(results.get('items', []))} items at offset {offset}")
                    except SpotifyException as e:
                        logger.error(f"Spotify API error: {e}")
                        raise ValueError(f"Spotify API error: {e.msg if hasattr(e, 'msg') else str(e)}")
                    except Exception as e:
                        logger.error(f"Unexpected error fetching Spotify tracks: {e}")
                        raise ValueError(f"Failed to fetch tracks: {str(e)}")

                    tracks = results.get("items", [])
                    if not tracks:
                        break

                    all_tracks.extend(tracks)
                    stats["fetched"] = len(all_tracks)
                    progress.set_fetching(len(all_tracks))

                    offset += limit
                    if offset > 2000:  # Safety limit
                        break

                logger.info(f"Fetched {len(all_tracks)} tracks from Spotify")

                # Track IDs we've already added in this session to prevent duplicates
                # (Spotify API may return same track multiple times)
                added_track_ids: set[str] = set()

                # Process and match tracks
                for i, item in enumerate(all_tracks):
                    spotify_track = item.get("track")
                    if not spotify_track:
                        continue

                    track_id = spotify_track["id"]

                    # Skip if we've already added this track in this session
                    if track_id in added_track_ids:
                        continue

                    added_at = item.get("added_at")
                    track_name = spotify_track.get("name", "Unknown")
                    artists = spotify_track.get("artists", [])
                    artist_name = artists[0]["name"] if artists else "Unknown"

                    # Update progress every 10 tracks
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

                    # Parse added_at and convert to naive datetime (remove timezone)
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
                    else:
                        stats["unmatched"] += 1

                # Optionally sync top tracks
                if include_top_tracks:
                    progress.set_fetching(stats["fetched"], "Fetching top tracks...")
                    try:
                        top_results = client.current_user_top_tracks(limit=50, time_range="medium_term")
                        for spotify_track in top_results.get("items", []):
                            stats["top_tracks_fetched"] += 1

                            track_id = spotify_track["id"]

                            # Skip if we've already added this track
                            if track_id in added_track_ids:
                                continue

                            local_match = await _match_to_local(db, spotify_track)

                            favorite = SpotifyFavorite(
                                profile_id=profile_uuid,
                                spotify_track_id=track_id,
                                matched_track_id=local_match.id if local_match else None,
                                track_data=_extract_track_data(spotify_track),
                            )
                            db.add(favorite)
                            added_track_ids.add(track_id)
                            stats["top_tracks_new"] += 1

                            if local_match:
                                stats["matched"] += 1
                            else:
                                stats["unmatched"] += 1
                    except Exception as e:
                        logger.warning(f"Failed to fetch top tracks: {e}")

                # Update last sync time
                profile_result = await db.execute(
                    select(SpotifyProfile).where(SpotifyProfile.profile_id == profile_uuid)
                )
                spotify_profile = profile_result.scalar_one_or_none()
                if spotify_profile:
                    spotify_profile.last_sync_at = dt.utcnow()

                await db.commit()
                logger.info(f"Spotify sync completed for profile {profile_id}: {stats}")

        finally:
            # Close the engine to release connections
            await local_engine.dispose()

        return stats

    try:
        # Run the async sync in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            results = loop.run_until_complete(run_sync())
        finally:
            loop.close()

        progress.complete(
            fetched=results["fetched"],
            new=results["new"],
            matched=results["matched"],
            unmatched=results["unmatched"],
        )

        logger.info(f"Spotify sync complete: {results}")
        return {"status": "success", **results}

    except ValueError as e:
        # User-facing errors (not connected, API errors, etc.)
        logger.error(f"Spotify sync failed: {e}")
        progress.error(str(e))
        return {"status": "error", "error": str(e)}
    except Exception as e:
        logger.error(f"Spotify sync failed unexpectedly: {e}", exc_info=True)
        progress.error(f"Unexpected error: {str(e)}")
        # Retry on unexpected errors
        try:
            self.retry(exc=e, countdown=60)
        except self.MaxRetriesExceededError:
            pass
        return {"status": "error", "error": str(e)}


async def _match_to_local(db, spotify_track: dict[str, Any]):
    """Try to match a Spotify track to local library.

    Simplified matching for Celery task context.
    """
    from sqlalchemy import func, select

    from app.db.models import Track

    # Extract info from Spotify track
    isrc = spotify_track.get("external_ids", {}).get("isrc")
    track_name = spotify_track.get("name", "").lower().strip()
    artists = spotify_track.get("artists", [])
    artist_name = artists[0]["name"].lower().strip() if artists else ""

    # 1. Try ISRC match
    if isrc:
        result = await db.execute(
            select(Track).where(Track.isrc == isrc)
        )
        match = result.scalar_one_or_none()
        if match:
            return match

    # 2. Try exact artist + title match
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

        # 3. Try partial match (title contains, artist contains)
        result = await db.execute(
            select(Track).where(
                func.lower(Track.title).contains(track_name),
                func.lower(Track.artist).contains(artist_name),
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


def get_spotify_sync_progress() -> dict[str, Any] | None:
    """Get current Spotify sync progress from Redis.

    This is called by the API to check sync status.
    """
    try:
        r = get_redis()
        data = r.get(SPOTIFY_SYNC_PROGRESS_KEY)
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
