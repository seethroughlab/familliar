"""App settings service for user-configurable settings stored in a JSON file."""

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel


class AppSettings(BaseModel):
    """User-configurable app settings."""

    # Music Library
    music_library_paths: list[str] = []  # List of paths to music libraries

    # Spotify
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None

    # Last.fm
    lastfm_api_key: str | None = None
    lastfm_api_secret: str | None = None

    # LLM Settings
    anthropic_api_key: str | None = None
    llm_provider: str = "claude"  # "claude" or "ollama"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"  # Default model with tool support

    # Audio fingerprinting
    acoustid_api_key: str | None = None  # Get free key at https://acoustid.org/new-application


class AppSettingsService:
    """Service for managing user-configurable app settings."""

    def __init__(self, settings_path: Path | None = None):
        self.settings_path = settings_path or Path("data/settings.json")
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        self._settings: AppSettings | None = None

    def _load(self) -> AppSettings:
        """Load settings from file."""
        if self.settings_path.exists():
            try:
                with open(self.settings_path) as f:
                    data = json.load(f)
                return AppSettings(**data)
            except (json.JSONDecodeError, Exception):
                pass
        return AppSettings()

    def _save(self, settings: AppSettings) -> None:
        """Save settings to file."""
        with open(self.settings_path, "w") as f:
            json.dump(settings.model_dump(), f, indent=2)

    def get(self) -> AppSettings:
        """Get current settings."""
        if self._settings is None:
            self._settings = self._load()
        return self._settings

    def update(self, **kwargs: Any) -> AppSettings:
        """Update settings with new values."""
        current = self.get()
        updated_data = current.model_dump()

        # Only update non-None values (allow explicit empty string to clear)
        for key, value in kwargs.items():
            if hasattr(current, key) and value is not None:
                updated_data[key] = value if value != "" else None

        self._settings = AppSettings(**updated_data)
        self._save(self._settings)
        return self._settings

    def get_masked(self) -> dict[str, Any]:
        """Get settings with secrets masked for frontend display."""
        settings = self.get()
        data = settings.model_dump()

        # Keys that contain secrets and should be masked
        secret_keys = {
            "spotify_client_id", "spotify_client_secret",
            "lastfm_api_key", "lastfm_api_secret",
            "anthropic_api_key", "acoustid_api_key"
        }

        # Mask only secret values
        for key in secret_keys:
            if key in data and data[key]:
                # Show first 4 chars + masked remainder
                val = str(data[key])
                if len(val) > 8:
                    data[key] = val[:4] + "•" * 8
                else:
                    data[key] = "•" * len(val)

        return data

    def has_spotify_credentials(self) -> bool:
        """Check if Spotify credentials are configured."""
        settings = self.get()
        return bool(settings.spotify_client_id and settings.spotify_client_secret)

    def has_lastfm_credentials(self) -> bool:
        """Check if Last.fm credentials are configured."""
        settings = self.get()
        return bool(settings.lastfm_api_key and settings.lastfm_api_secret)

    def has_music_library_configured(self) -> bool:
        """Check if at least one music library path is configured."""
        settings = self.get()
        return bool(settings.music_library_paths)


# Singleton instance
_app_settings_service: AppSettingsService | None = None


def get_app_settings_service() -> AppSettingsService:
    """Get or create the app settings service singleton."""
    global _app_settings_service
    if _app_settings_service is None:
        _app_settings_service = AppSettingsService()
    return _app_settings_service
