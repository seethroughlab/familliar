"""LLM service for conversational music discovery."""

import json
from typing import AsyncIterator
from uuid import UUID

import anthropic
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import Track, TrackAnalysis


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
    }
]

SYSTEM_PROMPT = """You are Familiar, an AI music assistant helping users discover and enjoy their personal music library.

You have access to tools that let you search the library, find similar tracks, filter by audio features, and control playback.

Guidelines:
- When the user asks for music, use tools to search and find matching tracks, then queue them
- Explain your choices briefly—why these tracks fit what they asked for
- If you can't find exactly what they want, suggest alternatives
- You can combine multiple searches: find similar to X, then filter by energy
- Consider context: "something chill" means low energy, "workout music" means high energy/BPM
- Be conversational but efficient—the user wants to listen to music, not read essays
- When you queue tracks, confirm what you've queued

Audio features guide:
- energy: 0 = calm/ambient, 1 = intense/energetic
- valence: 0 = sad/melancholic, 1 = happy/uplifting
- danceability: 0 = not danceable, 1 = very danceable
- acousticness: 0 = electronic/produced, 1 = acoustic
- instrumentalness: 0 = vocals, 1 = instrumental

Keep responses concise and music-focused."""


class ToolExecutor:
    """Executes tools called by the LLM."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._queued_tracks: list[dict] = []
        self._playback_action: str | None = None

    async def execute(self, tool_name: str, tool_input: dict) -> dict:
        """Execute a tool and return the result."""
        if tool_name == "search_library":
            return await self._search_library(**tool_input)
        elif tool_name == "find_similar_tracks":
            return await self._find_similar_tracks(**tool_input)
        elif tool_name == "filter_tracks_by_features":
            return await self._filter_tracks_by_features(**tool_input)
        elif tool_name == "get_library_stats":
            return await self._get_library_stats()
        elif tool_name == "queue_tracks":
            return await self._queue_tracks(**tool_input)
        elif tool_name == "control_playback":
            return await self._control_playback(**tool_input)
        elif tool_name == "get_track_details":
            return await self._get_track_details(**tool_input)
        else:
            return {"error": f"Unknown tool: {tool_name}"}

    def get_queued_tracks(self) -> list[dict]:
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


class LLMService:
    """Service for conversational music discovery using Claude."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    async def chat(
        self,
        message: str,
        conversation_history: list[dict],
        db: AsyncSession,
    ) -> AsyncIterator[dict]:
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
        tool_executor = ToolExecutor(db)
        messages = conversation_history + [{"role": "user", "content": message}]

        while True:
            # Call Claude
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=MUSIC_TOOLS,
                messages=messages,
            )

            # Process response content
            assistant_content = []
            for block in response.content:
                if block.type == "text":
                    yield {"type": "text", "content": block.text}
                    assistant_content.append(block)
                elif block.type == "tool_use":
                    yield {
                        "type": "tool_call",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input
                    }

                    # Execute the tool
                    result = await tool_executor.execute(block.name, block.input)

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
