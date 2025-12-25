"""Lyrics fetching service using LRCLIB.net for synced lyrics."""

import re
import httpx
from dataclasses import dataclass


@dataclass
class LyricLine:
    """A single line of lyrics with timing."""
    time: float  # Time in seconds
    text: str


@dataclass
class LyricsResult:
    """Result from lyrics search."""
    synced: bool
    lines: list[LyricLine]
    plain_text: str
    source: str = "lrclib"


class LyricsService:
    """Service for fetching song lyrics with optional sync timing."""

    BASE_URL = "https://lrclib.net/api"

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=10.0,
            headers={"User-Agent": "Familiar/1.0"}
        )

    async def search(
        self,
        track_name: str,
        artist_name: str,
        album_name: str | None = None,
        duration: float | None = None
    ) -> LyricsResult | None:
        """
        Search for lyrics by track metadata.
        Returns synced lyrics if available, otherwise plain lyrics.
        """
        # Try the get endpoint first (more precise with duration)
        if duration:
            result = await self._get_by_metadata(
                track_name, artist_name, album_name, duration
            )
            if result:
                return result

        # Fall back to search endpoint
        return await self._search_lyrics(track_name, artist_name)

    async def _get_by_metadata(
        self,
        track_name: str,
        artist_name: str,
        album_name: str | None,
        duration: float
    ) -> LyricsResult | None:
        """Get lyrics using precise metadata matching."""
        try:
            params = {
                "track_name": track_name,
                "artist_name": artist_name,
                "duration": int(duration)
            }
            if album_name:
                params["album_name"] = album_name

            response = await self.client.get(
                f"{self.BASE_URL}/get",
                params=params
            )

            if response.status_code == 200:
                data = response.json()
                return self._parse_response(data)

            return None
        except Exception:
            return None

    async def _search_lyrics(
        self,
        track_name: str,
        artist_name: str
    ) -> LyricsResult | None:
        """Search for lyrics by track and artist name."""
        try:
            response = await self.client.get(
                f"{self.BASE_URL}/search",
                params={
                    "track_name": track_name,
                    "artist_name": artist_name
                }
            )

            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Return first result
                    return self._parse_response(data[0])

            return None
        except Exception:
            return None

    def _parse_response(self, data: dict) -> LyricsResult | None:
        """Parse LRCLIB response into LyricsResult."""
        synced_lyrics = data.get("syncedLyrics")
        plain_lyrics = data.get("plainLyrics")

        if not synced_lyrics and not plain_lyrics:
            return None

        if synced_lyrics:
            lines = self._parse_lrc(synced_lyrics)
            return LyricsResult(
                synced=True,
                lines=lines,
                plain_text=plain_lyrics or "\n".join(line.text for line in lines),
                source="lrclib"
            )
        else:
            # Plain lyrics only
            lines = [
                LyricLine(time=0.0, text=line)
                for line in plain_lyrics.split("\n")
                if line.strip()
            ]
            return LyricsResult(
                synced=False,
                lines=lines,
                plain_text=plain_lyrics,
                source="lrclib"
            )

    def _parse_lrc(self, lrc_content: str) -> list[LyricLine]:
        """Parse LRC format lyrics into list of LyricLine objects."""
        lines = []
        # LRC format: [mm:ss.xx] or [mm:ss:xx] lyric text
        pattern = r'\[(\d+):(\d+)[.:](\d+)\]\s*(.*)'

        for line in lrc_content.split("\n"):
            match = re.match(pattern, line)
            if match:
                minutes = int(match.group(1))
                seconds = int(match.group(2))
                centiseconds = int(match.group(3))
                text = match.group(4).strip()

                # Convert to seconds
                time = minutes * 60 + seconds + centiseconds / 100

                if text:  # Skip empty lines
                    lines.append(LyricLine(time=time, text=text))

        return sorted(lines, key=lambda x: x.time)

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Singleton instance
_lyrics_service: LyricsService | None = None


def get_lyrics_service() -> LyricsService:
    """Get or create the lyrics service singleton."""
    global _lyrics_service
    if _lyrics_service is None:
        _lyrics_service = LyricsService()
    return _lyrics_service
