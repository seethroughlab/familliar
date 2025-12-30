"""New releases discovery service for finding new music from library artists."""

import logging
import unicodedata
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from rapidfuzz import fuzz
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ArtistCheckCache, ArtistNewRelease, Track
from app.services.search_links import generate_release_search_urls

logger = logging.getLogger(__name__)


def normalize_artist_name(name: str) -> str:
    """Normalize artist name for consistent matching.

    - Lowercase
    - Remove diacritics
    - Collapse whitespace
    """
    # Lowercase
    name = name.lower().strip()

    # Remove diacritics (é -> e, etc.)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))

    # Collapse whitespace
    name = " ".join(name.split())

    return name


class NewReleasesService:
    """Service for discovering new releases from artists in the user's library."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_library_artists(self) -> list[dict[str, Any]]:
        """Get unique artists from the library with their IDs.

        Returns:
            List of artist info dicts with name, normalized name, and IDs
        """
        # Get distinct artists with their MusicBrainz IDs
        result = await self.db.execute(
            select(
                Track.artist,
                Track.album_artist,
                Track.musicbrainz_artist_id,
            )
            .where(Track.artist.isnot(None))
            .distinct()
        )
        rows = result.fetchall()

        # Collect unique artists
        artists: dict[str, dict[str, Any]] = {}

        for row in rows:
            # Use album_artist if available, else artist
            artist_name = row.album_artist or row.artist
            if not artist_name:
                continue

            normalized = normalize_artist_name(artist_name)
            if not normalized:
                continue

            # Track by normalized name to avoid duplicates
            if normalized not in artists:
                artists[normalized] = {
                    "name": artist_name,
                    "normalized_name": normalized,
                    "musicbrainz_artist_id": row.musicbrainz_artist_id,
                }
            elif row.musicbrainz_artist_id and not artists[normalized].get("musicbrainz_artist_id"):
                # Prefer entries with MusicBrainz ID
                artists[normalized]["musicbrainz_artist_id"] = row.musicbrainz_artist_id

        return list(artists.values())

    async def get_artist_check_cache(self, artist_normalized: str) -> ArtistCheckCache | None:
        """Get cache entry for artist if it exists and is recent."""
        result = await self.db.execute(
            select(ArtistCheckCache).where(
                ArtistCheckCache.artist_name_normalized == artist_normalized
            )
        )
        return result.scalar_one_or_none()

    async def should_check_artist(
        self,
        artist_normalized: str,
        cache_hours: int = 24,
    ) -> bool:
        """Check if we should query external APIs for this artist.

        Returns True if:
        - No cache entry exists
        - Cache entry is older than cache_hours
        """
        cache = await self.get_artist_check_cache(artist_normalized)
        if not cache:
            return True

        cutoff = datetime.utcnow() - timedelta(hours=cache_hours)
        return cache.last_checked_at < cutoff

    async def update_artist_cache(
        self,
        artist_normalized: str,
        musicbrainz_id: str | None = None,
        spotify_id: str | None = None,
    ) -> None:
        """Update or create artist check cache entry."""
        cache = await self.get_artist_check_cache(artist_normalized)

        if cache:
            cache.last_checked_at = datetime.utcnow()
            if musicbrainz_id:
                cache.musicbrainz_artist_id = musicbrainz_id
            if spotify_id:
                cache.spotify_artist_id = spotify_id
        else:
            cache = ArtistCheckCache(
                artist_name_normalized=artist_normalized,
                musicbrainz_artist_id=musicbrainz_id,
                spotify_artist_id=spotify_id,
                last_checked_at=datetime.utcnow(),
            )
            self.db.add(cache)

        await self.db.flush()

    async def check_if_user_has_release(
        self,
        artist_name: str,
        album_name: str,
        musicbrainz_album_id: str | None = None,
    ) -> bool:
        """Check if user already has this release in their library.

        Matching strategy:
        1. MusicBrainz Album ID (exact match)
        2. Exact album + artist name
        3. Fuzzy match (> 85%)
        """
        # 1. Try MusicBrainz ID match
        if musicbrainz_album_id:
            result = await self.db.execute(
                select(func.count(Track.id)).where(
                    Track.musicbrainz_album_id == musicbrainz_album_id
                )
            )
            if (result.scalar() or 0) > 0:
                return True

        # Normalize names
        artist_lower = artist_name.lower().strip()
        album_lower = album_name.lower().strip()

        # 2. Try exact match
        result = await self.db.execute(
            select(func.count(Track.id)).where(
                func.lower(Track.artist) == artist_lower,
                func.lower(Track.album) == album_lower,
            )
        )
        if (result.scalar() or 0) > 0:
            return True

        # 3. Fuzzy match - get candidate albums
        result = await self.db.execute(
            select(Track.album, Track.artist)
            .where(
                Track.album.isnot(None),
                func.lower(Track.artist).contains(artist_lower[:10])  # Rough filter
            )
            .distinct()
            .limit(500)
        )
        candidates = result.fetchall()

        for track_album, track_artist in candidates:
            if not track_album or not track_artist:
                continue

            album_score = fuzz.ratio(album_lower, track_album.lower())
            artist_score = fuzz.ratio(artist_lower, track_artist.lower())

            # Weighted: album name matters more
            combined = (album_score * 0.7) + (artist_score * 0.3)
            if combined >= 85:
                return True

        return False

    async def save_discovered_release(
        self,
        artist_name: str,
        release_id: str,
        source: str,
        release_name: str,
        release_type: str | None = None,
        release_date: datetime | None = None,
        artwork_url: str | None = None,
        external_url: str | None = None,
        track_count: int | None = None,
        extra_data: dict[str, Any] | None = None,
        musicbrainz_artist_id: str | None = None,
        spotify_artist_id: str | None = None,
    ) -> ArtistNewRelease | None:
        """Save a discovered release if it doesn't exist.

        Returns the release if newly created, None if it already exists.
        """
        # Check if release already exists
        existing = await self.db.execute(
            select(ArtistNewRelease).where(
                ArtistNewRelease.source == source,
                ArtistNewRelease.release_id == release_id,
            )
        )
        if existing.scalar_one_or_none():
            return None

        # Check if user already has this release
        local_match = await self.check_if_user_has_release(
            artist_name, release_name
        )

        release = ArtistNewRelease(
            artist_name=artist_name,
            artist_name_normalized=normalize_artist_name(artist_name),
            musicbrainz_artist_id=musicbrainz_artist_id,
            spotify_artist_id=spotify_artist_id,
            release_id=release_id,
            source=source,
            release_name=release_name,
            release_type=release_type,
            release_date=release_date,
            artwork_url=artwork_url,
            external_url=external_url,
            track_count=track_count,
            extra_data=extra_data or {},
            local_album_match=local_match,
        )
        self.db.add(release)
        await self.db.flush()

        return release

    async def get_cached_releases(
        self,
        limit: int = 50,
        offset: int = 0,
        include_dismissed: bool = False,
        include_owned: bool = False,
    ) -> list[dict[str, Any]]:
        """Get cached new releases.

        Args:
            limit: Max releases to return
            offset: Pagination offset
            include_dismissed: Include releases user dismissed
            include_owned: Include releases user already owns

        Returns:
            List of release dicts with purchase links
        """
        query = select(ArtistNewRelease)

        if not include_dismissed:
            query = query.where(ArtistNewRelease.dismissed == False)  # noqa: E712

        if not include_owned:
            query = query.where(ArtistNewRelease.local_album_match == False)  # noqa: E712

        query = query.order_by(
            ArtistNewRelease.release_date.desc().nullslast(),
            ArtistNewRelease.discovered_at.desc(),
        ).offset(offset).limit(limit)

        result = await self.db.execute(query)
        releases = result.scalars().all()

        return [
            {
                "id": str(release.id),
                "artist_name": release.artist_name,
                "release_name": release.release_name,
                "release_type": release.release_type,
                "release_date": release.release_date.isoformat() if release.release_date else None,
                "artwork_url": release.artwork_url,
                "external_url": release.external_url,
                "track_count": release.track_count,
                "source": release.source,
                "local_album_match": release.local_album_match,
                "dismissed": release.dismissed,
                "discovered_at": release.discovered_at.isoformat(),
                "purchase_links": generate_release_search_urls(
                    release.artist_name, release.release_name
                ),
            }
            for release in releases
        ]

    async def get_releases_count(
        self,
        include_dismissed: bool = False,
        include_owned: bool = False,
    ) -> int:
        """Get total count of cached releases."""
        query = select(func.count(ArtistNewRelease.id))

        if not include_dismissed:
            query = query.where(ArtistNewRelease.dismissed == False)  # noqa: E712

        if not include_owned:
            query = query.where(ArtistNewRelease.local_album_match == False)  # noqa: E712

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def dismiss_release(
        self,
        release_id: UUID,
        profile_id: UUID,
    ) -> bool:
        """Mark a release as dismissed.

        Returns True if release was found and updated.
        """
        result = await self.db.execute(
            select(ArtistNewRelease).where(ArtistNewRelease.id == release_id)
        )
        release = result.scalar_one_or_none()

        if not release:
            return False

        release.dismissed = True
        release.dismissed_by_profile_id = profile_id
        await self.db.flush()

        return True

    async def get_check_status(self) -> dict[str, Any]:
        """Get status of new releases checking."""
        # Get counts
        total_releases = await self.get_releases_count(
            include_dismissed=True, include_owned=True
        )
        new_releases = await self.get_releases_count()

        # Get most recent check time
        result = await self.db.execute(
            select(func.max(ArtistCheckCache.last_checked_at))
        )
        last_check = result.scalar()

        # Count artists checked
        result = await self.db.execute(
            select(func.count(ArtistCheckCache.artist_name_normalized))
        )
        artists_checked = result.scalar() or 0

        # Count library artists
        artists = await self.get_library_artists()

        return {
            "total_releases_found": total_releases,
            "new_releases_available": new_releases,
            "artists_in_library": len(artists),
            "artists_checked": artists_checked,
            "last_check_at": last_check.isoformat() if last_check else None,
        }
