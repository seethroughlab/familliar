"""Last.fm endpoints for authentication and scrobbling."""

import time
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession
from app.db.models import Track
from app.services.lastfm import get_lastfm_service

router = APIRouter(prefix="/lastfm", tags=["lastfm"])


class LastfmStatusResponse(BaseModel):
    """Last.fm connection status."""
    configured: bool
    connected: bool
    username: str | None = None


class LastfmAuthResponse(BaseModel):
    """Last.fm auth URL response."""
    auth_url: str


class LastfmCallbackResponse(BaseModel):
    """Last.fm callback response."""
    status: str
    username: str


class ScrobbleRequest(BaseModel):
    """Request to scrobble a track."""
    track_id: str
    timestamp: int | None = None


class ScrobbleResponse(BaseModel):
    """Scrobble response."""
    status: str
    message: str


# In-memory session storage (in production, store in database per user)
_current_session: dict = {}


@router.get("/status", response_model=LastfmStatusResponse)
async def get_lastfm_status() -> LastfmStatusResponse:
    """Get Last.fm connection status."""
    lastfm = get_lastfm_service()

    if not lastfm.is_configured():
        return LastfmStatusResponse(
            configured=False,
            connected=False
        )

    return LastfmStatusResponse(
        configured=True,
        connected=bool(_current_session.get("session_key")),
        username=_current_session.get("username")
    )


@router.get("/auth", response_model=LastfmAuthResponse)
async def get_auth_url() -> LastfmAuthResponse:
    """Get the Last.fm authorization URL."""
    lastfm = get_lastfm_service()

    if not lastfm.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Last.fm API not configured. Set LASTFM_API_KEY and LASTFM_API_SECRET."
        )

    # Callback URL - frontend will handle the token
    callback_url = "http://localhost:3000/settings?lastfm_callback=true"
    auth_url = lastfm.get_auth_url(callback_url)

    return LastfmAuthResponse(auth_url=auth_url)


@router.post("/callback", response_model=LastfmCallbackResponse)
async def handle_callback(token: str = Query(...)) -> LastfmCallbackResponse:
    """
    Handle the Last.fm auth callback.
    Exchange the token for a session key.
    """
    lastfm = get_lastfm_service()

    if not lastfm.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Last.fm API not configured"
        )

    try:
        session = await lastfm.get_session(token)

        # Store session
        _current_session["session_key"] = session.session_key
        _current_session["username"] = session.username

        return LastfmCallbackResponse(
            status="connected",
            username=session.username
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to authenticate with Last.fm: {str(e)}"
        )


@router.post("/disconnect")
async def disconnect() -> dict:
    """Disconnect from Last.fm."""
    _current_session.clear()
    return {"status": "disconnected"}


@router.post("/now-playing", response_model=ScrobbleResponse)
async def update_now_playing(
    db: DbSession,
    request: ScrobbleRequest,
) -> ScrobbleResponse:
    """Update the "now playing" status on Last.fm."""
    if not _current_session.get("session_key"):
        raise HTTPException(
            status_code=400,
            detail="Not connected to Last.fm"
        )

    # Get track from database
    query = select(Track).where(Track.id == UUID(request.track_id))
    result = await db.execute(query)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.title or not track.artist:
        raise HTTPException(
            status_code=400,
            detail="Track must have title and artist for scrobbling"
        )

    lastfm = get_lastfm_service()
    success = await lastfm.update_now_playing(
        session_key=_current_session["session_key"],
        artist=track.artist,
        track=track.title,
        album=track.album,
        duration=int(track.duration_seconds) if track.duration_seconds else None
    )

    if success:
        return ScrobbleResponse(
            status="success",
            message=f"Now playing: {track.artist} - {track.title}"
        )
    else:
        return ScrobbleResponse(
            status="error",
            message="Failed to update now playing"
        )


@router.post("/scrobble", response_model=ScrobbleResponse)
async def scrobble_track(
    db: DbSession,
    request: ScrobbleRequest,
) -> ScrobbleResponse:
    """
    Scrobble a track to Last.fm.
    Should be called after 50% of the track has been played.
    """
    if not _current_session.get("session_key"):
        raise HTTPException(
            status_code=400,
            detail="Not connected to Last.fm"
        )

    # Get track from database
    query = select(Track).where(Track.id == UUID(request.track_id))
    result = await db.execute(query)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.title or not track.artist:
        raise HTTPException(
            status_code=400,
            detail="Track must have title and artist for scrobbling"
        )

    lastfm = get_lastfm_service()
    timestamp = request.timestamp or int(time.time())

    success = await lastfm.scrobble(
        session_key=_current_session["session_key"],
        artist=track.artist,
        track=track.title,
        timestamp=timestamp,
        album=track.album,
        duration=int(track.duration_seconds) if track.duration_seconds else None
    )

    if success:
        return ScrobbleResponse(
            status="success",
            message=f"Scrobbled: {track.artist} - {track.title}"
        )
    else:
        return ScrobbleResponse(
            status="error",
            message="Failed to scrobble track"
        )
