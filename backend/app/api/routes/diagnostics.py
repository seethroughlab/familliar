"""Diagnostics export endpoint for error reporting."""

import os
import platform
import sys
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import DbSession
from app.config import ANALYSIS_VERSION, get_app_version

router = APIRouter(tags=["diagnostics"])


def get_system_info() -> dict[str, Any]:
    """Gather system information for diagnostics."""
    info: dict[str, Any] = {
        "os": platform.system(),
        "os_version": platform.release(),
        "os_detail": platform.platform(),
        "architecture": platform.machine(),
        "python_version": sys.version.split()[0],
        "cpu_count": os.cpu_count(),
    }

    # Try to get memory info
    try:
        import psutil
        mem = psutil.virtual_memory()
        info["memory_total_gb"] = round(mem.total / (1024**3), 1)
        info["memory_available_gb"] = round(mem.available / (1024**3), 1)
        info["memory_percent_used"] = mem.percent
    except ImportError:
        pass  # psutil not installed

    # Check if running in Docker
    try:
        from app.api.routes.health import is_running_in_docker
        info["docker"] = is_running_in_docker()
    except Exception:
        info["docker"] = "unknown"

    return info


class DiagnosticsExport(BaseModel):
    """Comprehensive diagnostics data for issue reporting."""

    exported_at: str
    version: str
    deployment_mode: str
    system_info: dict[str, Any]
    system_health: dict[str, Any]
    library_stats: dict[str, Any]
    recent_failures: list[dict[str, Any]]
    recent_logs: list[dict[str, Any]]
    settings_summary: dict[str, Any]


@router.get("/diagnostics/export", response_model=DiagnosticsExport)
async def export_diagnostics(db: DbSession) -> DiagnosticsExport:
    """Export comprehensive diagnostics for issue reporting.

    This endpoint gathers system health, recent logs, and configuration
    information to help diagnose issues. Sensitive data (API keys, paths)
    is excluded or redacted.
    """
    from sqlalchemy import func, select

    from app.api.routes.health import is_running_in_docker, system_health_check
    from app.db.models import Track
    from app.logging_config import get_recent_logs
    from app.services.app_settings import get_app_settings_service
    from app.services.tasks import get_recent_failures

    # Get system health
    try:
        health = await system_health_check(db)
        system_health = {
            "status": health.status,
            "services": [s.model_dump() for s in health.services],
            "warnings": health.warnings,
        }
    except Exception as e:
        system_health = {"error": str(e)}

    # Get library stats
    library_stats: dict[str, Any] = {}
    try:
        total_tracks = await db.scalar(select(func.count(Track.id))) or 0
        analyzed_tracks = await db.scalar(
            select(func.count(Track.id)).where(Track.analysis_version >= ANALYSIS_VERSION)
        ) or 0

        library_stats = {
            "total_tracks": total_tracks,
            "analyzed_tracks": analyzed_tracks,
            "pending_analysis": total_tracks - analyzed_tracks,
            "analysis_version": ANALYSIS_VERSION,
        }
    except Exception as e:
        library_stats = {"error": str(e)}

    # Get recent failures
    try:
        recent_failures = get_recent_failures(limit=20)
    except Exception as e:
        recent_failures = [{"error": str(e)}]

    # Get recent logs (last 100 for export - keeps size manageable)
    try:
        recent_logs = get_recent_logs(limit=100)
    except Exception as e:
        recent_logs = [{"error": str(e)}]

    # Get non-sensitive settings summary
    try:
        settings_service = get_app_settings_service()
        app_settings = settings_service.get()
        settings_summary = {
            "llm_provider": app_settings.llm_provider,
            "ollama_model": app_settings.ollama_model,
            "has_anthropic_key": bool(app_settings.anthropic_api_key),
            "has_spotify_credentials": bool(app_settings.spotify_client_id),
            "has_lastfm_key": bool(app_settings.lastfm_api_key),
            "library_paths_count": len(app_settings.music_library_paths),
        }
    except Exception as e:
        settings_summary = {"error": str(e)}

    return DiagnosticsExport(
        exported_at=datetime.now(UTC).isoformat(),
        version=get_app_version(),
        deployment_mode="docker" if is_running_in_docker() else "local",
        system_info=get_system_info(),
        system_health=system_health,
        library_stats=library_stats,
        recent_failures=recent_failures,
        recent_logs=recent_logs,
        settings_summary=settings_summary,
    )
