"""Track endpoints."""

import mimetypes
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.db.models import Track, TrackAnalysis
from app.services.artwork import compute_album_hash, get_artwork_path, extract_artwork

router = APIRouter(prefix="/tracks", tags=["tracks"])


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

    class Config:
        from_attributes = True


class TrackDetailResponse(TrackResponse):
    """Track detail response with analysis features."""

    features: dict | None = None


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
) -> TrackListResponse:
    """List tracks with optional filtering and pagination."""
    query = select(Track)

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

    return TrackListResponse(
        items=[TrackResponse.model_validate(t) for t in tracks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{track_id}", response_model=TrackDetailResponse)
async def get_track(db: DbSession, track_id: UUID) -> TrackDetailResponse:
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

    # Get latest analysis
    features = None
    if track.analyses:
        latest = max(track.analyses, key=lambda a: a.version)
        features = latest.features

    response = TrackDetailResponse.model_validate(track)
    response.features = features
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

        async def stream_range():
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
            stream_range(),
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
        async def stream_full():
            with open(file_path, "rb") as f:
                chunk_size = 64 * 1024  # 64KB chunks
                while chunk := f.read(chunk_size):
                    yield chunk

        return StreamingResponse(
            stream_full(),
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
    size: str = Query("full", regex="^(full|thumb)$"),
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
    def stream_artwork():
        with open(artwork_path, "rb") as f:
            yield f.read()

    return StreamingResponse(
        stream_artwork(),
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
