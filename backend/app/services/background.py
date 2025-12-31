"""In-process background task manager using asyncio and ProcessPoolExecutor.

Replaces Celery with simpler in-process task execution that:
1. Uses spawn-based ProcessPoolExecutor (avoids fork/OpenBLAS SIGSEGV)
2. Runs periodic tasks via APScheduler
3. Reports progress via Redis (same interface as before)
"""

import asyncio
import json
import logging
import multiprocessing as mp
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import redis

from app.config import settings

logger = logging.getLogger(__name__)

# Force spawn context to avoid fork issues with numpy/OpenBLAS
mp_context = mp.get_context("spawn")


class BackgroundManager:
    """Manages background tasks in the API process.

    Key features:
    - ProcessPoolExecutor with spawn context (not fork) to avoid OpenBLAS crashes
    - APScheduler for periodic tasks (replaces Celery Beat)
    - Redis for progress reporting (same interface as Celery tasks used)
    - Task deduplication to prevent running multiple scans simultaneously
    """

    def __init__(self):
        self._executor: ProcessPoolExecutor | None = None
        self._scheduler = None
        self._redis: redis.Redis | None = None
        self._current_scan_task: asyncio.Task | None = None
        self._analysis_tasks: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    @property
    def redis(self) -> redis.Redis:
        """Lazy Redis client."""
        if self._redis is None:
            self._redis = redis.from_url(settings.redis_url)
        return self._redis

    @property
    def executor(self) -> ProcessPoolExecutor:
        """Lazy ProcessPoolExecutor with spawn context."""
        if self._executor is None:
            # Use spawn to get clean processes (fork can inherit corrupted OpenBLAS state)
            self._executor = ProcessPoolExecutor(
                max_workers=2,
                mp_context=mp_context,
            )
            logger.info("ProcessPoolExecutor initialized with spawn context (2 workers)")
        return self._executor

    async def startup(self) -> None:
        """Initialize scheduler on app startup."""
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger

            self._scheduler = AsyncIOScheduler()

            # Periodic library scan every 6 hours
            self._scheduler.add_job(
                self._periodic_scan,
                CronTrigger(hour="*/6", minute=0),
                id="periodic_scan",
                replace_existing=True,
            )

            # Catch-up analysis every hour at :30
            self._scheduler.add_job(
                self._analyze_catchup,
                CronTrigger(minute=30),
                id="analyze_catchup",
                replace_existing=True,
            )

            self._scheduler.start()
            logger.info("APScheduler started with periodic tasks")

        except ImportError:
            logger.warning("APScheduler not installed - periodic tasks disabled")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")

    async def shutdown(self) -> None:
        """Cleanup on app shutdown."""
        logger.info("Shutting down BackgroundManager...")

        # Cancel running tasks
        if self._current_scan_task and not self._current_scan_task.done():
            self._current_scan_task.cancel()
            try:
                await self._current_scan_task
            except asyncio.CancelledError:
                pass

        for task in self._analysis_tasks.values():
            if not task.done():
                task.cancel()

        # Stop scheduler
        if self._scheduler:
            self._scheduler.shutdown(wait=False)

        # Shutdown executor
        if self._executor:
            self._executor.shutdown(wait=False)

        logger.info("BackgroundManager shutdown complete")

    def is_scan_running(self) -> bool:
        """Check if a library scan is currently running (across all workers).

        Uses Redis to coordinate across multiple uvicorn workers.
        """
        # Check local task first
        if self._current_scan_task and not self._current_scan_task.done():
            return True

        # Check Redis lock (shared across all workers)
        try:
            if self.redis.get("familiar:scan:lock"):
                return True

            # Also check progress status
            data: bytes | None = self.redis.get("familiar:scan:progress")  # type: ignore[assignment]
            if data:
                progress = json.loads(data)
                if progress.get("status") == "running":
                    # Check if heartbeat is recent (within 2 minutes)
                    heartbeat = progress.get("last_heartbeat")
                    if heartbeat:
                        from datetime import datetime, timedelta
                        try:
                            hb_time = datetime.fromisoformat(heartbeat)
                            if datetime.now() - hb_time < timedelta(minutes=2):
                                return True
                        except (ValueError, TypeError):
                            pass
        except Exception:
            pass

        return False

    def _acquire_scan_lock(self) -> bool:
        """Try to acquire the scan lock in Redis. Returns True if acquired."""
        try:
            # SET NX (only if not exists) with 1 hour expiry
            return bool(self.redis.set("familiar:scan:lock", "1", nx=True, ex=3600))
        except Exception:
            return False

    def _release_scan_lock(self) -> None:
        """Release the scan lock in Redis."""
        try:
            self.redis.delete("familiar:scan:lock")
        except Exception:
            pass

    async def run_cpu_bound(self, func: Callable, *args: Any) -> Any:
        """Run CPU-bound function in process pool (spawned, not forked).

        This is the key to avoiding OpenBLAS SIGSEGV - spawned processes
        don't inherit corrupted library state from the parent.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, func, *args)

    async def run_scan(self, full_scan: bool = False) -> dict[str, Any]:
        """Start a library scan in the background.

        Returns immediately with status. Progress is reported via Redis.
        Uses Redis-based locking to prevent concurrent scans across workers.
        """
        async with self._lock:
            # Check if already running (local or other worker)
            if self.is_scan_running():
                return {"status": "already_running"}

            # Try to acquire Redis lock
            if not self._acquire_scan_lock():
                return {"status": "already_running"}

            # Create task and store reference
            self._current_scan_task = asyncio.create_task(
                self._do_scan(full_scan)
            )

        return {"status": "started"}

    async def _do_scan(self, full_scan: bool) -> dict[str, Any]:
        """Execute the library scan."""
        from app.services.tasks import run_library_scan

        try:
            result = await run_library_scan(full_scan=full_scan)
            return result
        except Exception as e:
            logger.error(f"Scan failed: {e}", exc_info=True)
            # Update Redis progress with error
            try:
                progress = {"status": "error", "message": str(e)}
                self.redis.set("familiar:scan:progress", json.dumps(progress), ex=3600)
            except Exception:
                pass
            return {"status": "error", "error": str(e)}
        finally:
            self._current_scan_task = None
            self._release_scan_lock()

    async def run_analysis(self, track_id: str) -> dict[str, Any]:
        """Queue a track for analysis.

        Runs in process pool to isolate potential crashes.
        """
        # Check if already analyzing this track
        if track_id in self._analysis_tasks:
            task = self._analysis_tasks[track_id]
            if not task.done():
                return {"status": "already_queued"}

        # Create analysis task
        task = asyncio.create_task(self._do_analysis(track_id))
        self._analysis_tasks[track_id] = task

        return {"status": "queued"}

    async def _do_analysis(self, track_id: str) -> dict[str, Any]:
        """Execute track analysis in process pool."""
        from app.services.tasks import run_track_analysis

        try:
            # Run in process pool to isolate librosa/numpy crashes
            result = await self.run_cpu_bound(run_track_analysis, track_id)
            return result
        except Exception as e:
            logger.error(f"Analysis failed for {track_id}: {e}")
            return {"status": "error", "error": str(e)}
        finally:
            # Clean up task reference
            self._analysis_tasks.pop(track_id, None)

    async def run_spotify_sync(
        self,
        profile_id: str,
        include_top_tracks: bool = True,
        favorite_matched: bool = False,
    ) -> dict[str, Any]:
        """Start Spotify sync in the background."""
        from app.services.tasks import run_spotify_sync

        try:
            result = await run_spotify_sync(
                profile_id=profile_id,
                include_top_tracks=include_top_tracks,
                favorite_matched=favorite_matched,
            )
            return result
        except Exception as e:
            logger.error(f"Spotify sync failed: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}

    async def run_new_releases_check(
        self,
        profile_id: str | None = None,
        days_back: int = 90,
        force: bool = False,
    ) -> dict[str, Any]:
        """Start new releases check in the background."""
        from app.services.tasks import run_new_releases_check

        try:
            result = await run_new_releases_check(
                profile_id=profile_id,
                days_back=days_back,
                force=force,
            )
            return result
        except Exception as e:
            logger.error(f"New releases check failed: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}

    async def _periodic_scan(self) -> None:
        """Run periodic incremental library scan."""
        logger.info("Starting periodic library scan")
        await self.run_scan(full_scan=False)

    async def _analyze_catchup(self) -> None:
        """Queue analysis for unanalyzed tracks."""
        from app.services.tasks import queue_unanalyzed_tracks

        logger.info("Running analysis catch-up")
        try:
            queued = await queue_unanalyzed_tracks(limit=500)
            if queued > 0:
                logger.info(f"Queued {queued} tracks for analysis")
        except Exception as e:
            logger.error(f"Analysis catch-up failed: {e}")


# Global singleton instance
_background_manager: BackgroundManager | None = None


def get_background_manager() -> BackgroundManager:
    """Get the global BackgroundManager instance."""
    global _background_manager
    if _background_manager is None:
        _background_manager = BackgroundManager()
    return _background_manager
