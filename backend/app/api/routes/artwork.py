"""Artwork endpoints for proactive artwork downloading."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.artwork import compute_album_hash, get_artwork_path
from app.services.background import get_background_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/artwork", tags=["artwork"])


class ArtworkQueueRequest(BaseModel):
    """Request to queue artwork for download."""

    artist: str
    album: str
    track_id: str | None = None  # Optional track ID for fallback extraction


class ArtworkQueueBatchRequest(BaseModel):
    """Request to queue multiple artworks for download."""

    items: list[ArtworkQueueRequest]


class ArtworkStatusResponse(BaseModel):
    """Response with artwork status."""

    album_hash: str
    exists: bool
    queued: bool = False


@router.post("/queue", status_code=202)
async def queue_artwork_download(request: ArtworkQueueRequest) -> dict[str, Any]:
    """Queue a single album for artwork download.

    Returns immediately (202 Accepted). Artwork will be fetched in background.
    """
    album_hash = compute_album_hash(request.artist, request.album)

    # Check if artwork already exists
    full_path = get_artwork_path(album_hash, "full")
    if full_path.exists():
        return {
            "status": "exists",
            "album_hash": album_hash,
            "message": "Artwork already exists",
        }

    # Queue for background download
    bg = get_background_manager()
    await bg.queue_artwork_fetch(
        album_hash=album_hash,
        artist=request.artist,
        album=request.album,
        track_id=request.track_id,
    )

    return {
        "status": "queued",
        "album_hash": album_hash,
        "message": "Artwork queued for download",
    }


@router.post("/queue/batch", status_code=202)
async def queue_artwork_batch(request: ArtworkQueueBatchRequest) -> dict[str, Any]:
    """Queue multiple albums for artwork download.

    Returns immediately (202 Accepted). Artworks will be fetched in background.
    Duplicates and existing artworks are automatically filtered.
    """
    bg = get_background_manager()

    queued = []
    exists = []
    seen_hashes: set[str] = set()

    for item in request.items:
        album_hash = compute_album_hash(item.artist, item.album)

        # Skip duplicates in this batch
        if album_hash in seen_hashes:
            continue
        seen_hashes.add(album_hash)

        # Check if artwork already exists
        full_path = get_artwork_path(album_hash, "full")
        if full_path.exists():
            exists.append(album_hash)
            continue

        # Queue for background download
        await bg.queue_artwork_fetch(
            album_hash=album_hash,
            artist=item.artist,
            album=item.album,
            track_id=item.track_id,
        )
        queued.append(album_hash)

    return {
        "status": "accepted",
        "queued_count": len(queued),
        "existing_count": len(exists),
        "queued_hashes": queued,
        "existing_hashes": exists,
    }


@router.get("/status/{album_hash}")
async def get_artwork_status(album_hash: str) -> ArtworkStatusResponse:
    """Check if artwork exists for an album hash."""
    full_path = get_artwork_path(album_hash, "full")
    thumb_path = get_artwork_path(album_hash, "thumb")

    return ArtworkStatusResponse(
        album_hash=album_hash,
        exists=full_path.exists() and thumb_path.exists(),
    )


@router.get("/{album_hash}/{size}")
async def get_artwork_by_hash(album_hash: str, size: str) -> Any:
    """Get artwork by album hash.

    This is the preferred endpoint for fetching artwork as it uses
    the stable album hash directly rather than requiring a track ID.
    """
    from starlette.responses import FileResponse

    if size not in ("full", "thumb"):
        raise HTTPException(status_code=400, detail="Size must be 'full' or 'thumb'")

    artwork_path = get_artwork_path(album_hash, size)

    if not artwork_path.exists():
        raise HTTPException(status_code=404, detail="Artwork not found")

    return FileResponse(
        artwork_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000"},
    )


class ArtworkStatusBatchRequest(BaseModel):
    """Request to check status of multiple album hashes."""

    hashes: list[str]


class ArtworkStatusBatchResponse(BaseModel):
    """Response with status for multiple album hashes."""

    status: dict[str, bool]  # hash -> exists


@router.post("/status/batch")
async def check_artwork_batch(request: ArtworkStatusBatchRequest) -> ArtworkStatusBatchResponse:
    """Check if artwork exists for multiple album hashes.

    Returns a map of hash -> exists (bool).
    Used by frontend to poll for artwork completion.
    """
    result = {}
    for h in request.hashes:
        thumb_path = get_artwork_path(h, "thumb")
        result[h] = thumb_path.exists()

    return ArtworkStatusBatchResponse(status=result)


@router.head("/check/{artist}/{album}")
async def check_artwork_exists(artist: str, album: str) -> None:
    """Fast HEAD request to check if artwork exists.

    Returns 200 if artwork exists, 404 if not.
    Used by frontend for quick existence checks without body overhead.
    """
    album_hash = compute_album_hash(artist, album)
    full_path = get_artwork_path(album_hash, "full")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Artwork not found")

    # 200 OK (no body for HEAD request)
