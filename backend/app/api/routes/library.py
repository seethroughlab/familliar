"""Library management endpoints."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.config import settings
from app.db.models import AlbumType, Track
from app.services.import_service import ImportError, ImportService, save_upload_to_temp
from app.services.scanner import LibraryScanner
from app.workers.tasks import get_scan_progress, scan_library

router = APIRouter(prefix="/library", tags=["library"])


class LibraryStats(BaseModel):
    """Library statistics."""

    total_tracks: int
    total_albums: int
    total_artists: int
    albums: int
    compilations: int
    soundtracks: int
    analyzed_tracks: int
    pending_analysis: int


class ScanProgress(BaseModel):
    """Detailed scan progress."""

    phase: str  # "discovery", "processing", "cleanup", "complete"
    files_discovered: int = 0
    files_processed: int = 0
    files_total: int = 0
    new_tracks: int = 0
    updated_tracks: int = 0
    relocated_tracks: int = 0
    deleted_tracks: int = 0
    unchanged_tracks: int = 0
    current_file: str | None = None
    started_at: str | None = None
    errors: list[str] = []


class ScanStatus(BaseModel):
    """Scan status response."""

    status: str  # "idle", "running", "completed", "error"
    message: str
    progress: ScanProgress | None = None


# Note: Scan progress is now stored in Redis and managed by the Celery worker.
# See app.workers.tasks for ScanProgressReporter class.


@router.get("/stats", response_model=LibraryStats)
async def get_library_stats(db: DbSession) -> LibraryStats:
    """Get library statistics."""
    # Total tracks
    total_tracks = await db.scalar(select(func.count(Track.id))) or 0

    # Unique albums
    total_albums = await db.scalar(select(func.count(func.distinct(Track.album)))) or 0

    # Unique artists
    total_artists = await db.scalar(select(func.count(func.distinct(Track.artist)))) or 0

    # By album type
    albums = await db.scalar(
        select(func.count(Track.id)).where(Track.album_type == AlbumType.ALBUM)
    ) or 0
    compilations = await db.scalar(
        select(func.count(Track.id)).where(Track.album_type == AlbumType.COMPILATION)
    ) or 0
    soundtracks = await db.scalar(
        select(func.count(Track.id)).where(Track.album_type == AlbumType.SOUNDTRACK)
    ) or 0

    # Analysis status
    analyzed_tracks = await db.scalar(
        select(func.count(Track.id)).where(Track.analysis_version > 0)
    ) or 0

    return LibraryStats(
        total_tracks=total_tracks,
        total_albums=total_albums,
        total_artists=total_artists,
        albums=albums,
        compilations=compilations,
        soundtracks=soundtracks,
        analyzed_tracks=analyzed_tracks,
        pending_analysis=total_tracks - analyzed_tracks,
    )


@router.post("/scan", response_model=ScanStatus)
async def start_scan(
    full: bool = False,
) -> ScanStatus:
    """Start a library scan using Celery worker.

    The scan runs in a separate worker process, so it won't block the API.
    Progress is stored in Redis and can be retrieved via GET /scan/status.

    Args:
        full: If True, rescan all files even if unchanged. Default False (incremental).
    """
    # Check if a scan is already running
    progress = get_scan_progress()
    if progress and progress.get("status") == "running":
        return ScanStatus(
            status="already_running",
            message="A scan is already in progress",
            progress=ScanProgress(**{k: progress.get(k, v) for k, v in ScanProgress().model_dump().items()}),
        )

    # Dispatch to Celery worker
    scan_library.delay(full_scan=full)

    return ScanStatus(
        status="started",
        message="Scan started in Celery worker",
    )


@router.get("/scan/status", response_model=ScanStatus)
async def get_scan_status() -> ScanStatus:
    """Get current scan status with detailed progress from Redis."""
    from datetime import datetime, timedelta
    from app.workers.tasks import clear_scan_progress

    progress = get_scan_progress()

    if not progress:
        return ScanStatus(
            status="idle",
            message="No scan running",
            progress=None,
        )

    # Check if the scan is stale (no heartbeat for 2 minutes)
    status = progress.get("status", "idle")
    if status == "running":
        last_heartbeat = progress.get("last_heartbeat")
        if last_heartbeat:
            try:
                heartbeat_time = datetime.fromisoformat(last_heartbeat)
                if datetime.now() - heartbeat_time > timedelta(minutes=2):
                    # Scan is stale - worker probably died
                    clear_scan_progress()
                    return ScanStatus(
                        status="interrupted",
                        message="Scan was interrupted (worker stopped responding)",
                        progress=None,
                    )
            except (ValueError, TypeError):
                pass

    # Convert Redis progress to ScanProgress model
    scan_progress = ScanProgress(
        phase=progress.get("phase", "idle"),
        files_discovered=progress.get("files_discovered", 0),
        files_processed=progress.get("files_processed", 0),
        files_total=progress.get("files_total", 0),
        new_tracks=progress.get("new_tracks", 0),
        updated_tracks=progress.get("updated_tracks", 0),
        relocated_tracks=progress.get("relocated_tracks", 0),
        deleted_tracks=progress.get("deleted_tracks", 0),
        unchanged_tracks=progress.get("unchanged_tracks", 0),
        current_file=progress.get("current_file"),
        started_at=progress.get("started_at"),
        errors=progress.get("errors", []),
    )

    return ScanStatus(
        status=status,
        message=progress.get("message", ""),
        progress=scan_progress if status != "idle" else None,
    )


class ImportResult(BaseModel):
    """Import operation result."""
    status: str
    message: str
    import_path: str | None = None
    files_found: int = 0
    files: list[str] = []


class RecentImport(BaseModel):
    """Recent import directory info."""
    name: str
    path: str
    file_count: int
    created_at: str | None


@router.post("/import", response_model=ImportResult)
async def import_music(
    db: DbSession,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> ImportResult:
    """Import music from a zip file or audio file.

    Accepts:
    - Zip files containing audio (extracts and imports)
    - Individual audio files (mp3, flac, m4a, etc.)

    Files are saved to {MUSIC_LIBRARY_PATH}/_imports/{timestamp}/
    and automatically scanned for metadata.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Read uploaded file
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Save to temp file
    try:
        temp_path = save_upload_to_temp(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    # Process the import
    try:
        import_service = ImportService()
        result = import_service.process_upload(temp_path, file.filename)

        # Schedule scan of the import directory
        import_dir = Path(result["import_path"])

        async def scan_import():
            scanner = LibraryScanner(db)
            await scanner.scan(import_dir, full_scan=True)

        background_tasks.add_task(scan_import)

        return ImportResult(
            status="processing",
            message=f"Imported {result['files_found']} files, scanning for metadata...",
            import_path=result["import_path"],
            files_found=result["files_found"],
            files=result.get("files", []),
        )

    except ImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {e}")
    finally:
        # Clean up temp file
        temp_path.unlink(missing_ok=True)


@router.get("/imports/recent", response_model=list[RecentImport])
async def get_recent_imports(limit: int = 10) -> list[RecentImport]:
    """Get list of recent import directories."""
    import_service = ImportService()
    imports = import_service.get_recent_imports(limit)
    return [RecentImport(**i) for i in imports]
