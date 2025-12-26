"""Smart playlist API endpoints."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.db.models import User
from app.services.smart_playlists import SmartPlaylistService

router = APIRouter(prefix="/smart-playlists", tags=["smart-playlists"])


class RuleSchema(BaseModel):
    """A single rule for matching tracks."""

    field: str = Field(..., description="Field to match (e.g., 'genre', 'bpm', 'energy')")
    operator: str = Field(..., description="Comparison operator")
    value: Any | None = Field(None, description="Value to compare against")


class SmartPlaylistCreate(BaseModel):
    """Request to create a smart playlist."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    rules: list[RuleSchema] = Field(default_factory=list)
    match_mode: str = Field(default="all", pattern="^(all|any)$")
    order_by: str = Field(default="title")
    order_direction: str = Field(default="asc", pattern="^(asc|desc)$")
    max_tracks: int | None = Field(default=None, ge=1, le=10000)


class SmartPlaylistUpdate(BaseModel):
    """Request to update a smart playlist."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    rules: list[RuleSchema] | None = None
    match_mode: str | None = Field(None, pattern="^(all|any)$")
    order_by: str | None = None
    order_direction: str | None = Field(None, pattern="^(asc|desc)$")
    max_tracks: int | None = Field(None, ge=1, le=10000)


class SmartPlaylistResponse(BaseModel):
    """Smart playlist response."""

    id: str
    name: str
    description: str | None
    rules: list[dict]
    match_mode: str
    order_by: str
    order_direction: str
    max_tracks: int | None
    cached_track_count: int
    last_refreshed_at: str | None
    created_at: str
    updated_at: str


class TrackResponse(BaseModel):
    """Track in smart playlist results."""

    id: str
    title: str | None
    artist: str | None
    album: str | None
    duration_seconds: float | None
    genre: str | None
    year: int | None


class SmartPlaylistTracksResponse(BaseModel):
    """Response with smart playlist tracks."""

    playlist: SmartPlaylistResponse
    tracks: list[TrackResponse]
    total: int


def playlist_to_response(playlist) -> SmartPlaylistResponse:
    """Convert SmartPlaylist model to response."""
    return SmartPlaylistResponse(
        id=str(playlist.id),
        name=playlist.name,
        description=playlist.description,
        rules=playlist.rules,
        match_mode=playlist.match_mode,
        order_by=playlist.order_by,
        order_direction=playlist.order_direction,
        max_tracks=playlist.max_tracks,
        cached_track_count=playlist.cached_track_count,
        last_refreshed_at=playlist.last_refreshed_at.isoformat() if playlist.last_refreshed_at else None,
        created_at=playlist.created_at.isoformat(),
        updated_at=playlist.updated_at.isoformat(),
    )


def track_to_response(track) -> TrackResponse:
    """Convert Track model to response."""
    return TrackResponse(
        id=str(track.id),
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        genre=track.genre,
        year=track.year,
    )


@router.get("", response_model=list[SmartPlaylistResponse])
async def list_smart_playlists(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all smart playlists for the current user."""
    service = SmartPlaylistService(db)
    playlists = await service.get_all_for_user(user.id)
    return [playlist_to_response(p) for p in playlists]


@router.post("", response_model=SmartPlaylistResponse, status_code=status.HTTP_201_CREATED)
async def create_smart_playlist(
    request: SmartPlaylistCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new smart playlist."""
    service = SmartPlaylistService(db)

    try:
        playlist = await service.create(
            user_id=user.id,
            name=request.name,
            description=request.description,
            rules=[r.model_dump() for r in request.rules],
            match_mode=request.match_mode,
            order_by=request.order_by,
            order_direction=request.order_direction,
            max_tracks=request.max_tracks,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return playlist_to_response(playlist)


@router.get("/{playlist_id}", response_model=SmartPlaylistResponse)
async def get_smart_playlist(
    playlist_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a smart playlist by ID."""
    service = SmartPlaylistService(db)
    playlist = await service.get_by_id(playlist_id, user.id)

    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Smart playlist not found",
        )

    return playlist_to_response(playlist)


@router.put("/{playlist_id}", response_model=SmartPlaylistResponse)
async def update_smart_playlist(
    playlist_id: UUID,
    request: SmartPlaylistUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a smart playlist."""
    service = SmartPlaylistService(db)
    playlist = await service.get_by_id(playlist_id, user.id)

    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Smart playlist not found",
        )

    update_data = request.model_dump(exclude_unset=True)
    if "rules" in update_data and update_data["rules"] is not None:
        update_data["rules"] = [r if isinstance(r, dict) else r.model_dump() for r in update_data["rules"]]

    try:
        playlist = await service.update(playlist, **update_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return playlist_to_response(playlist)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_smart_playlist(
    playlist_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a smart playlist."""
    service = SmartPlaylistService(db)
    playlist = await service.get_by_id(playlist_id, user.id)

    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Smart playlist not found",
        )

    await service.delete(playlist)


@router.get("/{playlist_id}/tracks", response_model=SmartPlaylistTracksResponse)
async def get_smart_playlist_tracks(
    playlist_id: UUID,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get tracks matching a smart playlist's rules."""
    service = SmartPlaylistService(db)
    playlist = await service.get_by_id(playlist_id, user.id)

    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Smart playlist not found",
        )

    tracks = await service.get_tracks(playlist, limit=limit, offset=offset)
    total = await service.get_track_count(playlist)

    return SmartPlaylistTracksResponse(
        playlist=playlist_to_response(playlist),
        tracks=[track_to_response(t) for t in tracks],
        total=total,
    )


@router.post("/{playlist_id}/refresh", response_model=SmartPlaylistResponse)
async def refresh_smart_playlist(
    playlist_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Refresh a smart playlist's cached track count."""
    service = SmartPlaylistService(db)
    playlist = await service.get_by_id(playlist_id, user.id)

    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Smart playlist not found",
        )

    await service.refresh_playlist(playlist)
    return playlist_to_response(playlist)


@router.get("/fields/available")
async def get_available_fields():
    """Get list of available fields and operators for building rules."""
    return {
        "track_fields": [
            {"name": "title", "type": "string", "description": "Track title"},
            {"name": "artist", "type": "string", "description": "Artist name"},
            {"name": "album", "type": "string", "description": "Album name"},
            {"name": "album_artist", "type": "string", "description": "Album artist"},
            {"name": "genre", "type": "string", "description": "Genre"},
            {"name": "year", "type": "number", "description": "Release year"},
            {"name": "duration_seconds", "type": "number", "description": "Track duration in seconds"},
            {"name": "format", "type": "string", "description": "Audio format (mp3, flac, etc.)"},
            {"name": "created_at", "type": "date", "description": "Date added to library"},
        ],
        "analysis_fields": [
            {"name": "bpm", "type": "number", "description": "Beats per minute", "range": [60, 200]},
            {"name": "key", "type": "string", "description": "Musical key (e.g., 'C', 'Am')"},
            {"name": "energy", "type": "number", "description": "Energy level", "range": [0, 1]},
            {"name": "valence", "type": "number", "description": "Musical positivity", "range": [0, 1]},
            {"name": "danceability", "type": "number", "description": "How danceable", "range": [0, 1]},
            {"name": "acousticness", "type": "number", "description": "Acoustic vs electronic", "range": [0, 1]},
            {"name": "instrumentalness", "type": "number", "description": "Instrumental vs vocal", "range": [0, 1]},
            {"name": "speechiness", "type": "number", "description": "Presence of spoken words", "range": [0, 1]},
        ],
        "operators": {
            "string": ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
            "number": ["equals", "not_equals", "greater_than", "less_than", "greater_or_equal", "less_or_equal", "between"],
            "date": ["within_days"],
            "list": ["in", "not_in"],
        },
    }
