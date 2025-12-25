"""Last.fm scrobbling service."""

import hashlib
import time
from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class LastfmSession:
    """Last.fm session data."""
    session_key: str
    username: str


class LastfmService:
    """Service for Last.fm API integration and scrobbling."""

    API_URL = "https://ws.audioscrobbler.com/2.0/"
    AUTH_URL = "https://www.last.fm/api/auth/"

    def __init__(self):
        self.api_key = settings.lastfm_api_key
        self.api_secret = settings.lastfm_api_secret
        self.client = httpx.AsyncClient(timeout=10.0)
        self._sessions: dict[str, LastfmSession] = {}

    def is_configured(self) -> bool:
        """Check if Last.fm API is configured."""
        return bool(self.api_key and self.api_secret)

    def get_auth_url(self, callback_url: str) -> str:
        """Get the Last.fm authorization URL."""
        if not self.is_configured():
            raise ValueError("Last.fm API key not configured")

        return f"{self.AUTH_URL}?api_key={self.api_key}&cb={callback_url}"

    def _sign_params(self, params: dict) -> str:
        """Generate API signature for authenticated requests."""
        # Sort params alphabetically and concatenate key+value
        sorted_params = sorted(params.items())
        sig_string = "".join(f"{k}{v}" for k, v in sorted_params)
        sig_string += self.api_secret

        return hashlib.md5(sig_string.encode()).hexdigest()

    async def get_session(self, token: str) -> LastfmSession:
        """
        Exchange an auth token for a session key.
        Called after user authorizes via Last.fm web auth.
        """
        if not self.is_configured():
            raise ValueError("Last.fm API key not configured")

        params = {
            "method": "auth.getSession",
            "api_key": self.api_key,
            "token": token,
        }
        params["api_sig"] = self._sign_params(params)
        params["format"] = "json"

        response = await self.client.get(self.API_URL, params=params)
        response.raise_for_status()

        data = response.json()
        if "error" in data:
            raise ValueError(f"Last.fm error: {data.get('message', 'Unknown error')}")

        session_data = data.get("session", {})
        session = LastfmSession(
            session_key=session_data.get("key", ""),
            username=session_data.get("name", "")
        )

        # Store session by username
        self._sessions[session.username] = session
        return session

    def get_stored_session(self, username: str) -> LastfmSession | None:
        """Get a stored session by username."""
        return self._sessions.get(username)

    def store_session(self, session: LastfmSession) -> None:
        """Store a session."""
        self._sessions[session.username] = session

    async def update_now_playing(
        self,
        session_key: str,
        artist: str,
        track: str,
        album: str | None = None,
        duration: int | None = None,
    ) -> bool:
        """
        Update the "now playing" status on Last.fm.
        Called when a track starts playing.
        """
        if not self.is_configured():
            return False

        params = {
            "method": "track.updateNowPlaying",
            "api_key": self.api_key,
            "sk": session_key,
            "artist": artist,
            "track": track,
        }

        if album:
            params["album"] = album
        if duration:
            params["duration"] = str(duration)

        params["api_sig"] = self._sign_params(params)
        params["format"] = "json"

        try:
            response = await self.client.post(self.API_URL, data=params)
            data = response.json()
            return "error" not in data
        except Exception:
            return False

    async def scrobble(
        self,
        session_key: str,
        artist: str,
        track: str,
        timestamp: int | None = None,
        album: str | None = None,
        duration: int | None = None,
    ) -> bool:
        """
        Scrobble a track to Last.fm.
        Called after at least 50% of the track has been played (or 4 minutes).
        """
        if not self.is_configured():
            return False

        if timestamp is None:
            timestamp = int(time.time())

        params = {
            "method": "track.scrobble",
            "api_key": self.api_key,
            "sk": session_key,
            "artist": artist,
            "track": track,
            "timestamp": str(timestamp),
        }

        if album:
            params["album"] = album
        if duration:
            params["duration"] = str(duration)

        params["api_sig"] = self._sign_params(params)
        params["format"] = "json"

        try:
            response = await self.client.post(self.API_URL, data=params)
            data = response.json()
            return "error" not in data
        except Exception:
            return False

    async def get_user_info(self, session_key: str) -> dict | None:
        """Get user info for a session."""
        if not self.is_configured():
            return None

        params = {
            "method": "user.getInfo",
            "api_key": self.api_key,
            "sk": session_key,
        }
        params["api_sig"] = self._sign_params(params)
        params["format"] = "json"

        try:
            response = await self.client.get(self.API_URL, params=params)
            data = response.json()
            if "error" not in data:
                return data.get("user")
            return None
        except Exception:
            return None

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Singleton instance
_lastfm_service: LastfmService | None = None


def get_lastfm_service() -> LastfmService:
    """Get or create the Last.fm service singleton."""
    global _lastfm_service
    if _lastfm_service is None:
        _lastfm_service = LastfmService()
    return _lastfm_service
