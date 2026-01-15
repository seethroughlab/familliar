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
        "name": "semantic_search",
        "description": "Search for tracks using natural language descriptions of sound, mood, or style. Uses AI audio embeddings to find tracks that sonically match descriptions like 'dreamy atmospheric synths', 'aggressive heavy guitars', 'mellow jazz with piano', 'gloomy with Eastern influences'. Best for abstract or mood-based queries where metadata search won't work well.",
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Natural language description of the sound, mood, or style you're looking for"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 20)",
                    "default": 20
                }
            },
            "required": ["description"]
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
    },
    # Metadata correction tools
    {
        "name": "lookup_correct_metadata",
        "description": "Look up correct metadata for a track from external sources (MusicBrainz). Use when the user reports incorrect metadata or you notice potential issues like wrong artist, album, year, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_id": {
                    "type": "string",
                    "description": "UUID of the track to look up"
                }
            },
            "required": ["track_id"]
        }
    },
    {
        "name": "propose_metadata_change",
        "description": "Propose a metadata correction for user review. The change will be queued in Proposed Changes for the user to approve/reject. Use after lookup_correct_metadata confirms the correct value, or when the user explicitly tells you the correct value.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of track UUIDs to change"
                },
                "field": {
                    "type": "string",
                    "enum": ["title", "artist", "album", "album_artist", "year", "genre"],
                    "description": "Which metadata field to change"
                },
                "new_value": {
                    "type": "string",
                    "description": "The correct value for the field"
                },
                "reason": {
                    "type": "string",
                    "description": "Explanation of why this change is needed"
                },
                "source": {
                    "type": "string",
                    "enum": ["user_request", "llm_suggestion"],
                    "description": "user_request if user explicitly asked, llm_suggestion if you noticed the issue",
                    "default": "user_request"
                }
            },
            "required": ["track_ids", "field", "new_value", "reason"]
        }
    },
    {
        "name": "get_album_tracks",
        "description": "Get all tracks from a specific album. Useful before proposing album-wide metadata changes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "album": {
                    "type": "string",
                    "description": "Album name to find tracks for"
                },
                "artist": {
                    "type": "string",
                    "description": "Artist name (optional but recommended for accuracy)"
                }
            },
            "required": ["album"]
        }
    },
    {
        "name": "mark_album_as_compilation",
        "description": "Mark an album as a compilation and set the album_artist field. Use when an album has tracks from multiple artists but should be grouped together (e.g., compilations curated by a DJ, Various Artists albums).",
        "input_schema": {
            "type": "object",
            "properties": {
                "album": {
                    "type": "string",
                    "description": "Album name"
                },
                "album_artist": {
                    "type": "string",
                    "description": "The album artist to set (e.g., 'Ladytron', 'Various Artists', 'Ministry of Sound')"
                },
                "reason": {
                    "type": "string",
                    "description": "Why this album should be marked as a compilation"
                }
            },
            "required": ["album", "album_artist", "reason"]
        }
    },
    {
        "name": "propose_album_artwork",
        "description": "Search for and propose new album artwork. Searches Cover Art Archive (MusicBrainz) for artwork options and creates a proposed change for the user to review.",
        "input_schema": {
            "type": "object",
            "properties": {
                "artist": {
                    "type": "string",
                    "description": "Artist name"
                },
                "album": {
                    "type": "string",
                    "description": "Album name"
                },
                "reason": {
                    "type": "string",
                    "description": "Why the artwork needs to be changed (e.g., 'missing artwork', 'wrong album art')"
                }
            },
            "required": ["artist", "album", "reason"]
        }
    },
    {
        "name": "find_duplicate_artists",
        "description": "Find artists in the library that are likely duplicates (same artist with different spellings). Detects variations like 'Artist_Name' vs 'Artist and Name', '&' vs 'and', etc. Use when the user mentions duplicate artists or to help clean up the library.",
        "input_schema": {
            "type": "object",
            "properties": {
                "artist_hint": {
                    "type": "string",
                    "description": "Optional: specific artist name to check for duplicates"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max duplicate groups to return (default 10)",
                    "default": 10
                }
            }
        }
    },
    {
        "name": "merge_duplicate_artists",
        "description": "Propose merging duplicate artists by changing the artist field on all tracks. Creates a proposed change for user approval.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source_artist": {
                    "type": "string",
                    "description": "The artist name to change FROM (the duplicate/incorrect spelling)"
                },
                "target_artist": {
                    "type": "string",
                    "description": "The artist name to change TO (the canonical/correct spelling)"
                },
                "reason": {
                    "type": "string",
                    "description": "Explanation of why these are duplicates"
                }
            },
            "required": ["source_artist", "target_artist", "reason"]
        }
    }
]

SYSTEM_PROMPT = """You are Familiar, a music assistant for a personal music library.

## CRITICAL: SEARCH ONCE, THEN QUEUE

You MUST follow this exact workflow:
1. Search ONCE (maybe twice if first search returns nothing)
2. IMMEDIATELY queue the tracks you found using queue_tracks
3. Tell the user what you queued

DO NOT keep searching repeatedly. If your first search returns tracks, USE THEM.

## How to Handle Requests

**"Play [artist]"** or **"Songs like [artist]"**:
1. search_library for the artist
2. If found: queue_tracks immediately
3. If not found: search for similar genres/styles ONCE, then queue what you find

**"Play something [abstract mood/vibe]"** (e.g., "dreamy", "ethereal", "aggressive", "gloomy with Eastern influences"):
1. semantic_search with the description
2. If unavailable, fall back to filter_tracks_by_features or search_library
3. queue_tracks immediately

**"Play something chill/upbeat/etc"** (simple mood words that map to audio features):
1. filter_tracks_by_features with appropriate values
2. queue_tracks immediately

**"More like this"**:
1. find_similar_tracks
2. queue_tracks immediately

## STOP CONDITIONS (queue and respond after ANY of these):
- You found 5+ tracks → STOP, queue them
- You've made 2 searches → STOP, queue whatever you have
- No results after 2 tries → STOP, tell user you couldn't find anything

## Audio Features Reference
- energy: 0=calm, 1=intense
- valence: 0=sad, 1=happy
- danceability: 0=not danceable, 1=danceable
- bpm: typical range 60-180

## Metadata Corrections

You can help fix incorrect metadata when the user reports issues:

**"Album X is showing under the wrong artist"** or **"The album artist is wrong"**:
1. Use get_album_tracks to find all tracks on that album
2. Use mark_album_as_compilation or propose_metadata_change to suggest the fix
3. Tell the user the change has been proposed for review in Settings

**"This track has the wrong [field]"**:
1. Optionally use lookup_correct_metadata to find the correct value from MusicBrainz
2. Use propose_metadata_change to suggest the correction
3. The user will review and approve the change in Settings > Proposed Changes

**"This album has wrong/missing artwork"** or **"Fix the album art for X"**:
1. Use propose_album_artwork to search Cover Art Archive and propose new artwork
2. The user can preview and approve the artwork change

Changes are NOT applied immediately - they go to a review queue where the user can:
- Preview what will change
- Approve or reject the change
- Choose scope: database only, ID3 tags, or file organization

NEVER make up track names. Only mention tracks returned by tools."""


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
