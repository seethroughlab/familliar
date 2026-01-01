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
        "description": "Filter tracks by audio features like BPM, energy, danceability, or musical key. Use for requests like 'upbeat songs', 'something around 120 BPM', or 'songs in the key of F'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "bpm_min": {"type": "number", "description": "Minimum BPM"},
                "bpm_max": {"type": "number", "description": "Maximum BPM"},
                "key": {"type": "string", "description": "Musical key to filter by (e.g., 'C', 'F', 'G#', 'Bb', 'F minor', 'C major')"},
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

SYSTEM_PROMPT = """You are Familiar, a music assistant for a personal music library.

## MANDATORY: USE TOOLS FIRST

You have ZERO knowledge of what music exists in this library. Before you can mention ANY track, artist, or album, you MUST call a tool to discover what's available.

WORKFLOW FOR EVERY MUSIC REQUEST:
1. FIRST: Call a search/filter tool (search_library, filter_tracks_by_features, get_library_genres)
2. THEN: Review the tool results to see what tracks actually exist
3. FINALLY: Respond to the user based ONLY on what the tools returned

FORBIDDEN ACTIONS:
- Suggesting tracks without first calling a tool
- Making up track names, artists, or albums
- Describing music that wasn't in tool results
- Saying "you might have..." or "try looking for..." without searching first

If you catch yourself about to mention a specific track/artist/album, STOP and call a tool first.

## How to Handle Requests

**"Play something chill/upbeat/etc"** → Call filter_tracks_by_features with appropriate energy/valence values, OR call get_library_genres first to find matching genres, then search_library

**"Find low BPM music"** → Call filter_tracks_by_features with bpm_max=90 (or appropriate value)

**"Play jazz/rock/etc"** → Call search_library with that genre

**"More like this"** → Call find_similar_tracks with the current track ID

## After Getting Results

- Queue tracks using queue_tracks with the track IDs from your search
- Tell the user what you found and queued (using the actual data from tools)
- If no results, say so honestly and suggest alternatives

## Audio Features Reference
- energy: 0=calm, 1=intense
- valence: 0=sad, 1=happy
- danceability: 0=not danceable, 1=danceable
- bpm: typical range 60-180

## Variety
Avoid queueing multiple tracks from the same artist/album. The tools help with this automatically.

Remember: ALWAYS use tools before discussing any music. No exceptions."""


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
