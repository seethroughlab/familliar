"""Track endpoints."""

from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, RequiredProfile
from app.db.models import ProfilePlayHistory, Track, TrackAnalysis
from app.services.artwork import compute_album_hash, get_artwork_path

router = APIRouter(prefix="/tracks", tags=["tracks"])


class TrackFeaturesResponse(BaseModel):
    """Audio analysis features."""

    bpm: float | None = None
    key: str | None = None
    energy: float | None = None
    danceability: float | None = None
    valence: float | None = None
    acousticness: float | None = None
    instrumentalness: float | None = None
    speechiness: float | None = None


class TrackResponse(BaseModel):
    """Track response schema."""

    id: UUID
    file_path: str
    title: str | None
    artist: str | None
    album: str | None
    album_artist: str | None
    album_type: str
    track_number: int | None
    disc_number: int | None
    year: int | None
    genre: str | None
    duration_seconds: float | None
    format: str | None
    analysis_version: int
    features: TrackFeaturesResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class TrackDetailResponse(TrackResponse):
    """Track detail response with analysis features (deprecated, use TrackResponse)."""

    pass


class TrackListResponse(BaseModel):
    """Paginated track list response."""

    items: list[TrackResponse]
    total: int
    page: int
    page_size: int


@router.get("", response_model=TrackListResponse)
async def list_tracks(
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    artist: str | None = None,
    album: str | None = None,
    genre: str | None = None,
    include_features: bool = Query(False, description="Include audio analysis features"),
) -> TrackListResponse:
    """List tracks with optional filtering and pagination."""
    query = select(Track)

    # Include analysis features if requested
    if include_features:
        query = query.options(selectinload(Track.analyses))

    # Apply filters
    if search:
        search_filter = f"%{search}%"
        query = query.where(
            Track.title.ilike(search_filter)
            | Track.artist.ilike(search_filter)
            | Track.album.ilike(search_filter)
        )
    if artist:
        query = query.where(Track.artist.ilike(f"%{artist}%"))
    if album:
        query = query.where(Track.album.ilike(f"%{album}%"))
    if genre:
        query = query.where(Track.genre.ilike(f"%{genre}%"))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    query = query.order_by(Track.artist, Track.album, Track.track_number)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    tracks = result.scalars().all()

    # Build response with optional features
    items = []
    for track in tracks:
        response = TrackResponse.model_validate(track)
        if include_features and track.analyses:
            # Get latest analysis features
            latest = max(track.analyses, key=lambda a: a.version)
            if latest.features:
                response.features = TrackFeaturesResponse(
                    bpm=latest.features.get("bpm"),
                    key=latest.features.get("key"),
                    energy=latest.features.get("energy"),
                    danceability=latest.features.get("danceability"),
                    valence=latest.features.get("valence"),
                    acousticness=latest.features.get("acousticness"),
                    instrumentalness=latest.features.get("instrumentalness"),
                    speechiness=latest.features.get("speechiness"),
                )
        items.append(response)

    return TrackListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{track_id}", response_model=TrackResponse)
async def get_track(db: DbSession, track_id: UUID) -> TrackResponse:
    """Get a single track with its latest analysis."""
    query = (
        select(Track)
        .options(selectinload(Track.analyses))
        .where(Track.id == track_id)
    )
    result = await db.execute(query)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    response = TrackResponse.model_validate(track)

    # Get latest analysis features
    if track.analyses:
        latest = max(track.analyses, key=lambda a: a.version)
        if latest.features:
            response.features = TrackFeaturesResponse(
                bpm=latest.features.get("bpm"),
                key=latest.features.get("key"),
                energy=latest.features.get("energy"),
                danceability=latest.features.get("danceability"),
                valence=latest.features.get("valence"),
                acousticness=latest.features.get("acousticness"),
                instrumentalness=latest.features.get("instrumentalness"),
                speechiness=latest.features.get("speechiness"),
            )

    return response


@router.get("/{track_id}/similar")
async def get_similar_tracks(
    db: DbSession,
    track_id: UUID,
    limit: int = Query(10, ge=1, le=50),
) -> list[TrackResponse]:
    """Find similar tracks using embedding similarity (pgvector)."""
    # Get the track's embedding
    query = (
        select(TrackAnalysis.embedding)
        .where(TrackAnalysis.track_id == track_id)
        .order_by(TrackAnalysis.version.desc())
        .limit(1)
    )
    result = await db.execute(query)
    embedding = result.scalar_one_or_none()

    if embedding is None:
        raise HTTPException(status_code=404, detail="Track not analyzed yet")

    # Find similar tracks using cosine distance
    # Note: pgvector uses <=> for cosine distance, <-> for L2 distance
    similar_query = (
        select(Track)
        .join(TrackAnalysis, Track.id == TrackAnalysis.track_id)
        .where(Track.id != track_id)
        .where(TrackAnalysis.embedding.isnot(None))
        .order_by(TrackAnalysis.embedding.cosine_distance(embedding))
        .limit(limit)
    )

    result = await db.execute(similar_query)
    tracks = result.scalars().all()

    return [TrackResponse.model_validate(t) for t in tracks]


# MIME types for audio formats
AUDIO_MIME_TYPES = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
}


def get_audio_mime_type(file_path: Path) -> str:
    """Get MIME type for audio file."""
    suffix = file_path.suffix.lower()
    return AUDIO_MIME_TYPES.get(suffix, "application/octet-stream")


@router.get("/{track_id}/stream")
async def stream_track(
    db: DbSession,
    track_id: UUID,
    request: Request,
) -> StreamingResponse:
    """Stream audio file with range request support for seeking."""
    # Get track from database
    query = select(Track).where(Track.id == track_id)
    result = await db.execute(query)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = Path(track.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    file_size = file_path.stat().st_size
    mime_type = get_audio_mime_type(file_path)

    # Parse range header for seeking support
    range_header = request.headers.get("range")

    if range_header:
        # Parse "bytes=start-end" format
        range_spec = range_header.replace("bytes=", "")
        range_parts = range_spec.split("-")
        start = int(range_parts[0]) if range_parts[0] else 0
        end = int(range_parts[1]) if range_parts[1] else file_size - 1

        # Clamp to file size
        start = max(0, min(start, file_size - 1))
        end = max(start, min(end, file_size - 1))
        content_length = end - start + 1

        async def stream_range() -> AsyncIterator[bytes]:
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 64 * 1024  # 64KB chunks
                while remaining > 0:
                    read_size = min(chunk_size, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            stream_range(),  # type: ignore[no-untyped-call]
            status_code=206,  # Partial Content
            media_type=mime_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )
    else:
        # Full file request
        async def stream_full() -> AsyncIterator[bytes]:
            with open(file_path, "rb") as f:
                chunk_size = 64 * 1024  # 64KB chunks
                while chunk := f.read(chunk_size):
                    yield chunk

        return StreamingResponse(
            stream_full(),  # type: ignore[no-untyped-call]
            media_type=mime_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )


@router.get("/{track_id}/artwork")
async def get_track_artwork(
    db: DbSession,
    track_id: UUID,
    size: str = Query("full", pattern="^(full|thumb)$"),
) -> StreamingResponse:
    """Get album artwork for a track.

    Artwork is extracted from the audio file on first request and cached.
    """
    # Get track from database
    query = select(Track).where(Track.id == track_id)
    result = await db.execute(query)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Compute album hash
    album_hash = compute_album_hash(track.artist, track.album)
    artwork_path = get_artwork_path(album_hash, size)

    # Check if artwork exists on disk
    if not artwork_path.exists():
        # Try to extract from audio file
        file_path = Path(track.file_path)
        if file_path.exists():
            from app.services.artwork import extract_and_save_artwork
            extract_and_save_artwork(file_path, track.artist, track.album)

        # Check again
        if not artwork_path.exists():
            raise HTTPException(status_code=404, detail="No artwork available")

    # Stream the artwork file
    def stream_artwork() -> Iterator[bytes]:
        with open(artwork_path, "rb") as f:
            yield f.read()

    return StreamingResponse(
        stream_artwork(),  # type: ignore[no-untyped-call]
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=31536000",  # Cache for 1 year
        },
    )


class LyricLineResponse(BaseModel):
    """A single line of lyrics with timing."""
    time: float
    text: str


class LyricsResponse(BaseModel):
    """Lyrics response schema."""
    synced: bool
    lines: list[LyricLineResponse]
    plain_text: str
    source: str


@router.get("/{track_id}/lyrics", response_model=LyricsResponse | None)
async def get_track_lyrics(
    db: DbSession,
    track_id: UUID,
) -> LyricsResponse | None:
    """
    Get lyrics for a track.
    Returns synced lyrics with timestamps if available, otherwise plain lyrics.
    """
    from app.services.lyrics import get_lyrics_service

    # Get track from database
    query = select(Track).where(Track.id == track_id)
    result = await db.execute(query)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.title or not track.artist:
        raise HTTPException(
            status_code=400,
            detail="Track must have title and artist to search for lyrics"
        )

    # Search for lyrics
    lyrics_service = get_lyrics_service()
    lyrics = await lyrics_service.search(
        track_name=track.title,
        artist_name=track.artist,
        album_name=track.album,
        duration=track.duration_seconds
    )

    if not lyrics:
        raise HTTPException(status_code=404, detail="No lyrics found")

    return LyricsResponse(
        synced=lyrics.synced,
        lines=[LyricLineResponse(time=line.time, text=line.text) for line in lyrics.lines],
        plain_text=lyrics.plain_text,
        source=lyrics.source
    )


class PlayRecordRequest(BaseModel):
    """Request to record a track play."""

    duration_seconds: float | None = None  # How long the track was played


class PlayRecordResponse(BaseModel):
    """Response for play record."""

    track_id: UUID
    play_count: int
    total_play_seconds: float


@router.post("/{track_id}/played", response_model=PlayRecordResponse)
async def record_play(
    track_id: UUID,
    db: DbSession,
    profile: RequiredProfile,
    request: PlayRecordRequest | None = None,
) -> PlayRecordResponse:
    """Record that a track was played.

    Increments play count and updates last_played_at for the profile.
    Optionally records how long the track was played.
    """
    from datetime import datetime

    # Verify track exists
    track = await db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Get or create play history record
    result = await db.execute(
        select(ProfilePlayHistory).where(
            ProfilePlayHistory.profile_id == profile.id,
            ProfilePlayHistory.track_id == track_id,
        )
    )
    play_history = result.scalar_one_or_none()

    if play_history:
        # Update existing record
        play_history.play_count += 1
        play_history.last_played_at = datetime.utcnow()
        if request and request.duration_seconds:
            play_history.total_play_seconds += request.duration_seconds
    else:
        # Create new record
        play_history = ProfilePlayHistory(
            profile_id=profile.id,
            track_id=track_id,
            play_count=1,
            last_played_at=datetime.utcnow(),
            total_play_seconds=request.duration_seconds if request and request.duration_seconds else 0.0,
        )
        db.add(play_history)

    await db.commit()
    await db.refresh(play_history)

    return PlayRecordResponse(
        track_id=track_id,
        play_count=play_history.play_count,
        total_play_seconds=play_history.total_play_seconds,
    )


class ProfilePlayStatsResponse(BaseModel):
    """Profile play statistics."""

    total_plays: int
    total_play_seconds: float
    unique_tracks: int
    top_tracks: list[dict[str, Any]]


@router.get("/stats/plays", response_model=ProfilePlayStatsResponse)
async def get_play_stats(
    db: DbSession,
    profile: RequiredProfile,
    limit: int = Query(10, ge=1, le=50),
) -> ProfilePlayStatsResponse:
    """Get play statistics for the current profile."""
    # Get all play history for profile
    result = await db.execute(
        select(ProfilePlayHistory, Track)
        .join(Track, ProfilePlayHistory.track_id == Track.id)
        .where(ProfilePlayHistory.profile_id == profile.id)
        .order_by(ProfilePlayHistory.play_count.desc())
    )
    rows = result.all()

    total_plays = sum(ph.play_count for ph, _ in rows)
    total_play_seconds = sum(ph.total_play_seconds for ph, _ in rows)
    unique_tracks = len(rows)

    top_tracks = [
        {
            "id": str(track.id),
            "title": track.title,
            "artist": track.artist,
            "play_count": ph.play_count,
            "total_play_seconds": ph.total_play_seconds,
            "last_played_at": ph.last_played_at.isoformat() if ph.last_played_at else None,
        }
        for ph, track in rows[:limit]
    ]

    return ProfilePlayStatsResponse(
        total_plays=total_plays,
        total_play_seconds=total_play_seconds,
        unique_tracks=unique_tracks,
        top_tracks=top_tracks,
    )
