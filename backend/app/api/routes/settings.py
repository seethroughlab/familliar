"""App settings endpoints for user-configurable settings."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.app_settings import get_app_settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


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
    llm_provider: str | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None


@router.get("", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    """Get current app settings (secrets are masked)."""
    service = get_app_settings_service()
    masked = service.get_masked()

    # Validate music library paths
    paths = masked.get("music_library_paths", [])
    paths_valid = [Path(p).exists() and Path(p).is_dir() for p in paths]

    return SettingsResponse(
        **masked,
        music_library_paths_valid=paths_valid,
        spotify_configured=service.has_spotify_credentials(),
        lastfm_configured=service.has_lastfm_credentials(),
        music_library_configured=service.has_music_library_configured(),
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(request: SettingsUpdateRequest) -> SettingsResponse:
    """Update app settings."""
    service = get_app_settings_service()

    # Filter out None values (only update provided fields)
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    service.update(**updates)

    masked = service.get_masked()

    # Validate music library paths
    paths = masked.get("music_library_paths", [])
    paths_valid = [Path(p).exists() and Path(p).is_dir() for p in paths]

    return SettingsResponse(
        **masked,
        music_library_paths_valid=paths_valid,
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
