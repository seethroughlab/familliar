"""Library management endpoints."""

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.config import settings
from app.db.models import AlbumType, Track
from app.services.import_service import ImportError, ImportService, save_upload_to_temp
from app.services.scanner import LibraryScanner

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


class ScanStatus(BaseModel):
    """Scan status response."""

    status: str
    message: str
    files_found: int | None = None
    files_queued: int | None = None


# Simple in-memory scan state (replace with Redis in production)
_scan_state: dict = {"status": "idle", "message": "No scan running"}


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
    db: DbSession,
    background_tasks: BackgroundTasks,
    full: bool = False,
) -> ScanStatus:
    """Start a library scan.

    Args:
        full: If True, rescan all files even if unchanged. Default False (incremental).
    """
    global _scan_state

    if _scan_state["status"] == "running":
        return ScanStatus(
            status="already_running",
            message="A scan is already in progress",
        )

    _scan_state = {"status": "running", "message": "Scan starting..."}

    async def run_scan() -> None:
        global _scan_state
        try:
            scanner = LibraryScanner(db)
            total_results = {"total": 0, "new": 0, "updated": 0, "deleted": 0, "queued": 0}

            # Scan all configured library paths
            for library_path in settings.music_library_paths:
                if library_path.exists():
                    _scan_state["message"] = f"Scanning {library_path.name}..."
                    result = await scanner.scan(library_path, full_scan=full)
                    for key in total_results:
                        total_results[key] += result.get(key, 0)

            _scan_state = {
                "status": "completed",
                "message": f"Scan complete: {total_results['new']} new, {total_results['updated']} updated, {total_results['deleted']} deleted",
                "files_found": total_results["total"],
                "files_queued": total_results["queued"],
            }
        except Exception as e:
            _scan_state = {"status": "error", "message": str(e)}

    background_tasks.add_task(run_scan)

    return ScanStatus(
        status="started",
        message="Scan started in background",
    )


@router.get("/scan/status", response_model=ScanStatus)
async def get_scan_status() -> ScanStatus:
    """Get current scan status."""
    return ScanStatus(**_scan_state)


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
