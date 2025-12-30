"""API routes for new releases discovery."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DbSession, RequiredProfile
from app.services.new_releases import NewReleasesService
from app.workers.tasks import (
    check_new_releases,
    clear_new_releases_progress,
    get_new_releases_progress,
)

router = APIRouter(prefix="/new-releases", tags=["new-releases"])


@router.get("")
async def list_new_releases(
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    include_dismissed: bool = Query(default=False),
    include_owned: bool = Query(default=False),
) -> dict[str, Any]:
    """List cached new releases.

    Returns releases from artists in the library that were discovered
    via Spotify or MusicBrainz.

    Query params:
    - limit: Max releases to return (1-100)
    - offset: Pagination offset
    - include_dismissed: Include releases user dismissed
    - include_owned: Include releases user already owns locally
    """
    service = NewReleasesService(db)

    releases = await service.get_cached_releases(
        limit=limit,
        offset=offset,
        include_dismissed=include_dismissed,
        include_owned=include_owned,
    )

    total = await service.get_releases_count(
        include_dismissed=include_dismissed,
        include_owned=include_owned,
    )

    return {
        "releases": releases,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/status")
async def get_status(db: DbSession) -> dict[str, Any]:
    """Get new releases check status.

    Returns:
    - Status of the last/current check (from Redis progress)
    - Database stats (total releases, artists checked, etc.)
    """
    service = NewReleasesService(db)

    # Get database stats
    db_stats = await service.get_check_status()

    # Get progress from Redis (for running/recent checks)
    progress = get_new_releases_progress()

    return {
        **db_stats,
        "progress": progress,
    }


@router.post("/check")
async def trigger_check(
    profile: RequiredProfile,
    days_back: int = Query(default=90, ge=1, le=365),
    force: bool = Query(default=False),
) -> dict[str, Any]:
    """Trigger a background check for new releases.

    This queues a Celery task to check Spotify (if connected) and
    MusicBrainz for recent releases from artists in the library.

    Query params:
    - days_back: Number of days to look back (1-365)
    - force: If true, check all artists regardless of cache

    Returns task ID for tracking progress.
    """
    # Clear any stale progress
    clear_new_releases_progress()

    # Queue the Celery task
    task = check_new_releases.delay(
        profile_id=str(profile.id),
        days_back=days_back,
        force=force,
    )

    return {
        "task_id": task.id,
        "status": "queued",
        "message": "New releases check started",
    }


@router.post("/{release_id}/dismiss")
async def dismiss_release(
    release_id: UUID,
    db: DbSession,
    profile: RequiredProfile,
) -> dict[str, Any]:
    """Dismiss a release (hide it from the list).

    The release can be shown again by querying with include_dismissed=true.
    """
    service = NewReleasesService(db)

    success = await service.dismiss_release(release_id, profile.id)

    if not success:
        raise HTTPException(status_code=404, detail="Release not found")

    await db.commit()

    return {"status": "ok", "message": "Release dismissed"}
