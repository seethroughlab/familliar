"""Plugin management endpoints for installing and managing visualizers and browsers."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.deps import DbSession
from app.db.models import PluginType
from app.services.plugins import get_plugin_service

router = APIRouter(prefix="/plugins", tags=["plugins"])


class PluginAuthor(BaseModel):
    """Plugin author information."""

    name: str | None
    url: str | None


class PluginResponse(BaseModel):
    """Response model for a plugin."""

    id: str
    plugin_id: str
    name: str
    version: str
    type: str
    description: str | None
    author: PluginAuthor | None
    repository_url: str
    enabled: bool
    load_error: str | None
    api_version: int
    icon: str | None
    preview: str | None

    class Config:
        from_attributes = True


class PluginListResponse(BaseModel):
    """Response model for list of plugins."""

    plugins: list[PluginResponse]
    total: int


class InstallPluginRequest(BaseModel):
    """Request to install a plugin from a GitHub URL."""

    url: str


class InstallPluginResponse(BaseModel):
    """Response from plugin installation."""

    success: bool
    plugin_id: str | None
    error: str | None


class UpdatePluginRequest(BaseModel):
    """Request to update plugin settings."""

    enabled: bool | None = None


class UpdateCheckResponse(BaseModel):
    """Response from checking for plugin updates."""

    has_update: bool
    current_version: str
    latest_version: str | None
    error: str | None


class ReportLoadErrorRequest(BaseModel):
    """Request to report a plugin load error."""

    error: str


def plugin_to_response(plugin) -> PluginResponse:
    """Convert a Plugin model to a response."""
    manifest = plugin.manifest or {}
    return PluginResponse(
        id=str(plugin.id),
        plugin_id=plugin.plugin_id,
        name=plugin.name,
        version=plugin.version,
        type=plugin.plugin_type.value,
        description=plugin.description,
        author=PluginAuthor(name=plugin.author_name, url=plugin.author_url)
        if plugin.author_name or plugin.author_url
        else None,
        repository_url=plugin.repository_url,
        enabled=plugin.enabled,
        load_error=plugin.load_error,
        api_version=plugin.api_version,
        icon=manifest.get("icon"),
        preview=manifest.get("preview"),
    )


@router.get("", response_model=PluginListResponse)
async def list_plugins(
    db: DbSession,
    type: Literal["visualizer", "browser"] | None = None,
    enabled_only: bool = False,
) -> PluginListResponse:
    """List all installed plugins.

    Args:
        type: Filter by plugin type (visualizer or browser)
        enabled_only: Only return enabled plugins
    """
    service = get_plugin_service()

    plugin_type = PluginType(type) if type else None
    plugins = await service.list_plugins(db, plugin_type, enabled_only)

    return PluginListResponse(
        plugins=[plugin_to_response(p) for p in plugins],
        total=len(plugins),
    )


@router.get("/{plugin_id}", response_model=PluginResponse)
async def get_plugin(
    db: DbSession,
    plugin_id: str,
) -> PluginResponse:
    """Get a specific plugin by ID."""
    service = get_plugin_service()
    plugin = await service.get_plugin(db, plugin_id)

    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    return plugin_to_response(plugin)


@router.post("/install", response_model=InstallPluginResponse)
async def install_plugin(
    db: DbSession,
    request: InstallPluginRequest,
) -> InstallPluginResponse:
    """Install a plugin from a GitHub URL.

    Supported URL formats:
    - https://github.com/user/repo
    - https://github.com/user/repo/tree/branch
    - https://github.com/user/repo/releases/tag/v1.0.0
    """
    service = get_plugin_service()
    result = await service.install(db, request.url)

    return InstallPluginResponse(
        success=result.success,
        plugin_id=result.plugin_id,
        error=result.error,
    )


@router.patch("/{plugin_id}", response_model=PluginResponse)
async def update_plugin_settings(
    db: DbSession,
    plugin_id: str,
    request: UpdatePluginRequest,
) -> PluginResponse:
    """Update plugin settings (enable/disable)."""
    service = get_plugin_service()

    if request.enabled is not None:
        success = await service.set_enabled(db, plugin_id, request.enabled)
        if not success:
            raise HTTPException(status_code=404, detail="Plugin not found")

    plugin = await service.get_plugin(db, plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    return plugin_to_response(plugin)


@router.delete("/{plugin_id}")
async def uninstall_plugin(
    db: DbSession,
    plugin_id: str,
) -> dict:
    """Uninstall a plugin."""
    service = get_plugin_service()
    success = await service.uninstall(db, plugin_id)

    if not success:
        raise HTTPException(status_code=404, detail="Plugin not found")

    return {"success": True}


@router.get("/{plugin_id}/bundle")
async def get_plugin_bundle(
    db: DbSession,
    plugin_id: str,
) -> Response:
    """Get the JavaScript bundle for a plugin.

    Returns the pre-built IIFE bundle that the frontend will execute
    to register the plugin with the visualizer or browser registry.
    """
    service = get_plugin_service()

    # Verify plugin exists and is enabled
    plugin = await service.get_plugin(db, plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    if not plugin.enabled:
        raise HTTPException(status_code=403, detail="Plugin is disabled")

    # Get bundle path
    bundle_path = service.get_bundle_path(plugin_id)
    if not bundle_path:
        raise HTTPException(status_code=404, detail="Plugin bundle not found")

    # Read and return bundle
    bundle_content = bundle_path.read_bytes()

    return Response(
        content=bundle_content,
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            "X-Plugin-Version": plugin.version,
        },
    )


@router.post("/{plugin_id}/check-update", response_model=UpdateCheckResponse)
async def check_plugin_update(
    db: DbSession,
    plugin_id: str,
) -> UpdateCheckResponse:
    """Check if a newer version of the plugin is available."""
    service = get_plugin_service()
    result = await service.check_for_update(db, plugin_id)

    return UpdateCheckResponse(
        has_update=result.has_update,
        current_version=result.current_version,
        latest_version=result.latest_version,
        error=result.error,
    )


@router.post("/{plugin_id}/update", response_model=InstallPluginResponse)
async def update_plugin(
    db: DbSession,
    plugin_id: str,
) -> InstallPluginResponse:
    """Update a plugin to the latest version from GitHub."""
    service = get_plugin_service()
    result = await service.update_plugin(db, plugin_id)

    return InstallPluginResponse(
        success=result.success,
        plugin_id=result.plugin_id,
        error=result.error,
    )


@router.post("/{plugin_id}/report-error")
async def report_load_error(
    db: DbSession,
    plugin_id: str,
    request: ReportLoadErrorRequest,
) -> dict:
    """Report a plugin load error from the frontend.

    Called when the frontend fails to load or execute a plugin bundle.
    """
    service = get_plugin_service()
    success = await service.report_load_error(db, plugin_id, request.error)

    if not success:
        raise HTTPException(status_code=404, detail="Plugin not found")

    return {"success": True}


# MIME type mapping for common asset types
MIME_TYPES = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".json": "application/json",
    ".js": "application/javascript",
    ".css": "text/css",
}


@router.get("/{plugin_id}/assets/{asset_path:path}")
async def get_plugin_asset(
    db: DbSession,
    plugin_id: str,
    asset_path: str,
) -> Response:
    """Serve a static asset from a plugin's public/ folder.

    This endpoint allows plugins to include static assets like 3D models,
    images, or other files that are served alongside the plugin bundle.

    Args:
        plugin_id: The plugin identifier
        asset_path: Path to the asset within the plugin's public/ folder
    """
    service = get_plugin_service()

    # Verify plugin exists
    plugin = await service.get_plugin(db, plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    # Get asset path (handles security checks)
    file_path = service.get_asset_path(plugin_id, asset_path)
    if not file_path:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Determine MIME type
    suffix = file_path.suffix.lower()
    content_type = MIME_TYPES.get(suffix, "application/octet-stream")

    # Read and return file
    content = file_path.read_bytes()

    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",  # Cache for 1 day
        },
    )
