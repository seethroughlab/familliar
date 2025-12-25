from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://familiar:familiar@localhost:5432/familiar"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Music library
    music_library_path: Path = Path("/data/music")

    # Data paths
    art_path: Path = Path("data/art")
    videos_path: Path = Path("data/videos")

    # Analysis
    analysis_version: int = 1

    # API Keys (Phase 3+)
    anthropic_api_key: str | None = None
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    lastfm_api_key: str | None = None

    # Development
    debug: bool = True
    log_level: str = "INFO"

    @property
    def sync_database_url(self) -> str:
        """Synchronous database URL for Alembic or sync operations."""
        return self.database_url.replace("+asyncpg", "")


# Analysis version constant - bump when analysis pipeline changes
ANALYSIS_VERSION = 1

# Supported audio formats
AUDIO_EXTENSIONS = {".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav"}

# Global settings instance
settings = Settings()
