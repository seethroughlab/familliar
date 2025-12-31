"""Familiar API - Main FastAPI application."""

import logging
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import (
    bandcamp,
    chat,
    favorites,
    health,
    lastfm,
    library,
    new_releases,
    organizer,
    outputs,
    playlists,
    profiles,
    sessions,
    smart_playlists,
    spotify,
    tracks,
    videos,
)
from app.api.routes import settings as settings_routes
from app.config import settings as app_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger(__name__)


# Request ID middleware for tracing
class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add unique request ID to each request for tracing."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


def create_error_response(
    status_code: int,
    message: str,
    detail: str | None = None,
    request_id: str | None = None,
) -> JSONResponse:
    """Create a consistent error response."""
    content = {
        "error": True,
        "status_code": status_code,
        "message": message,
    }
    if detail:
        content["detail"] = detail
    if request_id:
        content["request_id"] = request_id
    return JSONResponse(status_code=status_code, content=content)


def migrate_env_to_settings() -> None:
    """One-time migration of MUSIC_LIBRARY_PATH env var to AppSettings."""
    from app.services.app_settings import get_app_settings_service

    service = get_app_settings_service()
    app_settings = service.get()

    # If music library paths already configured in settings, skip migration
    if app_settings.music_library_paths:
        return

    # Check for MUSIC_LIBRARY_PATH environment variable
    env_path = app_config.music_library_path
    if env_path and env_path != "/data/music":
        # User has a custom path configured via env var - migrate it
        paths = [p.strip() for p in env_path.split(",") if p.strip()]
        if paths:
            service.update(music_library_paths=paths)
            logging.info(f"Migrated MUSIC_LIBRARY_PATH to settings: {paths}")


def validate_library_paths() -> None:
    """Validate library paths on startup and log warnings for issues."""
    from app.config import AUDIO_EXTENSIONS

    paths = app_config.music_library_paths

    if not paths:
        logging.warning(
            "⚠️  NO MUSIC LIBRARY CONFIGURED. "
            "Go to /admin to set up your music library path."
        )
        return

    all_empty = True
    for path in paths:
        if not path.exists():
            logging.warning(
                f"⚠️  Library path does not exist: {path}. "
                "Check that the volume is mounted correctly in docker-compose.yml"
            )
        elif not path.is_dir():
            logging.warning(f"⚠️  Library path is not a directory: {path}")
        else:
            # Check if directory has any audio files (quick check)
            has_audio = False
            try:
                for ext in AUDIO_EXTENSIONS:
                    if any(path.rglob(f"*{ext}")):
                        has_audio = True
                        all_empty = False
                        break
                if not has_audio:
                    logging.warning(
                        f"⚠️  Library path appears empty (no audio files): {path}. "
                        "This may indicate a volume mount issue - check docker-compose.yml"
                    )
            except PermissionError:
                logging.warning(f"⚠️  Cannot read library path (permission denied): {path}")

    if all_empty and paths:
        logging.error(
            "❌ ALL LIBRARY PATHS ARE EMPTY OR INACCESSIBLE. "
            "Library scan will find no files. Check your docker-compose volume mounts."
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events."""
    # Startup
    print(f"Starting Familiar API (debug={app_config.debug})")

    # Migrate env vars to settings on first run
    migrate_env_to_settings()

    # Validate library paths and log warnings
    validate_library_paths()

    # Start background task manager
    from app.services.background import get_background_manager
    bg = get_background_manager()
    await bg.startup()
    print("Background task manager started")

    yield

    # Shutdown
    print("Shutting down Familiar API")
    await bg.shutdown()
    print("Background task manager stopped")


app = FastAPI(
    title="Familiar",
    description="LLM-powered local music player API",
    version="0.1.0",
    lifespan=lifespan,
)

# Request ID middleware (must be added first to wrap everything)
app.add_middleware(RequestIDMiddleware)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors."""
    request_id = getattr(request.state, "request_id", None)
    errors = exc.errors()
    detail = "; ".join(
        f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}" for e in errors
    )
    logger.warning(f"[{request_id}] Validation error: {detail}")
    return create_error_response(
        status_code=422,
        message="Validation error",
        detail=detail,
        request_id=request_id,
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    """Handle database errors."""
    request_id = getattr(request.state, "request_id", None)
    logger.error(f"[{request_id}] Database error: {exc}", exc_info=True)
    return create_error_response(
        status_code=500,
        message="Database error",
        detail=str(exc) if app_config.debug else None,
        request_id=request_id,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler for unhandled exceptions."""
    request_id = getattr(request.state, "request_id", None)
    logger.error(f"[{request_id}] Unhandled error: {exc}", exc_info=True)
    return create_error_response(
        status_code=500,
        message="Internal server error",
        detail=str(exc) if app_config.debug else None,
        request_id=request_id,
    )

# Include routers
app.include_router(health.router, prefix="/api/v1")
app.include_router(tracks.router, prefix="/api/v1")
app.include_router(library.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(spotify.router, prefix="/api/v1")
app.include_router(videos.router, prefix="/api/v1")
app.include_router(lastfm.router, prefix="/api/v1")
app.include_router(settings_routes.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(smart_playlists.router, prefix="/api/v1")
app.include_router(playlists.router, prefix="/api/v1")
app.include_router(profiles.router, prefix="/api/v1")
app.include_router(favorites.router, prefix="/api/v1")
app.include_router(organizer.router, prefix="/api/v1")
app.include_router(bandcamp.router, prefix="/api/v1")
app.include_router(outputs.router, prefix="/api/v1")
app.include_router(new_releases.router, prefix="/api/v1")


# Serve frontend static files in production
# The static folder is created during Docker build
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
    app.mount("/icons", StaticFiles(directory=STATIC_DIR / "icons"), name="icons")

    # Serve PWA files
    @app.get("/manifest.json")
    async def manifest() -> FileResponse:
        return FileResponse(STATIC_DIR / "manifest.json")

    @app.get("/sw.js")
    async def service_worker() -> FileResponse:
        return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript")

    @app.get("/registerSW.js")
    async def register_sw() -> FileResponse:
        return FileResponse(STATIC_DIR / "registerSW.js", media_type="application/javascript")

    @app.get("/workbox-{path:path}")
    async def workbox(path: str) -> FileResponse:
        return FileResponse(STATIC_DIR / f"workbox-{path}", media_type="application/javascript")

    # Serve index.html for root
    @app.get("/")
    async def serve_root() -> FileResponse:
        """Serve index.html for root path."""
        return FileResponse(STATIC_DIR / "index.html")

    # SPA fallback - serve index.html for all non-API routes
    @app.get("/{full_path:path}", response_model=None)
    async def spa_fallback(full_path: str) -> FileResponse | dict[str, Any]:
        """Serve index.html for SPA routing (catches all non-API routes)."""
        # Don't catch API or docs routes
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json", "health")):
            return {"detail": "Not found"}
        return FileResponse(STATIC_DIR / "index.html")
else:
    # Development mode - just show API info
    @app.get("/")
    async def root() -> dict[str, Any]:
        """Root endpoint with API info."""
        return {
            "name": "Familiar",
            "version": "0.1.0",
            "docs": "/docs",
        }
