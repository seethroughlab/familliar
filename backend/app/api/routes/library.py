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


# Shared scan state - import this in scanner.py to update progress
class ScanState:
    def __init__(self):
        self.status = "idle"
        self.message = "No scan running"
        self.progress = ScanProgress(phase="idle")
        self.started_at: str | None = None

    def start(self):
        from datetime import datetime
        self.status = "running"
        self.message = "Scan starting..."
        self.started_at = datetime.now().isoformat()
        self.progress = ScanProgress(phase="discovery", started_at=self.started_at)

    def set_discovery(self, dirs_scanned: int, files_found: int):
        self.progress.phase = "discovery"
        self.progress.files_discovered = files_found
        self.message = f"Discovering files... ({dirs_scanned} directories, {files_found} files found)"

    def set_processing(self, processed: int, total: int, new: int, updated: int, unchanged: int, current: str | None = None):
        self.progress.phase = "processing"
        self.progress.files_processed = processed
        self.progress.files_total = total
        self.progress.new_tracks = new
        self.progress.updated_tracks = updated
        self.progress.unchanged_tracks = unchanged
        self.progress.current_file = current
        pct = int(processed / total * 100) if total > 0 else 0
        self.message = f"Processing files... {processed}/{total} ({pct}%)"

    def set_cleanup(self, deleted: int):
        self.progress.phase = "cleanup"
        self.progress.deleted_tracks = deleted
        self.message = f"Cleanup: removed {deleted} deleted files"

    def complete(self):
        self.status = "completed"
        self.progress.phase = "complete"
        p = self.progress
        self.message = f"Complete: {p.new_tracks} new, {p.updated_tracks} updated, {p.deleted_tracks} deleted, {p.unchanged_tracks} unchanged"

    def error(self, msg: str):
        self.status = "error"
        self.message = msg
        self.progress.errors.append(msg)

    def add_error(self, msg: str):
        self.progress.errors.append(msg)

    def to_response(self) -> ScanStatus:
        return ScanStatus(
            status=self.status,
            message=self.message,
            progress=self.progress if self.status != "idle" else None,
        )


# Global scan state
scan_state = ScanState()


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
    if scan_state.status == "running":
        return ScanStatus(
            status="already_running",
            message="A scan is already in progress",
            progress=scan_state.progress,
        )

    scan_state.start()

    async def run_scan() -> None:
        try:
            scanner = LibraryScanner(db, scan_state)

            # Scan all configured library paths
            for library_path in settings.music_library_paths:
                if library_path.exists():
                    await scanner.scan(library_path, full_scan=full)

            scan_state.complete()
        except Exception as e:
            scan_state.error(str(e))

    background_tasks.add_task(run_scan)

    return ScanStatus(
        status="started",
        message="Scan started in background",
    )


@router.get("/scan/status", response_model=ScanStatus)
async def get_scan_status() -> ScanStatus:
    """Get current scan status with detailed progress."""
    return scan_state.to_response()


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
