"""App settings endpoints for user-configurable settings."""

from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.app_settings import get_app_settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


class ClapStatus(BaseModel):
    """CLAP embeddings status details."""

    enabled: bool
    reason: str
    ram_gb: float | None
    ram_sufficient: bool
    env_override: bool
    explicit_setting: bool | None


class SettingsResponse(BaseModel):
    """Settings response with masked secrets."""

    # Music Library
    music_library_paths: list[str]
    music_library_paths_valid: list[bool]  # Whether each path exists and is accessible

    # API Credentials
    spotify_client_id: str | None
    spotify_client_secret: str | None
    lastfm_api_key: str | None
    lastfm_api_secret: str | None
    anthropic_api_key: str | None
    acoustid_api_key: str | None

    # LLM Settings
    llm_provider: str
    ollama_url: str
    ollama_model: str

    # Metadata enrichment
    auto_enrich_metadata: bool
    enrich_overwrite_existing: bool

    # Analysis settings
    clap_embeddings_enabled: bool | None  # None = auto-detect
    clap_status: ClapStatus

    # Computed status fields
    spotify_configured: bool
    lastfm_configured: bool
    music_library_configured: bool


class SettingsUpdateRequest(BaseModel):
    """Request to update settings."""

    # Music Library
    music_library_paths: list[str] | None = None

    # API Credentials
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    lastfm_api_key: str | None = None
    lastfm_api_secret: str | None = None
    anthropic_api_key: str | None = None
    acoustid_api_key: str | None = None

    # LLM Settings
    llm_provider: Literal["claude", "ollama"] | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None

    # Metadata enrichment
    auto_enrich_metadata: bool | None = None
    enrich_overwrite_existing: bool | None = None

    # Analysis settings
    clap_embeddings_enabled: bool | None = None


@router.get("", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    """Get current app settings (secrets are masked)."""
    service = get_app_settings_service()
    masked = service.get_masked()

    # Validate music library paths
    paths = masked.get("music_library_paths", [])
    paths_valid = [Path(p).exists() and Path(p).is_dir() for p in paths]

    # Get CLAP status
    clap_status_data = service.get_clap_status()

    return SettingsResponse(
        **masked,
        music_library_paths_valid=paths_valid,
        clap_status=ClapStatus(**clap_status_data),
        spotify_configured=service.has_spotify_credentials(),
        lastfm_configured=service.has_lastfm_credentials(),
        music_library_configured=service.has_music_library_configured(),
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(request: SettingsUpdateRequest) -> SettingsResponse:
    """Update app settings."""
    service = get_app_settings_service()

    # Filter out None values (only update provided fields)
    # Note: clap_embeddings_enabled can be explicitly set to None to reset to auto
    updates = {}
    for k, v in request.model_dump().items():
        if k == "clap_embeddings_enabled":
            # Allow explicit None to reset to auto-detect
            if request.clap_embeddings_enabled is not None or "clap_embeddings_enabled" in request.model_fields_set:
                updates[k] = v
        elif v is not None:
            updates[k] = v

    service.update(**updates)

    masked = service.get_masked()

    # Validate music library paths
    paths = masked.get("music_library_paths", [])
    paths_valid = [Path(p).exists() and Path(p).is_dir() for p in paths]

    # Get CLAP status
    clap_status_data = service.get_clap_status()

    return SettingsResponse(
        **masked,
        music_library_paths_valid=paths_valid,
        clap_status=ClapStatus(**clap_status_data),
        spotify_configured=service.has_spotify_credentials(),
        lastfm_configured=service.has_lastfm_credentials(),
        music_library_configured=service.has_music_library_configured(),
    )


@router.delete("/spotify")
async def clear_spotify_settings() -> dict[str, Any]:
    """Clear Spotify credentials."""
    service = get_app_settings_service()
    service.update(spotify_client_id="", spotify_client_secret="")
    return {"status": "cleared", "message": "Spotify credentials cleared"}


@router.delete("/lastfm")
async def clear_lastfm_settings() -> dict[str, Any]:
    """Clear Last.fm credentials."""
    service = get_app_settings_service()
    service.update(lastfm_api_key="", lastfm_api_secret="")
    return {"status": "cleared", "message": "Last.fm credentials cleared"}


class PathValidationRequest(BaseModel):
    """Request to validate a filesystem path."""

    path: str


class PathValidationResponse(BaseModel):
    """Response with path validation details."""

    path: str
    exists: bool
    is_directory: bool
    audio_file_count: int | None = None
    error: str | None = None


@router.post("/validate-path", response_model=PathValidationResponse)
async def validate_path(request: PathValidationRequest) -> PathValidationResponse:
    """Validate a filesystem path exists and count audio files."""
    from app.config import AUDIO_EXTENSIONS

    path = Path(request.path)

    if not path.exists():
        return PathValidationResponse(
            path=request.path,
            exists=False,
            is_directory=False,
            error="Path does not exist",
        )

    if not path.is_dir():
        return PathValidationResponse(
            path=request.path,
            exists=True,
            is_directory=False,
            error="Path is not a directory",
        )

    # Count audio files
    try:
        audio_count = sum(
            1
            for ext in AUDIO_EXTENSIONS
            for _ in path.rglob(f"*{ext}")
        )
        return PathValidationResponse(
            path=request.path,
            exists=True,
            is_directory=True,
            audio_file_count=audio_count,
        )
    except PermissionError:
        return PathValidationResponse(
            path=request.path,
            exists=True,
            is_directory=True,
            error="Permission denied - cannot read directory contents",
        )


class DirectoryEntry(BaseModel):
    """A directory entry for browsing."""

    name: str
    path: str
    is_readable: bool
    has_audio_hint: bool = False  # Quick check if directory might contain audio


class BrowseDirectoriesResponse(BaseModel):
    """Response with directory listing."""

    current_path: str
    parent_path: str | None
    directories: list[DirectoryEntry]
    error: str | None = None


# Paths that should not be browsable for security
BLOCKED_PATHS = {
    "/proc",
    "/sys",
    "/dev",
    "/etc",
    "/root",
    "/boot",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/usr",
    "/var",
    "/run",
    "/tmp",
}


def _has_audio_files_quick(path: Path, max_check: int = 20) -> bool:
    """Quick check if directory has audio files (checks first N files only)."""
    from app.config import AUDIO_EXTENSIONS

    try:
        count = 0
        for item in path.iterdir():
            if count >= max_check:
                break
            if item.is_file() and item.suffix.lower() in AUDIO_EXTENSIONS:
                return True
            count += 1
        return False
    except (PermissionError, OSError):
        return False


@router.get("/browse-directories", response_model=BrowseDirectoriesResponse)
async def browse_directories(path: str = "/") -> BrowseDirectoriesResponse:
    """Browse directories inside the container for library path selection.

    This endpoint allows admins to navigate the filesystem to find their
    music library folder. Sensitive system paths are blocked for security.
    """
    # Normalize path
    browse_path = Path(path).resolve()

    # Security: Block sensitive paths
    path_str = str(browse_path)
    for blocked in BLOCKED_PATHS:
        if path_str == blocked or path_str.startswith(blocked + "/"):
            return BrowseDirectoriesResponse(
                current_path=path_str,
                parent_path=str(browse_path.parent) if browse_path.parent != browse_path else None,
                directories=[],
                error="Access to this path is not allowed",
            )

    # Check if path exists
    if not browse_path.exists():
        return BrowseDirectoriesResponse(
            current_path=path_str,
            parent_path=str(browse_path.parent) if browse_path.parent != browse_path else None,
            directories=[],
            error="Path does not exist",
        )

    if not browse_path.is_dir():
        return BrowseDirectoriesResponse(
            current_path=path_str,
            parent_path=str(browse_path.parent),
            directories=[],
            error="Path is not a directory",
        )

    # List directories
    directories: list[DirectoryEntry] = []
    try:
        for item in sorted(browse_path.iterdir(), key=lambda x: x.name.lower()):
            # Skip hidden files/directories
            if item.name.startswith("."):
                continue

            # Only list directories
            if not item.is_dir():
                continue

            # Check if readable
            is_readable = True
            try:
                list(item.iterdir())
            except (PermissionError, OSError):
                is_readable = False

            # Quick check for audio files
            has_audio = _has_audio_files_quick(item) if is_readable else False

            directories.append(
                DirectoryEntry(
                    name=item.name,
                    path=str(item),
                    is_readable=is_readable,
                    has_audio_hint=has_audio,
                )
            )
    except PermissionError:
        return BrowseDirectoriesResponse(
            current_path=path_str,
            parent_path=str(browse_path.parent) if browse_path.parent != browse_path else None,
            directories=[],
            error="Permission denied - cannot read directory",
        )

    # Calculate parent path (None if at root)
    parent_path = str(browse_path.parent) if browse_path.parent != browse_path else None

    return BrowseDirectoriesResponse(
        current_path=path_str,
        parent_path=parent_path,
        directories=directories,
    )
