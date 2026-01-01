"""Tool executor for LLM service."""

import logging
import random
import re
from typing import Any
from uuid import UUID

import anthropic
import httpx
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Playlist,
    PlaylistTrack,
    SpotifyFavorite,
    SpotifyProfile,
    Track,
    TrackAnalysis,
)
from app.services.app_settings import get_app_settings_service

logger = logging.getLogger(__name__)


class ToolExecutor:
    """Executes tools called by the LLM."""

    def __init__(
        self, db: AsyncSession, profile_id: UUID | None = None, user_message: str = ""
    ) -> None:
        self.db = db
        self.profile_id = profile_id
        self.user_message = user_message
        self._queued_tracks: list[dict[str, Any]] = []
        self._playback_action: str | None = None
        self._auto_saved_playlist: dict[str, Any] | None = None

    async def execute(self, tool_name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool and return the result."""
        handlers = {
            "search_library": self._search_library,
            "find_similar_tracks": self._find_similar_tracks,
            "filter_tracks_by_features": self._filter_tracks_by_features,
            "get_library_stats": self._get_library_stats,
            "get_library_genres": self._get_library_genres,
            "queue_tracks": self._queue_tracks,
            "control_playback": self._control_playback,
            "get_track_details": self._get_track_details,
            "get_spotify_status": self._get_spotify_status,
            "get_spotify_favorites": self._get_spotify_favorites,
            "get_unmatched_spotify_favorites": self._get_unmatched_spotify_favorites,
            "get_spotify_sync_stats": self._get_spotify_sync_stats,
            "search_bandcamp": self._search_bandcamp,
            "recommend_bandcamp_purchases": self._recommend_bandcamp_purchases,
            "select_diverse_tracks": self._select_diverse_tracks,
        }

        handler = handlers.get(tool_name)
        if handler:
            # Handle methods that take no args vs those that do
            if tool_name in ("get_library_stats", "get_spotify_status", "get_spotify_sync_stats"):
                return await handler()  # type: ignore[operator]
            return await handler(**tool_input)  # type: ignore[operator]
        return {"error": f"Unknown tool: {tool_name}"}

    def get_queued_tracks(self) -> list[dict[str, Any]]:
        """Get tracks that were queued during this conversation turn."""
        return self._queued_tracks

    def get_playback_action(self) -> str | None:
        """Get playback action requested during this conversation turn."""
        return self._playback_action

    def get_auto_saved_playlist(self) -> dict[str, Any] | None:
        """Get the auto-saved playlist created during this conversation turn."""
        return self._auto_saved_playlist

    # --- Helper methods ---

    async def _generate_playlist_name_llm(self, tracks: list[dict[str, Any]]) -> str:
        """Generate a creative playlist name using the LLM."""
        from datetime import datetime

        if not tracks:
            return f"AI Playlist - {datetime.now().strftime('%b %d %H:%M')}"

        artists = list(set(t.get("artist", "") for t in tracks[:10] if t.get("artist")))
        genres = list(set(t.get("genre", "") for t in tracks[:10] if t.get("genre")))

        prompt = f"""Generate a short, creative playlist name (2-5 words max).

User's request: "{self.user_message or 'curated selection'}"
Artists included: {', '.join(artists[:5]) or 'Various'}
Genres: {', '.join(genres[:3]) or 'Mixed'}
Track count: {len(tracks)}

Rules:
- Be creative and evocative, not literal
- Don't just repeat the user's words
- Avoid generic names like "Chill Vibes" or "Good Music"
- No quotes, colons, or special characters
- Examples of good names: "Midnight Drive", "Sunday Morning Coffee", "Electric Dreams"

Respond with ONLY the playlist name, nothing else."""

        try:
            app_settings = get_app_settings_service().get()

            if app_settings.llm_provider == "ollama":
                client = httpx.AsyncClient(timeout=30.0)
                try:
                    response = await client.post(
                        f"{app_settings.ollama_url.rstrip('/')}/api/generate",
                        json={
                            "model": app_settings.ollama_model,
                            "prompt": prompt,
                            "stream": False,
                        },
                    )
                    response.raise_for_status()
                    name = response.json().get("response", "").strip()
                finally:
                    await client.aclose()
            else:
                api_key = get_app_settings_service().get_effective("anthropic_api_key")
                if not api_key:
                    raise ValueError("No API key")

                anthropic_client = anthropic.Anthropic(api_key=api_key)
                message = anthropic_client.messages.create(
                    model="claude-haiku-4-20250815",
                    max_tokens=50,
                    messages=[{"role": "user", "content": prompt}],
                )
                name = ""
                if message.content:
                    first_block = message.content[0]
                    if hasattr(first_block, "text"):
                        name = first_block.text.strip()

            name = name.strip('"\'').strip()
            if name and len(name) <= 50 and not any(c in name for c in [":", "\n", '"']):
                return name

        except Exception as e:
            logger.debug(f"LLM playlist name generation failed: {e}")

        return self._generate_playlist_name_fallback()

    def _generate_playlist_name_fallback(self) -> str:
        """Fallback playlist name from user message or timestamp."""
        from datetime import datetime

        if self.user_message:
            name = self.user_message[:50].strip()
            if len(self.user_message) > 50:
                name += "..."
            return name
        return f"AI Playlist - {datetime.now().strftime('%b %d %H:%M')}"

    def _normalize_query_variations(self, query: str) -> list[str]:
        """Generate search variations to handle number padding, etc."""
        variations = [query]

        padded = re.sub(r"(\s)(\d)(\s|$)", r"\g<1>0\2\3", query)
        if padded != query:
            variations.append(padded)

        unpadded = re.sub(r"(\s)0(\d)(\s|$)", r"\g<1>\2\3", query)
        if unpadded != query:
            variations.append(unpadded)

        return variations

    def _apply_diversity(
        self,
        tracks: list[Track],
        max_per_artist: int = 2,
        max_per_album: int = 3,
    ) -> list[Track]:
        """Filter tracks to ensure diversity across artists and albums."""
        shuffled = list(tracks)
        random.shuffle(shuffled)

        artist_counts: dict[str, int] = {}
        album_counts: dict[str, int] = {}
        diverse: list[Track] = []

        for track in shuffled:
            artist_key = (track.artist or "").lower().strip()
            album_key = f"{artist_key}:{(track.album or '').lower().strip()}"

            artist_count = artist_counts.get(artist_key, 0)
            album_count = album_counts.get(album_key, 0)

            if artist_count >= max_per_artist or album_count >= max_per_album:
                continue

            diverse.append(track)
            artist_counts[artist_key] = artist_count + 1
            album_counts[album_key] = album_count + 1

        return diverse

    def _track_to_dict(self, track: Track) -> dict[str, Any]:
        """Convert track to dictionary."""
        return {
            "id": str(track.id),
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "genre": track.genre,
            "duration_seconds": track.duration_seconds,
            "year": track.year,
        }

    # --- Tool implementations ---

    async def _search_library(self, query: str, limit: int = 20) -> dict[str, Any]:
        """Search tracks by text query with diversity across artists/albums."""
        variations = self._normalize_query_variations(query)

        conditions = []
        for var in variations:
            search_filter = f"%{var}%"
            conditions.extend([
                Track.title.ilike(search_filter),
                Track.artist.ilike(search_filter),
                Track.album.ilike(search_filter),
                Track.genre.ilike(search_filter),
            ])

        stmt = select(Track).where(or_(*conditions)).limit(limit * 5)
        result = await self.db.execute(stmt)
        all_tracks = list(result.scalars().all())

        diverse_tracks = self._apply_diversity(all_tracks, max_per_artist=2, max_per_album=3)
        random.shuffle(diverse_tracks)
        selected = diverse_tracks[:limit]

        return {
            "tracks": [self._track_to_dict(t) for t in selected],
            "count": len(selected),
            "note": f"Selected from {len(all_tracks)} matches with artist/album diversity",
        }

    async def _find_similar_tracks(self, track_id: str, limit: int = 10) -> dict[str, Any]:
        """Find similar tracks using embedding similarity."""
        stmt = (
            select(TrackAnalysis.embedding)
            .where(TrackAnalysis.track_id == UUID(track_id))
            .order_by(TrackAnalysis.version.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        embedding = result.scalar_one_or_none()

        if embedding is None:
            return {"error": "Track not analyzed yet", "tracks": []}

        similar_stmt = (
            select(Track)
            .join(TrackAnalysis, Track.id == TrackAnalysis.track_id)
            .where(Track.id != UUID(track_id))
            .where(TrackAnalysis.embedding.isnot(None))
            .order_by(TrackAnalysis.embedding.cosine_distance(embedding))
            .limit(limit * 4)
        )
        result = await self.db.execute(similar_stmt)
        all_tracks = list(result.scalars().all())

        diverse_tracks = self._apply_diversity(all_tracks, max_per_artist=2, max_per_album=2)
        selected = diverse_tracks[:limit]

        return {
            "tracks": [self._track_to_dict(t) for t in selected],
            "count": len(selected),
            "note": f"Similar tracks from {len(set(t.artist for t in selected))} different artists",
        }

    async def _filter_tracks_by_features(
        self,
        bpm_min: float | None = None,
        bpm_max: float | None = None,
        energy_min: float | None = None,
        energy_max: float | None = None,
        danceability_min: float | None = None,
        valence_min: float | None = None,
        valence_max: float | None = None,
        acousticness_min: float | None = None,
        instrumentalness_min: float | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Filter tracks by audio features stored in JSONB."""
        # Convert string params to float (LLM tool calls may pass strings)
        def to_float(v: Any) -> float | None:
            if v is None:
                return None
            try:
                return float(v)
            except (ValueError, TypeError):
                return None

        bpm_min = to_float(bpm_min)
        bpm_max = to_float(bpm_max)
        energy_min = to_float(energy_min)
        energy_max = to_float(energy_max)
        danceability_min = to_float(danceability_min)
        valence_min = to_float(valence_min)
        valence_max = to_float(valence_max)
        acousticness_min = to_float(acousticness_min)
        instrumentalness_min = to_float(instrumentalness_min)
        limit = int(limit) if limit else 20

        stmt = select(Track).join(TrackAnalysis, Track.id == TrackAnalysis.track_id)

        conditions = []
        if bpm_min is not None:
            conditions.append(
                text("(features->>'bpm')::float >= :bpm_min").bindparams(bpm_min=bpm_min)
            )
        if bpm_max is not None:
            conditions.append(
                text("(features->>'bpm')::float <= :bpm_max").bindparams(bpm_max=bpm_max)
            )
        if energy_min is not None:
            conditions.append(
                text("(features->>'energy')::float >= :energy_min").bindparams(
                    energy_min=energy_min
                )
            )
        if energy_max is not None:
            conditions.append(
                text("(features->>'energy')::float <= :energy_max").bindparams(
                    energy_max=energy_max
                )
            )
        if danceability_min is not None:
            conditions.append(
                text("(features->>'danceability')::float >= :danceability_min").bindparams(
                    danceability_min=danceability_min
                )
            )
        if valence_min is not None:
            conditions.append(
                text("(features->>'valence')::float >= :valence_min").bindparams(
                    valence_min=valence_min
                )
            )
        if valence_max is not None:
            conditions.append(
                text("(features->>'valence')::float <= :valence_max").bindparams(
                    valence_max=valence_max
                )
            )
        if acousticness_min is not None:
            conditions.append(
                text("(features->>'acousticness')::float >= :acousticness_min").bindparams(
                    acousticness_min=acousticness_min
                )
            )
        if instrumentalness_min is not None:
            conditions.append(
                text("(features->>'instrumentalness')::float >= :instrumentalness_min").bindparams(
                    instrumentalness_min=instrumentalness_min
                )
            )

        for condition in conditions:
            stmt = stmt.where(condition)

        stmt = stmt.limit(limit * 5)
        result = await self.db.execute(stmt)
        all_tracks = list(result.scalars().all())

        diverse_tracks = self._apply_diversity(all_tracks, max_per_artist=2, max_per_album=3)
        random.shuffle(diverse_tracks)
        selected = diverse_tracks[:limit]

        return {
            "tracks": [self._track_to_dict(t) for t in selected],
            "count": len(selected),
            "note": f"Selected from {len(all_tracks)} matches with artist/album diversity",
        }

    async def _get_library_stats(self) -> dict[str, Any]:
        """Get library statistics."""
        total_result = await self.db.execute(select(func.count(Track.id)))
        total_tracks = total_result.scalar() or 0

        artists_result = await self.db.execute(
            select(func.count(func.distinct(Track.artist)))
        )
        total_artists = artists_result.scalar() or 0

        albums_result = await self.db.execute(
            select(func.count(func.distinct(Track.album)))
        )
        total_albums = albums_result.scalar() or 0

        genres_result = await self.db.execute(
            select(Track.genre, func.count(Track.id).label("count"))
            .where(Track.genre.isnot(None))
            .group_by(Track.genre)
            .order_by(text("count DESC"))
            .limit(10)
        )
        top_genres = [{"genre": r[0], "count": r[1]} for r in genres_result.all()]

        return {
            "total_tracks": total_tracks,
            "total_artists": total_artists,
            "total_albums": total_albums,
            "top_genres": top_genres,
        }

    async def _get_library_genres(self, limit: int = 50) -> dict[str, Any]:
        """Get all genres in the library with track counts."""
        genres_result = await self.db.execute(
            select(Track.genre, func.count(Track.id).label("count"))
            .where(Track.genre.isnot(None))
            .where(Track.genre != "")
            .group_by(Track.genre)
            .order_by(text("count DESC"))
            .limit(limit)
        )
        genres = [{"genre": r[0], "count": r[1]} for r in genres_result.all()]

        return {
            "genres": genres,
            "total": len(genres),
            "hint": "Use these genre names in search_library to find tracks.",
        }

    async def _queue_tracks(
        self, track_ids: list[str], clear_existing: bool = False
    ) -> dict[str, Any]:
        """Queue tracks for playback and auto-save as playlist."""
        stmt = select(Track).where(Track.id.in_([UUID(tid) for tid in track_ids]))
        result = await self.db.execute(stmt)
        tracks = result.scalars().all()

        self._queued_tracks = [self._track_to_dict(t) for t in tracks]

        if tracks and self.profile_id:
            playlist_name = await self._generate_playlist_name_llm(self._queued_tracks)
            self._auto_saved_playlist = await self._save_as_playlist(
                name=playlist_name,
                track_ids=track_ids,
                description=self.user_message,
            )

        return {
            "queued": len(tracks),
            "clear_existing": clear_existing,
            "tracks": self._queued_tracks,
        }

    async def _control_playback(self, action: str) -> dict[str, Any]:
        """Control playback."""
        self._playback_action = action
        return {"action": action, "status": "ok"}

    async def _get_track_details(self, track_id: str) -> dict[str, Any]:
        """Get detailed track info including features."""
        stmt = select(Track).where(Track.id == UUID(track_id))
        result = await self.db.execute(stmt)
        track = result.scalar_one_or_none()

        if not track:
            return {"error": "Track not found"}

        analysis_stmt = (
            select(TrackAnalysis)
            .where(TrackAnalysis.track_id == UUID(track_id))
            .order_by(TrackAnalysis.version.desc())
            .limit(1)
        )
        analysis_result = await self.db.execute(analysis_stmt)
        analysis = analysis_result.scalar_one_or_none()

        track_dict = self._track_to_dict(track)
        if analysis:
            track_dict["features"] = analysis.features

        return track_dict

    async def _get_spotify_status(self) -> dict[str, Any]:
        """Check if Spotify is connected."""
        if not self.profile_id:
            return {
                "connected": False,
                "message": "No profile ID provided. User can connect via Settings.",
            }

        result = await self.db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == self.profile_id)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            return {
                "connected": False,
                "message": "Spotify not connected. User can connect via Settings.",
            }

        return {
            "connected": True,
            "spotify_user_id": profile.spotify_user_id,
            "last_sync": profile.last_sync_at.isoformat() if profile.last_sync_at else None,
        }

    async def _get_spotify_favorites(self, limit: int = 50) -> dict[str, Any]:
        """Get Spotify favorites that are matched to local library."""
        if not self.profile_id:
            return {"tracks": [], "count": 0, "note": "No profile ID provided"}

        result = await self.db.execute(
            select(SpotifyFavorite, Track)
            .join(Track, SpotifyFavorite.matched_track_id == Track.id)
            .where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.isnot(None),
            )
            .order_by(SpotifyFavorite.added_at.desc())
            .limit(limit)
        )
        rows = result.all()

        tracks = []
        for favorite, track in rows:
            track_dict = self._track_to_dict(track)
            track_dict["spotify_added_at"] = (
                favorite.added_at.isoformat() if favorite.added_at else None
            )
            tracks.append(track_dict)

        return {
            "tracks": tracks,
            "count": len(tracks),
            "note": "These are Spotify favorites that match tracks in your local library",
        }

    async def _get_unmatched_spotify_favorites(self, limit: int = 50) -> dict[str, Any]:
        """Get Spotify favorites that don't have local matches."""
        if not self.profile_id:
            return {"tracks": [], "count": 0, "note": "No profile ID provided"}

        result = await self.db.execute(
            select(SpotifyFavorite)
            .where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.is_(None),
            )
            .order_by(SpotifyFavorite.added_at.desc())
            .limit(limit)
        )
        favorites = result.scalars().all()

        unmatched = []
        for f in favorites:
            data = f.track_data or {}
            unmatched.append({
                "spotify_id": f.spotify_track_id,
                "name": data.get("name"),
                "artist": data.get("artist"),
                "album": data.get("album"),
                "added_at": f.added_at.isoformat() if f.added_at else None,
                "spotify_url": data.get("external_url"),
            })

        return {
            "tracks": unmatched,
            "count": len(unmatched),
            "note": "These are Spotify favorites you don't have in your local library",
        }

    async def _get_spotify_sync_stats(self) -> dict[str, Any]:
        """Get Spotify sync statistics."""
        if not self.profile_id:
            return {
                "total_favorites": 0,
                "matched": 0,
                "unmatched": 0,
                "match_rate": 0,
                "last_sync": None,
                "connected": False,
            }

        total = (
            await self.db.scalar(
                select(func.count(SpotifyFavorite.id)).where(
                    SpotifyFavorite.profile_id == self.profile_id
                )
            )
            or 0
        )

        matched = (
            await self.db.scalar(
                select(func.count(SpotifyFavorite.id)).where(
                    SpotifyFavorite.profile_id == self.profile_id,
                    SpotifyFavorite.matched_track_id.isnot(None),
                )
            )
            or 0
        )

        profile_result = await self.db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == self.profile_id)
        )
        profile = profile_result.scalar_one_or_none()

        return {
            "total_favorites": total,
            "matched": matched,
            "unmatched": total - matched,
            "match_rate": round(matched / total * 100, 1) if total > 0 else 0,
            "last_sync": (
                profile.last_sync_at.isoformat() if profile and profile.last_sync_at else None
            ),
            "connected": profile is not None,
        }

    async def _search_bandcamp(
        self,
        query: str,
        item_type: str = "album",
        limit: int = 10,
    ) -> dict[str, Any]:
        """Search Bandcamp for albums/tracks."""
        from app.services.bandcamp import BandcampService

        type_map = {"album": "a", "track": "t", "artist": "b"}
        api_type = type_map.get(item_type, "a")

        bc = BandcampService()
        try:
            results = await bc.search(query, item_type=api_type, limit=limit)
            return {
                "results": [
                    {
                        "type": r.result_type,
                        "name": r.name,
                        "artist": r.artist,
                        "url": r.url,
                        "genre": r.genre,
                        "release_date": r.release_date,
                    }
                    for r in results
                ],
                "count": len(results),
                "query": query,
            }
        finally:
            await bc.close()

    async def _recommend_bandcamp_purchases(self, limit: int = 5) -> dict[str, Any]:
        """Recommend Bandcamp albums based on unmatched Spotify favorites."""
        from app.services.bandcamp import BandcampService

        if not self.profile_id:
            return {"recommendations": [], "message": "No profile ID provided"}

        result = await self.db.execute(
            select(SpotifyFavorite)
            .where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.is_(None),
            )
            .order_by(SpotifyFavorite.added_at.desc())
            .limit(limit * 2)
        )
        favorites = result.scalars().all()

        if not favorites:
            return {
                "recommendations": [],
                "message": "No unmatched Spotify favorites to base recommendations on",
            }

        bc = BandcampService()
        recommendations = []
        seen_artists = set()

        try:
            for f in favorites:
                data = f.track_data or {}
                artist = data.get("artist")
                if not artist or artist.lower() in seen_artists:
                    continue

                seen_artists.add(artist.lower())
                results = await bc.search(artist, item_type="a", limit=2)

                for r in results:
                    recommendations.append({
                        "type": r.result_type,
                        "name": r.name,
                        "artist": r.artist,
                        "url": r.url,
                        "genre": r.genre,
                        "based_on": {
                            "spotify_track": data.get("name"),
                            "spotify_artist": artist,
                        },
                    })

                if len(recommendations) >= limit:
                    break
        finally:
            await bc.close()

        return {
            "recommendations": recommendations[:limit],
            "count": len(recommendations[:limit]),
            "note": "Albums recommended based on your Spotify favorites",
        }

    async def _save_as_playlist(
        self,
        name: str,
        track_ids: list[str],
        description: str | None = None,
    ) -> dict[str, Any]:
        """Save tracks as an AI-generated playlist."""
        if not self.profile_id:
            return {"error": "No profile ID - cannot save playlist", "saved": False}

        if not track_ids:
            return {"error": "No tracks provided", "saved": False}

        playlist = Playlist(
            profile_id=self.profile_id,
            name=name,
            description=description,
            is_auto_generated=True,
            generation_prompt=name,
        )
        self.db.add(playlist)
        await self.db.flush()

        tracks_added = 0
        for position, track_id_str in enumerate(track_ids):
            try:
                track_id = UUID(track_id_str)
            except ValueError:
                continue

            track = await self.db.get(Track, track_id)
            if not track:
                continue

            playlist_track = PlaylistTrack(
                playlist_id=playlist.id,
                track_id=track_id,
                position=position,
            )
            self.db.add(playlist_track)
            tracks_added += 1

        await self.db.commit()

        return {
            "saved": True,
            "playlist_id": str(playlist.id),
            "playlist_name": name,
            "tracks_saved": tracks_added,
            "message": f"Saved {tracks_added} tracks as '{name}'",
        }

    async def _select_diverse_tracks(
        self,
        track_ids: list[str],
        limit: int = 20,
        max_per_artist: int = 2,
        max_per_album: int = 2,
    ) -> dict[str, Any]:
        """Select a diverse subset from given track IDs."""
        if not track_ids:
            return {"tracks": [], "count": 0, "note": "No tracks provided"}

        stmt = select(Track).where(Track.id.in_([UUID(tid) for tid in track_ids]))
        result = await self.db.execute(stmt)
        tracks = list(result.scalars().all())

        if not tracks:
            return {"tracks": [], "count": 0, "note": "No matching tracks found"}

        diverse_tracks = self._apply_diversity(
            tracks,
            max_per_artist=max_per_artist,
            max_per_album=max_per_album,
        )

        selected = diverse_tracks[:limit]
        unique_artists = len(set(t.artist for t in selected if t.artist))

        return {
            "tracks": [self._track_to_dict(t) for t in selected],
            "count": len(selected),
            "unique_artists": unique_artists,
            "note": f"Selected {len(selected)} tracks from {unique_artists} different artists",
        }
