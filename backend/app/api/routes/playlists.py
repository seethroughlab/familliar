"""Playlist management endpoints."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, RequiredProfile
from app.db.models import Playlist, PlaylistTrack, Track

router = APIRouter(prefix="/playlists", tags=["playlists"])


class PlaylistCreate(BaseModel):
    """Request to create a playlist."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    track_ids: list[str] = Field(default_factory=list)
    is_auto_generated: bool = False
    generation_prompt: str | None = None


class PlaylistUpdate(BaseModel):
    """Request to update a playlist."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class TrackInPlaylist(BaseModel):
    """Track in a playlist response."""

    id: str
    title: str | None
    artist: str | None
    album: str | None
    duration_seconds: float | None
    position: int


class PlaylistResponse(BaseModel):
    """Playlist response."""

    id: str
    name: str
    description: str | None
    is_auto_generated: bool
    generation_prompt: str | None
    track_count: int
    created_at: str
    updated_at: str


class PlaylistDetailResponse(BaseModel):
    """Playlist detail response with tracks."""

    id: str
    name: str
    description: str | None
    is_auto_generated: bool
    generation_prompt: str | None
    tracks: list[TrackInPlaylist]
    created_at: str
    updated_at: str


@router.get("", response_model=list[PlaylistResponse])
async def list_playlists(
    db: DbSession,
    profile: RequiredProfile,
    include_auto: bool = Query(True, description="Include auto-generated playlists"),
) -> list[PlaylistResponse]:
    """List all playlists for the current profile."""
    query = select(Playlist).where(Playlist.profile_id == profile.id)

    if not include_auto:
        query = query.where(Playlist.is_auto_generated == False)

    query = query.order_by(Playlist.updated_at.desc())

    result = await db.execute(query)
    playlists = result.scalars().all()

    # Get track counts
    responses = []
    for playlist in playlists:
        count_result = await db.execute(
            select(func.count(PlaylistTrack.track_id)).where(
                PlaylistTrack.playlist_id == playlist.id
            )
        )
        track_count = count_result.scalar() or 0

        responses.append(PlaylistResponse(
            id=str(playlist.id),
            name=playlist.name,
            description=playlist.description,
            is_auto_generated=playlist.is_auto_generated,
            generation_prompt=playlist.generation_prompt,
            track_count=track_count,
            created_at=playlist.created_at.isoformat(),
            updated_at=playlist.updated_at.isoformat(),
        ))

    return responses


@router.post("", response_model=PlaylistDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    request: PlaylistCreate,
    db: DbSession,
    profile: RequiredProfile,
) -> PlaylistDetailResponse:
    """Create a new playlist with optional tracks."""
    # Create the playlist
    playlist = Playlist(
        profile_id=profile.id,
        name=request.name,
        description=request.description,
        is_auto_generated=request.is_auto_generated,
        generation_prompt=request.generation_prompt,
    )
    db.add(playlist)
    await db.flush()  # Get the playlist ID

    # Add tracks if provided
    tracks_added = []
    for position, track_id_str in enumerate(request.track_ids):
        try:
            track_id = UUID(track_id_str)
        except ValueError:
            continue

        # Verify track exists
        track = await db.get(Track, track_id)
        if not track:
            continue

        playlist_track = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track_id,
            position=position,
        )
        db.add(playlist_track)
        tracks_added.append(TrackInPlaylist(
            id=str(track.id),
            title=track.title,
            artist=track.artist,
            album=track.album,
            duration_seconds=track.duration_seconds,
            position=position,
        ))

    await db.commit()
    await db.refresh(playlist)

    return PlaylistDetailResponse(
        id=str(playlist.id),
        name=playlist.name,
        description=playlist.description,
        is_auto_generated=playlist.is_auto_generated,
        generation_prompt=playlist.generation_prompt,
        tracks=tracks_added,
        created_at=playlist.created_at.isoformat(),
        updated_at=playlist.updated_at.isoformat(),
    )


@router.get("/{playlist_id}", response_model=PlaylistDetailResponse)
async def get_playlist(
    playlist_id: UUID,
    db: DbSession,
    profile: RequiredProfile,
) -> PlaylistDetailResponse:
    """Get a playlist by ID with its tracks."""
    playlist = await db.get(Playlist, playlist_id)

    if not playlist or playlist.profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playlist not found",
        )

    # Get tracks with ordering
    result = await db.execute(
        select(PlaylistTrack, Track)
        .join(Track, PlaylistTrack.track_id == Track.id)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )

    tracks = [
        TrackInPlaylist(
            id=str(track.id),
            title=track.title,
            artist=track.artist,
            album=track.album,
            duration_seconds=track.duration_seconds,
            position=pt.position,
        )
        for pt, track in result.all()
    ]

    return PlaylistDetailResponse(
        id=str(playlist.id),
        name=playlist.name,
        description=playlist.description,
        is_auto_generated=playlist.is_auto_generated,
        generation_prompt=playlist.generation_prompt,
        tracks=tracks,
        created_at=playlist.created_at.isoformat(),
        updated_at=playlist.updated_at.isoformat(),
    )


@router.put("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: UUID,
    request: PlaylistUpdate,
    db: DbSession,
    profile: RequiredProfile,
) -> PlaylistResponse:
    """Update a playlist's name or description."""
    playlist = await db.get(Playlist, playlist_id)

    if not playlist or playlist.profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playlist not found",
        )

    if request.name is not None:
        playlist.name = request.name
    if request.description is not None:
        playlist.description = request.description

    await db.commit()
    await db.refresh(playlist)

    # Get track count
    count_result = await db.execute(
        select(func.count(PlaylistTrack.track_id)).where(
            PlaylistTrack.playlist_id == playlist.id
        )
    )
    track_count = count_result.scalar() or 0

    return PlaylistResponse(
        id=str(playlist.id),
        name=playlist.name,
        description=playlist.description,
        is_auto_generated=playlist.is_auto_generated,
        generation_prompt=playlist.generation_prompt,
        track_count=track_count,
        created_at=playlist.created_at.isoformat(),
        updated_at=playlist.updated_at.isoformat(),
    )


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: UUID,
    db: DbSession,
    profile: RequiredProfile,
) -> None:
    """Delete a playlist."""
    playlist = await db.get(Playlist, playlist_id)

    if not playlist or playlist.profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playlist not found",
        )

    # Delete playlist tracks first (cascade should handle this, but be explicit)
    await db.execute(
        delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist_id)
    )

    await db.delete(playlist)
    await db.commit()


@router.post("/{playlist_id}/tracks", response_model=PlaylistDetailResponse)
async def add_tracks_to_playlist(
    playlist_id: UUID,
    track_ids: list[str],
    db: DbSession,
    profile: RequiredProfile,
) -> PlaylistDetailResponse:
    """Add tracks to an existing playlist."""
    playlist = await db.get(Playlist, playlist_id)

    if not playlist or playlist.profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playlist not found",
        )

    # Get current max position
    result = await db.execute(
        select(func.max(PlaylistTrack.position)).where(
            PlaylistTrack.playlist_id == playlist_id
        )
    )
    max_position = result.scalar() or -1

    # Add new tracks
    for i, track_id_str in enumerate(track_ids):
        try:
            track_id = UUID(track_id_str)
        except ValueError:
            continue

        # Verify track exists
        track = await db.get(Track, track_id)
        if not track:
            continue

        # Check if already in playlist
        existing = await db.execute(
            select(PlaylistTrack).where(
                PlaylistTrack.playlist_id == playlist_id,
                PlaylistTrack.track_id == track_id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        playlist_track = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track_id,
            position=max_position + 1 + i,
        )
        db.add(playlist_track)

    await db.commit()

    # Return updated playlist
    return await get_playlist(playlist_id, db, profile)


@router.delete("/{playlist_id}/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_track_from_playlist(
    playlist_id: UUID,
    track_id: UUID,
    db: DbSession,
    profile: RequiredProfile,
) -> None:
    """Remove a track from a playlist."""
    playlist = await db.get(Playlist, playlist_id)

    if not playlist or playlist.profile_id != profile.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playlist not found",
        )

    await db.execute(
        delete(PlaylistTrack).where(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == track_id,
        )
    )
    await db.commit()
