"""Spotify integration service for OAuth and sync."""

import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import spotipy
from spotipy.oauth2 import SpotifyOAuth
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import SpotifyFavorite, SpotifyProfile, Track
from app.services.app_settings import get_app_settings_service


class SpotifyService:
    """Handles Spotify OAuth and API interactions."""

    # OAuth scopes needed for sync
    SCOPES = [
        "user-library-read",       # Saved tracks
        "user-top-read",           # Top tracks/artists
        "user-read-recently-played",  # Recently played
        "playlist-read-private",   # User playlists
    ]

    def __init__(self) -> None:
        # Redirect to backend OAuth callback endpoint
        # Using 127.0.0.1 instead of localhost for Spotify's security requirements
        self.redirect_uri = "http://127.0.0.1:8000/api/v1/spotify/callback"

    def _get_credentials(self) -> tuple[str | None, str | None]:
        """Get Spotify credentials from app settings or env fallback."""
        app_settings = get_app_settings_service().get()
        client_id = app_settings.spotify_client_id or settings.spotify_client_id
        client_secret = app_settings.spotify_client_secret or settings.spotify_client_secret
        return client_id, client_secret

    def is_configured(self) -> bool:
        """Check if Spotify credentials are configured."""
        client_id, client_secret = self._get_credentials()
        return bool(client_id and client_secret)

    def get_auth_url(self, profile_id: UUID) -> tuple[str, str]:
        """Generate OAuth authorization URL.

        Args:
            profile_id: Device profile ID to associate with Spotify connection

        Returns:
            Tuple of (auth_url, state_token)
        """
        client_id, client_secret = self._get_credentials()

        # Create state token that encodes profile_id
        state = f"{profile_id}:{secrets.token_urlsafe(16)}"

        oauth = SpotifyOAuth(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=self.redirect_uri,
            scope=" ".join(self.SCOPES),
            state=state,
        )

        auth_url = oauth.get_authorize_url()
        return auth_url, state

    async def handle_callback(
        self,
        db: AsyncSession,
        code: str,
        state: str,
    ) -> SpotifyProfile:
        """Handle OAuth callback and store tokens.

        Args:
            db: Database session
            code: Authorization code from Spotify
            state: State token to verify profile

        Returns:
            SpotifyProfile with tokens stored
        """
        # Extract profile_id from state
        try:
            profile_id_str, _ = state.split(":", 1)
            profile_id = UUID(profile_id_str)
        except (ValueError, AttributeError):
            raise ValueError("Invalid OAuth state")

        # Exchange code for tokens
        client_id, client_secret = self._get_credentials()
        oauth = SpotifyOAuth(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=self.redirect_uri,
            scope=" ".join(self.SCOPES),
        )

        token_info = oauth.get_access_token(code, as_dict=True)

        # Get Spotify user profile
        sp = spotipy.Spotify(auth=token_info["access_token"])
        spotify_user = sp.current_user()

        # Calculate token expiry
        expires_at = datetime.utcnow() + timedelta(seconds=token_info.get("expires_in", 3600))

        # Upsert SpotifyProfile
        result = await db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == profile_id)
        )
        spotify_profile = result.scalar_one_or_none()

        if spotify_profile:
            spotify_profile.spotify_user_id = spotify_user["id"]
            spotify_profile.access_token = token_info["access_token"]
            spotify_profile.refresh_token = token_info.get("refresh_token")
            spotify_profile.token_expires_at = expires_at
        else:
            spotify_profile = SpotifyProfile(
                profile_id=profile_id,
                spotify_user_id=spotify_user["id"],
                access_token=token_info["access_token"],
                refresh_token=token_info.get("refresh_token"),
                token_expires_at=expires_at,
                sync_mode="periodic",
            )
            db.add(spotify_profile)

        await db.commit()
        await db.refresh(spotify_profile)
        return spotify_profile

    async def get_client(self, db: AsyncSession, profile_id: UUID) -> spotipy.Spotify | None:
        """Get authenticated Spotify client for a device profile.

        Handles token refresh automatically.
        """
        result = await db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == profile_id)
        )
        spotify_profile = result.scalar_one_or_none()

        if not spotify_profile or not spotify_profile.access_token:
            return None

        # Check if token needs refresh
        if spotify_profile.token_expires_at and spotify_profile.token_expires_at < datetime.utcnow():
            if spotify_profile.refresh_token:
                spotify_profile = await self._refresh_token(db, spotify_profile)
            else:
                return None

        return spotipy.Spotify(auth=spotify_profile.access_token)

    async def _refresh_token(
        self,
        db: AsyncSession,
        spotify_profile: SpotifyProfile,
    ) -> SpotifyProfile:
        """Refresh expired access token."""
        client_id, client_secret = self._get_credentials()
        oauth = SpotifyOAuth(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=self.redirect_uri,
        )

        token_info = oauth.refresh_access_token(spotify_profile.refresh_token)

        spotify_profile.access_token = token_info["access_token"]
        if "refresh_token" in token_info:
            spotify_profile.refresh_token = token_info["refresh_token"]
        spotify_profile.token_expires_at = datetime.utcnow() + timedelta(
            seconds=token_info.get("expires_in", 3600)
        )

        await db.commit()
        await db.refresh(spotify_profile)
        return spotify_profile


class SpotifySyncService:
    """Syncs Spotify favorites and matches to local library."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.spotify_service = SpotifyService()

    async def sync_favorites(self, profile_id: UUID) -> dict[str, int]:
        """Sync profile's Spotify saved tracks to local database.

        Returns:
            Dict with sync statistics
        """
        client = await self.spotify_service.get_client(self.db, profile_id)
        if not client:
            raise ValueError("Spotify not connected")

        stats = {"fetched": 0, "new": 0, "matched": 0, "unmatched": 0}

        # Fetch saved tracks (paginated)
        offset = 0
        limit = 50

        while True:
            results = client.current_user_saved_tracks(limit=limit, offset=offset)
            tracks = results.get("items", [])

            if not tracks:
                break

            for item in tracks:
                spotify_track = item["track"]
                if not spotify_track:
                    continue

                stats["fetched"] += 1
                added_at = item.get("added_at")

                # Check if already synced
                existing = await self.db.execute(
                    select(SpotifyFavorite).where(
                        SpotifyFavorite.profile_id == profile_id,
                        SpotifyFavorite.spotify_track_id == spotify_track["id"],
                    )
                )
                favorite = existing.scalar_one_or_none()

                # Try to match to local library
                local_match = await self._match_to_local(spotify_track)

                if favorite:
                    # Update match if found
                    if local_match and not favorite.matched_track_id:
                        favorite.matched_track_id = local_match.id
                        stats["matched"] += 1
                else:
                    # Create new favorite
                    favorite = SpotifyFavorite(
                        profile_id=profile_id,
                        spotify_track_id=spotify_track["id"],
                        matched_track_id=local_match.id if local_match else None,
                        track_data=self._extract_track_data(spotify_track),
                        added_at=datetime.fromisoformat(added_at.replace("Z", "+00:00")) if added_at else None,
                    )
                    self.db.add(favorite)
                    stats["new"] += 1

                    if local_match:
                        stats["matched"] += 1
                    else:
                        stats["unmatched"] += 1

            offset += limit

            # Safety limit
            if offset > 2000:
                break

        # Update last sync time
        profile_result = await self.db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == profile_id)
        )
        spotify_profile = profile_result.scalar_one_or_none()
        if spotify_profile:
            spotify_profile.last_sync_at = datetime.utcnow()

        await self.db.commit()
        return stats

    async def sync_top_tracks(self, profile_id: UUID, time_range: str = "medium_term") -> dict[str, int]:
        """Sync profile's top tracks.

        Args:
            time_range: short_term (4 weeks), medium_term (6 months), long_term (years)
        """
        client = await self.spotify_service.get_client(self.db, profile_id)
        if not client:
            raise ValueError("Spotify not connected")

        stats = {"fetched": 0, "new": 0, "matched": 0}

        results = client.current_user_top_tracks(limit=50, time_range=time_range)

        for spotify_track in results.get("items", []):
            stats["fetched"] += 1

            # Check if already exists
            existing = await self.db.execute(
                select(SpotifyFavorite).where(
                    SpotifyFavorite.profile_id == profile_id,
                    SpotifyFavorite.spotify_track_id == spotify_track["id"],
                )
            )

            if existing.scalar_one_or_none():
                continue

            local_match = await self._match_to_local(spotify_track)

            favorite = SpotifyFavorite(
                profile_id=profile_id,
                spotify_track_id=spotify_track["id"],
                matched_track_id=local_match.id if local_match else None,
                track_data=self._extract_track_data(spotify_track),
            )
            self.db.add(favorite)
            stats["new"] += 1

            if local_match:
                stats["matched"] += 1

        await self.db.commit()
        return stats

    async def get_unmatched_favorites(self, profile_id: UUID, limit: int = 50) -> list[dict[str, Any]]:
        """Get Spotify favorites that don't have local matches.

        Returns tracks with popularity score for preference-based sorting.
        """
        result = await self.db.execute(
            select(SpotifyFavorite)
            .where(
                SpotifyFavorite.profile_id == profile_id,
                SpotifyFavorite.matched_track_id.is_(None),
            )
            .order_by(SpotifyFavorite.added_at.desc())
            .limit(limit)
        )
        favorites = result.scalars().all()

        return [
            {
                "spotify_id": f.spotify_track_id,
                "name": f.track_data.get("name"),
                "artist": f.track_data.get("artist"),
                "album": f.track_data.get("album"),
                "added_at": f.added_at.isoformat() if f.added_at else None,
                "popularity": f.track_data.get("popularity"),  # 0-100 score from Spotify
            }
            for f in favorites
        ]

    async def get_sync_stats(self, profile_id: UUID) -> dict[str, Any]:
        """Get sync statistics for a profile."""
        # Total favorites
        total = await self.db.scalar(
            select(func.count(SpotifyFavorite.id)).where(
                SpotifyFavorite.profile_id == profile_id
            )
        ) or 0

        # Matched favorites
        matched = await self.db.scalar(
            select(func.count(SpotifyFavorite.id)).where(
                SpotifyFavorite.profile_id == profile_id,
                SpotifyFavorite.matched_track_id.isnot(None),
            )
        ) or 0

        # Get profile info
        profile_result = await self.db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == profile_id)
        )
        spotify_profile = profile_result.scalar_one_or_none()

        return {
            "total_favorites": total,
            "matched": matched,
            "unmatched": total - matched,
            "match_rate": round(matched / total * 100, 1) if total > 0 else 0,
            "last_sync": spotify_profile.last_sync_at.isoformat() if spotify_profile and spotify_profile.last_sync_at else None,
            "spotify_user_id": spotify_profile.spotify_user_id if spotify_profile else None,
        }

    async def _match_to_local(self, spotify_track: dict[str, Any]) -> Track | None:
        """Try to match a Spotify track to local library.

        Matching priority:
        1. ISRC (International Standard Recording Code) - most reliable
        2. Exact artist + title match
        3. Contains match (substring)
        4. Fuzzy matching with rapidfuzz (threshold 85%)
        """
        from rapidfuzz import fuzz

        # Extract info from Spotify track
        isrc = spotify_track.get("external_ids", {}).get("isrc")
        track_name = spotify_track.get("name", "").lower().strip()
        artists = spotify_track.get("artists", [])
        artist_name = artists[0]["name"].lower().strip() if artists else ""

        # Normalize for matching - remove common variations
        def normalize(s: str) -> str:
            """Normalize string for matching."""
            import re
            # Remove featuring/feat variations
            s = re.sub(r'\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]', '', s, flags=re.IGNORECASE)
            # Remove remaster/remix annotations
            s = re.sub(r'\s*[\(\[][^\)\]]*(?:remaster|remix|version|edit)[^\)\]]*[\)\]]', '', s, flags=re.IGNORECASE)
            # Normalize apostrophes
            s = s.replace("'", "'").replace("'", "'").replace("`", "'")
            # Remove extra whitespace
            s = ' '.join(s.split())
            return s.strip()

        normalized_track_name = normalize(track_name)
        normalized_artist_name = normalize(artist_name)

        # 1. Try ISRC match
        if isrc:
            result = await self.db.execute(
                select(Track).where(Track.isrc == isrc)
            )
            match = result.scalar_one_or_none()
            if match:
                return match

        # 2. Try exact artist + title match
        if track_name and artist_name:
            result = await self.db.execute(
                select(Track).where(
                    func.lower(Track.title) == track_name,
                    func.lower(Track.artist) == artist_name,
                )
            )
            match = result.scalar_one_or_none()
            if match:
                return match

            # 3. Try partial match (title contains, artist contains)
            result = await self.db.execute(
                select(Track).where(
                    func.lower(Track.title).contains(track_name),
                    func.lower(Track.artist).contains(artist_name),
                ).limit(1)
            )
            match = result.scalar_one_or_none()
            if match:
                return match

        # 4. Fuzzy match with rapidfuzz
        if normalized_track_name and normalized_artist_name:
            # Get candidate tracks - limit to reasonable set for performance
            result = await self.db.execute(
                select(Track)
                .where(Track.title.isnot(None), Track.artist.isnot(None))
                .limit(5000)  # Safety limit
            )
            candidates = result.scalars().all()

            best_match: Track | None = None
            best_score: float = 0.0
            threshold = 85  # Minimum combined score to accept

            for track in candidates:
                if not track.title or not track.artist:
                    continue

                local_title = normalize(track.title.lower())
                local_artist = normalize(track.artist.lower())

                # Calculate fuzzy scores
                title_score = fuzz.ratio(normalized_track_name, local_title)
                artist_score = fuzz.ratio(normalized_artist_name, local_artist)

                # Combined score with weights (title matters more)
                combined = (title_score * 0.6) + (artist_score * 0.4)

                if combined >= threshold and combined > best_score:
                    best_score = combined
                    best_match = track

            if best_match:
                return best_match

        return None

    def _extract_track_data(self, spotify_track: dict[str, Any]) -> dict[str, Any]:
        """Extract relevant data from Spotify track object."""
        artists = spotify_track.get("artists", [])
        album = spotify_track.get("album", {})

        return {
            "name": spotify_track.get("name"),
            "artist": artists[0]["name"] if artists else None,
            "artist_id": artists[0]["id"] if artists else None,
            "album": album.get("name"),
            "album_id": album.get("id"),
            "isrc": spotify_track.get("external_ids", {}).get("isrc"),
            "duration_ms": spotify_track.get("duration_ms"),
            "popularity": spotify_track.get("popularity"),
            "preview_url": spotify_track.get("preview_url"),
            "external_url": spotify_track.get("external_urls", {}).get("spotify"),
        }
