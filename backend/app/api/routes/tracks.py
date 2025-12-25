"""Track endpoints."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.db.models import Track, TrackAnalysis

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
