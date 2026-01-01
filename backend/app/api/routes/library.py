"""Library management endpoints."""

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.config import settings
from app.db.models import AlbumType, Track, TrackStatus
from app.services.import_service import ImportService, MusicImportError, save_upload_to_temp
from app.services.scanner import LibraryScanner
from app.services.tasks import get_scan_progress

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

    phase: str = "idle"  # "discovery", "processing", "cleanup", "complete"
    files_discovered: int = 0
    files_processed: int = 0
    files_total: int = 0
    new_tracks: int = 0
    updated_tracks: int = 0
    relocated_tracks: int = 0
    unchanged_tracks: int = 0
    marked_missing: int = 0      # Newly marked as missing this scan
    still_missing: int = 0       # Already missing, still not found
    recovered: int = 0           # Previously missing, now found
    deleted_tracks: int = 0      # Legacy field, always 0 now
    current_file: str | None = None
    started_at: str | None = None
    last_heartbeat: str | None = None  # For stuck detection
    errors: list[str] = []
    warnings: list[str] = []


class ScanStatus(BaseModel):
    """Scan status response."""

    status: str  # "idle", "running", "completed", "error", "queued"
    message: str
    progress: ScanProgress | None = None
    warnings: list[str] = []
    queue_position: int | None = None  # Position in queue if waiting


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
    reread_unchanged: bool = False,
    reanalyze_changed: bool = True,
    # Legacy parameter for backwards compatibility
    full: bool | None = None,
) -> ScanStatus:
    """Start a library scan.

    The scan runs in the background, so this returns immediately.
    Progress is stored in Redis and can be retrieved via GET /scan/status.

    Scans and analysis cannot run simultaneously - they share resources.

    Args:
        reread_unchanged: Re-read metadata for files even if unchanged. Default False.
        reanalyze_changed: Queue changed files for audio analysis. Default True.
        full: Deprecated. Use reread_unchanged instead.
    """
    from app.services.background import get_background_manager

    # Handle legacy 'full' parameter
    if full is not None:
        reread_unchanged = full

    bg = get_background_manager()

    # Check if analysis is running - can't run both simultaneously
    if bg.is_analysis_running():
        raise HTTPException(
            status_code=409,
            detail="Cannot start scan while analysis is running. Cancel analysis first or wait for it to complete.",
        )

    # Check if a scan is already running
    if bg.is_scan_running():
        progress = get_scan_progress()
        if progress:
            return ScanStatus(
                status="already_running",
                message="A scan is already in progress",
                progress=ScanProgress(**{k: progress.get(k, v) for k, v in ScanProgress().model_dump().items()}),
            )
        return ScanStatus(
            status="already_running",
            message="A scan is already in progress",
        )

    # Start scan in background
    await bg.run_scan(
        reread_unchanged=reread_unchanged,
        reanalyze_changed=reanalyze_changed,
    )

    return ScanStatus(
        status="started",
        message="Scan started",
    )


class CancelResponse(BaseModel):
    """Response for cancel operations."""

    status: str
    message: str


@router.post("/scan/cancel", response_model=CancelResponse)
async def cancel_scan() -> CancelResponse:
    """Cancel a running or stuck library scan.

    Clears the scan progress from Redis and releases the lock.
    Use this when a scan appears stuck.
    """
    from app.services.background import get_background_manager
    from app.services.tasks import clear_scan_progress

    bg = get_background_manager()

    # Release the lock and clear progress
    bg._release_scan_lock()
    clear_scan_progress()

    return CancelResponse(
        status="cancelled",
        message="Scan cancelled and state cleared",
    )


@router.post("/analysis/cancel", response_model=CancelResponse)
async def cancel_analysis() -> CancelResponse:
    """Cancel running analysis tasks.

    Clears analysis task tracking. Note that in-progress subprocess tasks
    may continue to completion, but no new tasks will be started.
    """
    from app.services.background import get_background_manager

    bg = get_background_manager()

    # Cancel all running analysis tasks
    cancelled = 0
    for task_id, task in list(bg._analysis_tasks.items()):
        if not task.done():
            task.cancel()
            cancelled += 1
        bg._analysis_tasks.pop(task_id, None)

    return CancelResponse(
        status="cancelled",
        message=f"Cancelled {cancelled} analysis tasks",
    )


@router.get("/scan/status", response_model=ScanStatus)
async def get_scan_status() -> ScanStatus:
    """Get current scan status with detailed progress from Redis."""
    from datetime import datetime, timedelta

    from app.services.tasks import clear_scan_progress

    progress = get_scan_progress()

    if not progress:
        return ScanStatus(
            status="idle",
            message="No scan running",
            progress=None,
        )

    # Check if the scan is stale (no heartbeat for 5 minutes - network volumes can be slow)
    status = progress.get("status", "idle")
    if status == "running":
        last_heartbeat = progress.get("last_heartbeat")
        if last_heartbeat:
            try:
                heartbeat_time = datetime.fromisoformat(last_heartbeat)
                if datetime.now() - heartbeat_time > timedelta(minutes=5):
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
        unchanged_tracks=progress.get("unchanged_tracks", 0),
        marked_missing=progress.get("marked_missing", 0),
        still_missing=progress.get("still_missing", 0),
        recovered=progress.get("recovered", 0),
        deleted_tracks=progress.get("deleted_tracks", 0),  # Legacy, always 0
        current_file=progress.get("current_file"),
        started_at=progress.get("started_at"),
        last_heartbeat=progress.get("last_heartbeat"),  # For stuck detection
        errors=progress.get("errors", []),
        warnings=progress.get("warnings", []),
    )

    return ScanStatus(
        status=status,
        message=progress.get("message", ""),
        progress=scan_progress if status != "idle" else None,
        warnings=progress.get("warnings", []),
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

    except MusicImportError as e:
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


# ============================================================================
# Enhanced Import with Preview
# ============================================================================


class ImportTrackPreview(BaseModel):
    """Preview info for a single track."""
    filename: str
    relative_path: str
    detected_artist: str | None
    detected_album: str | None
    detected_title: str | None
    detected_track_num: int | None
    detected_year: int | None = None
    format: str
    duration_seconds: float | None
    file_size_bytes: int
    sample_rate: int | None = None
    bit_depth: int | None = None


class ImportPreviewResponse(BaseModel):
    """Response from import preview endpoint."""
    session_id: str
    tracks: list[ImportTrackPreview]
    total_size_bytes: int
    estimated_sizes: dict[str, int]
    has_convertible_formats: bool


class ImportTrackInput(BaseModel):
    """User-edited track metadata for import."""
    filename: str | None = None
    relative_path: str | None = None
    artist: str | None = None
    album: str | None = None
    title: str | None = None
    track_num: int | None = None
    year: int | None = None
    # Pass through detected values if not edited
    detected_artist: str | None = None
    detected_album: str | None = None
    detected_title: str | None = None
    detected_track_num: int | None = None
    detected_year: int | None = None


class ImportOptions(BaseModel):
    """Import execution options."""
    format: str = "original"  # "original", "flac", "mp3"
    mp3_quality: int = 320  # 128, 192, 320
    organization: str = "imports"  # "organized" or "imports"
    duplicate_handling: str = "rename"  # "skip", "replace", "rename"
    queue_analysis: bool = True


class ImportExecuteRequest(BaseModel):
    """Request body for import execution."""
    session_id: str
    tracks: list[ImportTrackInput]
    options: ImportOptions


class ImportExecuteResponse(BaseModel):
    """Response from import execute endpoint."""
    status: str
    imported_count: int
    imported_files: list[str]
    errors: list[str]
    base_path: str
    queue_analysis: bool


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def import_preview(
    file: UploadFile = File(...),
) -> ImportPreviewResponse:
    """Preview an import - extract and scan files without importing.

    Uploads file to temp location, extracts if zip, scans metadata,
    and returns preview with session_id for later execution.

    Session expires after 24 hours if not executed.
    """
    from app.services.import_service import (
        ImportPreviewService,
        MusicImportError,
        save_upload_to_temp,
    )

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

    try:
        preview_service = ImportPreviewService()
        result = preview_service.create_preview_session(temp_path, file.filename)

        return ImportPreviewResponse(
            session_id=result["session_id"],
            tracks=[ImportTrackPreview(**t) for t in result["tracks"]],
            total_size_bytes=result["total_size_bytes"],
            estimated_sizes=result["estimated_sizes"],
            has_convertible_formats=result["has_convertible_formats"],
        )

    except MusicImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview failed: {e}")
    finally:
        # Clean up temp file (session has its own copy)
        temp_path.unlink(missing_ok=True)


@router.post("/import/execute", response_model=ImportExecuteResponse)
async def import_execute(
    db: DbSession,
    background_tasks: BackgroundTasks,
    request: ImportExecuteRequest,
) -> ImportExecuteResponse:
    """Execute an import with user-specified options.

    Uses session_id from preview to access uploaded files.
    Applies user-edited metadata and conversion options.
    """
    from app.services.import_service import ImportExecuteService, MusicImportError

    try:
        execute_service = ImportExecuteService()
        result = execute_service.execute_import(
            session_id=request.session_id,
            tracks=[t.model_dump() for t in request.tracks],
            options=request.options.model_dump(),
        )

        # Schedule scan of imported files if requested
        # Use specific scan_paths to avoid scanning entire library
        scan_paths = result.get("scan_paths", [])
        if result["queue_analysis"] and scan_paths and settings.music_library_paths:
            from pathlib import Path

            from app.services.scanner import LibraryScanner

            library_root = Path(settings.music_library_paths[0])

            async def scan_import():
                scanner = LibraryScanner(db)
                for rel_path in scan_paths:
                    scan_dir = library_root / rel_path
                    if scan_dir.exists():
                        await scanner.scan(scan_dir, full_scan=True)

            background_tasks.add_task(scan_import)

        return ImportExecuteResponse(**result)

    except MusicImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {e}")


class AnalysisStatus(BaseModel):
    """Analysis status response."""

    status: str  # "idle", "running", "stuck", "error"
    total: int = 0
    analyzed: int = 0
    pending: int = 0
    failed: int = 0
    percent: float = 0.0
    current_file: str | None = None
    error: str | None = None
    heartbeat: str | None = None


@router.get("/analysis/status", response_model=AnalysisStatus)
async def get_analysis_status(db: DbSession) -> AnalysisStatus:
    """Get current audio analysis status with stuck detection.

    Returns analysis progress and detects if the worker has stalled.
    """
    from datetime import datetime, timedelta

    from sqlalchemy import or_

    from app.config import ANALYSIS_VERSION

    # Get counts from database
    total = await db.scalar(select(func.count(Track.id))) or 0
    analyzed = await db.scalar(
        select(func.count(Track.id)).where(Track.analysis_version >= ANALYSIS_VERSION)
    ) or 0
    failed = await db.scalar(
        select(func.count(Track.id)).where(Track.analysis_failed_at.isnot(None))
    ) or 0

    # Pending = not analyzed and not recently failed
    failure_cutoff = datetime.utcnow() - timedelta(hours=24)
    pending = await db.scalar(
        select(func.count(Track.id)).where(
            Track.analysis_version < ANALYSIS_VERSION,
            or_(
                Track.analysis_failed_at.is_(None),
                Track.analysis_failed_at < failure_cutoff,
            ),
        )
    ) or 0

    percent = (analyzed / total * 100) if total > 0 else 100.0

    # Check if background analysis tasks are running
    from app.services.background import get_background_manager

    bg = get_background_manager()
    active_tasks = bg.get_analysis_task_count()

    if active_tasks > 0:
        return AnalysisStatus(
            status="running",
            total=total,
            analyzed=analyzed,
            pending=pending,
            failed=failed,
            percent=round(percent, 1),
            current_file=f"Processing {active_tasks} tracks...",
        )

    # No active analysis tasks - check if there's pending work
    if pending > 0:
        return AnalysisStatus(
            status="idle",
            total=total,
            analyzed=analyzed,
            pending=pending,
            failed=failed,
            percent=round(percent, 1),
        )

    return AnalysisStatus(
        status="complete",
        total=total,
        analyzed=analyzed,
        pending=0,
        failed=failed,
        percent=100.0,
    )


class AnalysisStartResponse(BaseModel):
    """Response for starting analysis."""

    status: str
    queued: int = 0
    message: str


@router.post("/analysis/start", response_model=AnalysisStartResponse)
async def start_analysis(limit: int = 500) -> AnalysisStartResponse:
    """Manually trigger analysis for unanalyzed tracks.

    This queues tracks for analysis in the background. Use GET /analysis/status
    to monitor progress.

    Scans and analysis cannot run simultaneously - they share resources.
    """
    from app.services.background import get_background_manager
    from app.services.tasks import queue_unanalyzed_tracks

    bg = get_background_manager()

    # Check if scan is running - can't run both simultaneously
    if bg.is_scan_running():
        raise HTTPException(
            status_code=409,
            detail="Cannot start analysis while a scan is running. Cancel scan first or wait for it to complete.",
        )

    try:
        queued = await queue_unanalyzed_tracks(limit=limit)
        if queued == 0:
            return AnalysisStartResponse(
                status="complete",
                queued=0,
                message="All tracks are already analyzed",
            )
        return AnalysisStartResponse(
            status="started",
            queued=queued,
            message=f"Queued {queued} tracks for analysis",
        )
    except Exception as e:
        return AnalysisStartResponse(
            status="error",
            queued=0,
            message=f"Failed to start analysis: {e}",
        )


# ============================================================================
# Missing Tracks API
# ============================================================================


class MissingTrack(BaseModel):
    """Missing track info for user review."""

    id: str
    title: str | None
    artist: str | None
    album: str | None
    file_path: str
    status: str  # "missing" or "pending_deletion"
    missing_since: str | None
    days_missing: int


class MissingTracksResponse(BaseModel):
    """List of missing tracks."""

    tracks: list[MissingTrack]
    total_missing: int
    total_pending_deletion: int


class RelocateRequest(BaseModel):
    """Request to search a folder for missing files."""

    search_path: str


class RelocateResult(BaseModel):
    """Result of batch relocation."""

    found: int
    not_found: int
    relocated_tracks: list[dict]


class LocateRequest(BaseModel):
    """Request to manually set new path for a track."""

    new_path: str


class BatchDeleteRequest(BaseModel):
    """Request to delete multiple tracks."""

    track_ids: list[str]


@router.get("/missing", response_model=MissingTracksResponse)
async def get_missing_tracks(db: DbSession) -> MissingTracksResponse:
    """Get all tracks with MISSING or PENDING_DELETION status."""
    from datetime import datetime

    result = await db.execute(
        select(Track).where(
            Track.status.in_([TrackStatus.MISSING, TrackStatus.PENDING_DELETION])
        ).order_by(Track.missing_since.desc())
    )
    tracks = result.scalars().all()

    now = datetime.now()
    missing_tracks = []
    total_missing = 0
    total_pending = 0

    for track in tracks:
        days_missing = 0
        if track.missing_since:
            days_missing = (now - track.missing_since).days

        if track.status == TrackStatus.MISSING:
            total_missing += 1
        else:
            total_pending += 1

        missing_tracks.append(
            MissingTrack(
                id=str(track.id),
                title=track.title,
                artist=track.artist,
                album=track.album,
                file_path=track.file_path,
                status=track.status.value,
                missing_since=track.missing_since.isoformat() if track.missing_since else None,
                days_missing=days_missing,
            )
        )

    return MissingTracksResponse(
        tracks=missing_tracks,
        total_missing=total_missing,
        total_pending_deletion=total_pending,
    )


@router.post("/missing/relocate", response_model=RelocateResult)
async def relocate_missing_tracks(
    db: DbSession,
    request: RelocateRequest,
) -> RelocateResult:
    """Search a folder for missing files and relocate them.

    Scans the provided path for audio files and matches them against
    missing tracks by filename. Successfully matched tracks are updated
    with the new path and marked as ACTIVE.
    """
    import os

    from app.config import AUDIO_EXTENSIONS

    search_path = Path(request.search_path)
    if not search_path.exists() or not search_path.is_dir():
        raise HTTPException(status_code=400, detail="Search path does not exist or is not a directory")

    # Get all missing tracks
    result = await db.execute(
        select(Track).where(
            Track.status.in_([TrackStatus.MISSING, TrackStatus.PENDING_DELETION])
        )
    )
    missing_tracks = {Path(t.file_path).name.lower(): t for t in result.scalars().all()}

    if not missing_tracks:
        return RelocateResult(found=0, not_found=0, relocated_tracks=[])

    # Build map of filenames in search path
    audio_ext_lower = {ext.lower() for ext in AUDIO_EXTENSIONS}
    found_files: dict[str, Path] = {}

    for root, _, filenames in os.walk(search_path):
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext in audio_ext_lower:
                key = filename.lower()
                if key not in found_files:  # First occurrence wins
                    found_files[key] = Path(root) / filename

    # Match and relocate
    relocated = []
    for filename, track in missing_tracks.items():
        if filename in found_files:
            new_path = found_files[filename]
            track.file_path = str(new_path)
            track.status = TrackStatus.ACTIVE
            track.missing_since = None
            relocated.append({
                "id": str(track.id),
                "title": track.title,
                "old_path": track.file_path,
                "new_path": str(new_path),
            })

    await db.commit()

    return RelocateResult(
        found=len(relocated),
        not_found=len(missing_tracks) - len(relocated),
        relocated_tracks=relocated,
    )


@router.post("/missing/{track_id}/locate")
async def locate_single_track(
    db: DbSession,
    track_id: str,
    request: LocateRequest,
) -> dict:
    """Manually set a new path for a missing track.

    Use this when you know exactly where the file has moved to.
    """
    from uuid import UUID

    new_path = Path(request.new_path)
    if not new_path.exists():
        raise HTTPException(status_code=400, detail="File does not exist at specified path")
    if not new_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    try:
        track_uuid = UUID(track_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")

    track = await db.get(Track, track_uuid)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if track.status not in (TrackStatus.MISSING, TrackStatus.PENDING_DELETION):
        raise HTTPException(status_code=400, detail="Track is not missing")

    old_path = track.file_path
    track.file_path = str(new_path)
    track.status = TrackStatus.ACTIVE
    track.missing_since = None

    await db.commit()

    return {
        "status": "relocated",
        "track_id": track_id,
        "old_path": old_path,
        "new_path": str(new_path),
    }


@router.delete("/missing/{track_id}")
async def delete_missing_track(
    db: DbSession,
    track_id: str,
) -> dict:
    """Permanently delete a missing track from the database.

    This is irreversible - the track and all its analysis data will be removed.
    """
    from uuid import UUID

    try:
        track_uuid = UUID(track_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")

    track = await db.get(Track, track_uuid)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if track.status not in (TrackStatus.MISSING, TrackStatus.PENDING_DELETION):
        raise HTTPException(status_code=400, detail="Track is not missing - cannot delete active tracks")

    title = track.title or Path(track.file_path).name
    await db.delete(track)
    await db.commit()

    return {
        "status": "deleted",
        "track_id": track_id,
        "title": title,
    }


@router.delete("/missing/batch")
async def delete_missing_tracks_batch(
    db: DbSession,
    request: BatchDeleteRequest,
) -> dict:
    """Permanently delete multiple missing tracks from the database.

    This is irreversible - the tracks and all their analysis data will be removed.
    Only tracks with MISSING or PENDING_DELETION status can be deleted.
    """
    from uuid import UUID

    deleted = 0
    errors = []

    for track_id in request.track_ids:
        try:
            track_uuid = UUID(track_id)
            track = await db.get(Track, track_uuid)

            if not track:
                errors.append(f"{track_id}: not found")
                continue

            if track.status not in (TrackStatus.MISSING, TrackStatus.PENDING_DELETION):
                errors.append(f"{track_id}: not missing")
                continue

            await db.delete(track)
            deleted += 1

        except ValueError:
            errors.append(f"{track_id}: invalid ID")

    await db.commit()

    return {
        "status": "completed",
        "deleted": deleted,
        "errors": errors,
    }
