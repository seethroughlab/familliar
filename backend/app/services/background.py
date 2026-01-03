"""In-process background task manager using asyncio and ProcessPoolExecutor.

Key features:
1. Uses spawn-based ProcessPoolExecutor (avoids fork/OpenBLAS SIGSEGV)
2. Runs periodic tasks via APScheduler
3. Reports progress via Redis for frontend consumption
"""

import asyncio
import json
import logging
import multiprocessing as mp
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
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
    - APScheduler for periodic tasks
    - Redis for progress reporting
    - Task deduplication to prevent running multiple syncs simultaneously
    """

    def __init__(self):
        self._executor: ProcessPoolExecutor | None = None
        self._scheduler = None
        self._redis: redis.Redis | None = None
        self._current_sync_task: asyncio.Task | None = None
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
            self._create_executor()
        return self._executor

    def _create_executor(self) -> None:
        """Create a new ProcessPoolExecutor with spawn context."""
        # Use spawn to get clean processes (fork can inherit corrupted OpenBLAS state)
        self._executor = ProcessPoolExecutor(
            max_workers=2,
            mp_context=mp_context,
        )
        logger.info("ProcessPoolExecutor initialized with spawn context (2 workers)")

    def _reset_executor(self) -> None:
        """Reset the executor after a crash. Creates a fresh process pool."""
        if self._executor is not None:
            try:
                self._executor.shutdown(wait=False)
            except Exception:
                pass
            self._executor = None
        self._create_executor()
        logger.warning("ProcessPoolExecutor was reset after crash")

    async def startup(self) -> None:
        """Initialize scheduler on app startup."""
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger

            self._scheduler = AsyncIOScheduler()

            # Unified library sync every 2 hours (replaces separate scan + analysis catch-up)
            self._scheduler.add_job(
                self._periodic_sync,
                CronTrigger(hour="*/2", minute=0),
                id="periodic_sync",
                replace_existing=True,
            )

            self._scheduler.start()
            logger.info("APScheduler started with periodic sync (every 2 hours)")

            # Schedule startup sync after a short delay
            asyncio.create_task(self._startup_sync())

        except ImportError:
            logger.warning("APScheduler not installed - periodic tasks disabled")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")

    async def shutdown(self) -> None:
        """Cleanup on app shutdown."""
        logger.info("Shutting down BackgroundManager...")

        # Cancel running tasks
        if self._current_sync_task and not self._current_sync_task.done():
            self._current_sync_task.cancel()
            try:
                await self._current_sync_task
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

    def is_analysis_running(self) -> bool:
        """Check if any analysis tasks are currently running."""
        # Clean up completed tasks first
        completed = [tid for tid, task in self._analysis_tasks.items() if task.done()]
        for tid in completed:
            self._analysis_tasks.pop(tid, None)

        return len(self._analysis_tasks) > 0

    def get_analysis_task_count(self) -> int:
        """Get the number of active analysis tasks."""
        # Clean up completed tasks first
        completed = [tid for tid, task in self._analysis_tasks.items() if task.done()]
        for tid in completed:
            self._analysis_tasks.pop(tid, None)

        return len(self._analysis_tasks)

    def is_sync_running(self) -> bool:
        """Check if a library sync is currently running."""
        # Check local task first
        if self._current_sync_task and not self._current_sync_task.done():
            return True

        # Check Redis lock
        try:
            if self.redis.get("familiar:sync:lock"):
                return True

            # Also check progress status
            data: bytes | None = self.redis.get("familiar:sync:progress")  # type: ignore[assignment]
            if data:
                progress = json.loads(data)
                if progress.get("status") == "running":
                    # Check if heartbeat is recent
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

    def _acquire_sync_lock(self) -> bool:
        """Try to acquire the sync lock in Redis. Returns True if acquired."""
        try:
            return bool(self.redis.set("familiar:sync:lock", "1", nx=True, ex=7200))  # 2 hour expiry
        except Exception:
            return False

    def _release_sync_lock(self) -> None:
        """Release the sync lock in Redis."""
        try:
            self.redis.delete("familiar:sync:lock")
        except Exception:
            pass

    def _cancel_sync(self) -> None:
        """Cancel the current sync task."""
        if self._current_sync_task and not self._current_sync_task.done():
            self._current_sync_task.cancel()
        self._release_sync_lock()

    async def run_cpu_bound(self, func: Callable, *args: Any, max_retries: int = 1) -> Any:
        """Run CPU-bound function in process pool (spawned, not forked).

        This is the key to avoiding OpenBLAS SIGSEGV - spawned processes
        don't inherit corrupted library state from the parent.

        If the process pool crashes (BrokenProcessPool), it will be automatically
        recreated and the operation retried once.
        """
        loop = asyncio.get_event_loop()
        retries = 0
        last_error = None

        while retries <= max_retries:
            try:
                return await loop.run_in_executor(self.executor, func, *args)
            except BrokenProcessPool as e:
                last_error = e
                if retries < max_retries:
                    logger.warning(
                        f"Process pool crashed, recreating and retrying "
                        f"(attempt {retries + 1}/{max_retries + 1})"
                    )
                    self._reset_executor()
                    retries += 1
                else:
                    raise
        raise last_error  # Should not reach here, but for type safety

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

    async def run_sync(
        self,
        reread_unchanged: bool = False,
    ) -> dict[str, Any]:
        """Start a unified library sync (scan + analysis) in the background.

        Returns immediately with status. Progress is reported via Redis.
        Uses Redis-based locking to prevent concurrent syncs across workers.

        Args:
            reread_unchanged: Re-read metadata for files even if unchanged.
        """
        async with self._lock:
            # Check if already running (local or other worker)
            if self.is_sync_running():
                return {"status": "already_running"}

            # Try to acquire Redis lock
            if not self._acquire_sync_lock():
                return {"status": "already_running"}

            # Create task and store reference
            self._current_sync_task = asyncio.create_task(
                self._do_sync(reread_unchanged)
            )

        return {"status": "started"}

    async def _do_sync(
        self,
        reread_unchanged: bool,
    ) -> dict[str, Any]:
        """Execute the unified library sync."""
        from app.services.tasks import run_library_sync

        try:
            result = await run_library_sync(reread_unchanged=reread_unchanged)
            return result
        except Exception as e:
            logger.error(f"Sync failed: {e}", exc_info=True)
            # Update Redis progress with error
            try:
                progress = {"status": "error", "phase_message": str(e)}
                self.redis.set("familiar:sync:progress", json.dumps(progress), ex=3600)
            except Exception:
                pass
            return {"status": "error", "error": str(e)}
        finally:
            self._current_sync_task = None
            self._release_sync_lock()

    async def _startup_sync(self) -> None:
        """Run initial sync on startup after a short delay."""
        # Wait for server to fully start
        await asyncio.sleep(5)

        # Only run if no sync is already in progress
        if self.is_sync_running():
            logger.info("Skipping startup sync - another sync is already running")
            return

        logger.info("Starting automatic library sync on startup")
        try:
            await self.run_sync()
        except Exception as e:
            logger.error(f"Startup sync failed: {e}")

    async def _periodic_sync(self) -> None:
        """Run periodic unified library sync."""
        logger.info("Starting periodic library sync")
        try:
            await self.run_sync()
        except Exception as e:
            logger.error(f"Periodic sync failed: {e}")


# Global singleton instance
_background_manager: BackgroundManager | None = None


def get_background_manager() -> BackgroundManager:
    """Get the global BackgroundManager instance."""
    global _background_manager
    if _background_manager is None:
        _background_manager = BackgroundManager()
    return _background_manager
