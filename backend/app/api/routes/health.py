"""Health check endpoints."""

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select, text

from app.api.deps import DbSession
from app.config import ANALYSIS_VERSION
from app.db.models import Track

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class ServiceStatus(BaseModel):
    """Status of an individual service."""

    name: str
    status: str  # "healthy", "unhealthy", "degraded"
    message: str | None = None
    details: dict[str, Any] | None = None


class SystemHealth(BaseModel):
    """Overall system health status."""

    status: str  # "healthy", "degraded", "unhealthy"
    services: list[ServiceStatus]
    warnings: list[str] = []
    deployment_mode: str = "local"  # "docker" or "local"


def is_running_in_docker() -> bool:
    """Detect if we're running inside a Docker container."""
    # Check for .dockerenv file (most reliable)
    if Path("/.dockerenv").exists():
        return True
    # Check cgroup (works on most Linux systems)
    try:
        with open("/proc/1/cgroup", "r") as f:
            return "docker" in f.read()
    except (FileNotFoundError, PermissionError):
        pass
    return False


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Basic liveness check."""
    return {"status": "healthy"}


@router.get("/health/db")
async def db_health_check(db: DbSession) -> dict[str, Any]:
    """Database connectivity check."""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


@router.get("/health/system", response_model=SystemHealth)
async def system_health_check(db: DbSession) -> SystemHealth:
    """Comprehensive system health check.

    Checks all required services:
    - Database (PostgreSQL)
    - Redis
    - Celery workers
    - Analysis backlog status
    - Library paths accessibility
    """
    from app.config import settings

    services: list[ServiceStatus] = []
    warnings: list[str] = []

    # Check Library Paths (before other checks so we can surface volume issues prominently)
    unmounted_volumes: list[str] = []
    for library_path in settings.music_library_paths:
        if not library_path.exists():
            # Check if it's a volume mount issue
            parts = library_path.parts
            if len(parts) > 2 and parts[1] == "Volumes":
                volume_name = parts[2]
                if not Path(f"/Volumes/{volume_name}").exists():
                    unmounted_volumes.append(volume_name)

    if unmounted_volumes:
        volume_list = ", ".join(unmounted_volumes)
        warnings.insert(0, f"Music library volume(s) not mounted: {volume_list}. Connect the drive to continue.")

    # Check Database
    try:
        await db.execute(text("SELECT 1"))
        services.append(ServiceStatus(
            name="database",
            status="healthy",
            message="PostgreSQL connected",
        ))
    except Exception as e:
        services.append(ServiceStatus(
            name="database",
            status="unhealthy",
            message=f"PostgreSQL error: {str(e)}",
        ))

    # Check Redis
    try:
        import redis
        from app.config import settings
        r = redis.from_url(settings.redis_url)
        r.ping()
        services.append(ServiceStatus(
            name="redis",
            status="healthy",
            message="Redis connected",
        ))
    except Exception as e:
        services.append(ServiceStatus(
            name="redis",
            status="unhealthy",
            message=f"Redis error: {str(e)}",
        ))

    # Check Background Processing (Celery Workers)
    try:
        from app.workers.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=2.0)
        active_workers = inspect.active_queues()

        if active_workers:
            worker_names = list(active_workers.keys())
            services.append(ServiceStatus(
                name="background_processing",
                status="healthy",
                message=f"{len(worker_names)} process(es) running",
                details={"workers": worker_names},
            ))
        else:
            services.append(ServiceStatus(
                name="background_processing",
                status="unhealthy",
                message="Background processing stopped",
            ))
            warnings.append(
                "Background processing is not running. Music analysis and library scans "
                "will not complete. Try restarting Familiar."
            )
    except Exception as e:
        services.append(ServiceStatus(
            name="background_processing",
            status="unhealthy",
            message="Cannot check status",
        ))
        logger.warning(f"Cannot check worker status: {e}")
        warnings.append(
            "Cannot verify background processing status. "
            "If analysis seems stuck, try restarting Familiar."
        )

    # Check Analysis Backlog
    try:
        total_tracks = await db.scalar(select(func.count(Track.id))) or 0
        analyzed_tracks = await db.scalar(
            select(func.count(Track.id)).where(Track.analysis_version >= ANALYSIS_VERSION)
        ) or 0
        pending = total_tracks - analyzed_tracks

        if pending == 0:
            services.append(ServiceStatus(
                name="analysis",
                status="healthy",
                message="All tracks analyzed",
                details={"total": total_tracks, "analyzed": analyzed_tracks, "pending": 0},
            ))
        elif pending < 100:
            services.append(ServiceStatus(
                name="analysis",
                status="healthy",
                message=f"{pending} tracks pending analysis",
                details={"total": total_tracks, "analyzed": analyzed_tracks, "pending": pending},
            ))
        elif pending < 1000:
            services.append(ServiceStatus(
                name="analysis",
                status="degraded",
                message=f"{pending} tracks pending analysis",
                details={"total": total_tracks, "analyzed": analyzed_tracks, "pending": pending},
            ))
            # Check if processing is running
            bg_healthy = any(
                s.name == "background_processing" and s.status == "healthy"
                for s in services
            )
            if bg_healthy:
                warnings.append(
                    f"{pending} tracks are being analyzed. This may take a while."
                )
            else:
                warnings.append(
                    f"{pending} tracks waiting for analysis. "
                    "Background processing is not running."
                )
        else:
            services.append(ServiceStatus(
                name="analysis",
                status="degraded",
                message=f"{pending:,} tracks pending analysis",
                details={"total": total_tracks, "analyzed": analyzed_tracks, "pending": pending},
            ))
            # Check if processing is running
            bg_healthy = any(
                s.name == "background_processing" and s.status == "healthy"
                for s in services
            )
            if bg_healthy:
                warnings.append(
                    f"{pending:,} tracks are being analyzed. This may take a while."
                )
            else:
                warnings.append(
                    f"{pending:,} tracks waiting for analysis. "
                    "Background processing is not running."
                )
    except Exception as e:
        services.append(ServiceStatus(
            name="analysis",
            status="unhealthy",
            message=f"Cannot check analysis status: {str(e)}",
        ))

    # Determine overall status
    unhealthy_count = sum(1 for s in services if s.status == "unhealthy")
    degraded_count = sum(1 for s in services if s.status == "degraded")

    if unhealthy_count > 0:
        # Database or Redis down is critical
        critical_services = {"database", "redis"}
        critical_down = any(s.status == "unhealthy" and s.name in critical_services for s in services)
        overall_status = "unhealthy" if critical_down else "degraded"
    elif degraded_count > 0:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return SystemHealth(
        status=overall_status,
        services=services,
        warnings=warnings,
        deployment_mode="docker" if is_running_in_docker() else "local",
    )


class WorkerTask(BaseModel):
    """A task currently being processed by a worker."""

    id: str
    name: str
    args: list[Any] = []
    started_at: str | None = None


class WorkerInfo(BaseModel):
    """Information about a Celery worker."""

    name: str
    status: str  # "online", "offline"
    active_tasks: list[WorkerTask] = []
    processed_total: int = 0
    concurrency: int | None = None


class QueueStats(BaseModel):
    """Statistics about task queues."""

    name: str
    pending: int


class TaskFailure(BaseModel):
    """A recent task failure."""

    task: str
    error: str
    track: str | None = None
    timestamp: str


class WorkerStatus(BaseModel):
    """Detailed worker and queue status."""

    workers: list[WorkerInfo]
    queues: list[QueueStats]
    analysis_progress: dict[str, Any]
    recent_failures: list[TaskFailure] = []


@router.get("/health/workers", response_model=WorkerStatus)
async def get_worker_status(db: DbSession) -> WorkerStatus:
    """Get detailed status of Celery workers and task queues."""
    import redis
    from app.config import ANALYSIS_VERSION, settings
    from app.workers.celery_app import celery_app
    from app.workers.tasks import get_recent_failures

    workers: list[WorkerInfo] = []
    queues: list[QueueStats] = []
    recent_failures: list[TaskFailure] = []

    # Get recent failures
    try:
        failures = get_recent_failures(limit=10)
        recent_failures = [TaskFailure(**f) for f in failures]
    except Exception as e:
        logger.warning(f"Could not get recent failures: {e}")

    # Get worker info from Celery
    try:
        inspect = celery_app.control.inspect(timeout=2.0)

        # Get active tasks per worker
        active = inspect.active() or {}
        # Get worker stats
        stats = inspect.stats() or {}

        for worker_name in set(list(active.keys()) + list(stats.keys())):
            worker_tasks = active.get(worker_name, [])
            worker_stats = stats.get(worker_name, {})

            active_task_list = []
            for task in worker_tasks:
                active_task_list.append(WorkerTask(
                    id=task.get("id", ""),
                    name=task.get("name", "").split(".")[-1],  # Short name
                    args=task.get("args", [])[:2],  # Limit args shown
                    started_at=task.get("time_start"),
                ))

            workers.append(WorkerInfo(
                name=worker_name.replace("celery@", ""),
                status="online",
                active_tasks=active_task_list,
                processed_total=worker_stats.get("total", {}).get("app.workers.tasks.analyze_track", 0),
                concurrency=worker_stats.get("pool", {}).get("max-concurrency"),
            ))

    except Exception as e:
        logger.warning(f"Could not get worker info: {e}")

    # Get queue depths from Redis
    try:
        r = redis.from_url(settings.redis_url)
        # Default Celery queue
        default_queue_len = r.llen("celery") or 0
        queues.append(QueueStats(name="default", pending=default_queue_len))
    except Exception as e:
        logger.warning(f"Could not get queue stats: {e}")

    # Get analysis progress
    total_tracks = await db.scalar(select(func.count(Track.id))) or 0
    analyzed_tracks = await db.scalar(
        select(func.count(Track.id)).where(Track.analysis_version >= ANALYSIS_VERSION)
    ) or 0

    analysis_progress = {
        "total": total_tracks,
        "analyzed": analyzed_tracks,
        "pending": total_tracks - analyzed_tracks,
        "percent": round((analyzed_tracks / total_tracks * 100), 1) if total_tracks > 0 else 0,
    }

    return WorkerStatus(
        workers=workers,
        queues=queues,
        analysis_progress=analysis_progress,
        recent_failures=recent_failures,
    )
