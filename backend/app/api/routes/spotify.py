"""Spotify integration endpoints."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete

from app.api.deps import CurrentProfile, DbSession
from app.db.models import SpotifyFavorite, SpotifyProfile
from app.services.spotify import SpotifyService, SpotifySyncService

router = APIRouter(prefix="/spotify", tags=["spotify"])


class SpotifyStatusResponse(BaseModel):
    """Spotify connection status."""
    configured: bool
    connected: bool
    spotify_user_id: str | None = None
    last_sync: str | None = None
    stats: dict | None = None


class SyncResponse(BaseModel):
    """Sync operation response."""
    status: str
    message: str
    stats: dict | None = None


class StoreSearchLink(BaseModel):
    """Search link for a music store."""
    name: str
    url: str


class UnmatchedTrack(BaseModel):
    """Unmatched Spotify track with search links."""
    spotify_id: str
    name: str | None
    artist: str | None
    album: str | None
    added_at: str | None
    popularity: int | None = None  # Spotify popularity score (0-100)
    search_links: dict[str, StoreSearchLink] = {}


@router.get("/status", response_model=SpotifyStatusResponse)
async def get_spotify_status(
    db: DbSession,
    profile: CurrentProfile,
) -> SpotifyStatusResponse:
    """Check Spotify connection status.

    Requires X-Profile-ID header.
    """
    spotify_service = SpotifyService()

    if not spotify_service.is_configured():
        return SpotifyStatusResponse(
            configured=False,
            connected=False,
        )

    if not profile:
        return SpotifyStatusResponse(
            configured=True,
            connected=False,
        )

    # Check if profile has connected Spotify
    sync_service = SpotifySyncService(db)
    try:
        stats = await sync_service.get_sync_stats(profile.id)
        connected = stats.get("spotify_user_id") is not None
    except Exception:
        connected = False
        stats = None

    return SpotifyStatusResponse(
        configured=True,
        connected=connected,
        spotify_user_id=stats.get("spotify_user_id") if stats else None,
        last_sync=stats.get("last_sync") if stats else None,
        stats=stats,
    )


@router.get("/auth")
async def spotify_auth(profile: CurrentProfile) -> dict:
    """Get Spotify OAuth authorization URL.

    Requires X-Profile-ID header.
    """
    if not profile:
        raise HTTPException(
            status_code=401,
            detail="Profile ID required - register at POST /profiles/register",
        )

    spotify_service = SpotifyService()

    if not spotify_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Spotify credentials not configured. Add them in Settings.",
        )

    auth_url, state = spotify_service.get_auth_url(profile.id)

    return {
        "auth_url": auth_url,
        "state": state,
    }


@router.get("/callback")
async def spotify_callback(
    db: DbSession,
    code: str = Query(...),
    state: str = Query(...),
    error: str | None = Query(None),
) -> RedirectResponse:
    """Handle Spotify OAuth callback.

    The profile_id is encoded in the state parameter from the auth request.
    """
    if error:
        # Redirect to frontend with error
        return RedirectResponse(
            url=f"http://localhost:3000/settings?spotify_error={error}"
        )

    spotify_service = SpotifyService()

    try:
        spotify_profile = await spotify_service.handle_callback(db, code, state)

        # Redirect to frontend with success
        return RedirectResponse(
            url=f"http://localhost:3000/settings?spotify_connected=true&spotify_user={spotify_profile.spotify_user_id}"
        )
    except Exception as e:
        return RedirectResponse(
            url=f"http://localhost:3000/settings?spotify_error={str(e)}"
        )


@router.post("/sync", response_model=SyncResponse)
async def sync_spotify(
    db: DbSession,
    profile: CurrentProfile,
    include_top_tracks: bool = Query(True),
) -> SyncResponse:
    """Sync Spotify favorites to local database.

    Requires X-Profile-ID header.
    """
    if not profile:
        raise HTTPException(
            status_code=401,
            detail="Profile ID required",
        )

    sync_service = SpotifySyncService(db)

    try:
        # Sync saved tracks
        stats = await sync_service.sync_favorites(profile.id)

        # Optionally sync top tracks
        if include_top_tracks:
            top_stats = await sync_service.sync_top_tracks(profile.id)
            stats["top_tracks_fetched"] = top_stats["fetched"]
            stats["top_tracks_new"] = top_stats["new"]

        return SyncResponse(
            status="success",
            message=f"Synced {stats['fetched']} tracks, {stats['matched']} matched to local library",
            stats=stats,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/unmatched", response_model=list[UnmatchedTrack])
async def get_unmatched_tracks(
    db: DbSession,
    profile: CurrentProfile,
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("popularity", enum=["popularity", "added_at"]),
) -> list[UnmatchedTrack]:
    """Get Spotify favorites that don't have local matches.

    Requires X-Profile-ID header.
    Sorted by listening preference (popularity) by default.
    Includes search links for Bandcamp, Discogs, Qobuz, etc.
    """
    if not profile:
        raise HTTPException(
            status_code=401,
            detail="Profile ID required",
        )

    from app.services.search_links import generate_search_urls

    sync_service = SpotifySyncService(db)

    try:
        unmatched = await sync_service.get_unmatched_favorites(profile.id, limit)

        # Generate search links and sort by preference
        result = []
        for track in unmatched:
            artist = track.get("artist") or "Unknown Artist"
            name = track.get("name") or "Unknown Track"
            album = track.get("album")

            # Generate search links for all stores
            links = generate_search_urls(artist, name, album)
            search_links = {
                key: StoreSearchLink(name=val["name"], url=val["url"])
                for key, val in links.items()
            }

            result.append(UnmatchedTrack(
                spotify_id=track["spotify_id"],
                name=name,
                artist=artist,
                album=album,
                added_at=track.get("added_at"),
                popularity=track.get("popularity"),
                search_links=search_links,
            ))

        # Sort by preference
        if sort_by == "popularity":
            result.sort(key=lambda t: t.popularity or 0, reverse=True)
        elif sort_by == "added_at":
            result.sort(key=lambda t: t.added_at or "", reverse=True)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect")
async def disconnect_spotify(
    db: DbSession,
    profile: CurrentProfile,
) -> dict:
    """Disconnect Spotify account.

    Requires X-Profile-ID header.
    """
    if not profile:
        raise HTTPException(
            status_code=401,
            detail="Profile ID required",
        )

    # Delete favorites first (foreign key)
    await db.execute(
        delete(SpotifyFavorite).where(SpotifyFavorite.profile_id == profile.id)
    )

    # Delete Spotify profile
    await db.execute(
        delete(SpotifyProfile).where(SpotifyProfile.profile_id == profile.id)
    )

    await db.commit()

    return {"status": "disconnected"}
