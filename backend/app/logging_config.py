"""Structured logging configuration for production debugging.

In development: Human-readable colored output
In production: JSON-formatted logs for log aggregation systems
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from app.config import settings


class JSONFormatter(logging.Formatter):
    """JSON log formatter for production environments."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add extra fields from record
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "track_id"):
            log_data["track_id"] = record.track_id
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add any extra attributes
        extra_keys = set(record.__dict__.keys()) - {
            "name", "msg", "args", "created", "filename", "funcName",
            "levelname", "levelno", "lineno", "module", "msecs",
            "pathname", "process", "processName", "relativeCreated",
            "stack_info", "exc_info", "exc_text", "thread", "threadName",
            "taskName", "message", "request_id", "user_id", "track_id",
            "duration_ms",
        }
        for key in extra_keys:
            value = getattr(record, key)
            if value is not None and not key.startswith("_"):
                log_data[key] = value

        return json.dumps(log_data)


class DevelopmentFormatter(logging.Formatter):
    """Human-readable colored formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        reset = self.RESET

        # Format time
        time_str = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")

        # Build message
        msg = f"{color}{time_str} {record.levelname:8}{reset} [{record.name}] {record.getMessage()}"

        # Add request ID if present
        if hasattr(record, "request_id"):
            msg = f"{color}{time_str} {record.levelname:8}{reset} [{record.request_id}] [{record.name}] {record.getMessage()}"

        # Add exception if present
        if record.exc_info:
            msg += f"\n{self.formatException(record.exc_info)}"

        return msg


def setup_logging() -> None:
    """Configure logging based on environment."""
    # Determine log level
    log_level = logging.DEBUG if settings.debug else logging.INFO

    # Choose formatter based on environment
    if settings.debug:
        formatter = DevelopmentFormatter()
    else:
        formatter = JSONFormatter()

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add stdout handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name.

    Usage:
        from app.logging_config import get_logger
        logger = get_logger(__name__)
        logger.info("Message", extra={"request_id": "abc123"})
    """
    return logging.getLogger(name)
