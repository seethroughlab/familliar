"""Recommendations service for discovering similar artists and tracks."""

import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Playlist, PlaylistTrack, Track
from app.services.bandcamp import BandcampService
from app.services.lastfm import get_lastfm_service

logger = logging.getLogger(__name__)


@dataclass
class RecommendedArtist:
    """A recommended artist."""

    name: str
    source: str  # "lastfm" or "bandcamp"
    match_score: float  # 0-1 similarity
    image_url: str | None
    external_url: str | None
    local_track_count: int  # How many tracks by this artist are in the library


@dataclass
class RecommendedTrack:
    """A recommended track."""

    title: str
    artist: str
    source: str  # "lastfm" or "bandcamp"
    match_score: float  # 0-1 similarity
    external_url: str | None
    local_track_id: str | None  # If track exists in library


@dataclass
class Recommendations:
    """Recommendations for a playlist."""

    artists: list[RecommendedArtist]
    tracks: list[RecommendedTrack]
    sources_used: list[str]


class RecommendationsService:
    """Service for generating recommendations based on playlist content."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.lastfm = get_lastfm_service()
        self.bandcamp = BandcampService()

    async def get_playlist_recommendations(
        self,
        playlist_id: UUID,
        artist_limit: int = 10,
        track_limit: int = 10,
    ) -> Recommendations:
        """Get recommendations based on a playlist's content.

        Extracts unique artists from the playlist, then:
        - If Last.fm is configured: Gets similar artists/tracks from Last.fm
        - Fallback: Searches Bandcamp for each artist

        Returns recommendations matched against local library.
        """
        # Get playlist with tracks
        playlist = await self.db.get(Playlist, playlist_id)
        if not playlist:
            return Recommendations(artists=[], tracks=[], sources_used=[])

        # Get unique artists from playlist
        artists = await self._get_playlist_artists(playlist_id)
        if not artists:
            return Recommendations(artists=[], tracks=[], sources_used=[])

        sources_used: list[str] = []
        recommended_artists: list[RecommendedArtist] = []
        recommended_tracks: list[RecommendedTrack] = []

        # Try Last.fm first
        if self.lastfm.is_configured():
            sources_used.append("lastfm")
            lastfm_artists, lastfm_tracks = await self._get_lastfm_recommendations(
                artists, artist_limit, track_limit
            )
            recommended_artists.extend(lastfm_artists)
            recommended_tracks.extend(lastfm_tracks)
        else:
            # Fallback to Bandcamp
            sources_used.append("bandcamp")
            bandcamp_artists = await self._get_bandcamp_recommendations(
                artists, artist_limit
            )
            recommended_artists.extend(bandcamp_artists)

        # Deduplicate and sort by match score
        recommended_artists = self._dedupe_artists(recommended_artists)[:artist_limit]
        recommended_tracks = self._dedupe_tracks(recommended_tracks)[:track_limit]

        return Recommendations(
            artists=recommended_artists,
            tracks=recommended_tracks,
            sources_used=sources_used,
        )

    async def _get_playlist_artists(self, playlist_id: UUID) -> list[str]:
        """Get unique artist names from a playlist."""
        result = await self.db.execute(
            select(Track.artist)
            .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
            .where(PlaylistTrack.playlist_id == playlist_id)
            .where(Track.artist.isnot(None))
            .distinct()
        )
        artists = [row[0] for row in result.all() if row[0]]
        return artists[:10]  # Limit to avoid too many API calls

    async def _get_lastfm_recommendations(
        self,
        artists: list[str],
        artist_limit: int,
        track_limit: int,
    ) -> tuple[list[RecommendedArtist], list[RecommendedTrack]]:
        """Get recommendations from Last.fm."""
        recommended_artists: list[RecommendedArtist] = []
        recommended_tracks: list[RecommendedTrack] = []

        # Get similar artists for each playlist artist
        for artist in artists[:5]:  # Limit API calls
            try:
                similar = await self.lastfm.get_similar_artists(artist, limit=5)
                for item in similar:
                    name = item.get("name", "")
                    if not name:
                        continue

                    # Get match score (0-1)
                    match_str = item.get("match", "0")
                    try:
                        match_score = float(match_str)
                    except (ValueError, TypeError):
                        match_score = 0.5

                    # Get image URL (Last.fm provides multiple sizes)
                    image_url = None
                    images = item.get("image", [])
                    if images:
                        # Get largest image
                        for img in reversed(images):
                            if img.get("#text"):
                                image_url = img["#text"]
                                break

                    # Check local library
                    local_count = await self._count_artist_tracks(name)

                    recommended_artists.append(
                        RecommendedArtist(
                            name=name,
                            source="lastfm",
                            match_score=match_score,
                            image_url=image_url,
                            external_url=item.get("url"),
                            local_track_count=local_count,
                        )
                    )
            except Exception as e:
                logger.warning(f"Failed to get similar artists for {artist}: {e}")

        # Get similar tracks for some playlist tracks
        playlist_tracks = await self._get_sample_tracks(artists)
        for track_artist, track_title in playlist_tracks[:3]:
            try:
                similar = await self.lastfm.get_similar_tracks(
                    track_artist, track_title, limit=5
                )
                for item in similar:
                    title = item.get("name", "")
                    artist_info = item.get("artist", {})
                    artist_name = (
                        artist_info.get("name", "")
                        if isinstance(artist_info, dict)
                        else str(artist_info)
                    )

                    if not title or not artist_name:
                        continue

                    # Get match score
                    match_str = item.get("match", "0")
                    try:
                        match_score = float(match_str)
                    except (ValueError, TypeError):
                        match_score = 0.5

                    # Check if track exists locally
                    local_track_id = await self._find_local_track(artist_name, title)

                    recommended_tracks.append(
                        RecommendedTrack(
                            title=title,
                            artist=artist_name,
                            source="lastfm",
                            match_score=match_score,
                            external_url=item.get("url"),
                            local_track_id=local_track_id,
                        )
                    )
            except Exception as e:
                logger.warning(
                    f"Failed to get similar tracks for {track_title}: {e}"
                )

        return recommended_artists, recommended_tracks

    async def _get_bandcamp_recommendations(
        self,
        artists: list[str],
        limit: int,
    ) -> list[RecommendedArtist]:
        """Get recommendations from Bandcamp search."""
        recommended: list[RecommendedArtist] = []

        for artist in artists[:5]:  # Limit searches
            try:
                results = await self.bandcamp.search(artist, item_type="b", limit=3)
                for result in results:
                    if not result.name:
                        continue

                    # Skip if it's the same artist
                    if result.name.lower() == artist.lower():
                        continue

                    # Check local library
                    local_count = await self._count_artist_tracks(result.name)

                    recommended.append(
                        RecommendedArtist(
                            name=result.name,
                            source="bandcamp",
                            match_score=0.5,  # Bandcamp doesn't provide similarity
                            image_url=result.image_url,
                            external_url=result.url,
                            local_track_count=local_count,
                        )
                    )
            except Exception as e:
                logger.warning(f"Failed to search Bandcamp for {artist}: {e}")

        return recommended

    async def _count_artist_tracks(self, artist: str) -> int:
        """Count how many tracks by this artist are in the library."""
        result = await self.db.execute(
            select(func.count(Track.id)).where(
                func.lower(Track.artist) == artist.lower()
            )
        )
        return result.scalar() or 0

    async def _find_local_track(self, artist: str, title: str) -> str | None:
        """Find a track in the local library by artist and title."""
        result = await self.db.execute(
            select(Track.id).where(
                func.lower(Track.artist) == artist.lower(),
                func.lower(Track.title) == title.lower(),
            )
        )
        row = result.first()
        return str(row[0]) if row else None

    async def _get_sample_tracks(
        self, artists: list[str]
    ) -> list[tuple[str, str]]:
        """Get sample tracks from the library for the given artists."""
        tracks: list[tuple[str, str]] = []
        for artist in artists[:3]:
            result = await self.db.execute(
                select(Track.artist, Track.title)
                .where(func.lower(Track.artist) == artist.lower())
                .limit(2)
            )
            for row in result.all():
                if row[0] and row[1]:
                    tracks.append((row[0], row[1]))
        return tracks

    def _dedupe_artists(
        self, artists: list[RecommendedArtist]
    ) -> list[RecommendedArtist]:
        """Deduplicate artists by name, keeping highest match score."""
        seen: dict[str, RecommendedArtist] = {}
        for artist in artists:
            key = artist.name.lower()
            if key not in seen or artist.match_score > seen[key].match_score:
                seen[key] = artist
        # Sort by match score descending
        return sorted(seen.values(), key=lambda a: a.match_score, reverse=True)

    def _dedupe_tracks(
        self, tracks: list[RecommendedTrack]
    ) -> list[RecommendedTrack]:
        """Deduplicate tracks by artist+title, keeping highest match score."""
        seen: dict[str, RecommendedTrack] = {}
        for track in tracks:
            key = f"{track.artist.lower()}:{track.title.lower()}"
            if key not in seen or track.match_score > seen[key].match_score:
                seen[key] = track
        # Sort by match score descending
        return sorted(seen.values(), key=lambda t: t.match_score, reverse=True)

    async def close(self) -> None:
        """Close resources."""
        await self.bandcamp.close()
