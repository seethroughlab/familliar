"""Proactive artwork fetcher service.

Fetches album artwork from external sources when not embedded in audio files.
Sources (in priority order):
1. Cover Art Archive (via MusicBrainz search)
2. Last.fm API
3. Spotify API (if configured)
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from app.services.artwork import get_artwork_path, save_artwork
from app.services.tasks import get_redis

logger = logging.getLogger(__name__)

# Redis key for progress tracking
ARTWORK_PROGRESS_KEY = "familiar:artwork:progress"

# Rate limiting
RATE_LIMIT_DELAY = 1.0  # Seconds between requests to Cover Art Archive
CACHE_FAILED_DURATION = 3600  # Don't retry failed albums for 1 hour

# MusicBrainz API
MB_BASE_URL = "https://musicbrainz.org/ws/2"
MB_USER_AGENT = "Familiar/1.0 (https://github.com/jeffwecan/familiar)"

# Cover Art Archive
CAA_BASE_URL = "https://coverartarchive.org"


@dataclass
class ArtworkFetchRequest:
    """Request to fetch artwork for an album."""

    album_hash: str
    artist: str
    album: str
    track_id: str | None = None
    timestamp: float = 0.0

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.time()


class ArtworkFetcher:
    """Background artwork fetcher with rate limiting and caching."""

    def __init__(self):
        self._queue: asyncio.Queue[ArtworkFetchRequest] = asyncio.Queue()
        self._failed_cache: dict[str, float] = {}  # album_hash -> timestamp of failure
        self._in_progress: set[str] = set()  # album_hashes currently being fetched
        self._in_progress_items: dict[str, str] = {}  # album_hash -> "artist - album"
        self._worker_task: asyncio.Task | None = None
        self._last_request_time: float = 0.0
        # Progress tracking
        self._completed: int = 0
        self._failed: int = 0
        self._started_at: str | None = None

    def _update_progress(self) -> None:
        """Update progress in Redis."""
        try:
            redis = get_redis()
            queued = self._queue.qsize()
            in_progress = len(self._in_progress)

            # Get current item being fetched
            current_item = None
            if self._in_progress_items:
                # Get the first in-progress item
                current_item = next(iter(self._in_progress_items.values()), None)

            # Only write progress if there's activity
            if queued > 0 or in_progress > 0 or self._completed > 0 or self._failed > 0:
                data = {
                    "status": "running" if (queued > 0 or in_progress > 0) else "idle",
                    "phase": "fetching" if (queued > 0 or in_progress > 0) else "idle",
                    "queued": queued,
                    "in_progress": in_progress,
                    "completed": self._completed,
                    "failed": self._failed,
                    "current_item": current_item,
                    "started_at": self._started_at,
                    "last_heartbeat": datetime.now().isoformat(),
                }
                redis.set(ARTWORK_PROGRESS_KEY, json.dumps(data), ex=3600)
            else:
                # Clear progress when idle with no history
                redis.delete(ARTWORK_PROGRESS_KEY)
        except Exception as e:
            logger.debug(f"Failed to update artwork progress: {e}")

    async def start(self) -> None:
        """Start the background worker."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())
            logger.info("Artwork fetcher worker started")

    async def stop(self) -> None:
        """Stop the background worker."""
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            logger.info("Artwork fetcher worker stopped")

    async def queue(self, request: ArtworkFetchRequest) -> bool:
        """Queue an artwork fetch request.

        Returns True if queued, False if skipped (already exists, failed recently, or in progress).
        """
        # Skip if artwork already exists
        full_path = get_artwork_path(request.album_hash, "full")
        if full_path.exists():
            return False

        # Skip if recently failed
        failed_time = self._failed_cache.get(request.album_hash)
        if failed_time and time.time() - failed_time < CACHE_FAILED_DURATION:
            return False

        # Skip if already in progress
        if request.album_hash in self._in_progress:
            return False

        # Start tracking if this is the first item
        if self._started_at is None:
            self._started_at = datetime.now().isoformat()
            self._completed = 0
            self._failed = 0

        # Add to queue
        await self._queue.put(request)
        self._update_progress()
        return True

    async def _worker(self) -> None:
        """Background worker that processes the queue."""
        while True:
            try:
                request = await self._queue.get()

                # Skip if already processed (may have been queued multiple times)
                full_path = get_artwork_path(request.album_hash, "full")
                if full_path.exists():
                    self._queue.task_done()
                    self._update_progress()
                    continue

                # Mark as in progress
                self._in_progress.add(request.album_hash)
                self._in_progress_items[request.album_hash] = f"{request.artist} - {request.album}"
                self._update_progress()

                try:
                    # Rate limit
                    await self._rate_limit()

                    # Try to fetch artwork
                    success = await self._fetch_artwork(request)

                    if success:
                        self._completed += 1
                    else:
                        # Cache the failure to avoid repeated attempts
                        self._failed_cache[request.album_hash] = time.time()
                        self._failed += 1
                finally:
                    self._in_progress.discard(request.album_hash)
                    self._in_progress_items.pop(request.album_hash, None)
                    self._queue.task_done()
                    self._update_progress()

                    # Reset counters when queue is empty
                    if self._queue.empty() and not self._in_progress:
                        self._started_at = None
                        self._completed = 0
                        self._failed = 0

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Artwork worker error: {e}", exc_info=True)
                await asyncio.sleep(1)  # Brief pause on error

    async def _rate_limit(self) -> None:
        """Apply rate limiting between requests."""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    async def _fetch_artwork(self, request: ArtworkFetchRequest) -> bool:
        """Fetch artwork from available sources.

        Returns True if artwork was successfully downloaded and saved.
        """
        logger.debug(f"Fetching artwork for {request.artist} - {request.album}")

        # Try Cover Art Archive first (via MusicBrainz)
        image_data = await self._fetch_from_musicbrainz(request.artist, request.album)

        # Try Last.fm if MusicBrainz failed
        if not image_data:
            image_data = await self._fetch_from_lastfm(request.artist, request.album)

        # Try Spotify if available and others failed
        if not image_data:
            image_data = await self._fetch_from_spotify(request.artist, request.album)

        if image_data:
            # Save artwork to disk
            saved = save_artwork(image_data, request.album_hash)
            if saved:
                logger.info(f"Downloaded artwork for {request.artist} - {request.album}")
                return True

        logger.debug(f"No artwork found for {request.artist} - {request.album}")
        return False

    async def _fetch_from_musicbrainz(self, artist: str, album: str) -> bytes | None:
        """Search MusicBrainz for release and fetch from Cover Art Archive."""
        async with httpx.AsyncClient(
            timeout=30.0,
            headers={"User-Agent": MB_USER_AGENT},
        ) as client:
            try:
                # Search for release
                search_query = f'release:"{album}" AND artist:"{artist}"'
                response = await client.get(
                    f"{MB_BASE_URL}/release",
                    params={
                        "query": search_query,
                        "limit": 5,
                        "fmt": "json",
                    },
                )

                if response.status_code != 200:
                    return None

                data = response.json()
                releases = data.get("releases", [])

                if not releases:
                    return None

                # Try each release until we find one with artwork
                for release in releases:
                    release_id = release.get("id")
                    if not release_id:
                        continue

                    # Fetch from Cover Art Archive
                    image_data = await self._fetch_from_caa(client, release_id)
                    if image_data:
                        return image_data

                    # Rate limit between CAA requests
                    await asyncio.sleep(0.5)

            except httpx.TimeoutException:
                logger.debug(f"MusicBrainz timeout for {artist} - {album}")
            except Exception as e:
                logger.debug(f"MusicBrainz error: {e}")

        return None

    async def _fetch_from_caa(
        self, client: httpx.AsyncClient, release_id: str
    ) -> bytes | None:
        """Fetch cover art from Cover Art Archive."""
        try:
            # Get front cover at 500px
            url = f"{CAA_BASE_URL}/release/{release_id}/front-500"
            response = await client.get(url, follow_redirects=True)

            if response.status_code == 200:
                return response.content

        except httpx.TimeoutException:
            pass
        except Exception as e:
            logger.debug(f"CAA error for {release_id}: {e}")

        return None

    async def _fetch_from_lastfm(self, artist: str, album: str) -> bytes | None:
        """Fetch artwork from Last.fm API."""
        from app.services.app_settings import get_app_settings_service

        app_settings = get_app_settings_service().get()
        api_key = app_settings.lastfm_api_key

        if not api_key:
            return None

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(
                    "https://ws.audioscrobbler.com/2.0/",
                    params={
                        "method": "album.getinfo",
                        "api_key": api_key,
                        "artist": artist,
                        "album": album,
                        "format": "json",
                    },
                )

                if response.status_code != 200:
                    return None

                data = response.json()
                album_data = data.get("album", {})
                images = album_data.get("image", [])

                # Find extralarge or large image
                image_url = None
                for img in images:
                    size = img.get("size", "")
                    url = img.get("#text", "")
                    if url and size in ("extralarge", "large"):
                        image_url = url
                        if size == "extralarge":
                            break

                if image_url:
                    # Download the image
                    img_response = await client.get(image_url, follow_redirects=True)
                    if img_response.status_code == 200:
                        return img_response.content

            except Exception as e:
                logger.debug(f"Last.fm error: {e}")

        return None

    async def _fetch_from_spotify(self, artist: str, album: str) -> bytes | None:
        """Fetch artwork from Spotify API (requires configured credentials)."""
        from app.services.app_settings import get_app_settings_service

        app_settings = get_app_settings_service().get()

        if not app_settings.spotify_client_id or not app_settings.spotify_client_secret:
            return None

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                # Get access token
                auth_response = await client.post(
                    "https://accounts.spotify.com/api/token",
                    data={"grant_type": "client_credentials"},
                    auth=(app_settings.spotify_client_id, app_settings.spotify_client_secret),
                )

                if auth_response.status_code != 200:
                    return None

                token = auth_response.json().get("access_token")
                if not token:
                    return None

                # Search for album
                search_response = await client.get(
                    "https://api.spotify.com/v1/search",
                    params={
                        "q": f"album:{album} artist:{artist}",
                        "type": "album",
                        "limit": 1,
                    },
                    headers={"Authorization": f"Bearer {token}"},
                )

                if search_response.status_code != 200:
                    return None

                data = search_response.json()
                albums = data.get("albums", {}).get("items", [])

                if not albums:
                    return None

                # Get largest image
                images = albums[0].get("images", [])
                if not images:
                    return None

                # Images are sorted by size descending
                image_url = images[0].get("url")
                if image_url:
                    img_response = await client.get(image_url, follow_redirects=True)
                    if img_response.status_code == 200:
                        return img_response.content

            except Exception as e:
                logger.debug(f"Spotify error: {e}")

        return None


# Global singleton
_artwork_fetcher: ArtworkFetcher | None = None


def get_artwork_fetcher() -> ArtworkFetcher:
    """Get the global ArtworkFetcher instance."""
    global _artwork_fetcher
    if _artwork_fetcher is None:
        _artwork_fetcher = ArtworkFetcher()
    return _artwork_fetcher


def get_artwork_fetch_progress() -> dict[str, Any] | None:
    """Get current artwork fetch progress from Redis."""
    try:
        redis = get_redis()
        data: bytes | None = redis.get(ARTWORK_PROGRESS_KEY)  # type: ignore[assignment]
        if data:
            return json.loads(data)
    except Exception as e:
        logger.debug(f"Failed to get artwork fetch progress: {e}")
    return None


def clear_artwork_fetch_progress() -> None:
    """Clear artwork fetch progress from Redis."""
    try:
        redis = get_redis()
        redis.delete(ARTWORK_PROGRESS_KEY)
    except Exception as e:
        logger.debug(f"Failed to clear artwork fetch progress: {e}")
