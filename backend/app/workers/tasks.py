"""Celery tasks for audio analysis."""

import logging
from datetime import datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.config import ANALYSIS_VERSION
from app.db.models import Track, TrackAnalysis
from app.db.session import sync_session_maker
from app.services.artwork import extract_and_save_artwork
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3)
def analyze_track(self, track_id: str) -> dict:
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
            analyze_track.delay(track_id)
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"track_id": track_id, "error": str(e)})

    return results
