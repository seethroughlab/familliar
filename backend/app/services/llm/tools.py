"""LLM tool definitions for music discovery."""

from typing import Any

# Tool definitions for Claude
MUSIC_TOOLS: list[dict[str, Any]] = [
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
    },
    {
        "name": "select_diverse_tracks",
        "description": "From a list of track IDs, select a diverse subset with variety across different artists and albums. Use this before queueing to ensure the playlist has good variety.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of track UUIDs to select from"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max tracks to return (default 20)",
                    "default": 20
                },
                "max_per_artist": {
                    "type": "integer",
                    "description": "Maximum tracks from any single artist (default 2)",
                    "default": 2
                },
                "max_per_album": {
                    "type": "integer",
                    "description": "Maximum tracks from any single album (default 2)",
                    "default": 2
                }
            },
            "required": ["track_ids"]
        }
    }
]

SYSTEM_PROMPT = """You are Familiar, an AI music assistant helping users discover and enjoy their personal music library.

You have access to tools that let you search the library, find similar tracks, filter by audio features, and control playback. You can also access the user's Spotify favorites if they've connected their account.

Playlists are automatically saved when you queue tracks, so just focus on finding and queueing great music.

Guidelines:
- For mood-based requests (e.g., "sleepy music", "something chill", "upbeat"), first call get_library_genres to see what genres are available, then search for matching genre names
- When the user asks for music, use tools to search and find matching tracks, then queue them
- Search by genre names that exist in their library (e.g., "ambient", "electronic", "jazz"), not mood words like "sleepy" or "relaxing"
- Explain your choices briefly—why these tracks fit what they asked for
- If you can't find exactly what they want, suggest alternatives
- You can combine multiple searches: find similar to X, then filter by energy
- Be conversational but efficient—the user wants to listen to music, not read essays
- When you queue tracks, confirm what you've queued

VARIETY IS ESSENTIAL:
- NEVER queue multiple tracks from the same album unless the user specifically requests that album
- Aim for variety across different artists—a good playlist has tracks from many different artists
- When selecting tracks, prioritize diversity: pick from various artists, albums, and years
- The tools automatically provide diverse results, but when curating manually, ensure you're not overrepresenting any single artist or album
- If the user wants 10 tracks, aim for at least 6-8 different artists

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


def convert_tools_to_ollama_format(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
