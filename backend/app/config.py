from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://familiar:familiar@localhost:5432/familiar"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Music library (comma-separated paths supported)
    # NOTE: No default - must be configured via admin UI or MUSIC_LIBRARY_PATH env var
    music_library_path: str = ""

    @property
    def music_library_paths(self) -> list[Path]:
        """Get list of music library paths.

        Priority:
        1. AppSettings (settings.json) if configured via admin UI
        2. Environment variable MUSIC_LIBRARY_PATH (comma-separated)
        3. Empty list (user must configure via /admin)

        There is intentionally NO default path - the user must explicitly
        configure their music library location via the admin UI.
        """
        # Check AppSettings first (configured via admin UI)
        from app.services.app_settings import get_app_settings_service

        app_settings = get_app_settings_service().get()
        if app_settings.music_library_paths:
            return [Path(p) for p in app_settings.music_library_paths if p]

        # Fall back to environment variable (for backwards compatibility)
        if self.music_library_path:
            paths = []
            for p in self.music_library_path.split(","):
                p = p.strip()
                if p:
                    paths.append(Path(p))
            if paths:
                return paths

        # No default - user must configure via admin UI
        return []

    # Data paths
    art_path: Path = Path("data/art")
    videos_path: Path = Path("data/videos")
    profiles_path: Path = Path("data/profiles")

    # Analysis
    analysis_version: int = 1

    # API Keys (Phase 3+)
    anthropic_api_key: str | None = None
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    frontend_url: str | None = None  # Base URL for OAuth callbacks (e.g., http://myserver:4400)
    lastfm_api_key: str | None = None
    lastfm_api_secret: str | None = None

    # WebRTC TURN server (optional, for NAT traversal in corporate networks)
    turn_server_url: str | None = None  # e.g. "turn:turn.example.com:3478"
    turn_server_username: str | None = None
    turn_server_credential: str | None = None

    # Development
    debug: bool = False  # Must be explicitly enabled for development
    log_level: str = "INFO"

    @property
    def sync_database_url(self) -> str:
        """Synchronous database URL for Alembic or sync operations."""
        return self.database_url.replace("+asyncpg", "")


# Analysis version constant - bump when analysis pipeline changes
# v1: Placeholder features only
# v2: Real CLAP embeddings + librosa features
ANALYSIS_VERSION = 2

# Supported audio formats
AUDIO_EXTENSIONS = {".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav", ".aiff", ".aif"}

# Global settings instance
settings = Settings()
