"""External audio feature lookup service.

Fetches pre-computed audio features from external services to skip
expensive local librosa computation when possible.

Currently supports:
- ReccoBeats: Free API, requires Spotify track ID (from SpotifyFavorite matches)

Future providers could include:
- Direct ISRC lookups
- MusicBrainz-linked services
"""

import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

# ReccoBeats API (no auth required)
RECCOBEATS_BASE_URL = "https://api.reccobeats.com/v1"


@dataclass
class ExternalFeatures:
    """Audio features retrieved from an external source."""

    source: str  # Provider name: "reccobeats", etc.
    bpm: float | None = None
    key: str | None = None  # e.g., "C", "Am"
    energy: float | None = None  # 0.0-1.0
    danceability: float | None = None  # 0.0-1.0
    valence: float | None = None  # 0.0-1.0 (positivity/happiness)
    acousticness: float | None = None  # 0.0-1.0
    instrumentalness: float | None = None  # 0.0-1.0
    speechiness: float | None = None  # 0.0-1.0
    liveness: float | None = None  # 0.0-1.0
    loudness: float | None = None  # dB, typically -60 to 0
    confidence: float = 1.0  # How reliable these features are
    raw_data: dict = field(default_factory=dict)  # Original API response


class ExternalFeaturesService:
    """Lookup audio features from external services.

    Attempts to find pre-computed features using available identifiers,
    falling back through providers in priority order.
    """

    def __init__(self, timeout: float = 10.0):
        self._client: httpx.AsyncClient | None = None
        self._timeout = timeout

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def lookup_features(
        self,
        *,
        spotify_track_id: str | None = None,
        isrc: str | None = None,
        title: str | None = None,
        artist: str | None = None,
    ) -> ExternalFeatures | None:
        """Try to find pre-computed audio features.

        Lookup priority:
        1. ReccoBeats by Spotify track ID (most reliable)
        2. Future: Other providers by ISRC, title+artist search

        Args:
            spotify_track_id: Spotify track ID (e.g., from SpotifyFavorite)
            isrc: International Standard Recording Code
            title: Track title for search fallback
            artist: Artist name for search fallback

        Returns:
            ExternalFeatures if found, None otherwise
        """
        # Try ReccoBeats with Spotify ID
        if spotify_track_id:
            features = await self._lookup_reccobeats(spotify_track_id)
            if features:
                return features

        # Future: Add more providers here
        # - ISRC-based lookups
        # - Title + artist search

        return None

    async def _lookup_reccobeats(self, spotify_track_id: str) -> ExternalFeatures | None:
        """Lookup audio features from ReccoBeats by Spotify track ID.

        ReccoBeats provides Spotify-compatible audio features for free.
        """
        client = await self._get_client()

        try:
            # Get audio features for the track
            response = await client.get(
                f"{RECCOBEATS_BASE_URL}/track/{spotify_track_id}/audio-features"
            )

            if response.status_code == 404:
                logger.debug(f"ReccoBeats: Track {spotify_track_id} not found")
                return None

            response.raise_for_status()
            data = response.json()

            # Map ReccoBeats response to our schema
            # ReccoBeats uses same format as Spotify's deprecated Audio Features API
            return ExternalFeatures(
                source="reccobeats",
                bpm=data.get("tempo"),
                key=self._pitch_class_to_key(data.get("key"), data.get("mode")),
                energy=data.get("energy"),
                danceability=data.get("danceability"),
                valence=data.get("valence"),
                acousticness=data.get("acousticness"),
                instrumentalness=data.get("instrumentalness"),
                speechiness=data.get("speechiness"),
                liveness=data.get("liveness"),
                loudness=data.get("loudness"),
                confidence=1.0,
                raw_data=data,
            )

        except httpx.HTTPStatusError as e:
            logger.warning(f"ReccoBeats API error for {spotify_track_id}: {e}")
            return None
        except Exception as e:
            logger.warning(f"ReccoBeats lookup failed for {spotify_track_id}: {e}")
            return None

    @staticmethod
    def _pitch_class_to_key(pitch_class: int | None, mode: int | None) -> str | None:
        """Convert Spotify pitch class notation to key string.

        Args:
            pitch_class: 0-11 representing C through B
            mode: 0 for minor, 1 for major

        Returns:
            Key string like "C", "Am", "F#", "Ebm"
        """
        if pitch_class is None:
            return None

        pitch_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        if pitch_class < 0 or pitch_class > 11:
            return None

        key = pitch_names[pitch_class]

        if mode == 0:  # Minor
            key += "m"

        return key


# Singleton instance
_external_features_service: ExternalFeaturesService | None = None


def get_external_features_service() -> ExternalFeaturesService:
    """Get or create the external features service singleton."""
    global _external_features_service
    if _external_features_service is None:
        _external_features_service = ExternalFeaturesService()
    return _external_features_service
