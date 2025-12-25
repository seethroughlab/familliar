"""App settings endpoints for user-configurable settings."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.app_settings import get_app_settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    """Settings response with masked secrets."""

    spotify_client_id: str | None
    spotify_client_secret: str | None
    lastfm_api_key: str | None
    lastfm_api_secret: str | None
    anthropic_api_key: str | None

    # Computed status fields
    spotify_configured: bool
    lastfm_configured: bool


class SettingsUpdateRequest(BaseModel):
    """Request to update settings."""

    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    lastfm_api_key: str | None = None
    lastfm_api_secret: str | None = None
    anthropic_api_key: str | None = None


@router.get("", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    """Get current app settings (secrets are masked)."""
    service = get_app_settings_service()
    masked = service.get_masked()

    return SettingsResponse(
        **masked,
        spotify_configured=service.has_spotify_credentials(),
        lastfm_configured=service.has_lastfm_credentials(),
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(request: SettingsUpdateRequest) -> SettingsResponse:
    """Update app settings."""
    service = get_app_settings_service()

    # Filter out None values (only update provided fields)
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    service.update(**updates)

    masked = service.get_masked()
    return SettingsResponse(
        **masked,
        spotify_configured=service.has_spotify_credentials(),
        lastfm_configured=service.has_lastfm_credentials(),
    )


@router.delete("/spotify")
async def clear_spotify_settings() -> dict:
    """Clear Spotify credentials."""
    service = get_app_settings_service()
    service.update(spotify_client_id="", spotify_client_secret="")
    return {"status": "cleared", "message": "Spotify credentials cleared"}


@router.delete("/lastfm")
async def clear_lastfm_settings() -> dict:
    """Clear Last.fm credentials."""
    service = get_app_settings_service()
    service.update(lastfm_api_key="", lastfm_api_secret="")
    return {"status": "cleared", "message": "Last.fm credentials cleared"}
