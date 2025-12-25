"""Celery tasks for audio analysis."""

import asyncio
from datetime import datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import ANALYSIS_VERSION
from app.db.models import Track, TrackAnalysis
from app.db.session import async_session_maker
from app.services.artwork import extract_and_save_artwork
from app.workers.celery_app import celery_app


def run_async(coro):
    """Run async function in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3)
def analyze_track(self, track_id: str) -> dict:
    """Analyze a track and save results.

    This is the main analysis task that orchestrates:
    1. Metadata extraction (already done during scan)
    2. Artwork extraction
    3. Audio feature extraction (Phase 1.5)
    4. Embedding generation (Phase 1.5)

    Args:
        track_id: UUID of the track to analyze

    Returns:
        Dict with analysis results
    """
    try:
        result = run_async(_analyze_track_async(track_id))
        return result
    except Exception as e:
        self.retry(exc=e, countdown=60)


async def _analyze_track_async(track_id: str) -> dict:
    """Async implementation of track analysis."""
    async with async_session_maker() as db:
        # Get track from database
        result = await db.execute(
            select(Track).where(Track.id == UUID(track_id))
        )
        track = result.scalar_one_or_none()

        if not track:
            return {"error": f"Track not found: {track_id}"}

        file_path = Path(track.file_path)
        if not file_path.exists():
            return {"error": f"File not found: {track.file_path}"}

        # Extract and save artwork
        artwork_hash = extract_and_save_artwork(
            file_path,
            artist=track.artist,
            album=track.album,
        )

        # Extract audio features (placeholder for Phase 1.5)
        features = await _extract_features(file_path)

        # Generate embedding (placeholder for Phase 1.5)
        embedding = await _generate_embedding(file_path)

        # Create or update analysis record
        analysis = TrackAnalysis(
            track_id=track.id,
            version=ANALYSIS_VERSION,
            features=features,
            embedding=embedding,
            acoustid=None,  # TODO: Phase 1.5
        )

        # Check if analysis for this version exists
        existing = await db.execute(
            select(TrackAnalysis)
            .where(TrackAnalysis.track_id == track.id)
            .where(TrackAnalysis.version == ANALYSIS_VERSION)
        )
        existing_analysis = existing.scalar_one_or_none()

        if existing_analysis:
            # Update existing
            existing_analysis.features = features
            existing_analysis.embedding = embedding
        else:
            # Create new
            db.add(analysis)

        # Update track analysis status
        track.analysis_version = ANALYSIS_VERSION
        track.analyzed_at = datetime.utcnow()

        await db.commit()

        return {
            "track_id": track_id,
            "status": "success",
            "artwork_extracted": artwork_hash is not None,
            "features_extracted": bool(features),
            "embedding_generated": embedding is not None,
        }


async def _extract_features(file_path: Path) -> dict:
    """Extract audio features from file.

    Phase 1: Returns placeholder features.
    Phase 1.5: Will use Essentia for real feature extraction.
    """
    # Placeholder features - will be replaced with real extraction
    return {
        "bpm": None,
        "key": None,
        "energy": None,
        "valence": None,
        "danceability": None,
        "acousticness": None,
        "instrumentalness": None,
        "speechiness": None,
        # Add more features in Phase 1.5
    }


async def _generate_embedding(file_path: Path) -> list[float] | None:
    """Generate audio embedding for similarity search.

    Phase 1: Returns None (no embedding).
    Phase 1.5: Will use CLAP model for real embeddings.
    """
    # Placeholder - will be replaced with CLAP embedding
    return None


@celery_app.task
def batch_analyze(track_ids: list[str]) -> dict:
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
            result = analyze_track.delay(track_id)
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"track_id": track_id, "error": str(e)})

    return results
