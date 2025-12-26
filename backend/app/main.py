"""Familiar API - Main FastAPI application."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings as app_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
from app.api.routes import health, tracks, library, chat, spotify, videos, lastfm, settings as settings_routes, sessions, smart_playlists


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


@app.get("/")
async def root() -> dict:
    """Root endpoint with API info."""
    return {
        "name": "Familiar",
        "version": "0.1.0",
        "docs": "/docs",
    }
