"""Familiar API - Main FastAPI application."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings as app_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
from app.api.routes import health, tracks, library, chat, spotify, videos, lastfm, settings as settings_routes, sessions, smart_playlists, profiles, organizer


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events."""
    # Startup
    print(f"Starting Familiar API (debug={app_config.debug})")
    yield
    # Shutdown
    print("Shutting down Familiar API")


app = FastAPI(
    title="Familiar",
    description="LLM-powered local music player API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(tracks.router, prefix="/api/v1")
app.include_router(library.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(spotify.router, prefix="/api/v1")
app.include_router(videos.router, prefix="/api/v1")
app.include_router(lastfm.router, prefix="/api/v1")
app.include_router(settings_routes.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(smart_playlists.router, prefix="/api/v1")
app.include_router(profiles.router, prefix="/api/v1")
app.include_router(organizer.router, prefix="/api/v1")


@app.get("/")
async def root() -> dict:
    """Root endpoint with API info."""
    return {
        "name": "Familiar",
        "version": "0.1.0",
        "docs": "/docs",
    }


# Serve frontend static files in production
# The static folder is created during Docker build
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
    app.mount("/icons", StaticFiles(directory=STATIC_DIR / "icons"), name="icons")

    # Serve PWA files
    @app.get("/manifest.json")
    async def manifest():
        return FileResponse(STATIC_DIR / "manifest.json")

    @app.get("/sw.js")
    async def service_worker():
        return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript")

    @app.get("/registerSW.js")
    async def register_sw():
        return FileResponse(STATIC_DIR / "registerSW.js", media_type="application/javascript")

    @app.get("/workbox-{path:path}")
    async def workbox(path: str):
        return FileResponse(STATIC_DIR / f"workbox-{path}", media_type="application/javascript")

    # SPA fallback - serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        """Serve index.html for SPA routing (catches all non-API routes)."""
        # Don't catch API or docs routes
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json", "health")):
            return {"detail": "Not found"}
        return FileResponse(STATIC_DIR / "index.html")
