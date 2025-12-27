"""LLM service for conversational music discovery."""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, cast
from uuid import UUID

import anthropic
import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import SpotifyFavorite, SpotifyProfile, Track, TrackAnalysis
from app.services.app_settings import get_app_settings_service

logger = logging.getLogger(__name__)

# Tool definitions for Claude
MUSIC_TOOLS = [
    {
        "name": "search_library",
        "description": "Search the user's music library by text query. Searches across title, artist, album, and genre. Returns matching tracks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query text"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 20)",
                    "default": 20
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "find_similar_tracks",
        "description": "Find tracks sonically similar to a given track, using audio embeddings. Great for 'play more like this' requests.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_id": {
                    "type": "string",
                    "description": "UUID of the reference track"
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of similar tracks to return",
                    "default": 10
                }
            },
            "required": ["track_id"]
        }
    },
    {
        "name": "filter_tracks_by_features",
        "description": "Filter tracks by audio features like BPM, energy, danceability. Use for requests like 'upbeat songs' or 'something around 120 BPM'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "bpm_min": {"type": "number", "description": "Minimum BPM"},
                "bpm_max": {"type": "number", "description": "Maximum BPM"},
                "energy_min": {"type": "number", "minimum": 0, "maximum": 1, "description": "Minimum energy (0-1)"},
                "energy_max": {"type": "number", "minimum": 0, "maximum": 1, "description": "Maximum energy (0-1)"},
                "danceability_min": {"type": "number", "minimum": 0, "maximum": 1},
                "valence_min": {"type": "number", "minimum": 0, "maximum": 1, "description": "Minimum valence/happiness (0-1)"},
                "valence_max": {"type": "number", "minimum": 0, "maximum": 1},
                "acousticness_min": {"type": "number", "minimum": 0, "maximum": 1},
                "instrumentalness_min": {"type": "number", "minimum": 0, "maximum": 1},
                "limit": {"type": "integer", "default": 20}
            }
        }
    },
    {
        "name": "get_library_stats",
        "description": "Get statistics about the music library: total tracks, artists, albums, genres. Use when user asks about their library.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_library_genres",
        "description": "Get all genres in the library with track counts. IMPORTANT: Use this first when user asks for mood-based music (e.g., 'sleepy', 'chill', 'upbeat') to find what actual genre names match their request.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max genres to return (default 50)",
                    "default": 50
                }
            }
        }
    },
    {
        "name": "queue_tracks",
        "description": "Add tracks to the playback queue. Use after finding tracks the user wants to play.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of track UUIDs to queue"
                },
                "clear_existing": {
                    "type": "boolean",
                    "default": False,
                    "description": "Clear current queue before adding"
                }
            },
            "required": ["track_ids"]
        }
    },
    {
        "name": "control_playback",
        "description": "Control music playback: play, pause, skip, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["play", "pause", "next", "previous", "shuffle_on", "shuffle_off"],
                    "description": "Playback action to perform"
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "get_track_details",
        "description": "Get detailed information about a specific track including audio features.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_id": {
                    "type": "string",
                    "description": "UUID of the track"
                }
            },
            "required": ["track_id"]
        }
    },
    {
        "name": "get_spotify_status",
        "description": "Check if the user has connected their Spotify account and get connection status.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_spotify_favorites",
        "description": "Get user's Spotify favorites that are available in their local library. Use this to find tracks the user has liked on Spotify.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 50)",
                    "default": 50
                }
            }
        }
    },
    {
        "name": "get_unmatched_spotify_favorites",
        "description": "Get Spotify favorites that couldn't be matched to the local library. Useful for finding music the user likes on Spotify but doesn't own locally.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 50)",
                    "default": 50
                }
            }
        }
    },
    {
        "name": "get_spotify_sync_stats",
        "description": "Get statistics about the Spotify sync: total favorites, matched count, match rate.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "search_bandcamp",
        "description": "Search Bandcamp for albums or tracks the user might want to purchase. Use this when the user wants to find music to buy, especially for artists they like but don't have locally.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (artist name, album name, or general search)"
                },
                "item_type": {
                    "type": "string",
                    "enum": ["album", "track", "artist"],
                    "description": "Type of result to search for",
                    "default": "album"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 10)",
                    "default": 10
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "recommend_bandcamp_purchases",
        "description": "Suggest Bandcamp albums to purchase based on Spotify favorites that aren't in the local library. Helps users complete their collection.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max recommendations (default 5)",
                    "default": 5
                }
            }
        }
    }
]

SYSTEM_PROMPT = """You are Familiar, an AI music assistant helping users discover and enjoy their personal music library.

You have access to tools that let you search the library, find similar tracks, filter by audio features, and control playback. You can also access the user's Spotify favorites if they've connected their account.

Guidelines:
- IMPORTANT: For mood-based requests (e.g., "sleepy music", "something chill", "upbeat"), first call get_library_genres to see what genres are available, then search for matching genre names
- When the user asks for music, use tools to search and find matching tracks, then queue them
- Search by genre names that exist in their library (e.g., "ambient", "electronic", "jazz"), not mood words like "sleepy" or "relaxing"
- Explain your choices briefly—why these tracks fit what they asked for
- If you can't find exactly what they want, suggest alternatives
- You can combine multiple searches: find similar to X, then filter by energy
- Be conversational but efficient—the user wants to listen to music, not read essays
- When you queue tracks, confirm what you've queued

Spotify integration:
- Use get_spotify_favorites to find tracks the user has liked on Spotify that are in their local library
- Use get_unmatched_spotify_favorites to show them music they like on Spotify but don't own locally
- Spotify favorites can help personalize recommendations—if they've liked a track on Spotify, it's a good indicator of preference

Bandcamp integration:
- Use search_bandcamp to help users find albums to purchase on Bandcamp
- Use recommend_bandcamp_purchases to suggest albums based on their Spotify favorites they don't own locally
- When showing Bandcamp results, include the URL so users can purchase directly

Audio features guide:
- energy: 0 = calm/ambient, 1 = intense/energetic
- valence: 0 = sad/melancholic, 1 = happy/uplifting
- danceability: 0 = not danceable, 1 = very danceable
- acousticness: 0 = electronic/produced, 1 = acoustic
- instrumentalness: 0 = vocals, 1 = instrumental

Keep responses concise and music-focused."""


class ToolExecutor:
    """Executes tools called by the LLM."""

    def __init__(self, db: AsyncSession, profile_id: UUID | None = None) -> None:
        self.db = db
        self.profile_id = profile_id
        self._queued_tracks: list[dict[str, Any]] = []
        self._playback_action: str | None = None

    async def execute(self, tool_name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool and return the result."""
        if tool_name == "search_library":
            return await self._search_library(**tool_input)
        elif tool_name == "find_similar_tracks":
            return await self._find_similar_tracks(**tool_input)
        elif tool_name == "filter_tracks_by_features":
            return await self._filter_tracks_by_features(**tool_input)
        elif tool_name == "get_library_stats":
            return await self._get_library_stats()
        elif tool_name == "get_library_genres":
            return await self._get_library_genres(**tool_input)
        elif tool_name == "queue_tracks":
            return await self._queue_tracks(**tool_input)
        elif tool_name == "control_playback":
            return await self._control_playback(**tool_input)
        elif tool_name == "get_track_details":
            return await self._get_track_details(**tool_input)
        elif tool_name == "get_spotify_status":
            return await self._get_spotify_status()
        elif tool_name == "get_spotify_favorites":
            return await self._get_spotify_favorites(**tool_input)
        elif tool_name == "get_unmatched_spotify_favorites":
            return await self._get_unmatched_spotify_favorites(**tool_input)
        elif tool_name == "get_spotify_sync_stats":
            return await self._get_spotify_sync_stats()
        elif tool_name == "search_bandcamp":
            return await self._search_bandcamp(**tool_input)
        elif tool_name == "recommend_bandcamp_purchases":
            return await self._recommend_bandcamp_purchases(**tool_input)
        else:
            return {"error": f"Unknown tool: {tool_name}"}

    def get_queued_tracks(self) -> list[dict[str, Any]]:
        """Get tracks that were queued during this conversation turn."""
        return self._queued_tracks

    def get_playback_action(self) -> str | None:
        """Get playback action requested during this conversation turn."""
        return self._playback_action

    def _normalize_query_variations(self, query: str) -> list[str]:
        """Generate search variations to handle number padding, etc."""
        import re
        variations = [query]

        # Try zero-padding single digits: "Analord 2" -> "Analord 02"
        padded = re.sub(r'(\s)(\d)(\s|$)', r'\g<1>0\2\3', query)
        if padded != query:
            variations.append(padded)

        # Try removing zero-padding: "Analord 02" -> "Analord 2"
        unpadded = re.sub(r'(\s)0(\d)(\s|$)', r'\g<1>\2\3', query)
        if unpadded != query:
            variations.append(unpadded)

        return variations

    async def _search_library(self, query: str, limit: int = 20) -> dict:
        """Search tracks by text query."""
        from sqlalchemy import or_

        # Generate query variations for better matching
        variations = self._normalize_query_variations(query)

        # Build OR conditions for all variations
        conditions = []
        for var in variations:
            search_filter = f"%{var}%"
            conditions.extend([
                Track.title.ilike(search_filter),
                Track.artist.ilike(search_filter),
                Track.album.ilike(search_filter),
                Track.genre.ilike(search_filter),
            ])

        stmt = (
            select(Track)
            .where(or_(*conditions))
            .order_by(Track.artist, Track.album, Track.track_number)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        tracks = result.scalars().all()

        return {
            "tracks": [self._track_to_dict(t) for t in tracks],
            "count": len(tracks)
        }

    async def _find_similar_tracks(self, track_id: str, limit: int = 10) -> dict:
        """Find similar tracks using embedding similarity."""
        # Get the source track's embedding
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

        # Find similar tracks
        similar_stmt = (
            select(Track)
            .join(TrackAnalysis, Track.id == TrackAnalysis.track_id)
            .where(Track.id != UUID(track_id))
            .where(TrackAnalysis.embedding.isnot(None))
            .order_by(TrackAnalysis.embedding.cosine_distance(embedding))
            .limit(limit)
        )
        result = await self.db.execute(similar_stmt)
        tracks = result.scalars().all()

        return {
            "tracks": [self._track_to_dict(t) for t in tracks],
            "count": len(tracks)
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
    ) -> dict:
        """Filter tracks by audio features stored in JSONB."""
        stmt = (
            select(Track)
            .join(TrackAnalysis, Track.id == TrackAnalysis.track_id)
        )

        # Build JSONB conditions
        conditions = []
        if bpm_min is not None:
            conditions.append(text("(features->>'bpm')::float >= :bpm_min").bindparams(bpm_min=bpm_min))
        if bpm_max is not None:
            conditions.append(text("(features->>'bpm')::float <= :bpm_max").bindparams(bpm_max=bpm_max))
        if energy_min is not None:
            conditions.append(text("(features->>'energy')::float >= :energy_min").bindparams(energy_min=energy_min))
        if energy_max is not None:
            conditions.append(text("(features->>'energy')::float <= :energy_max").bindparams(energy_max=energy_max))
        if danceability_min is not None:
            conditions.append(text("(features->>'danceability')::float >= :danceability_min").bindparams(danceability_min=danceability_min))
        if valence_min is not None:
            conditions.append(text("(features->>'valence')::float >= :valence_min").bindparams(valence_min=valence_min))
        if valence_max is not None:
            conditions.append(text("(features->>'valence')::float <= :valence_max").bindparams(valence_max=valence_max))
        if acousticness_min is not None:
            conditions.append(text("(features->>'acousticness')::float >= :acousticness_min").bindparams(acousticness_min=acousticness_min))
        if instrumentalness_min is not None:
            conditions.append(text("(features->>'instrumentalness')::float >= :instrumentalness_min").bindparams(instrumentalness_min=instrumentalness_min))

        for condition in conditions:
            stmt = stmt.where(condition)

        stmt = stmt.limit(limit)
        result = await self.db.execute(stmt)
        tracks = result.scalars().all()

        return {
            "tracks": [self._track_to_dict(t) for t in tracks],
            "count": len(tracks)
        }

    async def _get_library_stats(self) -> dict:
        """Get library statistics."""
        # Total tracks
        total_result = await self.db.execute(select(func.count(Track.id)))
        total_tracks = total_result.scalar() or 0

        # Unique artists
        artists_result = await self.db.execute(
            select(func.count(func.distinct(Track.artist)))
        )
        total_artists = artists_result.scalar() or 0

        # Unique albums
        albums_result = await self.db.execute(
            select(func.count(func.distinct(Track.album)))
        )
        total_albums = albums_result.scalar() or 0

        # Top genres
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
            "top_genres": top_genres
        }

    async def _get_library_genres(self, limit: int = 50) -> dict:
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
            "hint": "Use these genre names in search_library to find tracks. For mood-based requests, try genres like 'ambient', 'electronic', 'jazz', 'classical' etc."
        }

    async def _queue_tracks(self, track_ids: list[str], clear_existing: bool = False) -> dict:
        """Queue tracks for playback."""
        # Fetch track details
        stmt = select(Track).where(Track.id.in_([UUID(tid) for tid in track_ids]))
        result = await self.db.execute(stmt)
        tracks = result.scalars().all()

        # Store for frontend to pick up
        self._queued_tracks = [self._track_to_dict(t) for t in tracks]

        return {
            "queued": len(tracks),
            "clear_existing": clear_existing,
            "tracks": self._queued_tracks
        }

    async def _control_playback(self, action: str) -> dict:
        """Control playback."""
        self._playback_action = action
        return {"action": action, "status": "ok"}

    async def _get_track_details(self, track_id: str) -> dict:
        """Get detailed track info including features."""
        stmt = select(Track).where(Track.id == UUID(track_id))
        result = await self.db.execute(stmt)
        track = result.scalar_one_or_none()

        if not track:
            return {"error": "Track not found"}

        # Get analysis
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

    async def _get_spotify_status(self) -> dict:
        """Check if Spotify is connected."""
        if not self.profile_id:
            return {
                "connected": False,
                "message": "No profile ID provided. User can connect via Settings."
            }

        result = await self.db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == self.profile_id)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            return {
                "connected": False,
                "message": "Spotify not connected. User can connect via Settings."
            }

        return {
            "connected": True,
            "spotify_user_id": profile.spotify_user_id,
            "last_sync": profile.last_sync_at.isoformat() if profile.last_sync_at else None
        }

    async def _get_spotify_favorites(self, limit: int = 50) -> dict:
        """Get Spotify favorites that are matched to local library."""
        if not self.profile_id:
            return {"tracks": [], "count": 0, "note": "No profile ID provided"}

        result = await self.db.execute(
            select(SpotifyFavorite, Track)
            .join(Track, SpotifyFavorite.matched_track_id == Track.id)
            .where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.isnot(None)
            )
            .order_by(SpotifyFavorite.added_at.desc())
            .limit(limit)
        )
        rows = result.all()

        tracks = []
        for favorite, track in rows:
            track_dict = self._track_to_dict(track)
            track_dict["spotify_added_at"] = favorite.added_at.isoformat() if favorite.added_at else None
            tracks.append(track_dict)

        return {
            "tracks": tracks,
            "count": len(tracks),
            "note": "These are Spotify favorites that match tracks in your local library"
        }

    async def _get_unmatched_spotify_favorites(self, limit: int = 50) -> dict:
        """Get Spotify favorites that don't have local matches."""
        if not self.profile_id:
            return {"tracks": [], "count": 0, "note": "No profile ID provided"}

        result = await self.db.execute(
            select(SpotifyFavorite)
            .where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.is_(None)
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
                "spotify_url": data.get("external_url")
            })

        return {
            "tracks": unmatched,
            "count": len(unmatched),
            "note": "These are Spotify favorites you don't have in your local library"
        }

    async def _get_spotify_sync_stats(self) -> dict:
        """Get Spotify sync statistics."""
        if not self.profile_id:
            return {
                "total_favorites": 0,
                "matched": 0,
                "unmatched": 0,
                "match_rate": 0,
                "last_sync": None,
                "connected": False
            }

        # Total favorites
        total = await self.db.scalar(
            select(func.count(SpotifyFavorite.id)).where(
                SpotifyFavorite.profile_id == self.profile_id
            )
        ) or 0

        # Matched favorites
        matched = await self.db.scalar(
            select(func.count(SpotifyFavorite.id)).where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.isnot(None)
            )
        ) or 0

        # Get profile info
        profile_result = await self.db.execute(
            select(SpotifyProfile).where(SpotifyProfile.profile_id == self.profile_id)
        )
        profile = profile_result.scalar_one_or_none()

        return {
            "total_favorites": total,
            "matched": matched,
            "unmatched": total - matched,
            "match_rate": round(matched / total * 100, 1) if total > 0 else 0,
            "last_sync": profile.last_sync_at.isoformat() if profile and profile.last_sync_at else None,
            "connected": profile is not None
        }

    async def _search_bandcamp(
        self,
        query: str,
        item_type: str = "album",
        limit: int = 10,
    ) -> dict:
        """Search Bandcamp for albums/tracks."""
        from app.services.bandcamp import BandcampService

        # Map friendly names to API codes
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

    async def _recommend_bandcamp_purchases(self, limit: int = 5) -> dict:
        """Recommend Bandcamp albums based on unmatched Spotify favorites."""
        from app.services.bandcamp import BandcampService

        if not self.profile_id:
            return {
                "recommendations": [],
                "message": "No profile ID provided"
            }

        # Get unmatched Spotify favorites
        result = await self.db.execute(
            select(SpotifyFavorite)
            .where(
                SpotifyFavorite.profile_id == self.profile_id,
                SpotifyFavorite.matched_track_id.is_(None)
            )
            .order_by(SpotifyFavorite.added_at.desc())
            .limit(limit * 2)  # Get more to have variety
        )
        favorites = result.scalars().all()

        if not favorites:
            return {
                "recommendations": [],
                "message": "No unmatched Spotify favorites to base recommendations on"
            }

        # Search Bandcamp for each artist
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

                # Search for this artist's albums on Bandcamp
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
                        }
                    })

                if len(recommendations) >= limit:
                    break
        finally:
            await bc.close()

        return {
            "recommendations": recommendations[:limit],
            "count": len(recommendations[:limit]),
            "note": "Albums recommended based on your Spotify favorites that aren't in your local library"
        }

    def _track_to_dict(self, track: Track) -> dict:
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


def convert_tools_to_ollama_format(tools: list[dict]) -> list[dict]:
    """Convert Claude tool format to Ollama/OpenAI format."""
    ollama_tools = []
    for tool in tools:
        ollama_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            }
        })
    return ollama_tools


class OllamaClient:
    """Client for Ollama API with tool calling support."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.2"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.http_client = httpx.AsyncClient(timeout=120.0)

    async def close(self):
        """Close the HTTP client."""
        await self.http_client.aclose()

    async def chat(
        self,
        messages: list[dict],
        system: str | None = None,
        tools: list[dict] | None = None,
    ) -> dict:
        """Send a chat request to Ollama."""
        # Prepare messages with system prompt
        ollama_messages = []
        if system:
            ollama_messages.append({"role": "system", "content": system})

        # Convert messages to Ollama format
        for msg in messages:
            if msg["role"] == "user":
                content = msg["content"]
                if isinstance(content, list):
                    # Handle tool result format
                    for item in content:
                        if item.get("type") == "tool_result":
                            ollama_messages.append({
                                "role": "tool",
                                "content": item.get("content", ""),
                            })
                else:
                    ollama_messages.append({"role": "user", "content": content})
            elif msg["role"] == "assistant":
                content = msg["content"]
                if isinstance(content, list):
                    # Extract text content
                    text_parts = []
                    tool_calls = []
                    for item in content:
                        if hasattr(item, "type"):
                            if item.type == "text":
                                text_parts.append(item.text)
                            elif item.type == "tool_use":
                                tool_calls.append({
                                    "id": item.id,
                                    "type": "function",
                                    "function": {
                                        "name": item.name,
                                        "arguments": json.dumps(item.input),
                                    }
                                })
                    msg_dict: dict[str, Any] = {"role": "assistant"}
                    if text_parts:
                        msg_dict["content"] = "\n".join(text_parts)
                    if tool_calls:
                        msg_dict["tool_calls"] = tool_calls
                    ollama_messages.append(msg_dict)
                else:
                    ollama_messages.append({"role": "assistant", "content": content})

        # Prepare request body
        body = {
            "model": self.model,
            "messages": ollama_messages,
            "stream": False,
        }

        if tools:
            body["tools"] = convert_tools_to_ollama_format(tools)

        # Make request
        response = await self.http_client.post(
            f"{self.base_url}/api/chat",
            json=body,
        )
        response.raise_for_status()
        return response.json()


class LLMService:
    """Service for conversational music discovery using Claude or Ollama."""

    def __init__(self) -> None:
        self.app_settings = get_app_settings_service().get()
        self.provider = self.app_settings.llm_provider

        if self.provider == "claude":
            api_key = self._get_api_key()
            self.claude_client: anthropic.Anthropic | None = anthropic.Anthropic(api_key=api_key)
            self.ollama_client: OllamaClient | None = None
        else:
            self.claude_client = None
            self.ollama_client = OllamaClient(
                base_url=self.app_settings.ollama_url,
                model=self.app_settings.ollama_model,
            )

    def _get_api_key(self) -> str | None:
        """Get Anthropic API key from app settings or env fallback."""
        return self.app_settings.anthropic_api_key or settings.anthropic_api_key

    async def chat(
        self,
        message: str,
        conversation_history: list[dict[str, Any]],
        db: AsyncSession,
        profile_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Process a chat message and stream the response.

        Yields dicts with types:
        - {"type": "text", "content": "..."}
        - {"type": "tool_call", "name": "...", "input": {...}}
        - {"type": "tool_result", "name": "...", "result": {...}}
        - {"type": "queue", "tracks": [...], "clear": bool}
        - {"type": "playback", "action": "..."}
        - {"type": "done"}
        """
        if self.provider == "ollama":
            async for event in self._chat_ollama(message, conversation_history, db, profile_id):
                yield event
        else:
            async for event in self._chat_claude(message, conversation_history, db, profile_id):
                yield event

    async def _chat_claude(
        self,
        message: str,
        conversation_history: list[dict[str, Any]],
        db: AsyncSession,
        profile_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Chat using Claude API."""
        if not self.claude_client:
            yield {"type": "error", "content": "Claude client not configured"}
            return

        tool_executor = ToolExecutor(db, profile_id)
        messages: list[dict[str, Any]] = conversation_history + [{"role": "user", "content": message}]

        while True:
            # Call Claude
            try:
                response = self.claude_client.messages.create(
                    model="claude-sonnet-4-5-20250929",
                    max_tokens=2048,
                    system=SYSTEM_PROMPT,
                    tools=cast(Any, MUSIC_TOOLS),
                    messages=cast(Any, messages),
                )
            except anthropic.BadRequestError as e:
                logger.error(f"Anthropic BadRequestError: {e}")
                yield {"type": "error", "content": f"API error: {e.message}"}
                return
            except anthropic.AuthenticationError as e:
                logger.error(f"Anthropic AuthenticationError: {e}")
                yield {"type": "error", "content": "Invalid API key. Check your Anthropic API key in Settings."}
                return
            except anthropic.APIError as e:
                logger.error(f"Anthropic APIError: {e}")
                yield {"type": "error", "content": f"API error: {e.message}"}
                return

            # Process response content
            assistant_content: list[Any] = []
            for block in response.content:
                if block.type == "text":
                    yield {"type": "text", "content": block.text}
                    assistant_content.append(block)
                elif block.type == "tool_use":
                    tool_input = cast(dict[str, Any], block.input)
                    yield {
                        "type": "tool_call",
                        "id": block.id,
                        "name": block.name,
                        "input": tool_input
                    }

                    # Execute the tool
                    result = await tool_executor.execute(block.name, tool_input)

                    yield {
                        "type": "tool_result",
                        "name": block.name,
                        "result": result
                    }

                    assistant_content.append(block)

                    # Add tool result to messages for next iteration
                    messages.append({"role": "assistant", "content": assistant_content})
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result)
                        }]
                    })
                    assistant_content = []

            # Check if we should continue (more tool calls) or stop
            if response.stop_reason == "end_turn":
                # Emit any queued tracks or playback actions
                queued = tool_executor.get_queued_tracks()
                if queued:
                    yield {"type": "queue", "tracks": queued, "clear": False}

                action = tool_executor.get_playback_action()
                if action:
                    yield {"type": "playback", "action": action}

                yield {"type": "done"}
                break
            elif response.stop_reason == "tool_use":
                # Continue loop to process tool result
                continue
            else:
                yield {"type": "done"}
                break

    async def _chat_ollama(
        self,
        message: str,
        conversation_history: list[dict[str, Any]],
        db: AsyncSession,
        profile_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Chat using Ollama API with tool support."""
        if not self.ollama_client:
            yield {"type": "error", "content": "Ollama client not configured"}
            return

        tool_executor = ToolExecutor(db, profile_id)
        messages = conversation_history + [{"role": "user", "content": message}]

        max_iterations = 10  # Prevent infinite loops
        iteration = 0

        try:
            while iteration < max_iterations:
                iteration += 1

                # Call Ollama
                response = await self.ollama_client.chat(
                    messages=messages,
                    system=SYSTEM_PROMPT,
                    tools=MUSIC_TOOLS,
                )

                msg = response.get("message", {})
                content = msg.get("content", "")
                tool_calls = msg.get("tool_calls", [])

                # Yield text content if present
                if content:
                    yield {"type": "text", "content": content}

                # Process tool calls if present
                if tool_calls:
                    for tool_call in tool_calls:
                        func = tool_call.get("function", {})
                        tool_name = func.get("name", "")
                        tool_args_str = func.get("arguments", "{}")

                        # Parse arguments
                        try:
                            tool_input = json.loads(tool_args_str) if isinstance(tool_args_str, str) else tool_args_str
                        except json.JSONDecodeError:
                            tool_input = {}

                        yield {
                            "type": "tool_call",
                            "id": tool_call.get("id", ""),
                            "name": tool_name,
                            "input": tool_input
                        }

                        # Execute the tool
                        result = await tool_executor.execute(tool_name, tool_input)

                        yield {
                            "type": "tool_result",
                            "name": tool_name,
                            "result": result
                        }

                        # Add to messages for next iteration
                        messages.append({
                            "role": "assistant",
                            "content": content,
                            "tool_calls": tool_calls,
                        })
                        messages.append({
                            "role": "tool",
                            "content": json.dumps(result),
                        })

                    # Continue to process tool results
                    continue

                # No tool calls, we're done
                queued = tool_executor.get_queued_tracks()
                if queued:
                    yield {"type": "queue", "tracks": queued, "clear": False}

                action = tool_executor.get_playback_action()
                if action:
                    yield {"type": "playback", "action": action}

                yield {"type": "done"}
                break

        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama API error: {e}")
            yield {"type": "text", "content": f"Error communicating with Ollama: {e}"}
            yield {"type": "done"}
        except Exception as e:
            logger.error(f"Ollama chat error: {e}")
            yield {"type": "text", "content": f"Error: {e}"}
            yield {"type": "done"}
