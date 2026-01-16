"""App settings service for user-configurable settings stored in a JSON file.

Configuration Precedence
========================
Settings can come from multiple sources. The precedence (highest to lowest) is:

1. **AppSettings (settings.json)** - User-configured via admin UI
2. **Environment variables** - Set in docker-compose or .env
3. **Defaults** - Hardcoded fallbacks

Use `get_app_settings_service().get_effective()` to get the resolved value
for any setting with proper precedence applied.

Settings by Source
------------------
**Admin UI only (settings.json)**:
- music_library_paths, llm_provider, ollama_url, ollama_model

**Admin UI with env fallback**:
- anthropic_api_key, spotify_client_id, spotify_client_secret
- lastfm_api_key, lastfm_api_secret, acoustid_api_key

**Environment only (infrastructure)**:
- database_url, redis_url, frontend_url
- art_path, videos_path, profiles_path
"""

import json
from pathlib import Path
from typing import Any, Literal

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
    llm_provider: Literal["claude", "ollama"] = "claude"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"  # Default model with tool support

    # Audio fingerprinting
    acoustid_api_key: str | None = None  # Get free key at https://acoustid.org/new-application

    # Metadata enrichment
    auto_enrich_metadata: bool = True  # Auto-fetch missing metadata on playback
    enrich_overwrite_existing: bool = False  # Overwrite existing tags with MusicBrainz data

    # Analysis settings
    clap_embeddings_enabled: bool | None = None  # None = auto-detect based on RAM (6GB+ required)

    # External feature lookup (skip local librosa analysis when possible)
    external_features_enabled: bool = True  # Look up features from external services

    # Community embedding cache (share CLAP embeddings with other users)
    community_cache_enabled: bool = True  # Look up embeddings from community cache
    community_cache_contribute: bool = False  # Contribute computed embeddings (opt-in)
    community_cache_url: str = "https://familiar-cache.fly.dev"  # Cache server URL


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
        """Get current settings.

        Always reloads from file to ensure consistency across workers.
        The settings file is small so this is fine for performance.
        """
        return self._load()

    def update(self, **kwargs: Any) -> AppSettings:
        """Update settings with new values."""
        current = self.get()
        updated_data = current.model_dump()

        # Settings that accept None as a valid value (to reset to auto-detect)
        nullable_settings = {"clap_embeddings_enabled"}

        # Only update non-None values (allow explicit empty string to clear)
        # Exception: nullable_settings can be explicitly set to None
        for key, value in kwargs.items():
            if not hasattr(current, key):
                continue
            if key in nullable_settings:
                # Allow explicit None for these settings
                updated_data[key] = value if value != "" else None
            elif value is not None:
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

    def get_effective(self, key: str) -> Any:
        """Get the effective value for a setting with proper precedence.

        Precedence: AppSettings (JSON) > Environment variable > Default

        Args:
            key: Setting name (e.g., 'anthropic_api_key', 'spotify_client_id')

        Returns:
            The effective value from the highest-priority source that has it set.
        """
        from app.config import settings as env_settings

        app_value = getattr(self.get(), key, None)
        env_value = getattr(env_settings, key, None)

        # AppSettings takes priority if set (non-None and non-empty)
        if app_value:
            return app_value

        # Fall back to environment variable
        if env_value:
            return env_value

        return None

    def get_all_effective(self) -> dict[str, Any]:
        """Get all settings with precedence applied.

        Returns a dict with the effective value for each setting,
        combining AppSettings and environment variables.
        """
        from app.config import settings as env_settings

        app = self.get()
        result = {}

        # Settings that can come from either source
        dual_source_keys = [
            "anthropic_api_key",
            "spotify_client_id",
            "spotify_client_secret",
            "lastfm_api_key",
            "lastfm_api_secret",
            "acoustid_api_key",
        ]

        for key in dual_source_keys:
            result[key] = self.get_effective(key)

        # Settings from AppSettings only
        result["music_library_paths"] = app.music_library_paths
        result["llm_provider"] = app.llm_provider
        result["ollama_url"] = app.ollama_url
        result["ollama_model"] = app.ollama_model

        # Settings from environment only
        result["database_url"] = env_settings.database_url
        result["redis_url"] = env_settings.redis_url
        result["frontend_url"] = env_settings.frontend_url

        return result

    def is_clap_embeddings_enabled(self) -> tuple[bool, str]:
        """Get effective CLAP embeddings enabled status.

        Returns:
            Tuple of (enabled: bool, reason: str)

        Precedence:
        1. DISABLE_CLAP_EMBEDDINGS env var (if set, overrides everything)
        2. AppSettings clap_embeddings_enabled (if explicitly set)
        3. Auto-detect based on RAM (6GB minimum)
        """
        import os

        # Check environment variable override first (backwards compat)
        env_disabled = os.environ.get("DISABLE_CLAP_EMBEDDINGS", "").lower() in ("1", "true", "yes")
        if env_disabled:
            return (False, "Disabled via DISABLE_CLAP_EMBEDDINGS environment variable")

        # Check explicit setting
        settings = self.get()
        if settings.clap_embeddings_enabled is not None:
            if settings.clap_embeddings_enabled:
                return (True, "Enabled via settings")
            else:
                return (False, "Disabled via settings")

        # Auto-detect based on RAM
        ram_gb = get_system_ram_gb()
        if ram_gb is None:
            # Can't detect RAM (e.g., in container without psutil) - default to enabled
            # Most systems have enough RAM, better to try than silently disable
            return (True, "Auto-enabled (RAM detection unavailable, assuming sufficient)")

        if ram_gb >= 6.0:
            return (True, f"Auto-enabled ({ram_gb:.1f}GB RAM detected, 6GB+ required)")
        else:
            return (False, f"Auto-disabled (only {ram_gb:.1f}GB RAM, 6GB+ required)")

    def get_clap_status(self) -> dict[str, Any]:
        """Get detailed CLAP embeddings status for UI."""
        import os

        enabled, reason = self.is_clap_embeddings_enabled()
        ram_gb = get_system_ram_gb()

        return {
            "enabled": enabled,
            "reason": reason,
            "ram_gb": ram_gb,
            "ram_sufficient": ram_gb is not None and ram_gb >= 6.0,
            "env_override": os.environ.get("DISABLE_CLAP_EMBEDDINGS", "").lower() in ("1", "true", "yes"),
            "explicit_setting": self.get().clap_embeddings_enabled,
        }


def get_system_ram_gb() -> float | None:
    """Get total system RAM in GB. Returns None if unable to detect."""
    try:
        import psutil
        return psutil.virtual_memory().total / (1024**3)
    except ImportError:
        return None
    except Exception:
        return None


# Singleton instance
_app_settings_service: AppSettingsService | None = None


def get_app_settings_service() -> AppSettingsService:
    """Get or create the app settings service singleton."""
    global _app_settings_service
    if _app_settings_service is None:
        _app_settings_service = AppSettingsService()
    return _app_settings_service
