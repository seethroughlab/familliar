"""Bandcamp API endpoints for searching and discovering music."""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import RequiredProfile
from app.db.models import Profile
from app.services.bandcamp import BandcampService

router = APIRouter(prefix="/bandcamp", tags=["bandcamp"])


class BandcampSearchResult(BaseModel):
    """A single Bandcamp search result."""

    result_type: str
    name: str
    artist: str | None
    url: str
    image_url: str | None
    genre: str | None
    release_date: str | None


class BandcampSearchResponse(BaseModel):
    """Response for Bandcamp search."""

    query: str
    results: list[BandcampSearchResult]


class BandcampAlbumDetails(BaseModel):
    """Detailed album info from Bandcamp."""

    name: str | None
    artist: str | None
    url: str
    price: str | None
    tracks: list[str]
    track_count: int
    image_url: str | None
    tags: list[str]


@router.get("/search", response_model=BandcampSearchResponse)
async def search_bandcamp(
    profile: RequiredProfile,
    q: str = Query(..., min_length=1, description="Search query"),
    item_type: str = Query("a", pattern="^[atb]$", description="a=album, t=track, b=artist"),
    limit: int = Query(10, ge=1, le=50),
):
    """Search Bandcamp for albums, tracks, or artists.

    Use this to find music to purchase on Bandcamp.
    """
    bc = BandcampService()
    try:
        results = await bc.search(query=q, item_type=item_type, limit=limit)
        return BandcampSearchResponse(
            query=q,
            results=[
                BandcampSearchResult(
                    result_type=r.result_type,
                    name=r.name,
                    artist=r.artist,
                    url=r.url,
                    image_url=r.image_url,
                    genre=r.genre,
                    release_date=r.release_date,
                )
                for r in results
            ],
        )
    finally:
        await bc.close()


@router.get("/album", response_model=BandcampAlbumDetails)
async def get_album_details(
    profile: RequiredProfile,
    url: str = Query(..., description="Bandcamp album URL"),
):
    """Get detailed information about a Bandcamp album.

    Includes track list, price, and tags.
    """
    bc = BandcampService()
    try:
        details = await bc.get_album_details(url)
        if not details:
            return BandcampAlbumDetails(
                name=None,
                artist=None,
                url=url,
                price=None,
                tracks=[],
                track_count=0,
                image_url=None,
                tags=[],
            )
        return BandcampAlbumDetails(**details)
    finally:
        await bc.close()
