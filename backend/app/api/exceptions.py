"""Custom exception hierarchy for the Familiar API.

These exceptions provide structured error handling with proper HTTP status codes
and consistent error response formats.
"""

from typing import Any


class FamiliarError(Exception):
    """Base exception for all Familiar errors."""

    status_code: int = 500
    message: str = "An unexpected error occurred"

    def __init__(
        self,
        message: str | None = None,
        detail: str | None = None,
        **extra: Any,
    ) -> None:
        self.message = message or self.__class__.message
        self.detail = detail
        self.extra = extra
        super().__init__(self.message)


# 400 Bad Request errors
class ValidationError(FamiliarError):
    """Invalid input data."""

    status_code = 400
    message = "Invalid request data"


class InvalidPathError(FamiliarError):
    """Invalid file or directory path."""

    status_code = 400
    message = "Invalid path"


# 404 Not Found errors
class NotFoundError(FamiliarError):
    """Requested resource not found."""

    status_code = 404
    message = "Resource not found"


class TrackNotFoundError(NotFoundError):
    """Track not found in the library."""

    message = "Track not found"


class PlaylistNotFoundError(NotFoundError):
    """Playlist not found."""

    message = "Playlist not found"


class ProfileNotFoundError(NotFoundError):
    """Profile not found."""

    message = "Profile not found"


# 409 Conflict errors
class ConflictError(FamiliarError):
    """Request conflicts with current state."""

    status_code = 409
    message = "Request conflicts with current state"


class ScanInProgressError(ConflictError):
    """A library scan is already running."""

    message = "A library scan is already in progress"


class AnalysisInProgressError(ConflictError):
    """Audio analysis is already running."""

    message = "Audio analysis is already in progress"


# 503 Service Unavailable errors
class ServiceUnavailableError(FamiliarError):
    """External service or dependency unavailable."""

    status_code = 503
    message = "Service temporarily unavailable"


class LLMNotConfiguredError(ServiceUnavailableError):
    """LLM API not configured."""

    message = "AI assistant not configured. Add your API key in the Admin panel."


class ExternalServiceError(ServiceUnavailableError):
    """External API call failed."""

    message = "External service request failed"


# 500 Internal Server errors
class DatabaseError(FamiliarError):
    """Database operation failed."""

    status_code = 500
    message = "Database operation failed"


class FileOperationError(FamiliarError):
    """File system operation failed."""

    status_code = 500
    message = "File operation failed"


class AnalysisError(FamiliarError):
    """Audio analysis failed."""

    status_code = 500
    message = "Audio analysis failed"
