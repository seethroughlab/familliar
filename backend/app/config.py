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

    # Music library (comma-separated paths supported)
    music_library_path: str = "/data/music"

    @property
    def music_library_paths(self) -> list[Path]:
        """Get list of music library paths (supports comma-separated values)."""
        paths = []
        for p in self.music_library_path.split(","):
            p = p.strip()
            if p:
                paths.append(Path(p))
        return paths

    # Data paths
    art_path: Path = Path("data/art")
    videos_path: Path = Path("data/videos")

    # Analysis
    analysis_version: int = 1

    # API Keys (Phase 3+)
    anthropic_api_key: str | None = None
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    spotify_redirect_uri: str = "http://127.0.0.1:4400/api/v1/spotify/callback"
    lastfm_api_key: str | None = None
    lastfm_api_secret: str | None = None

    # WebRTC TURN server (optional, for NAT traversal in corporate networks)
    turn_server_url: str | None = None  # e.g. "turn:turn.example.com:3478"
    turn_server_username: str | None = None
    turn_server_credential: str | None = None

    # Development
    debug: bool = True
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
AUDIO_EXTENSIONS = {".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav"}

# Global settings instance
settings = Settings()
